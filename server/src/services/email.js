const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Nodemailer email service. In development messages are logged + rendered
 * to console so nothing needs a real SMTP server to smoke-test flows.
 */

let transporter = null;
if (env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

async function sendMail({ to, subject, html, text }) {
  const message = {
    from: `"QuickBite" <no-reply@quickbite.io>`,
    to, subject,
    html: html || `<p>${text || ''}</p>`,
    text,
  };
  if (!transporter) {
    logger.info(`[email:mock] to=${to} subject="${subject}"`);
    return { mocked: true };
  }
  try {
    return await transporter.sendMail(message);
  } catch (e) {
    logger.error(`email send failed: ${e.message}`);
    return { error: e.message };
  }
}

// ---- templates -----------------------------------------------------

const layout = (title, body) => `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
    <h2 style="color:#e5533d">QuickBite — ${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #eee" />
    <p style="color:#999;font-size:12px">You are receiving this because you have a QuickBite account.</p>
  </div>`;

function orderConfirmedEmail(order, branch) {
  return {
    subject: `Order ${order.orderNumber} confirmed`,
    html: layout('Order confirmed', `
      <p>Hi ${order.customerName}, <b>${branch.name}</b> confirmed your order.</p>
      <p>Estimated delivery: <b>${order.estimatedDeliveryAt}</b></p>
      <p>Total paid: <b>${order.total}</b></p>`),
  };
}

function orderDeliveredEmail(order) {
  return {
    subject: `Order ${order.orderNumber} delivered 🎉`,
    html: layout('Delivered', `
      <p>Your order <b>${order.orderNumber}</b> has been delivered.</p>
      <p>Tap the link in the app to rate your experience.</p>`),
  };
}

function refundEmail(order, amount) {
  return {
    subject: `Refund processed for ${order.orderNumber}`,
    html: layout('Refund processed', `
      <p>Your refund of <b>${amount}</b> for order <b>${order.orderNumber}</b>
      has been processed. It can take 5–10 business days to appear.</p>`),
  };
}

function otpEmail(email, code) {
  return {
    to: email,
    subject: 'Your QuickBite verification code',
    html: layout('Verification', `<p>Your code is <b style="font-size:24px">${code}</b> (valid 10 minutes).</p>`),
  };
}

function restaurantApprovedEmail(name) {
  return {
    subject: 'Your restaurant is approved 🎉',
    html: layout('Approved', `<p>Welcome aboard! <b>${name}</b> is now live on QuickBite. Start taking orders.</p>`),
  };
}

function payoutReceiptEmail(period, amount) {
  return {
    subject: `Your QuickBite payout — ${period}`,
    html: layout('Payout', `<p>We transferred <b>${amount}</b> for period ${period}. Statement PDF is attached in your dashboard.</p>`),
  };
}

module.exports = {
  sendMail, layout,
  templates: {
    orderConfirmedEmail, orderDeliveredEmail, refundEmail,
    otpEmail, restaurantApprovedEmail, payoutReceiptEmail,
  },
};
