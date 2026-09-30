const Expo = require('expo-server-sdk').Expo;
const webpush = require('web-push');
const env = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../config/prisma');

/**
 * Push notifications:
 *  - Expo Push API for mobile (iOS/Android)
 *  - web-push (VAPID) for the Next.js PWA
 * Device tokens live in the DeviceToken table (platform: expo|web).
 */

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

// VAPID keys for web push — generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:support@quickbite.io', VAPID_PUBLIC, VAPID_PRIVATE);
}

async function pushToUser(userId, payload) {
  const tokens = await prisma.deviceToken.findMany({ where: { userId } });
  const expoTickets = [];
  for (const t of tokens) {
    if (t.platform !== 'web' && Expo.isExpoPushToken(t.token)) {
      expoTickets.push({
        to: t.token,
        sound: 'default',
        badge: 1,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
      });
    } else if (t.platform === 'web' && VAPID_PRIVATE) {
      try {
        await webpush.sendNotification(JSON.parse(t.token), JSON.stringify(payload));
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await prisma.deviceToken.delete({ where: { id: t.id } }).catch(() => {});
        } else {
          logger.warn(`web push failed: ${e.message}`);
        }
      }
    }
  }
  if (!expoTickets.length) return { sent: 0 };
  // Chunked send (Expo allows 100 per call)
  const chunks = expo.chunkPushNotifications(expoTickets);
  let sent = 0;
  for (const chunk of chunks) {
    try {
      const results = await expo.sendPushNotificationsAsync(chunk);
      sent += results.filter((r) => r.status === 'ok').length;
      // Prune dead tokens
      for (const r of results) {
        if (r.status === 'error' && r.details?.error?.startsWith('DeviceNotRegistered')) {
          const t = chunk.find((c) => c.to === r.to);
          if (t) await prisma.deviceToken.delete({ where: { token: t.to } }).catch(() => {});
        }
      }
    } catch (e) {
      logger.error(`expo push chunk failed: ${e.message}`);
    }
  }
  return { sent };
}

async function pushToMany(userIds, payload) {
  return Promise.all(userIds.map((id) => pushToUser(id, payload)));
}

module.exports = { pushToUser, pushToMany, vapidPublicKey: () => VAPID_PUBLIC };
