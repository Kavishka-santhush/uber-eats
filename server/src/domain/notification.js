const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { pushToUser } = require('../services/push');
const { sendMail } = require('../services/email');

/**
 * Notification domain service — single entry point for every user-facing
 * alert. Writes the in-app row, then fans out to push / email according to
 * the user's NotificationPreference, and emits over Socket.io.
 */

async function notify(userId, { title, body, category = 'order', data = {}, email = false }) {
  const [pref] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.notification.create({
      data: { userId, title, body, category, data: data || {}, channel: 'IN_APP' },
    }),
  ]);
  const wantsPush = category === 'promo' ? pref?.pushPromos : (pref?.pushOrders ?? true);
  if (wantsPush !== false) {
    pushToUser(userId, { title, body, data: { category, ...data } })
      .catch((e) => logger.warn(`push fanout failed: ${e.message}`));
  }
  if (email && (category === 'promo' ? pref?.emailPromos : (pref?.emailOrders ?? true))) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user?.email) sendMail({ to: user.email, subject: title, text: body })
      .catch((e) => logger.warn(`email fanout failed: ${e.message}`));
  }
  // live bell update
  const { emitToUser } = require('../realtime/hub');
  emitToUser(userId, 'notification:new', { title, body, category, data });
}

async function notifyMany(userIds, payload) {
  return Promise.all((userIds || []).filter(Boolean).map((id) => notify(id, payload)));
}

/** Broadcast a platform announcement to all active users (paged). */
async function announcement(title, body) {
  const batchSize = 500;
  let cursor;
  do {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true },
    });
    await notifyMany(users.map((u) => u.id), { title, body, category: 'announcement' });
    cursor = users.at(-1)?.id;
  } while (cursor);
}

module.exports = { notify, notifyMany, announcement };
