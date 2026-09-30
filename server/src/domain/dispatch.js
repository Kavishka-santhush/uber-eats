const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const { haversineKm } = require('../lib/haversine');
const { money, num } = require('../lib/misc');
const pricing = require('./pricing');
const { emitDeliveryRequest, emitOrderUpdate, emitToUser } = require('../realtime/hub');
const { notify } = require('./notification');

/**
 * Driver dispatch — nearest-driver matching (Haversine), broadcast with
 * countdown, accept/reject handling and auto-escalation to next nearest.
 */

const DISPATCH_RADIUS_KM = 8;
const MAX_BROADCAST = 5;

/** Find online, approved, non-suspended drivers near the branch. */
async function findNearestDrivers(branch, limit = MAX_BROADCAST) {
  const online = await prisma.driverProfile.findMany({
    where: {
      availability: 'ONLINE',
      approvalStatus: 'APPROVED',
      isSuspended: false,
      lastLat: { not: null },
      user: { status: 'ACTIVE' },
    },
    include: { user: { select: { id: true, fullName: true, phone: true, avatarUrl: true } } },
  });
  return online
    .map((d) => ({
      driver: d,
      distanceKm: haversineKm(
        { lat: num(branch.lat), lng: num(branch.lng) },
        { lat: num(d.lastLat), lng: num(d.lastLng) },
      ),
    }))
    .filter((x) => x.distanceKm <= DISPATCH_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

/**
 * Create the Delivery record and broadcast to nearest drivers.
 * Called when a restaurant marks an order READY_FOR_PICKUP (or right after
 * placement for pre-assignment strategies).
 */
async function requestDrivers(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { branch: { include: { restaurant: true } }, customer: true },
  });
  if (!order || order.status === 'CANCELLED') return null;

  let delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) {
    const branch = order.branch;
    const fees = await pricing.computeDriverFee(order.distanceKm ?? 3, order.surgeMultiplier);
    delivery = await prisma.delivery.create({
      data: {
        orderId, branchId: branch.id, status: order.status,
        pickupLat: branch.lat, pickupLng: branch.lng,
        dropoffLat: order.dropoffLat, dropoffLng: order.dropoffLng,
        distanceKm: order.distanceKm,
        baseFee: fees.baseFee, distanceBonus: fees.distanceBonus,
        platformCut: fees.platformCut, driverEarning: fees.driverEarning,
        surgeMultiplier: order.surgeMultiplier,
      },
    });
  }

  const near = await findNearestDrivers(delivery.branch || order.branch);
  if (!near.length) {
    logger.info(`no drivers near branch ${order.branchId} for ${order.orderNumber}; will retry`);
    scheduleRetry(orderId);
    return delivery;
  }

  const expiresAt = new Date(Date.now() + env.DRIVER_REQUEST_TIMEOUT_SECONDS * 1000);
  await prisma.deliveryRequest.createMany({
    data: near.map(({ driver }) => ({
      deliveryId: delivery.id, driverId: driver.userId, expiresAt,
    })),
  });

  for (const { driver, distanceKm } of near) {
    emitDeliveryRequest(driver.user.id, {
      deliveryId: delivery.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurant: {
        name: order.branch.restaurant.name,
        address: order.branch.addressLine1,
        lat: num(order.branch.lat), lng: num(order.branch.lng),
      },
      customer: {
        name: order.customer.fullName,
        address: order.specialInstructions || '—',
        lat: num(order.dropoffLat), lng: num(order.dropoffLng),
      },
      distanceKm: money(distanceKm),
      fee: num(delivery.driverEarning),
      expiresAt: expiresAt.toISOString(),
    });
  }
  return delivery;
}

// Simple in-process retry so a delivery without nearby drivers still gets
// picked up once someone goes online (also triggered by driver:online).
const retryTimers = new Map();
function scheduleRetry(orderId) {
  if (retryTimers.has(orderId)) return;
  const t = setTimeout(() => {
    retryTimers.delete(orderId);
    requestDrivers(orderId).catch((e) => logger.warn(`dispatch retry failed: ${e.message}`));
  }, 30_000);
  retryTimers.set(orderId, t);
}

