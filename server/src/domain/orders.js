const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const { money, num, orderNumber } = require('../lib/misc');
const { haversineKm, estimateDriveMinutes, isWithinRadius } = require('../lib/haversine');
const pricing = require('./pricing');
const payments = require('./payments');
const { emitOrderUpdate } = require('../realtime/hub');
const { notify } = require('./notification');

/**
 * Order engine — placement, validation and the status state-machine.
 */

// Allowed transitions (restaurant / driver / system actions)
const TRANSITIONS = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['DRIVER_ASSIGNED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE_TO_RESTAURANT', 'CANCELLED'],
  DRIVER_EN_ROUTE_TO_RESTAURANT: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Place an order. `input` comes from the GraphQL mutation; cart items are
 * re-priced server-side from menu data (never trust client totals).
 */
async function placeOrder(customer, input) {
  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    include: { restaurant: true },
  });
  if (!branch || branch.status === 'CLOSED' || !branch.isOpenNow) {
    throw Object.assign(new Error('Branch is closed'), { extensions: { code: 'BAD_USER_INPUT' } });
  }
  if (branch.restaurant.status !== 'APPROVED') {
    throw Object.assign(new Error('Restaurant not approved'), { extensions: { code: 'BAD_USER_INPUT' } });
  }

  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId: customer.id },
  });
  if (!address) throw Object.assign(new Error('Address not found'), { extensions: { code: 'BAD_USER_INPUT' } });

  // Delivery-zone geofence check
  const dropoff = { lat: num(address.lat), lng: num(address.lng) };
  if (!isWithinRadius(dropoff, { lat: num(branch.lat), lng: num(branch.lng) }, branch.deliveryRadiusKm)) {
    throw Object.assign(new Error('Outside delivery zone'), { extensions: { code: 'BAD_USER_INPUT' } });
  }

  // Price cart items from DB
  const ids = input.items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids }, branchId: branch.id, availability: 'AVAILABLE' },
    include: { addOns: true, variants: { include: { options: true } } },
  });
  const byId = Object.fromEntries(menuItems.map((m) => [m.id, m]));

  let itemsTotal = 0;
  const orderItemData = [];
  for (const line of input.items) {
    const mi = byId[line.menuItemId];
    if (!mi) throw Object.assign(new Error(`Item unavailable: ${line.menuItemId}`), { extensions: { code: 'BAD_USER_INPUT' } });
    const qty = Math.max(1, Math.min(50, line.quantity | 0));
    let variantTotal = 0;
    let addOnsTotal = 0;
    let variantOptionId = null;
    let addOnId = null;
    if (line.variantOptionId) {
      const opt = mi.variants.flatMap((v) => v.options).find((o) => o.id === line.variantOptionId);
      if (!opt) throw Object.assign(new Error('Invalid variant'), { extensions: { code: 'BAD_USER_INPUT' } });
      variantTotal = money(num(opt.priceModifier) * qty);
      variantOptionId = opt.id;
    }
    if (line.addOnId) {
      const ao = mi.addOns.find((a) => a.id === line.addOnId);
      if (!ao) throw Object.assign(new Error('Invalid add-on'), { extensions: { code: 'BAD_USER_INPUT' } });
      addOnsTotal = money(num(ao.price) * qty);
      addOnId = ao.id;
    }
    // Effective unit price honours active special offers
    const now = new Date();
    const onOffer = mi.compareAtPrice != null
      && (!mi.offerValidFrom || mi.offerValidFrom <= now)
      && (!mi.offerValidTo || mi.offerValidTo >= now);
    const unit = money(onOffer ? num(mi.compareAtPrice) : num(mi.price));
    const lineTotal = money(unit * qty + variantTotal + addOnsTotal);
    itemsTotal = money(itemsTotal + lineTotal);
    orderItemData.push({
      menuItemId: mi.id, nameSnapshot: mi.name, priceSnapshot: unit,
      quantity: qty, variantTotal, addOnsTotal, lineTotal,
      specialInstructions: line.specialInstructions || null,
      variantOptionId, addOnId,
    });
  }

  if (itemsTotal < num(branch.minOrderAmount)) {
    throw Object.assign(new Error(`Minimum order is ${branch.minOrderAmount}`), { extensions: { code: 'BAD_USER_INPUT' } });
  }

  // Fees + surge
  const quote = await pricing.quoteDelivery({ branch, dropoffPoint: dropoff, itemsTotal });

  // Promo
  let discount = 0;
  let promo = null;
  if (input.promoCode) {
    const evalRes = await pricing.evaluatePromo({
      code: input.promoCode, customerId: customer.id, itemsTotal,
      deliveryFee: quote.deliveryFee, restaurantId: branch.restaurantId,
      subtotal: itemsTotal + quote.deliveryFee + quote.serviceFee,
    });
    if (!evalRes.ok) throw Object.assign(new Error(evalRes.reason), { extensions: { code: 'BAD_USER_INPUT' } });
    discount = evalRes.discount;
    promo = evalRes.promo;
  }

  // Loyalty redemption
  let loyaltyUsed = 0;
  let loyaltyValue = 0;
  if (input.loyaltyPointsToUse > 0) {
    const balance = await pricing.loyaltyPointsBalance(customer.id);
    loyaltyUsed = Math.min(input.loyaltyPointsToUse, balance);
    loyaltyValue = await pricing.loyaltyValueOf(loyaltyUsed);
    discount = money(discount + loyaltyValue);
  }

  const total = money(Math.max(0, itemsTotal + quote.deliveryFee + quote.serviceFee - discount));
  const { commission, restaurantEarning } = await pricing.computeCommission(
    money(itemsTotal + quote.serviceFee), branch.restaurant,
  );

  const estMinutes = branch.prepTimeMinutes + quote.minutes + 5;
  const scheduled = input.scheduledFor ? new Date(input.scheduledFor) : null;

  const order = await prisma.order.create({
    data: {
      orderNumber: orderNumber(),
      customerId: customer.id,
      branchId: branch.id,
      addressId: address.id,
      status: 'PLACED',
      itemsTotal, deliveryFee: quote.deliveryFee, serviceFee: quote.serviceFee,
      platformFee: 0, surgeMultiplier: quote.surge,
      discountTotal: discount, taxTotal: 0, total,
      commissionAmount: commission, restaurantEarning,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentMethod === 'CASH' ? 'PENDING' : 'PENDING',
      promoCodeId: promo?.id || null,
      loyaltyPointsUsed: loyaltyUsed,
      specialInstructions: input.specialInstructions || null,
      estimatedDeliveryAt: scheduled || new Date(Date.now() + estMinutes * 60_000),
      scheduledFor: scheduled,
      dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
      distanceKm: quote.distanceKm,
      groupOrderId: input.groupOrderId || null,
      items: { create: orderItemData },
      statusLogs: { create: { status: 'PLACED', note: 'placed by customer' } },
      payments: {
        create: {
          customerId: customer.id, method: input.paymentMethod,
          amount: total, status: 'PENDING',
        },
      },
    },
    include: { items: true, payments: true, branch: { include: { restaurant: true } } },
  });

  // Record promo usage + loyalty redemption row
  if (promo) {
    await prisma.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
    await prisma.promoCodeUsage.create({ data: { promoId: promo.id, userId: customer.id, orderId: order.id } });
  }
  if (loyaltyUsed > 0) {
    const bal = await pricing.loyaltyPointsBalance(customer.id);
    await prisma.loyaltyTransaction.create({
      data: { userId: customer.id, orderId: order.id, type: 'WITHDRAWAL', points: -loyaltyUsed, balanceAfter: bal, note: 'redeemed at checkout' },
    });
  }

  // Payment kick-off per method
  if (input.paymentMethod === 'WALLET') {
    await payments.payOrderWithWallet(order); // throws on insufficient balance (order stays PLACED/PENDING)
  } else if (input.paymentMethod === 'CARD') {
    const { createOrderPaymentIntent } = require('../services/stripe');
    const { clientSecret, intentId } = await createOrderPaymentIntent(order);
    await prisma.payment.update({
      where: { id: order.payments[0].id },
      data: { stripeIntentId: intentId, status: 'PROCESSING' },
    });
    order._clientSecret = clientSecret; // returned to client for Stripe confirmation
  }
  // CASH: nothing to charge now.

  // Notify branch staff + kick off driver dispatch
  const staff = await prisma.branchStaff.findMany({ where: { branchId: branch.id }, select: { userId: true } });
  await notify([branch.restaurant.ownerId, ...staff.map((s) => s.userId)].filter(Boolean), {
    title: 'New order 🍽️',
    body: `${order.orderNumber} — ${money(itemsTotal)} (${orderItemData.length} lines)`,
    data: { orderId: order.id },
  });
  await emitOrderUpdate(order.id);
  if (!scheduled) {
    require('./dispatch').requestDrivers(order.id).catch((e) => logger.warn(`dispatch failed: ${e.message}`));
  }

  return order;
}

