const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');
const dispatch = require('../domain/dispatch');
const payments = require('../domain/payments');
const { notify } = require('../domain/notification');

/**
 * Lightweight in-process job ticker (no external scheduler needed):
 *  - auto-cancel orders the restaurant never confirms
 *  - expire stale driver requests and re-broadcast
 *  - activate scheduled orders when their time arrives
 *  - flag orders that blew past their ETA (ops delay alerts)
 */

const EVERY_60S = 60_000;

async function autoCancelUnconfirmed() {
  const cutoff = new Date(Date.now() - env.ORDER_AUTO_CANCEL_MINUTES * 60_000);
  const stale = await prisma.order.findMany({
    where: { status: 'PLACED', confirmedAt: null, createdAt: { lt: cutoff }, scheduledFor: null },
  });
  for (const order of stale) {
    try {
      await payments.cancelAndRefund(order, {
        reason: 'Restaurant did not confirm in time', cancelledBy: 'SYSTEM',
      });
      await prisma.order.update({ where: { id: order.id }, data: { autoCancelled: true } });
      logger.info(`auto-cancelled ${order.orderNumber}`);
    } catch (e) {
      logger.error(`auto-cancel failed for ${order.id}: ${e.message}`);
    }
  }
  return stale.length;
}

async function activateScheduledOrders() {
  const due = await prisma.order.findMany({
    where: { status: 'PLACED', scheduledFor: { lte: new Date() } },
  });
  for (const order of due) {
    await prisma.order.update({
      where: { id: order.id },
      data: { scheduledFor: null, estimatedDeliveryAt: new Date(Date.now() + 45 * 60_000) },
    });
    await notify(order.branchId, { title: 'Scheduled order due', body: order.orderNumber }).catch(() => {});
    dispatch.requestDrivers(order.id).catch(() => {});
    // restaurant should see it now — the branch room gets a ping via hub
    const { emitToRoom } = require('../realtime/hub');
    emitToRoom(`branch:${order.branchId}`, 'order:new', { orderId: order.id, scheduled: true });
  }
  return due.length;
}

async function flagDelayedOrders() {
  const late = await prisma.order.findMany({
    where: {
      status: { in: ['PREPARING', 'READY_FOR_PICKUP', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
      estimatedDeliveryAt: { lt: new Date() },
    },
    take: 100,
  });
  if (late.length) {
    const { emitToOps } = require('../realtime/hub');
    emitToOps('ops:delay_alert', late.map((o) => ({
      orderId: o.id, orderNumber: o.orderNumber, status: o.status,
      eta: o.estimatedDeliveryAt, minutesLate: Math.round((Date.now() - o.estimatedDeliveryAt) / 60_000),
    })));
  }
  return late.length;
}

function start() {
  const tick = async (fn, name) => {
    try {
      const n = await fn();
      if (n) logger.debug(`job ${name}: ${n}`);
    } catch (e) {
      logger.error(`job ${name} crashed: ${e.message}`);
    }
  };
  setInterval(() => {
    tick(autoCancelUnconfirmed, 'autoCancel');
    tick(activateScheduledOrders, 'scheduled');
    tick(() => dispatch.expireStaleRequests(), 'expireRequests');
  }, EVERY_60S).unref();
  setInterval(() => tick(flagDelayedOrders, 'delayAlert'), 5 * EVERY_60S).unref();
  logger.info('job ticker started (60s cadence)');
}

module.exports = { start, autoCancelUnconfirmed, activateScheduledOrders, flagDelayedOrders };
