const prisma = require('../config/prisma');
const logger = require('../config/logger');

/**
 * Platform settings cache (commission rates, loyalty rates, driver fees…)
 * plus the audit-log helper. Settings are stored as JSON in PlatformSetting
 * and refreshed on write; reads hit memory.
 */

const DEFAULTS = {
  'commission.rate': { percent: 15 },
  'loyalty.earn_rate': { pointsPerCurrencyUnit: 1 },
  'loyalty.redeem_rate': { pointsPerCurrencyUnit: 100 },
  'order.auto_cancel_minutes': { minutes: 15 },
  'driver.request_timeout_seconds': { seconds: 45 },
  'driver.base_fee_km': { baseFee: 2.0, perKm: 0.8 },
  'platform.name': { name: 'QuickBite' },
  'platform.currency': { currency: 'USD' },
};

const cache = new Map();

async function getSetting(key) {
  if (cache.has(key)) return cache.get(key);
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  const value = row ? row.value : DEFAULTS[key];
  cache.set(key, value);
  return value;
}

async function setSetting(key, value, updatedBy) {
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy },
  });
  cache.set(key, value);
  logger.info(`setting updated: ${key}`);
  return value;
}

async function refreshCache() {
  cache.clear();
  const rows = await prisma.platformSetting.findMany();
  for (const r of rows) cache.set(r.key, r.value);
}

/** Effective platform commission percent for a restaurant (override wins). */
async function commissionRateFor(restaurant) {
  if (restaurant?.commissionRate != null) return Number(restaurant.commissionRate);
  const s = await getSetting('commission.rate');
  return Number(s?.percent ?? 15);
}

/** Append an audit-log row (fire-and-forget safe). */
async function audit({ userId, action, entity, entityId, ip, meta }) {
  prisma.auditLog.create({
    data: { userId: userId || null, action, entity: entity || null, entityId: entityId || null, ip: ip || null, meta: meta || undefined },
  }).catch((e) => logger.error(`audit failed: ${e.message}`));
}

module.exports = { getSetting, setSetting, refreshCache, commissionRateFor, audit, DEFAULTS };
