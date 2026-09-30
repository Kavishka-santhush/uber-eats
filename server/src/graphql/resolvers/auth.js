const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { requireAuth, requireRole } = require('../../lib/roles');
const { issueTokens, rotateRefreshToken, revokeAllForUser, hashToken } = require('../../lib/jwt');
const { paginate, slugify } = require('../../lib/misc');
const { ensureWallet } = require('../../domain/wallet');
const { audit } = require('../../services/settings');
const { notify, notifyMany } = require('../../domain/notification');

/** Auth + user profile + address + device + preference resolvers. */

async function publicUser(user) {
  return user;
}

async function loginCommon(user, req) {
  if (user.status === 'BANNED' || user.status === 'DELETED') {
    throw Object.assign(new Error('Account unavailable'), { extensions: { code: 'FORBIDDEN' } });
  }
  // Restaurant owners/drivers may log in while PENDING (to see approval status)
  const tokens = await issueTokens(user, req);
  await audit({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip: req.ip });
  return { ...tokens, user };
}

module.exports = {
  Query: {
    _ping: () => 'pong',
    enums: () => ({
      Role: ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'DRIVER', 'CUSTOMER'],
      OrderStatus: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
    }),
    me: (_p, _a, ctx) => ctx.user || null,
    user: async (_p, { id }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT', 'OPS_MANAGER');
      return prisma.user.findUnique({ where: { id } });
    },
    users: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const { take, skip } = paginate(args);
      const where = {
        ...(args.role ? { role: args.role } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(args.search ? { OR: [
          { fullName: { contains: args.search, mode: 'insensitive' } },
          { email: { contains: args.search, mode: 'insensitive' } },
          { phone: { contains: args.search } },
        ] } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        prisma.user.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    placesAutocomplete: async (_p, { input, lat, lng }) => {
      const maps = require('../../services/googleMaps');
      const preds = await maps.autocomplete(input, { lat, lng });
      return preds.map((x) => ({ description: x.description, placeId: x.place_id }));
    },
    geocode: async (_p, { address }) => {
      const maps = require('../../services/googleMaps');
      const g = await maps.geocode(address);
      return g && { lat: g.lat, lng: g.lng, formattedAddress: g.formattedAddress, placeId: g.placeId };
    },
  },

  Mutation: {
    registerCustomer: async (_p, { input }, ctx) => {
      const exists = await prisma.user.findFirst({
        where: { OR: [{ email: input.email }, input.phone ? { phone: input.phone } : {}] },
      });
      if (exists) throw Object.assign(new Error('Email or phone already registered'), { extensions: { code: 'BAD_USER_INPUT' } });
      const user = await prisma.user.create({
        data: {
          role: 'CUSTOMER', fullName: input.fullName, email: input.email, phone: input.phone,
          passwordHash: await bcrypt.hash(input.password, 10),
          status: 'ACTIVE', notificationPref: { create: {} }, wallet: { create: {} },
        },
      });
      await ensureWallet(user.id);
      return loginCommon(user, ctx.req);
    },

    registerRestaurantOwner: async (_p, { input }, ctx) => {
      const exists = await prisma.user.findUnique({ where: { email: input.email } });
      if (exists) throw Object.assign(new Error('Email already registered'), { extensions: { code: 'BAD_USER_INPUT' } });
      const user = await prisma.user.create({
        data: {
          role: 'RESTAURANT_OWNER', fullName: input.fullName, email: input.email, phone: input.phone,
          passwordHash: await bcrypt.hash(input.password, 10), status: 'PENDING',
        },
      });
      const restaurant = await prisma.restaurant.create({
        data: {
          ownerId: user.id, name: input.restaurantName, slug: `${slugify(input.restaurantName)}-${user.id.slice(0, 4)}`,
          licenseDocUrl: input.licenseDocUrl, foodSafetyUrl: input.foodSafetyUrl,
          status: 'PENDING_APPROVAL',
          cuisines: input.cuisineIds?.length ? { create: input.cuisineIds.map((id) => ({ cuisineId: id })) } : undefined,
        },
      });
      // Notify admins that a new restaurant application is pending.
      const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true } });
      await notifyMany(admins.map((a) => a.id), { title: 'New restaurant application', body: `${input.restaurantName} submitted for approval`, category: 'system' });
      const tokens = await issueTokens(user, ctx.req);
      return { ...tokens, user };
    },

    registerDriver: async (_p, { input }, ctx) => {
      const exists = await prisma.user.findFirst({
        where: { OR: [{ email: input.email }, { phone: input.phone }] },
      });
      if (exists) throw Object.assign(new Error('Email or phone already registered'), { extensions: { code: 'BAD_USER_INPUT' } });
      const user = await prisma.user.create({
        data: {
          role: 'DRIVER', fullName: input.fullName, email: input.email, phone: input.phone,
          passwordHash: await bcrypt.hash(input.password, 10), status: 'PENDING',
          driverProfile: {
            create: {
              vehicleType: input.vehicleType, vehicleModel: input.vehicleModel, vehiclePlate: input.vehiclePlate,
              licenseDocUrl: input.licenseDocUrl, insuranceDocUrl: input.insuranceDocUrl,
              photoDocUrl: input.photoDocUrl, idDocUrl: input.idDocUrl, approvalStatus: 'PENDING_APPROVAL',
            },
          },
        },
      });
      return loginCommon(user, ctx.req);
    },

    login: async (_p, { input }, ctx) => {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw Object.assign(new Error('Invalid credentials'), { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return loginCommon(user, ctx.req);
    },

    loginWithGoogle: async (_p, { input }, ctx) => {
      // Verify Google ID token signature via Google's tokeninfo endpoint.
      let payload;
      try {
        const { data } = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${input.idToken}`, { timeout: 8000 });
        if (!data.email) throw new Error('no email');
        payload = data;
      } catch {
        throw Object.assign(new Error('Invalid Google token'), { extensions: { code: 'UNAUTHENTICATED' } });
      }
      let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email: payload.email }] } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            role: 'CUSTOMER', fullName: payload.name || payload.email, email: payload.email,
            googleId: payload.sub, avatarUrl: payload.picture, status: 'ACTIVE',
            isPhoneVerified: false, wallet: { create: {} }, notificationPref: { create: {} },
          },
        });
      }
      return loginCommon(user, ctx.req);
    },

    logout: async (_p, { refreshToken }, ctx) => {
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
      if (row) await revokeAllForUser(row.userId);
      return true;
    },

    updateProfile: async (_p, { input }, ctx) => {
      const user = requireAuth(ctx);
      return prisma.user.update({ where: { id: user.id }, data: input });
    },

    changePassword: async (_p, { oldPassword, newPassword }, ctx) => {
      const user = requireAuth(ctx);
      if (!user.passwordHash || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
        throw Object.assign(new Error('Wrong current password'), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
      await revokeAllForUser(user.id);
      return true;
    },

    sendPhoneOtp: async (_p, { phone }, ctx) => {
      const user = ctx.user;
      const code = env.otpMock ? '123456' : String(crypto.randomInt(100000, 999999));
      const target = user || await prisma.user.findFirst({ where: { phone } });
      if (!target) throw Object.assign(new Error('Unknown phone'), { extensions: { code: 'BAD_USER_INPUT' } });
      await prisma.user.update({
        where: { id: target.id },
        data: { otpCode: hashToken(code), otpExpiresAt: new Date(Date.now() + 10 * 60_000) },
      });
      // In production, send via SMS gateway. Mock logs the code.
      if (env.otpMock) ctx.logger?.info?.(`OTP for ${phone}: ${code}`);
      require('../../config/logger').info(`[otp:mock] ${phone} -> ${code}`);
      return true;
    },

    verifyPhoneOtp: async (_p, { code }, ctx) => {
      const user = requireAuth(ctx);
      if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        throw Object.assign(new Error('OTP expired'), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      if (user.otpCode !== hashToken(code)) {
        throw Object.assign(new Error('Invalid OTP'), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      await prisma.user.update({ where: { id: user.id }, data: { isPhoneVerified: true, otpCode: null, otpExpiresAt: null } });
      return true;
    },

    addAddress: async (_p, { input }, ctx) => {
      const user = requireAuth(ctx);
      if (input.isDefault) await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return prisma.address.create({ data: { ...input, userId: user.id, fullName: input.fullName || user.fullName } });
    },
    updateAddress: async (_p, { id, input }, ctx) => {
      const user = requireAuth(ctx);
      await ensureAddressOwner(user.id, id);
      if (input.isDefault) await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return prisma.address.update({ where: { id }, data: input });
    },
    deleteAddress: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      await ensureAddressOwner(user.id, id);
      await prisma.address.delete({ where: { id } });
      return true;
    },
    setDefaultAddress: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      await ensureAddressOwner(user.id, id);
      await prisma.$transaction([
        prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
        prisma.address.update({ where: { id }, data: { isDefault: true } }),
      ]);
      return prisma.address.findUnique({ where: { id } });
    },

    registerDeviceToken: async (_p, { token, platform }, ctx) => {
      const user = requireAuth(ctx);
      await prisma.deviceToken.upsert({
        where: { token },
        update: { userId: user.id, platform },
        create: { userId: user.id, token, platform },
      });
      return true;
    },
    removeDeviceToken: async (_p, { token }, ctx) => {
      requireAuth(ctx);
      await prisma.deviceToken.deleteMany({ where: { token } });
      return true;
    },

    updateNotificationPref: async (_p, { input }, ctx) => {
      const user = requireAuth(ctx);
      return prisma.notificationPreference.upsert({
        where: { userId: user.id },
        update: input,
        create: { userId: user.id, ...input },
      });
    },
    setDarkMode: async (_p, { dark }, ctx) => {
      const user = requireAuth(ctx);
      return prisma.user.update({ where: { id: user.id }, data: { darkMode: dark } });
    },

    adminSetUserStatus: async (_p, { id, status }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const target = await prisma.user.findUnique({ where: { id } });
      const { canManageUser } = require('../../lib/roles');
      if (!canManageUser(actor, target)) throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      if (status === 'BANNED' || status === 'DELETED') await revokeAllForUser(id);
      const u = await prisma.user.update({ where: { id }, data: { status } });
      await audit({ userId: actor.id, action: `user.set_status.${status}`, entity: 'user', entityId: id, ip: ctx.req?.ip });
      return u;
    },
    adminDeleteUser: async (_p, { id }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN');
      await prisma.user.update({ where: { id }, data: { status: 'DELETED', email: `deleted_${id}@gone.invalid` } });
      await audit({ userId: actor.id, action: 'user.soft_delete', entity: 'user', entityId: id, ip: ctx.req?.ip });
      return true;
    },
  },

  User: {
    wallet: (u) => prisma.wallet.findUnique({ where: { userId: u.id } }),
    driverProfile: (u) => prisma.driverProfile.findUnique({ where: { userId: u.id } }),
    ownedRestaurants: (u) => prisma.restaurant.findMany({ where: { ownerId: u.id } }),
    addresses: (u, _a, ctx) => ctx.loaders.userAddresses.load(u.id),
    notificationPref: (u) => prisma.notificationPreference.findUnique({ where: { userId: u.id } }),
    favorites: (u) => prisma.favorite.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } }),
    unreadNotificationCount: (u) => prisma.notification.count({ where: { userId: u.id, isRead: false } }),
    loyaltyPoints: async (u) => {
      const agg = await prisma.loyaltyTransaction.aggregate({ where: { userId: u.id }, _sum: { points: true } });
      return agg._sum.points || 0;
    },
  },

  Address: { lat: (a) => a.lat, lng: (a) => a.lng },
  Favorite: {
    restaurant: (f) => (f.restaurantId ? prisma.restaurant.findUnique({ where: { id: f.restaurantId } }) : null),
    item: (f) => (f.menuItemId ? prisma.menuItem.findUnique({ where: { id: f.menuItemId } }) : null),
  },
  NotificationPreference: {
    pushOrders: (p) => p.pushOrders, pushPromos: (p) => p.pushPromos,
    emailOrders: (p) => p.emailOrders, emailPromos: (p) => p.emailPromos, smsCritical: (p) => p.smsCritical,
  },
};

async function ensureAddressOwner(userId, addressId) {
  const a = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!a) throw Object.assign(new Error('Address not found'), { extensions: { code: 'NOT_FOUND' } });
  return a;
}