/** Driver accepts: cancel sibling requests, assign, flip availability. */
async function acceptRequest(userId, deliveryId) {
  const req = await prisma.deliveryRequest.findFirst({
    where: { deliveryId, driverId: userId, status: 'PENDING' },
    include: { delivery: { include: { order: { include: { customer: true, branch: true } } } } },
  });
  if (!req) throw Object.assign(new Error('Request not found or expired'), { extensions: { code: 'BAD_USER_INPUT' } });
  if (req.expiresAt < new Date()) {
    await prisma.deliveryRequest.update({ where: { id: req.id }, data: { status: 'EXPIRED' } });
    throw Object.assign(new Error('Request expired'), { extensions: { code: 'BAD_USER_INPUT' } });
  }
  const { delivery } = req;
  if (delivery.driverId && delivery.driverId !== userId) {
    throw Object.assign(new Error('Already assigned to another driver'), { extensions: { code: 'BAD_USER_INPUT' } });
  }

  await prisma.$transaction([
    prisma.deliveryRequest.update({ where: { id: req.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } }),
    prisma.deliveryRequest.updateMany({
      where: { deliveryId, id: { not: req.id }, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    }),
    prisma.delivery.update({
      where: { id: delivery.id },
      data: { driverId: userId, status: 'DRIVER_ASSIGNED', assignedAt: new Date() },
    }),
    prisma.driverProfile.update({
      where: { userId },
      data: { availability: 'ON_DELIVERY' },
    }),
    prisma.order.update({
      where: { id: delivery.orderId },
      data: { status: 'DRIVER_ASSIGNED' },
    }),
    prisma.orderStatusLog.create({
      data: { orderId: delivery.orderId, status: 'DRIVER_ASSIGNED', note: `driver ${userId} accepted` },
    }),
  ]);

  const driverUser = await prisma.user.findUnique({ where: { id: userId } });
  await notify(delivery.order.customerId, {
    title: 'Driver assigned 🛵',
    body: `${driverUser.fullName} is heading to the restaurant.`,
    data: { orderId: delivery.orderId, driverId: userId },
  });
  await emitOrderUpdate(delivery.orderId);
  return delivery;
}

/** Driver rejects: mark request, try next nearest candidate. */
async function rejectRequest(userId, deliveryId, reason) {
  const req = await prisma.deliveryRequest.findFirst({
    where: { deliveryId, driverId: userId, status: 'PENDING' },
  });
  if (!req) return false;
  await prisma.deliveryRequest.update({
    where: { id: req.id },
    data: { status: 'REJECTED', respondedAt: new Date(), rejectReason: reason || null },
  });
  const remaining = await prisma.deliveryRequest.count({
    where: { deliveryId, status: 'PENDING' },
  });
  if (remaining === 0) {
    // widen the net
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId }, include: { branch: true },
    });
    const near = await findNearestDrivers(delivery.branch, MAX_BROADCAST * 2);
    const already = await prisma.deliveryRequest.findMany({
      where: { deliveryId }, select: { driverId: true },
    });
    const taken = new Set(already.map((a) => a.driverId));
    const fresh = near.filter((n) => !taken.has(n.driver.userId));
    if (fresh.length) {
      const expiresAt = new Date(Date.now() + env.DRIVER_REQUEST_TIMEOUT_SECONDS * 1000);
      await prisma.deliveryRequest.createMany({
        data: fresh.map(({ driver }) => ({ deliveryId, driverId: driver.userId, expiresAt })),
      });
      for (const { driver, distanceKm } of fresh) {
        emitDeliveryRequest(driver.user.id, {
          deliveryId, orderId: delivery.orderId, widened: true,
          distanceKm: money(distanceKm), fee: num(delivery.driverEarning),
          expiresAt: expiresAt.toISOString(),
        });
      }
    } else {
      scheduleRetry(delivery.orderId);
    }
  }
  return true;
}

/**
 * Expire outstanding requests (called by the jobs ticker).
 * If a delivery never got a driver, escalate re-broadcast.
 */
async function expireStaleRequests() {
  const stale = await prisma.deliveryRequest.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    include: { delivery: true },
  });
  if (!stale.length) return 0;
  await prisma.deliveryRequest.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'EXPIRED' },
  });
  const deliveryIds = [...new Set(stale.map((s) => s.deliveryId))];
  for (const id of deliveryIds) {
    const open = await prisma.delivery.findFirst({
      where: { id, driverId: null, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
    });
    if (open) requestDrivers(open.orderId).catch(() => {});
  }
  return stale.length;
}

/** Driver availability toggle — going online can unblock waiting orders. */
async function setDriverAvailability(userId, online) {
  const profile = await prisma.driverProfile.update({
    where: { userId },
    data: { availability: online ? 'ONLINE' : 'OFFLINE' },
  });
  if (online) {
    // try to attach this driver to queued deliveries near any branch
    const waiting = await prisma.delivery.findMany({
      where: { driverId: null, status: { in: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'] } },
      include: { branch: true },
      take: 5,
    });
    for (const d of waiting) {
      const dist = haversineKm(
        { lat: num(d.branch.lat), lng: num(d.branch.lng) },
        { lat: num(profile.lastLat || d.branch.lat), lng: num(profile.lastLng || d.branch.lng) },
      );
      if (dist <= DISPATCH_RADIUS_KM) {
        const near = [{ driver: profile, distanceKm: dist }];
        const expiresAt = new Date(Date.now() + env.DRIVER_REQUEST_TIMEOUT_SECONDS * 1000);
        await prisma.deliveryRequest.create({
          data: { deliveryId: d.id, driverId: userId, expiresAt },
        });
        emitDeliveryRequest(userId, { deliveryId: d.id, orderId: d.orderId, distanceKm: money(dist), fee: num(d.driverEarning), expiresAt: expiresAt.toISOString() });
      }
    }
  }
  return profile;
}

/** Route-deviation alert: driver strayed >1.5km off the straight-line leg. */
function detectRouteDeviation(delivery, point) {
  const legStart = delivery.pickedUpAt
    ? { lat: num(delivery.pickupLat), lng: num(delivery.pickupLng) }
    : { lat: num(delivery.dropoffLat), lng: num(delivery.dropoffLng) };
  const legEnd = delivery.pickedUpAt
    ? { lat: num(delivery.dropoffLat), lng: num(delivery.dropoffLng) }
    : { lat: num(delivery.pickupLat), lng: num(delivery.pickupLng) };
  const total = haversineKm(legStart, legEnd);
  const via = haversineKm(legStart, point) + haversineKm(point, legEnd);
  return via - total > Math.max(1.5, total * 0.6);
}

module.exports = {
  requestDrivers, acceptRequest, rejectRequest, expireStaleRequests,
  setDriverAvailability, findNearestDrivers, detectRouteDeviation, scheduleRetry,
};
