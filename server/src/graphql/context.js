const DataLoader = require('dataloader');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { verifyAccessToken } = require('../lib/jwt');

/**
 * Per-request GraphQL context.
 *  - authenticates the caller from the `Authorization: Bearer <token>` header
 *    (access JWT -> DB user), leaving `user` null for guests;
 *  - instantiates request-scoped DataLoaders to batch/N+1-protect the hot
 *    relation fields used by resolvers (addresses, branches, hours).
 */

function buildLoaders() {
  return {
    // User.addresses
    userAddresses: new DataLoader(async (userIds) => {
      const rows = await prisma.address.findMany({
        where: { userId: { in: [...userIds] } },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      const grouped = new Map(userIds.map((id) => [id, []]));
      for (const a of rows) if (grouped.has(a.userId)) grouped.get(a.userId).push(a);
      return userIds.map((id) => grouped.get(id));
    }),
    // Restaurant.branches
    branchesByRestaurant: new DataLoader(async (restaurantIds) => {
      const rows = await prisma.branch.findMany({ where: { restaurantId: { in: [...restaurantIds] } } });
      const grouped = new Map(restaurantIds.map((id) => [id, []]));
      for (const b of rows) if (grouped.has(b.restaurantId)) grouped.get(b.restaurantId).push(b);
      return restaurantIds.map((id) => grouped.get(id));
    }),
    // Branch.hours
    hoursByBranch: new DataLoader(async (branchIds) => {
      const rows = await prisma.operatingHour.findMany({
        where: { branchId: { in: [...branchIds] } },
        orderBy: { dayOfWeek: 'asc' },
      });
      const grouped = new Map(branchIds.map((id) => [id, []]));
      for (const h of rows) if (grouped.has(h.branchId)) grouped.get(h.branchId).push(h);
      return branchIds.map((id) => grouped.get(id));
    }),
  };
}

async function resolveUser(req) {
  const header = req?.headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    if (!payload?.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || ['BANNED', 'DELETED'].includes(user.status)) return null;
    return user;
  } catch {
    return null; // expired / malformed -> treat as guest
  }
}

async function createContext({ req }) {
  const user = await resolveUser(req);
  return {
    user,
    loaders: buildLoaders(),
    req,
    prisma,
    logger,
  };
}

module.exports = { createContext, buildLoaders };
