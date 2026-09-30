const prisma = require('../../config/prisma');
const { requireAuth, requireRole } = require('../../lib/roles');
const { paginate } = require('../../lib/misc');
const { recomputeRestaurantRating, recomputeDriverRating } = require('./_helpers');
const { notify } = require('../../domain/notification');

/** Ratings & reviews for restaurants, drivers, dishes. */

async function paginateReviews(where, args) {
  const { take, skip } = paginate(args);
  const [items, total] = await Promise.all([
    prisma.review.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.review.count({ where }),
  ]);
  return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
}

module.exports = {
  Query: {
    restaurantReviews: (_p, { restaurantId, minRating, ...args }) =>
      paginateReviews({ restaurantId, type: 'restaurant', ...(minRating ? { rating: { gte: minRating } } : {}) }, args),
    driverReviews: (_p, { driverUserId, ...args }) =>
      paginateReviews({ driverId: driverUserId, type: 'driver' }, args),
    itemReviews: (_p, { menuItemId, ...args }) =>
      paginateReviews({ menuItemId, type: 'dish' }, args),
    review: async (_p, { id }, ctx) => {
      const r = await prisma.review.findUnique({ where: { id } });
      if (r && ctx.user) {
        r.hasVoted = !!(await prisma.reviewVote.findFirst({ where: { reviewId: id, userId: ctx.user.id } }));
      }
      return r;
    },
    pendingReviewForOrder: async (_p, { orderId }, ctx) => {
      const user = requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { reviews: true, delivery: true } });
      return {
        orderRated: order.reviews.some((r) => r.authorId === user.id && r.type === 'restaurant'),
        driverRated: order.reviews.some((r) => r.authorId === user.id && r.type === 'driver'),
        hasDriver: !!order.delivery,
      };
    },
  },

  Mutation: {
    createReview: async (_p, { input }, ctx) => {
      const user = requireAuth(ctx);
      const { orderId, restaurantId, driverUserId, menuItemId, type, rating, comment, photoUrls, branchId } = input;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.customerId !== user.id) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      if (order.status !== 'DELIVERED') throw Object.assign(new Error('Rate only after delivery'), { extensions: { code: 'BAD_USER_INPUT' } });
      // one review per (order, type, target)
      const existing = await prisma.review.findFirst({
        where: { orderId, authorId: user.id, type, ...(type === 'driver' ? { driverId: driverUserId } : {}), ...(type === 'dish' ? { menuItemId } : {}) },
      });
      if (existing) return existing;
      const review = await prisma.review.create({
        data: {
          authorId: user.id, restaurantId, branchId: branchId || null, orderId, menuItemId: menuItemId || null,
          driverId: type === 'driver' ? driverUserId : null, type, rating, comment, photoUrls: photoUrls || [],
        },
        include: { author: true },
      });
      if (type === 'restaurant') {
        await prisma.order.update({ where: { id: orderId }, data: { restaurantRating: rating } });
        await recomputeRestaurantRating(restaurantId);
      } else if (type === 'driver' && driverUserId) {
        await prisma.order.update({ where: { id: orderId }, data: { driverRating: rating } });
        await recomputeDriverRating(driverUserId);
        const d = await prisma.driverProfile.findUnique({ where: { userId: driverUserId } });
        if (d) await notify(driverUserId, { title: 'New rating', body: `${rating}★ from a customer`, category: 'system' });
      }
      // notify restaurant owner
      const r = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      await notify(r.ownerId, { title: 'New review', body: `${rating}★ — ${user.fullName}`, category: 'system' });
      return review;
    },
    respondToReview: async (_p, { reviewId, message }, ctx) => {
      const user = requireAuth(ctx);
      const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { restaurant: true } });
      if (review.restaurant.ownerId !== user.id && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      }
      const existing = await prisma.reviewResponse.findUnique({ where: { reviewId } });
      if (existing) return prisma.reviewResponse.update({ where: { id: existing.id }, data: { message } });
      const resp = await prisma.reviewResponse.create({ data: { reviewId, userId: user.id, message }, include: { user: true } });
      await notify(review.authorId, { title: 'Restaurant replied to your review', body: message });
      return resp;
    },
    voteReview: async (_p, { reviewId, helpful }, ctx) => {
      const user = requireAuth(ctx);
      const existing = await prisma.reviewVote.findUnique({ where: { reviewId_userId: { reviewId, userId: user.id } } });
      if (existing) {
        await prisma.reviewVote.delete({ where: { id: existing.id } });
        await prisma.review.update({ where: { id: reviewId }, data: { helpfulCount: { decrement: existing.isHelpful ? 1 : 0 } } });
      } else {
        await prisma.reviewVote.create({ data: { reviewId, userId: user.id, isHelpful: helpful } });
        if (helpful) await prisma.review.update({ where: { id: reviewId }, data: { helpfulCount: { increment: 1 } } });
      }
      return prisma.review.findUnique({ where: { id: reviewId } });
    },
    reportReview: async (_p, { reviewId, reason }, ctx) => {
      const user = requireAuth(ctx);
      const report = await prisma.reviewReport.create({ data: { reviewId, reporterId: user.id, reason } });
      await prisma.review.update({ where: { id: reviewId }, data: { isAbusiveFlagged: true } });
      const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, select: { id: true } });
      await notify(admins.map((a) => a.id), { title: 'Review reported', body: reason, category: 'system' });
      return report;
    },
    deleteReview: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const r = await prisma.review.findUnique({ where: { id } });
      if (r.authorId !== user.id && !['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT'].includes(user.role)) {
        throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      }
      await prisma.review.delete({ where: { id } });
      await recomputeRestaurantRating(r.restaurantId);
      if (r.driverId) await recomputeDriverRating(r.driverId);
      return true;
    },
    adminResolveReviewReport: async (_p, { reportId, action }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const report = await prisma.reviewReport.findUnique({ where: { id: reportId }, include: { review: true } });
      if (action === 'remove') {
        await prisma.review.delete({ where: { id: report.reviewId } });
        await recomputeRestaurantRating(report.review.restaurantId);
      }
      return prisma.reviewReport.update({
        where: { id: reportId },
        data: { status: action === 'remove' ? 'REMOVED' : 'KEPT' },
      });
    },
  },

  Review: {
    author: (r) => (r.author || prisma.user.findUnique({ where: { id: r.authorId } })),
    restaurant: (r) => (r.restaurant || (r.restaurantId ? prisma.restaurant.findUnique({ where: { id: r.restaurantId } }) : null)),
    item: (r) => (r.item || (r.menuItemId ? prisma.menuItem.findUnique({ where: { id: r.menuItemId } }) : null)),
    driver: (r) => (r.driver || (r.driverId ? prisma.driverProfile.findUnique({ where: { userId: r.driverId }, include: { user: true } }) : null)),
    response: (r) => prisma.reviewResponse.findUnique({ where: { reviewId: r.id }, include: { user: true } }),
    hasVoted: async (r, _a, ctx) => (ctx.user ? !!(await prisma.reviewVote.findFirst({ where: { reviewId: r.id, userId: ctx.user.id } })) : false),
  },
  ReviewReport: {
    review: (rr) => prisma.review.findUnique({ where: { id: rr.reviewId } }),
    reporter: (rr) => prisma.user.findUnique({ where: { id: rr.reporterId } }),
  },
};
