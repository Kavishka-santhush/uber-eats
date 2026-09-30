const { verifyAccessToken } = require('../lib/jwt');
const prisma = require('../config/prisma');

/**
 * REST bearer-auth middleware.
 * Populates `req.user` when a valid, non-revoked access token is present.
 * It never rejects on its own — route guards (restRequireRoles / handlers)
 * decide whether an anonymous request is acceptable.
 */
async function authenticateRest(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      if (payload?.sub) {
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (user && !['BANNED', 'DELETED'].includes(user.status)) req.user = user;
      }
    } catch {
      /* invalid/expired token -> stay anonymous */
    }
  }
  next();
}

module.exports = { authenticateRest };