/**
 * Central status mutation used by restaurant/driver/admin resolvers.
 * Enforces the state machine and fires side-effects per transition.
 */
async function transitionOrder(orderId, toStatus, { actorId, note } = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { branch: { include: { restaurant: true } }, delivery: { include: { driver: { include: { user: true } } } } },
  });
  if (!order) throw Object.assign(new Error('Order not found'), { extensions: { code: 'NOT_FOUND' } });
  if (!canTransition(order.status, toStatus)) {
    throw Object.assign(
      new Error(`Illegal transition ${order.status} → ${toStatus}`),
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  const data = { status: toStatus };
  if (toStatus === 'CONFIRMED') data.confirmedAt = new Date();
  if (toStatus === 'PICKED_UP') data.pickedUpAt = new Date();
  if (toStatus === 'DELIVERED') {
    data.deliveredAt = new Date();
    data.loyaltyPointsEarned = await pricing.loyaltyEarnForOrder(order.total);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({ where: { id: orderId }, data });
    await tx.orderStatusLog.create({ data: { orderId, status: toStatus, note, changedBy: actorId } });
    if (order.delivery) {
      await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: toStatus } });
    }
    if (toStatus === 'DELIVERED') {
      await tx.restaurant.update({ where: { id: order.branch.restaurantId }, data: { totalOrders: { increment: 1 } } });
      if (order.delivery?.driverId) {
        await tx.driverProfile.update({
          where: { userId: order.delivery.driverId },
          data: { totalDeliveries: { increment: 1 }, earningsBalance: { increment: num(order.delivery.driverEarning) } },
        });
      }
      // loyalty earn
      if (data.loyaltyPointsEarned > 0) {
        const bal = await pricing.loyaltyPointsBalance(order.customerId);
        await tx.loyaltyTransaction.create({
          data: { userId: order.customerId, orderId, type: 'DEPOSIT', points: data.loyaltyPointsEarned, balanceAfter: bal, note: 'earned on delivery' },
        });
      }
    }
    return o;
  });

  // COD collected at the door
  if (toStatus === 'DELIVERED' && order.paymentMethod === 'CASH') {
    await payments.confirmCodCollected(orderId);
  }

  // Stakeholder notifications per hop
  const msg = {
    CONFIRMED: ['Order confirmed ✅', `${order.branch.restaurant.name} accepted your order`],
    PREPARING: ['Order in the kitchen 🍳', 'Your food is being prepared'],
    READY_FOR_PICKUP: ['Ready for pickup', 'The driver is on the way to collect'],
    PICKED_UP: ['Order picked up 🛵', 'Your driver is heading to you'],
    OUT_FOR_DELIVERY: ['Out for delivery', 'Arriving shortly!'],
    DELIVERED: ['Delivered 🎉', 'Enjoy your meal — tap to rate'],
  }[toStatus];
  if (msg) {
    await notify(order.customerId, { title: msg[0], body: msg[1], data: { orderId }, email: toStatus === 'DELIVERED' });
  }

  await emitOrderUpdate(orderId);
  return updated;
}

/** Restaurant rejects a placed order → full cancel + refund. */
async function rejectOrder(orderId, reason, actorId) {
  return payments.cancelAndRefund(
    await prisma.order.findUnique({ where: { id: orderId } }),
    { reason: reason || 'Restaurant rejected the order', cancelledBy: actorId },
  );
}

module.exports = { placeOrder, transitionOrder, rejectOrder, canTransition, TRANSITIONS };
