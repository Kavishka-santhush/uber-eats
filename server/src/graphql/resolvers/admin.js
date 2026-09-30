const fs = require('fs');
const path = require('path');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const bcrypt = require('bcryptjs');
const { requireRole, requireAuth } = require('../../lib/roles');
const { paginate, num, money } = require('../../lib/misc');
const { getSetting, setSetting, audit } = require('../../services/settings');
const { announcement } = require('../../domain/notification');
const pdf = require('../../services/pdf');

/** Admin dashboard, analytics, surge zones, settings, audit, invoices. */

async function platformStats() {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const [activeOrders, onlineDrivers, activeRestaurants, revToday, ordersToday, newSignups, revTotal, payouts] = await Promise.all([
    prisma.order.count({ where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
    prisma.driverProfile.count({ where: { availability: { in: ['ONLINE', 'ON_DELIVERY'] } } }),
    prisma.restaurant.count({ where: { status: 'APPROVED' } }),
    prisma.order.aggregate({ where: { status: 'DELIVERED', deliveredAt: { gte: dayStart } }, _sum: { total: true } }),
    prisma.order.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { total: true } }),
    prisma.driverPayout.aggregate({ where: { status: 'REQUESTED' }, _sum: { amount: true } }),
  ]);
  return {
    activeOrders, onlineDrivers, activeRestaurants,
    revenueToday: money(num(revToday._sum.total)),
    ordersToday, newSignupsToday: newSignups,
    revenueTotal: money(num(revTotal._sum.total)),
    payoutsPendingAmount: money(num(payouts._sum.amount)),
  };
}

