const crypto = require('crypto');

/** Assorted small helpers used across resolvers/services. */

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Human-friendly unique order numbers: QB-8FK2QD */
function orderNumber() {
  return `QB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/** 6-char group-order join codes */
function groupCode() {
  return crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toUpperCase();
}

/** Ticket numbers TK-2026-000123 */
function ticketNumber() {
  return `TK-${new Date().getFullYear()}-${crypto.randomBytes(4).readUInt32BE(0) % 1_000_000
    .toString().padStart(6, '0')}`;
}

/** Parse relay-ish pagination args -> prisma skip/take (+hasNextPage helper) */
function paginate(args, maxLimit = 50) {
  const limit = Math.min(Number(args.limit) || 20, maxLimit);
  const page = Math.max(Number(args.page) || 1, 1);
  return { limit, skip: (page - 1) * limit, take: limit, page };
}

/** Clamp a numeric money value to 2dp number for Decimal inputs */
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Convert Prisma Decimal | number | string to JS number safely */
const num = (d) => (d == null ? 0 : Number(d));

/** True if order is still cancellable by customer without refund complexity */
function isEarlyOrderStatus(status) {
  return ['PLACED', 'CONFIRMED'].includes(status);
}

module.exports = {
  slugify, orderNumber, groupCode, ticketNumber,
  paginate, money, num, isEarlyOrderStatus,
};
