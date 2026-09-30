const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { emitToRoom } = require('./hub');

/**
 * Socket.io event handlers, registered on top of the auth handshake already
 * performed in hub.init (socket.data.user = verified access-token payload
 * { sub, role, fullName, tv }).
 *
 * Rooms beyond the base ones (user:/drivers:/ops:/admins) joined at connect:
 *   order:<id>   joined explicitly by customer / branch staff / assigned driver
 *   branch:<id>  joined by restaurant back-office clients
 *
 * The GPS cadence is client-throttled to ~3s per driver.
 */

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'];

async function canAccessBranch(userId, role, branchId) {
  if (STAFF.includes(role)) return true;
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { restaurant: { select: { ownerId: true } }, staff: { select: { userId: true } } },
  });
  if (!branch) return false;
  if (branch.restaurant.ownerId === userId) return true;
  if (role === 'RESTAURANT_STAFF' && branch.staff.some((s) => s.userId === userId)) return true;
  return false;
}

async function canJoinOrder(userId, role, orderId) {
  if (STAFF.includes(role)) return true;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      branch: { include: { restaurant: { select: { ownerId: true } }, staff: { select: { userId: true } } } },
      delivery: { select: { driverId: true } },
    },
  });
  if (!order) return false;
  if (order.customerId === userId) return true;
  if (order.delivery?.driverId === userId) return true;
  if (order.branch.restaurant.ownerId === userId) return true;
  if (role === 'RESTAURANT_STAFF' && order.branch.staff.some((s) => s.userId === userId)) return true;
  return false;
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const { sub: userId, role } = socket.data.user;

    // ---- room membership ------------------------------------------------
    socket.on('order:join', async ({ orderId } = {}) => {
      if (!orderId) return;
      if (await canJoinOrder(userId, role, orderId)) {
        socket.join(`order:${orderId}`);
        socket.emit('order:joined', { orderId });
      } else {
        socket.emit('room:denied', { orderId });
      }
    });
    socket.on('order:leave', ({ orderId } = {}) => { if (orderId) socket.leave(`order:${orderId}`); });

    socket.on('branch:join', async ({ branchId } = {}) => {
      if (!branchId) return;
      if (await canAccessBranch(userId, role, branchId)) {
        socket.join(`branch:${branchId}`);
        socket.emit('branch:joined', { branchId });
      } else {
        socket.emit('room:denied', { branchId });
      }
    });
    socket.on('branch:leave', ({ branchId } = {}) => { if (branchId) socket.leave(`branch:${branchId}`); });

    // ---- driver GPS (client throttled to ~3s) ---------------------------
    socket.on('delivery:location', async (payload = {}) => {
      const { deliveryId, lat, lng, heading, speed } = payload;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !deliveryId) {
        return socket.emit('delivery:location:ack', { ok: false, error: 'bad payload' });
      }
      try {
        const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
        if (!delivery || delivery.driverId !== userId) {
          return socket.emit('delivery:location:ack', { ok: false, error: 'forbidden' });
        }
        const { recordLocation } = require('../graphql/resolvers/orders').__internals;
        await recordLocation(delivery, { lat, lng, heading, speed });
        return socket.emit('delivery:location:ack', { ok: true });
      } catch (e) {
        logger.error(`socket delivery:location: ${e.message}`);
        return socket.emit('delivery:location:ack', { ok: false, error: 'server error' });
      }
    });

    // idle driver presence ping (keeps the fleet map fresh, no active delivery)
    socket.on('driver:ping', async ({ lat, lng } = {}) => {
      if (role !== 'DRIVER') return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      await prisma.driverProfile
        .update({ where: { userId }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } })
        .catch(() => {});
    });

    // ---- order chat presence -------------------------------------------
    socket.on('chat:typing', ({ orderId, typing } = {}) => {
      if (orderId) socket.to(`order:${orderId}`).emit('chat:typing', { userId, typing: !!typing });
    });

    socket.on('disconnect', () => logger.debug(`socket disconnected user=${userId}`));
  });

  logger.info('socket.io event handlers registered');
}

module.exports = { registerSocketHandlers, emitToRoom };
