const prisma = require('../../config/prisma');
const { num, money } = require('../../lib/misc');

/**
 * Shared resolver helpers: field resolvers reused across domains,
 * cart/quote building, and view-model enrichment (distance, ETA).
 */

// Generic relation resolvers Prisma would otherwise require per-type.
const passthrough = (field) => async (parent, _args, ctx) => {
  if (parent[field] !== undefined) return parent[field];
  return null;
};

/** Lazily load a related record by id when the parent only has the FK. */
function loadOne(model, idField, parent, fallbackId) {
  const id = parent[idField] ?? fallbackId;
  if (!id) return Promise.resolve(null);
  return prisma[model].findUnique({ where: { id } });
}

/** Compute "open now" from operating hours for the current moment. */
function isOpenNowFromHours(hours) {
  const now = new Date();
  const day = now.getDay();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = hours.find((h) => h.dayOfWeek === day);
  if (!today || today.isClosed) return false;
  return hhmm >= today.openTime && hhmm <= today.closeTime;
}

/**
 * Build a delivery quote for the checkout screen without placing an order.
 * Mirrors domain/pricing so the client previews exact totals.
 */
async function buildQuote({ branch, address, items }) {
  const pricing = require('../../domain/pricing');
  let itemsTotal = 0;
  for (const line of items) {
    const mi = await prisma.menuItem.findUnique({
      where: { id: line.menuItemId },
      include: { addOns: true, variants: { include: { options: true } } },
    });
    if (!mi) continue;
    const qty = Math.max(1, line.quantity | 0);
    let unit = num(mi.price);
    if (line.variantOptionId) {
      const opt = mi.variants.flatMap((v) => v.options).find((o) => o.id === line.variantOptionId);
      if (opt) unit += num(opt.priceModifier);
    }
    if (line.addOnId) {
      const ao = mi.addOns.find((a) => a.id === line.addOnId);
      if (ao) unit += num(ao.price);
    }
    itemsTotal = money(itemsTotal + unit * qty);
  }
  const quote = await pricing.quoteDelivery({
    branch, dropoffPoint: { lat: num(address.lat), lng: num(address.lng) }, itemsTotal,
  });
  const subtotal = money(itemsTotal + quote.deliveryFee + quote.serviceFee);
  return {
    itemsTotal,
    deliveryFee: quote.deliveryFee,
    serviceFee: quote.serviceFee,
    surge: quote.surge,
    distanceKm: quote.distanceKm,
    etaMinutes: branch.prepTimeMinutes + quote.minutes + 5,
    subtotal,
    meetsMinimum: itemsTotal >= num(branch.minOrderAmount),
  };
}

/** Aggregate a restaurant's average rating from its reviews (kept fresh). */
async function recomputeRestaurantRating(restaurantId) {
  const agg = await prisma.review.aggregate({
    where: { restaurantId, type: 'restaurant' },
    _avg: { rating: true }, _count: true,
  });
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { avgRating: agg._avg.rating || 0, reviewCount: agg._count },
  });
}

async function recomputeDriverRating(driverUserId) {
  const agg = await prisma.review.aggregate({
    where: { driverId: driverUserId, type: 'driver' },
    _avg: { rating: true }, _count: true,
  });
  await prisma.driverProfile.update({
    where: { userId: driverUserId },
    data: { avgRating: agg._avg.rating || 0, reviewCount: agg._count },
  });
}

/** Format an amount for email/notification copy. */
const fmtMoney = (n) => `${money(n)}`;

module.exports = {
  passthrough, loadOne, isOpenNowFromHours, buildQuote,
  recomputeRestaurantRating, recomputeDriverRating, fmtMoney,
};
