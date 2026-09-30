const logger = require('../config/logger');

/**
 * Socket.io hub — thin wrapper so domain code can emit without importing
 * the server instance (avoids circular deps). Rooms:
 *   user:<id>        private channel per user (notifications, own order)
 *   order:<id>       participants of an order (customer, branch staff, driver)
 *   branch:<id>      restaurant back-office clients
 *   drivers          pool of online drivers (delivery broadcasts)
 *   ops              operations managers (live map)
 *   admins           admin dashboards (stats feeds)
 */

let io = null;

function init(server, opts = {}) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: opts.origin || '*', methods: ['GET', 'POST'] },
    pingInterval: 10000,
  });

  io.use((socket, next) => {
    // Handshake auth: access token (verified lazily to avoid jwt import cycle)
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthenticated'));
    try {
      const { verifyAccessToken } = require('../lib/jwt');
      socket.data.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { sub, role } = socket.data.user;
    socket.join(`user:${sub}`);
    if (role === 'DRIVER') socket.join('drivers');
    if (['SUPER_ADMIN', 'ADMIN'].includes(role)) socket.join('admins');
    if (['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER'].includes(role)) socket.join('ops');
    logger.debug(`socket connected user=${sub} role=${role}`);
  });

  return io;
}

function getIo() { return io; }

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function emitToRoom(room, event, payload) {
  if (io) io.to(room).emit(event, payload);
}

function emitToOps(event, payload) { emitToRoom('ops', event, payload); }
function emitToAdmins(event, payload) { emitToRoom('admins', event, payload); }

/** Broadcast an order's current status to its order room + stakeholders. */
async function emitOrderUpdate(orderId) {
  const prisma = require('../config/prisma');
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { delivery: { include: { driver: { include: { user: { select: { id: true } } } } } } },
  });
  if (!order) return;
  const payload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    driverId: order.delivery?.driver?.user?.id || null,
    branchId: order.branchId,
  };
  emitToRoom(`order:${order.id}`, 'order:status', payload);
  emitToUser(order.customerId, 'order:status', payload);
  emitToRoom(`branch:${order.branchId}`, 'order:status', payload);
  if (order.delivery?.driver) emitToUser(order.delivery.driver.user.id, 'order:status', payload);
  emitToOps('ops:order_update', payload);
  emitToAdmins('admin:order_update', payload);
}

/** Broadcast delivery request to a specific driver + the pool for fallback. */
function emitDeliveryRequest(driverId, payload) {
  emitToUser(driverId, 'delivery:request', payload);
}

/** Live driver GPS forward to order participants + ops. */
function emitDriverLocation(orderId, payload) {
  emitToRoom(`order:${orderId}`, 'delivery:location', payload);
  emitToOps('ops:driver_location', { orderId, ...payload });
}

module.exports = {
  init, getIo, emitToUser, emitToRoom, emitToOps, emitToAdmins,
  emitOrderUpdate, emitDeliveryRequest, emitDriverLocation,
};