function daySeries(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

async function revenueSeries(days = 14) {
  const dates = daySeries(days);
  const since = dates[0];
  const orders = await prisma.order.findMany({
    where: { status: 'DELIVERED', deliveredAt: { gte: since } },
    select: { total: true, deliveredAt: true },
  });
  const map = {};
  for (const o of orders) {
    const key = o.deliveredAt.toISOString().slice(0, 10);
    map[key] = money((map[key] || 0) + num(o.total));
  }
  return dates.map((d) => ({ label: d.toISOString().slice(0, 10), value: map[d.toISOString().slice(0, 10)] || 0 }));
}

async function ordersSeries(days = 14) {
  const dates = daySeries(days);
  return Promise.all(dates.map(async (d) => {
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const c = await prisma.order.count({ where: { createdAt: { gte: d, lt: next } } });
    return { label: d.toISOString().slice(0, 10), value: c };
  }));
}

module.exports = {
  Query: {
    platformStats: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      return platformStats();
    },
    adminDashboard: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const [stats, revenueS, ordersS, topRestaurants, topDrivers, recentOrders, pendingRestaurantApps, pendingDriverApps, openTickets] = await Promise.all([
        platformStats(), revenueSeries(14), ordersSeries(14),
        prisma.restaurant.findMany({ where: { status: 'APPROVED' }, orderBy: { totalOrders: 'desc' }, take: 5, include: { branches: true } }),
        prisma.driverProfile.findMany({ where: { approvalStatus: 'APPROVED' }, orderBy: { totalDeliveries: 'desc' }, take: 5, include: { user: true } }),
        prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { customer: true, branch: { include: { restaurant: true } } } }),
        prisma.restaurant.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.driverProfile.count({ where: { approvalStatus: 'PENDING_APPROVAL' } }),
        prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      ]);
      return { stats, revenueSeries: revenueS, ordersSeries: ordersS, topRestaurants, topDrivers, recentOrders, pendingRestaurantApps, pendingDriverApps, openTickets };
    },
    analytics: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const from = args.from ? new Date(args.from) : new Date(Date.now() - 30 * 86400_000);
      const to = args.to ? new Date(args.to) : new Date();
      const [byStatus, byHour, topCuisines, restaurantRevenue, driverThroughput, customerGrowth] = await Promise.all([
        prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
        prisma.order.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
        prisma.cuisine.findMany({ include: { restaurants: { where: { status: 'APPROVED' }, select: { id: true } } } }),
        prisma.restaurant.findMany({ where: { status: 'APPROVED' }, include: { branches: { select: { orders: true } } } }),
        prisma.driverProfile.findMany({ where: { approvalStatus: 'APPROVED' }, include: { user: { select: { fullName: true } } }, orderBy: { totalDeliveries: 'desc' }, take: 10 }),
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
      ]);
      const hourBuckets = new Array(24).fill(0);
      for (const o of byHour) hourBuckets[new Date(o.createdAt).getHours()] += 1;
      return {
        revenue: await revenueSeries(30),
        ordersByStatus: byStatus.map((s) => ({ label: s.status, value: s._count })),
        ordersByHour: hourBuckets.map((v, h) => ({ label: `${h}:00`, value: v })),
        topCuisines: topCuisines.map((c) => ({ label: c.name, value: c.restaurants.length })).sort((a, b) => b.value - a.value).slice(0, 8),
        restaurantRevenue: restaurantRevenue.map((r) => ({ label: r.name, value: money(num(r.avgRating)) })).slice(0, 10),
        driverThroughput: driverThroughput.map((d) => ({ label: d.user.fullName, value: d.totalDeliveries })),
        customerGrowth: [{ label: 'total_customers', value: customerGrowth }],
      };
    },
    surgeZones: (_p, { activeOnly }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      return prisma.surgeZone.findMany({ where: activeOnly ? { isActive: true } : {}, include: { branch: true } });
    },
    activeDeliveries: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      return prisma.delivery.findMany({
        where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        include: { order: { include: { customer: true, branch: { include: { restaurant: true } } } }, driver: { include: { user: true } }, branch: true },
      });
    },
    platformSettings: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN');
      const rows = await prisma.platformSetting.findMany();
      return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
    },
    auditLogs: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const { take, skip } = paginate(args, 100);
      const where = { ...(args.action ? { action: { contains: args.action } } : {}), ...(args.userId ? { userId: args.userId } : {}) };
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { user: true } }),
        prisma.auditLog.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    adminRestaurants: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const { take, skip } = paginate(args, 20);
      const where = {
        ...(args.status ? { status: args.status } : {}),
        ...(args.search ? { name: { contains: args.search, mode: 'insensitive' } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.restaurant.findMany({
          where, skip, take, orderBy: { createdAt: 'desc' },
          include: { owner: { select: { id: true, fullName: true, email: true } }, branches: true, cuisines: { include: { cuisine: true } } },
        }),
        prisma.restaurant.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    restaurantEarnings: async (_p, { restaurantId, from, to }, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === 'RESTAURANT_OWNER') {
        const r = await prisma.restaurant.findFirst({ where: { id: restaurantId, ownerId: user.id } });
        if (!r) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      } else requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const where = { branch: { restaurantId }, status: 'DELIVERED' };
      if (from || to) where.deliveredAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
      const orders = await prisma.order.findMany({ where, select: { total: true, commissionAmount: true, restaurantEarning: true, deliveredAt: true } });
      const gross = money(orders.reduce((s, o) => s + num(o.total), 0));
      const commission = money(orders.reduce((s, o) => s + num(o.commissionAmount), 0));
      const net = money(orders.reduce((s, o) => s + num(o.restaurantEarning), 0));
      return { count: orders.length, gross, commission, net, currency: env.PLATFORM_CURRENCY };
    },
    reportCsv: async (_p, { kind, from, to }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const range = { ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) };
      let rows = [];
      if (kind === 'orders') rows = (await prisma.order.findMany({ where: range, include: { customer: true, branch: true } })).map((o) => [o.orderNumber, o.status, o.total, o.branch.name, o.customer.fullName, o.createdAt.toISOString()]);
      else if (kind === 'restaurants') rows = (await prisma.restaurant.findMany()).map((r) => [r.name, r.status, r.avgRating, r.totalOrders]);
      else if (kind === 'drivers') rows = (await prisma.driverProfile.findMany({ include: { user: true } })).map((d) => [d.user.fullName, d.approvalStatus, d.totalDeliveries, d.avgRating]);
      const csv = [(['order_number,status,total,restaurant,customer,created'].split(',')), ...rows].map((r) => r.join(',')).join('\n');
      const dir = path.join(process.cwd(), env.UPLOAD_DIR, 'reports');
      fs.mkdirSync(dir, { recursive: true });
      const file = `${kind}-${Date.now()}.csv`;
      fs.writeFileSync(path.join(dir, file), csv);
      return `/uploads/reports/${file}`;
    },
    demandPrediction: async (_p, { branchId }, ctx) => {
      requireAuth(ctx);
      const counts = await prisma.order.groupBy({ by: ['status'], where: { branchId }, _count: true });
      const recent = await prisma.order.findMany({ where: { branchId }, select: { createdAt: true }, take: 500 });
      const hourly = new Array(24).fill(0);
      recent.forEach((o) => { hourly[new Date(o.createdAt).getHours()] += 1; });
      const ai = require('../../services/openrouter');
      return ai.predictDemand(hourly);
    },
  },

  Mutation: {
    adminUpsertSetting: async (_p, { key, value }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN');
      const v = await setSetting(key, value, actor.id);
      await audit({ userId: actor.id, action: 'setting.update', entity: key, meta: { value } });
      return { key, value: v, updatedAt: new Date() };
    },
    adminSetCommissionRate: async (_p, { percent }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN');
      await setSetting('commission.rate', { percent }, actor.id);
      return true;
    },
    adminSetLoyaltyRates: async (_p, { earnRate, redeemRate }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN');
      await setSetting('loyalty.earn_rate', { pointsPerCurrencyUnit: earnRate }, actor.id);
      await setSetting('loyalty.redeem_rate', { pointsPerCurrencyUnit: redeemRate }, actor.id);
      return true;
    },

    upsertSurgeZone: async (_p, { id, input }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const data = { ...input, daysOfWeek: input.daysOfWeek || [] };
      delete data.branchId;
      const res = id
        ? await prisma.surgeZone.update({ where: { id }, data: { ...data, branch: input.branchId ? { connect: { id: input.branchId } } : undefined } })
        : await prisma.surgeZone.create({ data: { ...data, branch: input.branchId ? { connect: { id: input.branchId } } : undefined } });
      await audit({ userId: actor.id, action: id ? 'surge.update' : 'surge.create', entity: 'surge', entityId: res.id });
      return res;
    },
    toggleSurgeZone: async (_p, { id, active }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      return prisma.surgeZone.update({ where: { id }, data: { isActive: active } });
    },
    deleteSurgeZone: async (_p, { id }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      await prisma.surgeZone.delete({ where: { id } });
      return true;
    },

    adminSuspendRestaurant: async (_p, { id, suspended }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const r = await prisma.restaurant.update({ where: { id }, data: { status: suspended ? 'SUSPENDED' : 'APPROVED' } });
      await prisma.branch.updateMany({ where: { restaurantId: id }, data: { status: suspended ? 'CLOSED' : 'OPEN' } });
      await audit({ userId: actor.id, action: suspended ? 'restaurant.suspend' : 'restaurant.reactivate', entity: 'restaurant', entityId: id });
      return r;
    },
    adminInterveneOrder: async (_p, { id, action, note }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const order = await prisma.order.findUnique({ where: { id }, include: { payments: true } });
      if (action === 'force_cancel') {
        const paymentsDomain = require('../../domain/payments');
        await paymentsDomain.cancelAndRefund(order, { reason: note || 'admin intervention', cancelledBy: actor.id });
      } else if (action === 'reassign') {
        const d = await prisma.delivery.findUnique({ where: { orderId: id } });
        if (d) { await prisma.delivery.update({ where: { id: d.id }, data: { driverId: null } }); require('../../domain/dispatch').requestDrivers(id); }
      }
      await audit({ userId: actor.id, action: `order.${action}`, entity: 'order', entityId: id, meta: { note } });
      return prisma.order.findUnique({ where: { id }, include: { items: true, branch: true, customer: true } });
    },
    publishAnnouncement: async (_p, { title, body }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      await announcement(title, body);
      await audit({ userId: actor.id, action: 'announcement.publish', entity: 'announcement', meta: { title } });
      return true;
    },
    generateInvoice: async (_p, { orderId }, ctx) => {
      requireAuth(ctx);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, customer: true, address: true, branch: { include: { restaurant: true } }, promoCode: true },
      });
      const file = await pdf.generateOrderInvoicePdf(order);
      return `/uploads/pdf/${path.basename(file)}`;
    },
    generateRestaurantStatement: async (_p, { restaurantId, periodFrom, periodTo }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'RESTAURANT_OWNER');
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, include: { owner: true } });
      const agg = await prisma.order.aggregate({
        where: { branch: { restaurantId }, status: 'DELIVERED', deliveredAt: { gte: new Date(periodFrom), lte: new Date(periodTo) } },
        _sum: { total: true, commissionAmount: true, restaurantEarning: true }, _count: true,
      });
      const { commissionRateFor } = require('../../services/settings');
      const summary = {
        count: agg._count, gross: num(agg._sum.total), commission: num(agg._sum.commissionAmount),
        net: num(agg._sum.restaurantEarning), commissionPercent: await commissionRateFor(restaurant),
      };
      const period = `${new Date(periodFrom).toISOString().slice(0, 7)}`;
      const file = await pdf.generateRestaurantStatementPdf(restaurant, period, summary);
      return `/uploads/pdf/${path.basename(file)}`;
    },
    adminAddStaffUser: async (_p, { role, fullName, email, password }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN');
      return prisma.user.create({
        data: { role, fullName, email, passwordHash: await bcrypt.hash(password, 10), status: 'ACTIVE', notificationPref: { create: {} } },
      });
    },
  },
};
