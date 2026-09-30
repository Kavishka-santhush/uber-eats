const logger = require('../config/logger');
const env = require('../config/env');
const { handleWebhook } = require('../services/stripe');

/**
 * Stripe webhook receiver. Must be mounted with `express.raw()` so the exact
 * request body bytes are available for signature verification (see app.js).
 * POST /webhook/stripe   (Stripe-Signature header required)
 */
async function stripeWebhookHandler(req, res) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.warn('Stripe webhook hit but STRIPE_WEBHOOK_SECRET is unset');
    return res.status(503).json({ received: false, error: 'webhook not configured' });
  }
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ received: false, error: 'missing signature' });
  try {
    const result = await handleWebhook(req.body, signature); // req.body is a Buffer (express.raw)
    return res.status(200).json(result);
  } catch (e) {
    logger.error(`stripe webhook processing failed: ${e.message}`);
    return res.status(400).json({ received: false, error: e.message });
  }
}

module.exports = { stripeWebhookHandler };
