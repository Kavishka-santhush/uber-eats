const prisma = require('../../config/prisma');
const { requireAuth, requireRole } = require('../../lib/roles');
const { paginate, num, money } = require('../../lib/misc');
const wallet = require('../../domain/wallet');
const payments = require('../../domain/payments');
const pricing = require('../../domain/pricing');
const stripeSvc = require('../../services/stripe');
const { notify } = require('../../domain/notification');
const { audit } = require('../../services/settings');

/** Wallet, payments, promos, loyalty, payouts, refunds. */

module.exports = {
  Query: {
    myWallet: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      return wallet.ensureWallet(user.id);
    },
    walletForUser: async (_p, { userId }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      return wallet.ensureWallet(userId);
    },
    activePromos: (_p, { restaurantId }) => prisma.promoCode.findMany({
      where: {
        isActive: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() },
        OR: [{ restaurantId: null }, ...(restaurantId ? [{ restaurantId }] : [])],
      },
      include: { restaurant: true },
    }),
    myPromoHistory: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      const usages = await prisma.promoCodeUsage.findMany({ where: { userId: user.id }, include: { promo: true }, orderBy: { usedAt: 'desc' }, take: 50 });
      return usages.map((u) => u.promo);
    },
    loyaltyHistory: async (_p, args, ctx) => {
      const user = requireAuth(ctx);
      const { take } = paginate(args);
      return prisma.loyaltyTransaction.findMany({
        where: { userId: user.id }, take, orderBy: { createdAt: 'desc' },
        include: { order: true },
      });
    },
    payments: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const { take, skip } = paginate(args, 100);
      const where = {
        ...(args.status ? { status: args.status } : {}),
        ...(args.method ? { method: args.method } : {}),
        ...(args.from || args.to ? { createdAt: { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(args.to) } : {}) } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { order: true, customer: true } }),
        prisma.payment.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
  },

  Mutation: {
    createCardPayment: async (_p, { orderId }, ctx) => {
      const user = requireRole(ctx, 'CUSTOMER');
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order.customerId !== user.id) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      const { clientSecret, intentId } = await stripeSvc.createOrderPaymentIntent(order);
      await prisma.payment.updateMany({ where: { orderId, method: 'CARD' }, data: { stripeIntentId: intentId, status: 'PROCESSING' } });
      return { clientSecret, intentId };
    },
    topUpWallet: async (_p, { amount }, ctx) => {
      const user = requireAuth(ctx);
      const { clientSecret, intentId } = await stripeSvc.createTopupPaymentIntent(user.id, amount);
      return { clientSecret, intentId };
    },
    confirmTopup: async (_p, { intentId }, ctx) => {
      const user = requireAuth(ctx);
      const pi = await stripeSvc.stripe.paymentIntents.retrieve(intentId);
      if (pi.status !== 'succeeded' || pi.metadata.userId !== user.id) {
        throw Object.assign(new Error('Payment not complete'), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      await wallet.creditWallet(user.id, pi.amount / 100, 'WALLET_TOPUP', pi.id, 'Stripe top-up');
      return wallet.ensureWallet(user.id);
    },
    applyPromo: async (_p, { orderDraft }, ctx) => {
      const user = requireAuth(ctx);
      const res = await pricing.evaluatePromo({
        code: orderDraft.promoCode, customerId: user.id,
        itemsTotal: orderDraft.itemsTotal, deliveryFee: orderDraft.deliveryFee || 0,
        restaurantId: orderDraft.restaurantId, subtotal: orderDraft.subtotal || orderDraft.itemsTotal,
      });
      return { ok: res.ok, discount: res.discount, freeDelivery: res.freeDelivery, reason: res.reason || null, promo: res.promo ? { code: res.promo.code, type: res.promo.type, value: res.promo.value } : null };
    },
    createPromo: async (_p, { input }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const p = await prisma.promoCode.create({ data: { ...input, createdBy: actor.id } });
      await audit({ userId: actor.id, action: 'promo.create', entity: 'promo', entityId: p.id });
      return p;
    },
    updatePromo: async (_p, { id, input }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      return prisma.promoCode.update({ where: { id }, data: input });
    },
    togglePromo: async (_p, { id, isActive }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      return prisma.promoCode.update({ where: { id }, data: { isActive } });
    },
    deletePromo: async (_p, { id }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      await prisma.promoCode.delete({ where: { id } });
      return true;
    },
    redeemLoyalty: async (_p, { points }, ctx) => {
      const user = requireAuth(ctx);
      const balance = await pricing.loyaltyPointsBalance(user.id);
      if (points > balance) throw Object.assign(new Error('Not enough points'), { extensions: { code: 'BAD_USER_INPUT' } });
      const value = await pricing.loyaltyValueOf(points);
      await prisma.$transaction([
        prisma.loyaltyTransaction.create({ data: { userId: user.id, type: 'WITHDRAWAL', points: -points, balanceAfter: balance - points, note: 'redeemed to wallet' } }),
      ]);
      await wallet.creditWallet(user.id, value, 'ADMIN_ADJUSTMENT', null, `Loyalty redemption (${points} pts)`);
      return { points, credited: value, balance: balance - points };
    },

    requestDriverPayout: async (_p, { amount, accountInfo }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const profile = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (num(profile.earningsBalance) < amount) throw Object.assign(new Error('Amount exceeds balance'), { extensions: { code: 'BAD_USER_INPUT' } });
      const payout = await prisma.driverPayout.create({ data: { driverId: user.id, amount, accountInfo } });
      await prisma.driverProfile.update({ where: { userId: user.id }, data: { earningsBalance: { decrement: amount } } });
      const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } }, select: { id: true } });
      await notify(admins.map((a) => a.id), { title: 'Driver payout requested', body: `${amount} withdrawal`, category: 'system' });
      return payout;
    },
    requestRestaurantPayout: async (_p, { restaurantId, periodFrom, periodTo }, ctx) => {
      const user = requireAuth(ctx);
      await assertRestaurantOwnership(user, restaurantId);
      const agg = await prisma.order.aggregate({
        where: { branch: { restaurantId }, status: 'DELIVERED', deliveredAt: { gte: new Date(periodFrom), lte: new Date(periodTo) } },
        _sum: { total: true, commissionAmount: true, restaurantEarning: true },
      });
      const gross = num(agg._sum.total);
      const commission = num(agg._sum.commissionAmount);
      const net = num(agg._sum.restaurantEarning);
      const payout = await prisma.restaurantPayout.create({
        data: { restaurantId, periodFrom: new Date(periodFrom), periodTo: new Date(periodTo), grossAmount: gross, commission, netAmount: net },
      });
      return payout;
    },
    adminProcessPayout: async (_p, { id, approve, isDriver }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const status = approve ? 'PAID' : 'REJECTED';
      if (isDriver) {
        const p = await prisma.driverPayout.update({ where: { id }, data: { status, processedBy: actor.id, processedAt: new Date() } });
        if (!approve) await prisma.driverProfile.update({ where: { userId: p.driverId }, data: { earningsBalance: { increment: num(p.amount) } } });
        return p;
      }
      return prisma.restaurantPayout.update({ where: { id }, data: { status, processedBy: actor.id, processedAt: new Date() } });
    },

    processRefund: async (_p, { orderId, amount, partial, reason }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
      const payment = order.payments.find((p) => p.status === 'SUCCEEDED');
      const refundAmount = money(amount ?? order.total);
      let stripeRefundId = null;
      if (payment?.stripePaymentId) {
        const r = await stripeSvc.refundPayment(payment, refundAmount, reason);
        stripeRefundId = r.id;
      } else if (payment && (payment.method === 'WALLET' || payment.method === 'CASH')) {
        await wallet.creditWallet(order.customerId, refundAmount, 'ORDER_REFUND', order.id, `Refund ${order.orderNumber}`);
      }
      const refund = await prisma.refund.upsert({
        where: { orderId },
        update: { amount: refundAmount, status: 'SUCCEEDED', reason, stripeRefundId, processedBy: actor.id },
        create: { paymentId: payment?.id || order.id, orderId, amount: refundAmount, isPartial: !!partial, reason, status: 'SUCCEEDED', stripeRefundId, processedBy: actor.id },
      });
      await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: partial ? 'PARTIALLY_REFUNDED' : 'REFUNDED' } });
      await audit({ userId: actor.id, action: 'payment.refund', entity: 'order', entityId: orderId, meta: { amount: refundAmount } });
      await notify(order.customerId, { title: 'Refund processed', body: `${refundAmount} for ${order.orderNumber}`, email: true });
      return refund;
    },
    adminCreditWallet: async (_p, { userId, amount, note }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      await wallet.creditWallet(userId, amount, 'ADMIN_ADJUSTMENT', actor.id, note || 'Support credit');
      await audit({ userId: actor.id, action: 'wallet.credit', entity: 'user', entityId: userId, meta: { amount, note } });
      return wallet.ensureWallet(userId);
    },
  },

  Wallet: {
    transactions: async (w, args) => {
      const { take, skip } = paginate(args);
      const where = { walletId: w.id };
      const [items, total] = await Promise.all([
        prisma.walletTransaction.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        prisma.walletTransaction.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
  },
  Payment: { order: (p) => (p.order || prisma.order.findUnique({ where: { id: p.orderId } })) },
  Refund: { order: (r) => (r.order || prisma.order.findUnique({ where: { id: r.orderId } })) },
};

async function assertRestaurantOwnership(user, restaurantId) {
  if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return;
  const r = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: user.id } });
  if (!r) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
}
