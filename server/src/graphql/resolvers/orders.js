const prisma = require('../../config/prisma');
const { requireAuth, requireRole, assertBranchAccess } = require('../../lib/roles');
const { paginate, num, groupCode } = require('../../lib/misc');
const orders = require('../../domain/orders');
const payments = require('../../domain/payments');
const dispatch = require('../../domain/dispatch');
const pricing = require('../../domain/pricing');
const { buildQuote } = require('./_helpers');
const { emitToRoom, emitDriverLocation } = require('../../realtime/hub');
const { notify } = require('../../domain/notification');

/** Orders, delivery tracking, chat, group ordering. */

const ORDER_INCLUDE = {
  customer: true,
  branch: { include: { restaurant: true } },
  address: true,
  items: { include: { item: true, variantOption: true, addOn: true } },
  promoCode: true,
  delivery: { include: { driver: { include: { user: true } } } },
  statusLogs: { orderBy: { createdAt: 'asc' } },
};

async function loadOrder(id) {
  return prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

/** Can this user view/act on the order? owner-of, branch staff, driver, admin. */
function assertOrderAccess(user, order) {
  if (['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'].includes(user.role)) return;
  if (order.customerId === user.id) return;
  if (order.delivery?.driver?.userId === user.id) return;
  if (user.role === 'RESTAURANT_OWNER' || user.role === 'RESTAURANT_STAFF') {
    if (order.branchId === user.__branchId) return; // resolved lazily below
  }
  // fall through to async branch check by throwing a marker the caller awaits
  throw Object.assign(new Error('FORBIDDEN_ORDER'), { code: 'NEED_BRANCH_CHECK' });
}

async function canAccessOrder(user, order) {
  if (['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'].includes(user.role)) return true;
  if (order.customerId === user.id) return true;
  if (order.delivery?.driver?.userId === user.id) return true;
  if (user.role === 'RESTAURANT_OWNER') {
    const r = await prisma.restaurant.findFirst({ where: { ownerId: user.id, branches: { some: { id: order.branchId } } } });
    return !!r;
  }
  if (user.role === 'RESTAURANT_STAFF') {
    const s = await prisma.branchStaff.findFirst({ where: { userId: user.id, branchId: order.branchId } });
    return !!s;
  }
  return false;
}

module.exports = {
  Query: {
    order: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const order = await loadOrder(id);
      if (!order) return null;
      if (!(await canAccessOrder(user, order))) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      return order;
    },
    orderByNumber: async (_p, { orderNumber }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { orderNumber }, include: ORDER_INCLUDE });
      if (!order) return null;
      if (!(await canAccessOrder(user, order))) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      return order;
    },
    myOrders: async (_p, args, ctx) => {
      const user = requireAuth(ctx);
      const { take, skip } = paginate(args);
      const where = { customerId: user.id };
      const [items, total] = await Promise.all([
        prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { items: true, branch: { include: { restaurant: true } }, delivery: { include: { driver: true } } } }),
        prisma.order.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    activeOrder: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      return prisma.order.findFirst({
        where: { customerId: user.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' }, include: ORDER_INCLUDE,
      });
    },
    orders: async (_p, args, ctx) => {
      const user = requireAuth(ctx);
      const { take, skip } = paginate(args, 100);
      const where = buildOrderWhere(user, args);
      const [items, total] = await Promise.all([
        prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { items: true, branch: { include: { restaurant: true } }, customer: true, delivery: { include: { driver: true } } } }),
        prisma.order.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    branchOrders: async (_p, { branchId, status, page, limit }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      const { take, skip } = paginate({ page, limit });
      const where = { branchId, ...(status ? { status } : {}), ...(status ? {} : { status: { notIn: ['DELIVERED', 'CANCELLED'] } }) };
      const [items, total] = await Promise.all([
        prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { items: true, customer: true } }),
        prisma.order.count({ where: status ? { branchId, status } : { branchId } }),
      ]);
      return { items, total, page: page || 1, pages: Math.ceil(total / take) };
    },
    driverActiveDelivery: async (_p, _a, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const d = await prisma.delivery.findFirst({
        where: { driverId: user.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        include: { order: { include: ORDER_INCLUDE }, branch: true },
      });
      return d;
    },
    orderChat: async (_p, { orderId }, ctx) => {
      const user = requireAuth(ctx);
      const order = await loadOrder(orderId);
      if (!(await canAccessOrder(user, order))) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      return prisma.chatMessage.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, include: { sender: true } });
    },
    groupOrder: (_p, { code }) => prisma.groupOrder.findUnique({ where: { code }, include: { orders: { include: { items: true } }, host: true, branch: { include: { restaurant: true } } } }),
    deliveryQuote: async (_p, { branchId, addressId, itemsTotal }, ctx) => {
      requireAuth(ctx);
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      const address = await prisma.address.findUnique({ where: { id: addressId } });
      const quote = await pricing.quoteDelivery({ branch, dropoffPoint: { lat: num(address.lat), lng: num(address.lng) }, itemsTotal });
      return { ...quote, etaMinutes: branch.prepTimeMinutes + quote.minutes + 5, meetsMinimum: num(itemsTotal) >= num(branch.minOrderAmount) };
    },
  },

  Mutation: {
    placeOrder: async (_p, { input }, ctx) => {
      const user = requireRole(ctx, 'CUSTOMER');
      const order = await orders.placeOrder(user, input);
      return loadOrder(order.id);
    },

    cancelOrder: async (_p, { id, reason }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id } });
      if (order.customerId !== user.id && !['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT'].includes(user.role)) {
        throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      }
      await payments.cancelAndRefund(order, { reason, cancelledBy: user.id });
      return loadOrder(id);
    },

    reorder: async (_p, { orderId }, ctx) => {
      const user = requireRole(ctx, 'CUSTOMER');
      const old = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (old.customerId !== user.id) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      const address = await prisma.address.findFirst({ where: { userId: user.id }, orderBy: { isDefault: 'desc' } });
      const input = {
        branchId: old.branchId,
        addressId: address.id,
        items: old.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, variantOptionId: i.variantOptionId, addOnId: i.addOnId, specialInstructions: i.specialInstructions })),
        paymentMethod: old.paymentMethod,
      };
      const order = await orders.placeOrder(user, input);
      return loadOrder(order.id);
    },

    // ---- restaurant actions ----
    acceptOrder: async (_p, { id, prepMinutes }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id } });
      await assertBranchAccess(user, order.branchId);
      if (prepMinutes) await prisma.order.update({ where: { id }, data: { estimatedDeliveryAt: new Date(Date.now() + (prepMinutes + 20) * 60_000) } });
      await orders.transitionOrder(id, 'CONFIRMED', { actorId: user.id, note: prepMinutes ? `prep ${prepMinutes}m` : null });
      return loadOrder(id);
    },
    rejectOrder: async (_p, { id, reason }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id } });
      await assertBranchAccess(user, order.branchId);
      await orders.rejectOrder(id, reason, user.id);
      return loadOrder(id);
    },
    setOrderPreparing: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id } });
      await assertBranchAccess(user, order.branchId);
      await orders.transitionOrder(id, 'PREPARING', { actorId: user.id });
      return loadOrder(id);
    },
    markOrderReady: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id } });
      await assertBranchAccess(user, order.branchId);
      await orders.transitionOrder(id, 'READY_FOR_PICKUP', { actorId: user.id });
      // kick driver dispatch when food is ready
      await dispatch.requestDrivers(id);
      return loadOrder(id);
    },

    // ---- driver actions ----
    updateDeliveryStatus: async (_p, { deliveryId, status, proofPhotoUrl }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (d.driverId !== user.id) throw Object.assign(new Error('Not your delivery'), { extensions: { code: 'FORBIDDEN' } });
      if (proofPhotoUrl) await prisma.delivery.update({ where: { id: deliveryId }, data: { proofPhotoUrl } });
      await orders.transitionOrder(d.orderId, status, { actorId: user.id });
      return prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: { include: { branch: true } } } });
    },
    markPickedUp: async (_p, { deliveryId }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (d.driverId !== user.id) throw Object.assign(new Error('Not your delivery'), { extensions: { code: 'FORBIDDEN' } });
      await orders.transitionOrder(d.orderId, 'PICKED_UP', { actorId: user.id });
      return prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } });
    },
    markDelivered: async (_p, { deliveryId, proofPhotoUrl }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (d.driverId !== user.id) throw Object.assign(new Error('Not your delivery'), { extensions: { code: 'FORBIDDEN' } });
      if (proofPhotoUrl) await prisma.delivery.update({ where: { id: deliveryId }, data: { proofPhotoUrl } });
      await orders.transitionOrder(d.orderId, 'DELIVERED', { actorId: user.id });
      await prisma.driverProfile.update({ where: { userId: user.id }, data: { availability: 'ONLINE' } });
      return prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } });
    },
    sendDeliveryLocation: async (_p, { deliveryId, location }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } });
      if (d.driverId !== user.id) return false;
      await recordLocation(d, location);
      return true;
    },

    // ---- group ordering ----
    createGroupOrder: async (_p, { branchId }, ctx) => {
      const user = requireAuth(ctx);
      return prisma.groupOrder.create({
        data: { hostId: user.id, branchId, code: groupCode() },
        include: { branch: { include: { restaurant: true } }, host: true },
      });
    },
    joinGroupOrder: async (_p, { code }, ctx) => {
      requireAuth(ctx);
      return prisma.groupOrder.findUnique({ where: { code }, include: { orders: true, host: true, branch: { include: { restaurant: true } } } });
    },
    closeGroupOrder: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const g = await prisma.groupOrder.findUnique({ where: { id } });
      if (g.hostId !== user.id) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      return prisma.groupOrder.update({ where: { id }, data: { isActive: false } });
    },

    // ---- chat ----
    sendOrderMessage: async (_p, { orderId, body }, ctx) => {
      const user = requireAuth(ctx);
      const order = await loadOrder(orderId);
      if (!(await canAccessOrder(user, order))) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      const msg = await prisma.chatMessage.create({ data: { orderId, senderId: user.id, body }, include: { sender: true } });
      // route to the other side of the conversation
      const recipientId = order.customerId === user.id ? order.delivery?.driver?.userId : order.customerId;
      emitToRoom(`order:${orderId}`, 'chat:message', msg);
      if (recipientId) await notify(recipientId, { title: 'New message', body, data: { orderId } });
      return msg;
    },
  },

  Order: {
    delivery: (o) => (o.delivery !== undefined ? o.delivery : prisma.delivery.findUnique({ where: { orderId: o.id }, include: { driver: { include: { user: true } } } })),
  },

  Delivery: {
    driver: (d) => (d.driver || (d.driverId ? prisma.driverProfile.findUnique({ where: { userId: d.driverId }, include: { user: true } }) : null)),
    liveLocations: (d) => prisma.driverLocation.findMany({ where: { deliveryId: d.id }, orderBy: { recordedAt: 'desc' }, take: 120 }),
    async etaMinutes(d) {
      if (!d.driver || !d.orderId) return null;
      const order = d.order || await prisma.order.findUnique({ where: { id: d.orderId } });
      const { haversineKm, estimateDriveMinutes } = require('../../lib/haversine');
      const origin = d.pickedUpAt
        ? { lat: num(d.driver.lastLat || d.pickupLat), lng: num(d.driver.lastLng || d.pickupLng) }
        : { lat: num(d.driver.lastLat || d.dropoffLat), lng: num(d.driver.lastLng || d.pickupLng) };
      const dest = d.pickedUpAt
        ? { lat: num(d.dropoffLat), lng: num(d.dropoffLng) }
        : { lat: num(d.pickupLat), lng: num(d.pickupLng) };
      return estimateDriveMinutes(haversineKm(origin, dest)) + (d.pickedUpAt ? 0 : order?.branch?.prepTimeMinutes || 15);
    },
    async routePolyline(d) {
      if (d._polyline) return d._polyline;
      const maps = require('../../services/googleMaps');
      const res = await maps.directions({ lat: num(d.pickupLat), lng: num(d.pickupLng) }, { lat: num(d.dropoffLat), lng: num(d.dropoffLng) });
      d._polyline = res.polyline;
      return res.polyline;
    },
  },
};

