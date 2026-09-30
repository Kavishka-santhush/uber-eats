const prisma = require('../config/prisma');

/**
 * RBAC guards shared by GraphQL resolvers and REST middleware.
 * Role hierarchy + explicit permission matrix (seeded in PlatformSetting
 * `rbac.permissions`) drive authorization decisions.
 */

const ROLE_GROUPS = {
  STAFF: ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'SUPPORT_AGENT'],
  BACKOFFICE: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF'],
  MANAGE_ROLES: ['SUPER_ADMIN', 'ADMIN'],
  STAFF_ROLES: ['SUPER_ADMIN', 'ADMIN'],
  OPS_ROLES: ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER'],
  SUPPORT_ROLES: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT'],
};

class AuthError extends Error {
  constructor(message = 'Unauthenticated', code = 'UNAUTHENTICATED') {
    super(message);
    this.extensions = { code };
  }
}

function requireAuth(ctx) {
  if (!ctx.user) throw new AuthError();
  return ctx.user;
}

function requireRole(ctx, ...roles) {
  const user = requireAuth(ctx);
  if (!roles.includes(user.role)) {
    throw new AuthError('Forbidden: insufficient role', 'FORBIDDEN');
  }
  return user;
}

function requireGroup(ctx, groupName) {
  return requireRole(ctx, ...(ROLE_GROUPS[groupName] || []));
}

/** Can this user manage (approve/suspend/payout) a target user? */
function canManageUser(actor, target) {
  if (actor.role === 'SUPER_ADMIN') return true;
  if (actor.role === 'ADMIN') return ['CUSTOMER', 'DRIVER', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(target.role);
  return false;
}

/** Restaurant staff scoping — verify the user owns/works at the branch. */
async function assertBranchAccess(user, branchId, { staffAllowed = true } = {}) {
  if (['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER'].includes(user.role)) return true;
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { restaurant: { select: { ownerId: true } }, staff: { select: { userId: true } } },
  });
  if (!branch) throw new AuthError('Branch not found', 'NOT_FOUND');
  if (branch.restaurant.ownerId === user.id) return true;
  if (staffAllowed && user.role === 'RESTAURANT_STAFF'
      && branch.staff.some((s) => s.userId === user.id)) return true;
  throw new AuthError('Forbidden: not your branch', 'FORBIDDEN');
}

async function assertRestaurantAccess(user, restaurantId) {
  if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return true;
  const count = await prisma.restaurant.count({
    where: { id: restaurantId, ownerId: user.id },
  });
  if (!count) throw new AuthError('Forbidden: not your restaurant', 'FORBIDDEN');
  return true;
}

/** REST middleware equivalent for non-GraphQL endpoints. */
function restRequireRoles(...roles) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = {
  ROLE_GROUPS, AuthError, requireAuth, requireRole, requireGroup,
  canManageUser, assertBranchAccess, assertRestaurantAccess, restRequireRoles,
};
