const prisma = require('../config/prisma');
const { haversineKm, estimateDriveMinutes } = require('../lib/haversine');
const { isInsidePolygon, isWithinRadius } = require('../lib/haversine');
const { money, num } = require('../lib/misc');
const { getSetting } = require('../services/settings');

/**
 * Pricing engine: delivery fee, surge multiplier, promo evaluation,
 * loyalty accrual/redemption and commission split. Pure functions where
 * possible so resolvers and the order-creation transaction share them.
 */

/** Active surge multiplier for a coordinate (zone circle or polygon). */
async function surgeMultiplierAt(point) {
  const zones = await prisma.surgeZone.findMany({ where: { isActive: true } });
  const now = new Date();
  const day = now.getDay();
  let best = 1;
  for (const z of zones) {
    if (z.daysOfWeek?.length && !z.daysOfWeek.includes(day)) continue;
    if (z.scheduleFrom && z.scheduleTo && (now < z.scheduleFrom || now > z.scheduleTo)) continue;
    const hit = z.polygon
      ? isInsidePolygon(point, z.polygon)
      : isWithinRadius(point, { lat: z.centerLat, lng: z.centerLng }, z.radiusKm);
    if (hit) best = Math.max(best, num(z.multiplier));
  }
  return best;
}

/** Delivery fee estimate: branch fee * surge, free above threshold. */
async function quoteDelivery({ branch, dropoffPoint, itemsTotal }) {
  const distanceKm = haversineKm({ lat: branch.lat, lng: branch.lng }, dropoffPoint);
  const minutes = estimateDriveMinutes(distanceKm);
  const surge = await surgeMultiplierAt(dropoffPoint);
  let fee = num(branch.deliveryFee) * surge;
  if (branch.freeDeliveryAbove != null && num(itemsTotal) >= num(branch.freeDeliveryAbove)) {
    fee = 0;
  }
  const serviceFee = money(num(itemsTotal) * (num(branch.serviceFeePercent) / 100));
  return { distanceKm: money(distanceKm), minutes, deliveryFee: money(fee), serviceFee, surge };
}

/**
 * Evaluate a promo code against an order draft.
 * Returns { ok, discount, freeDelivery, reason }.
 */
async function evaluatePromo({ code, customerId, itemsTotal, deliveryFee, restaurantId, subtotal }) {
  const now = new Date();
  const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
  const fail = (reason) => ({ ok: false, discount: 0, freeDelivery: false, reason });
  if (!promo || !promo.isActive) return fail('Invalid code');
  if (promo.startsAt > now || promo.expiresAt < now) return fail('Code expired');
  if (promo.restaurantId && promo.restaurantId !== restaurantId) return fail('Not valid at this restaurant');
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return fail('Fully redeemed');
  if (subtotal < num(promo.minOrderAmount)) return fail(`Minimum order ${promo.minOrderAmount} required`);
  if (promo.usagePerUser != null) {
    const mine = await prisma.promoCodeUsage.count({
      where: { promoId: promo.id, userId: customerId },
    });
    if (mine >= promo.usagePerUser) return fail('Limit reached for your account');
  }
  let discount = 0;
  let freeDelivery = false;
  if (promo.type === 'PERCENTAGE') {
    discount = money(num(itemsTotal) * (num(promo.value) / 100));
    if (promo.maxDiscount != null) discount = Math.min(discount, num(promo.maxDiscount));
  } else if (promo.type === 'FIXED') {
    discount = Math.min(num(promo.value), num(itemsTotal));
  } else if (promo.type === 'FREE_DELIVERY') {
    freeDelivery = true;
    discount = money(deliveryFee);
  }
  return { ok: true, promo, discount: money(discount), freeDelivery };
}

/** Loyalty: points earned on a delivered order + current balance helpers. */
async function loyaltyEarnForOrder(total) {
  const cfg = await getSetting('loyalty.earn_rate');
  return Math.floor(num(total) * num(cfg?.pointsPerCurrencyUnit ?? 1));
}

async function loyaltyPointsBalance(customerId) {
  const agg = await prisma.loyaltyTransaction.aggregate({
    where: { userId: customerId }, _sum: { points: true },
  });
  return agg._sum.points || 0;
}

/** Convert points -> currency value for redemption at checkout. */
async function loyaltyValueOf(points) {
  const cfg = await getSetting('loyalty.redeem_rate');
  return money(points / num(cfg?.pointsPerCurrencyUnit ?? 100));
}

/** Commission split for the platform / restaurant on an order total. */
async function computeCommission(orderTotal, restaurant) {
  const { commissionRateFor } = require('../services/settings');
  const percent = await commissionRateFor(restaurant);
  const commission = money(num(orderTotal) * (percent / 100));
  return { percent, commission, restaurantEarning: money(num(orderTotal) - commission) };
}

/** Driver payout: base + per-km, surge applied, platform cut withheld. */
async function computeDriverFee(distanceKm, surge) {
  const cfg = await getSetting('driver.base_fee_km');
  const base = num(cfg?.baseFee ?? 2);
  const perKm = num(cfg?.perKm ?? 0.8);
  const gross = money((base + perKm * num(distanceKm)) * num(surge || 1));
  const platformCut = money(gross * 0.1);
  return { baseFee: money(base * num(surge || 1)), distanceBonus: money(perKm * num(distanceKm) * num(surge || 1)), gross, platformCut, driverEarning: money(gross - platformCut) };
}

module.exports = {
  surgeMultiplierAt, quoteDelivery, evaluatePromo,
  loyaltyEarnForOrder, loyaltyPointsBalance, loyaltyValueOf,
  computeCommission, computeDriverFee,
};
