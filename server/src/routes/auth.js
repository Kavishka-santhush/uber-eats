const express = require('express');
const prisma = require('../config/prisma');
const {
  rotateRefreshToken, verifyAccessToken, revokeAllForUser, hashToken,
} = require('../lib/jwt');

/**
 * REST auth endpoints (paired with the GraphQL auth mutations).
 * Refresh/logout live here so browsers can keep the refresh token in an
 * httpOnly cookie flow or a plain JSON body without touching GraphQL.
 */

const router = express.Router();

// POST /auth/refresh  { refreshToken } -> { accessToken, refreshToken, user }
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = (req.body && req.body.refreshToken) || req.cookies?.refreshToken;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });
    const tokens = await rotateRefreshToken(refreshToken, req);
    const payload = verifyAccessToken(tokens.accessToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    return res.json({ ...tokens, user });
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Invalid refresh token' });
  }
});

// POST /auth/logout  { refreshToken } -> revokes the whole token family
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = (req.body && req.body.refreshToken) || req.cookies?.refreshToken;
    if (refreshToken) {
      const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
      if (row) await revokeAllForUser(row.userId);
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

module.exports = router;
