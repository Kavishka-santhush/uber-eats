const prisma = require('../../config/prisma');
const { requireAuth, requireRole } = require('../../lib/roles');
const { paginate, num, money } = require('../../lib/misc');
const dispatch = require('../../domain/dispatch');
const { notify } = require('../../domain/notification');
const { audit } = require('../../services/settings');

/** Delivery drivers: availability, requests, earnings, history, admin ops. */

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

module.exports = {
  Query: {
    myDriverProfile: async (_p, _a, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      return prisma.driverProfile.findUnique({ where: { userId: user.id }, include: { user: true } });
    },
    driverProfile: async (_p, { userId }, ctx) => {
      requireAuth(ctx);
      return prisma.driverProfile.findUnique({ where: { userId }, include: { user: true } });
    },
    myDeliveryRequests: async (_p, _a, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const reqs = await prisma.deliveryRequest.findMany({
        where: { driverId: user.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        include: { delivery: { include: { order: { include: { branch: { include: { restaurant: true } } } } } } },
        orderBy: { createdAt: 'desc' },
      });
      return reqs.map((r) => ({
        id: r.id,
        deliveryId: r.deliveryId,
        status: r.status,
        expiresAt: r.expiresAt,
        order: r.delivery.order,
        fee: r.delivery.driverEarning,
        distanceKm: r.delivery.distanceKm,
      }));
    },
    driverEarnings: async (_p, args, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const since = args.from ? new Date(args.from) : new Date(Date.now() - 30 * 86400_000);
      const dels = await prisma.delivery.findMany({
        where: { driverId: user.id, status: 'DELIVERED', deliveredAt: { gte: since } },
        select: { driverEarning: true, deliveredAt: true },
      });
      const sum = (rows) => money(rows.reduce((s, d) => s + num(d.driverEarning), 0));
      const today = startOfDay();
      const week = new Date(Date.now() - 7 * 86400_000);
      const byDay = {};
      for (const d of dels) {
        const key = d.deliveredAt.toISOString().slice(0, 10);
        byDay[key] = money((byDay[key] || 0) + num(d.driverEarning));
      }
      return {
        today: sum(dels.filter((d) => d.deliveredAt >= today)),
        week: sum(dels.filter((d) => d.deliveredAt >= week)),
        month: sum(dels.filter((d) => d.deliveredAt >= since)),
        lifetime: sum(dels),
        byDay: Object.entries(byDay).map(([date, amount]) => ({ date, amount })),
      };
    },
    driverHistory: async (_p, args, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const { take, skip } = paginate(args);
      const where = { delivery: { driverId: user.id, status: 'DELIVERED' } };
      const [items, total] = await Promise.all([
        prisma.order.findMany({ where, skip, take, orderBy: { deliveredAt: 'desc' }, include: { branch: { include: { restaurant: true } }, delivery: true } }),
        prisma.order.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    onlineDrivers: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      return prisma.driverProfile.findMany({
        where: { availability: { in: ['ONLINE', 'ON_DELIVERY'] }, approvalStatus: 'APPROVED' },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      });
    },
    drivers: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const { take, skip } = paginate(args);
      const where = {
        ...(args.status ? { approvalStatus: args.status } : {}),
        ...(args.search ? { user: { OR: [
          { fullName: { contains: args.search, mode: 'insensitive' } },
          { email: { contains: args.search, mode: 'insensitive' } },
          { phone: { contains: args.search } },
        ] } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.driverProfile.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, include: { user: true } }),
        prisma.driverProfile.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    driverPerformance: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const agg = await prisma.driverProfile.aggregate({
        _avg: { completionRate: true, acceptanceRate: true, onTimeRate: true, avgRating: true },
        _count: true, _sum: { totalDeliveries: true },
      });
      return agg;
    },
    driverHeatmap: async (_p, _a, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const drivers = await prisma.driverProfile.findMany({
        where: { availability: { in: ['ONLINE', 'ON_DELIVERY'] }, lastLat: { not: null } },
        select: { lastLat: true, lastLng: true },
      });
      // 0.01° grid cells
      const cells = {};
      for (const d of drivers) {
        const key = `${num(d.lastLat).toFixed(2)},${num(d.lastLng).toFixed(2)}`;
        cells[key] = (cells[key] || 0) + 1;
      }
      return { total: drivers.length, cells: Object.entries(cells).map(([cell, count]) => ({ cell, count })) };
    },
  },

  Mutation: {
    setDriverOnline: async (_p, { online }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const profile = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (profile.approvalStatus !== 'APPROVED' || profile.isSuspended) {
        throw Object.assign(new Error('Not approved or suspended'), { extensions: { code: 'FORBIDDEN' } });
      }
      return dispatch.setDriverAvailability(user.id, online);
    },
    updateDriverLocation: async (_p, { lat, lng }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      await prisma.driverProfile.update({ where: { userId: user.id }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } });
      // if on an active delivery, push to tracking room too
      const active = await prisma.delivery.findFirst({ where: { driverId: user.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } } });
      if (active) {
        const { recordLocation } = require('./orders').__internals;
        await recordLocation(active, { lat, lng });
      }
      return true;
    },
    respondToDelivery: async (_p, { deliveryId, accept, reason }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      if (accept) {
        const d = await dispatch.acceptRequest(user.id, deliveryId);
        return { ok: true, deliveryId: d.id, orderId: d.orderId };
      }
      await dispatch.rejectRequest(user.id, deliveryId, reason);
      return { ok: true, deliveryId, accepted: false };
    },
    updateDriverDocuments: async (_p, input, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v != null));
      return prisma.driverProfile.update({ where: { userId: user.id }, data });
    },
    updateDriverProfile: async (_p, { input }, ctx) => {
      const user = requireRole(ctx, 'DRIVER');
      return prisma.driverProfile.update({ where: { userId: user.id }, data: input });
    },
    adminSetDriverApproval: async (_p, { userId, status, reason }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const profile = await prisma.driverProfile.update({
        where: { userId }, data: { approvalStatus: status, rejectionReason: reason || null },
        include: { user: true },
      });
      if (status === 'APPROVED') await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
      await notify(userId, {
        title: status === 'APPROVED' ? 'You are approved! 🛵' : `Application ${status.toLowerCase()}`,
        body: status === 'REJECTED' ? (reason || 'See dashboard') : 'Start accepting deliveries.',
        email: true, category: 'system',
      });
      await audit({ userId: actor.id, action: `driver.${status.toLowerCase()}`, entity: 'driver', entityId: userId, ip: ctx.req?.ip });
      return profile;
    },
    adminSetDriverSuspension: async (_p, { userId, suspended, reason }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const profile = await prisma.driverProfile.update({
        where: { userId },
        data: { isSuspended: suspended, suspensionReason: reason || null, availability: suspended ? 'OFFLINE' : undefined },
      });
      await audit({ userId: actor.id, action: suspended ? 'driver.suspend' : 'driver.reactivate', entity: 'driver', entityId: userId });
      return profile;
    },
    adminReassignDelivery: async (_p, { deliveryId, toDriverId }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER');
      const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
      if (!d) throw Object.assign(new Error('Not found'), { extensions: { code: 'NOT_FOUND' } });
      if (d.driverId) {
        await prisma.driverProfile.update({ where: { userId: d.driverId }, data: { availability: 'ONLINE' } });
      }
      if (toDriverId) {
        await prisma.delivery.update({ where: { id: deliveryId }, data: { driverId: toDriverId, status: 'DRIVER_ASSIGNED', assignedAt: new Date() } });
        await prisma.driverProfile.update({ where: { userId: toDriverId }, data: { availability: 'ON_DELIVERY' } });
        const order = await prisma.order.update({ where: { id: d.orderId }, data: { status: 'DRIVER_ASSIGNED' } });
        const { emitOrderUpdate } = require('../../realtime/hub');
        await emitOrderUpdate(d.orderId);
        return prisma.delivery.findUnique({ where: { id: deliveryId }, include: { driver: { include: { user: true } }, order: true } });
      }
      // unassign → re-broadcast
      await prisma.delivery.update({ where: { id: deliveryId }, data: { driverId: null } });
      dispatch.requestDrivers(d.orderId).catch(() => {});
      return prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: true } });
    },
  },

  DriverProfile: {
    user: (d) => (d.user || prisma.user.findUnique({ where: { id: d.userId } })),
    activeDelivery: (d) => prisma.delivery.findFirst({ where: { driverId: d.userId, status: { notIn: ['DELIVERED', 'CANCELLED'] } }, include: { order: { include: { branch: { include: { restaurant: true } } } } } }),
  },
};
