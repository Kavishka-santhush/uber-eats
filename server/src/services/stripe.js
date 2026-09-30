const Stripe = require('stripe');
const env = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../config/prisma');

/**
 * Stripe payments: card PaymentIntents, wallet top-ups, refunds and
 * webhook processing. Webhook raw body must be passed for signature check.
 */

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

function assertStripe() {
  if (!stripe) {
    const e = new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
    e.extensions = { code: 'INTERNAL_SERVER_ERROR' };
    throw e;
  }
}

/** Create a PaymentIntent for an order. Amount in minor units. */
async function createOrderPaymentIntent(order) {
  assertStripe();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(Number(order.total) * 100),
    currency: order.currency || env.PLATFORM_CURRENCY.toLowerCase(),
    metadata: { orderId: order.id, orderNumber: order.orderNumber, kind: 'order' },
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret, intentId: intent.id };
}

/** Create a PaymentIntent for a wallet top-up. */
async function createTopupPaymentIntent(userId, amount) {
  assertStripe();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(Number(amount) * 100),
    currency: env.PLATFORM_CURRENCY.toLowerCase(),
    metadata: { userId, kind: 'wallet_topup' },
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret, intentId: intent.id };
}

async function refundPayment(payment, amount, reason) {
  assertStripe();
  if (!payment.stripePaymentId) {
    // Wallet/COD refunds are handled by ledger entries, not Stripe.
    return { id: `local_${payment.id}`, status: 'succeeded', local: true };
  }
  return stripe.refunds.create({
    payment_intent: payment.stripePaymentId,
    amount: Math.round(Number(amount) * 100),
    reason: reason || 'requested_by_customer',
  });
}

/**
 * Webhook handler. Events consumed:
 *  payment_intent.succeeded / payment_intent.payment_failed
 * Ledger updates + order status transitions happen here (single source of truth).
 */
async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe webhook signature verification failed: ${err.message}`);
    return { received: false };
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      if (pi.metadata?.kind === 'order' && pi.metadata.orderId) {
        const { markOrderPaid } = require('../domain/payments');
        await markOrderPaid(pi.metadata.orderId, {
          stripePaymentId: pi.latest_charge || pi.id, stripeIntentId: pi.id,
        });
      } else if (pi.metadata?.kind === 'wallet_topup' && pi.metadata.userId) {
        const { creditWallet } = require('../domain/wallet');
        await creditWallet(pi.metadata.userId, pi.amount / 100, 'WALLET_TOPUP',
          pi.id, 'Stripe top-up');
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object;
      if (pi.metadata?.kind === 'order' && pi.metadata.orderId) {
        await prisma.payment.updateMany({
          where: { orderId: pi.metadata.orderId, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'FAILED', failureReason: pi.last_payment_error?.message || 'failed' },
        });
        const { emitOrderUpdate } = require('../realtime/hub');
        await emitOrderUpdate(pi.metadata.orderId);
      }
      break;
    }
    default:
      break;
  }
  return { received: true };
}

module.exports = {
  stripe, createOrderPaymentIntent, createTopupPaymentIntent,
  refundPayment, handleWebhook,
};