/** Persist a GPS ping, emit it live, and run the route-deviation check. */
async function recordLocation(delivery, { lat, lng, heading, speed }) {
  await prisma.driverLocation.create({
    data: { deliveryId: delivery.id, lat, lng, heading: heading ?? null, speed: speed ?? null },
  });
  await prisma.driverProfile.update({
    where: { userId: delivery.driverId },
    data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() },
  });
  emitDriverLocation(delivery.orderId, { lat, lng, heading, speed });
  const deviated = dispatch.detectRouteDeviation(delivery, { lat, lng });
  if (deviated) {
    const { emitToOps } = require('../../realtime/hub');
    emitToOps('ops:route_deviation', { deliveryId: delivery.id, orderId: delivery.orderId, lat, lng });
  }
}

module.exports.__internals = { recordLocation, canAccessOrder };

/** Role-aware where clause for the shared orders list query. */
function buildOrderWhere(user, args) {
  const base = {};
  if (args.status) base.status = args.status;
  if (args.from || args.to) base.createdAt = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(args.to) } : {}) };
  if (args.search) base.orderNumber = { contains: args.search, mode: 'insensitive' };
  switch (user.role) {
    case 'CUSTOMER': return { ...base, customerId: user.id };
    case 'DRIVER': return { ...base, delivery: { driverId: user.id } };
    case 'RESTAURANT_OWNER': return { ...base, ...(args.branchId ? { branchId: args.branchId } : { branch: { restaurant: { ownerId: user.id } } }) };
    case 'RESTAURANT_STAFF': return { ...base, branchId: args.branchId };
    default: // admin/ops/support/super
      if (args.branchId) base.branchId = args.branchId;
      if (args.customerId) base.customerId = args.customerId;
      if (args.driverId) base.delivery = { driverId: args.driverId };
      return base;
  }
}
