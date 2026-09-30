const prisma = require('../config/prisma');
const { money, num } = require('../lib/misc');
const { debitWallet, creditWallet } = require('./wallet');
const { emitOrderUpdate } = require('../realtime/hub');
const { notify } = require('./notification');
const logger = require('../config/logger');

/**
 * Payment lifecycle used by resolvers, the Stripe webhook and COD flows.
 */

async function createPaymentForOrder(order, method, extra = {}) {
  return prisma.payment.create({
    data: {
      orderId: order.id,
      customerId: order.customerId,
      method,
      amount: order.total,
      status: extra.status || 'PENDING',
      ...extra,
    },
  });
}

/** Mark an order's payment as succeeded (card via webhook, or wallet/COD). */
async function markOrderPaid(orderId, { stripePaymentId, stripeIntentId } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus === 'SUCCEEDED') return order;
  const [updated] = await Promise.all([
    prisma.payment.updateMany({
      where: { orderId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'SUCCEEDED', paidAt: new Date(), stripePaymentId, stripeIntentId },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'SUCCEEDED' },
    }),
  ]);
  await emitOrderUpdate(orderId);
  return updated;
}

/** Pay the order from the customer wallet (debit ledger + mark paid). */
async function payOrderWithWallet(order) {
  await debitWallet(order.customerId, num(order.total), 'ORDER_PAYMENT', order.id,
    `Order ${order.orderNumber}`);
  await createPaymentForOrder(order, 'WALLET', { status: 'SUCCEEDED', paidAt: new Date() });
  return markOrderPaid(order.id);
}

/**
 * Cancel + refund according to order stage:
 *  - before restaurant confirmed  -> full refund
 *  - PREPARING/READY              -> full refund minus service fee (support decides)
 *  - picked up                    -> no auto refund (must go through support)
 */
async function cancelAndRefund(order, { reason, cancelledBy, partial = false, amount }) {
  if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
    const e = new Error(`Order already ${order.status.toLowerCase()}`);
    e.extensions = { code: 'BAD_USER_INPUT' };
    throw e;
  }
  const refundable = { PLACED: 1, CONFIRMED: 1, PREPARING: 0.9, READY_FOR_PICKUP: 0.8 }[order.status] ?? 0;
  if (refundable === 0 && !partial) {
    const e = new Error('Order is beyond the refundable stage — contact support');
    e.extensions = { code: 'BAD_USER_INPUT' };
    throw e;
  }
  const refundAmount = money(amount ?? Number(order.total) * (partial ? 1 : refundable));

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason,
        cancelledBy, paymentStatus: 'REFUNDED',
      },
    });
    await tx.orderStatusLog.create({
      data: { orderId: order.id, status: 'CANCELLED', note: reason, changedBy: cancelledBy },
    });
    if (refundAmount > 0) {
      const payment = await tx.payment.findFirst({
        where: { orderId: order.id, status: 'SUCCEEDED' },
      });
      await tx.refund.upsert({
        where: { orderId: order.id },
        update: { amount: refundAmount, status: 'SUCCEEDED', reason },
        create: {
          paymentId: payment?.id || order.id, orderId: order.id,
          amount: refundAmount, isPartial: partial, reason, status: 'SUCCEEDED',
        },
      });
      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: partial ? 'PARTIALLY_REFUNDED' : 'REFUNDED' },
        });
        // card refunds settle via Stripe; wallet refunds settle in the ledger now
        if (payment.method === 'WALLET' || payment.method === 'CASH') {
          await creditWallet(order.customerId, refundAmount, 'ORDER_REFUND', order.id,
            `Refund ${order.orderNumber}`, tx);
        } else if (payment.stripePaymentId) {
          require('../services/stripe').refundPayment(payment, refundAmount, 'cancelled')
            .catch((e) => logger.error(`stripe refund failed: ${e.message}`));
        }
      }
    }
    // release any driver assignment
    await tx.delivery.updateMany({
      where: { orderId: order.id, status: { notIn: ['DELIVERED'] } },
      data: { status: 'CANCELLED' },
    });
  });

  await emitOrderUpdate(order.id);
  await notify(order.customerId, {
    title: `Order ${order.orderNumber} cancelled`,
    body: refundAmount > 0 ? `Refund of ${refundAmount} processed.` : 'No refund due at this stage.',
    email: true,
  });
  return { refundAmount };
}

/** COD: driver collects cash; ledger moves it out of the system at delivery. */
async function confirmCodCollected(orderId) {
  await prisma.payment.updateMany({
    where: { orderId, method: 'CASH' },
    data: { status: 'SUCCEEDED', paidAt: new Date() },
  });
  return markOrderPaid(orderId);
}

module.exports = {
  createPaymentForOrder, markOrderPaid, payOrderWithWallet,
  cancelAndRefund, confirmCodCollected,
};
