const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const prisma = require('../config/prisma');

/**
 * Access + refresh token issuing with rotation.
 * Refresh tokens are stored hashed (sha256) in the DB; presenting a
 * revoked/rotated token revokes the whole family (replay detection).
 */

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, fullName: user.fullName, tv: user.tokenVersion || 0 },
    env.JWT_SECRET,
    { expiresIn: env.accessTokenTtl },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueTokens(user, req = {}, family) {
  const accessToken = signAccessToken(user);
  const refreshToken = jwt.sign(
    { sub: user.id, fam: family || crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${env.refreshTokenTtlDays}d` },
  );
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      userAgent: req.headers ? (req.headers['user-agent'] || null) : null,
      ip: req.ip || null,
      expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86400_000),
    },
  });
  return { accessToken, refreshToken };
}

/** Rotate: revoke old refresh row, mint a new pair in the same family. */
async function rotateRefreshToken(oldToken, req = {}) {
  const oldHash = hashToken(oldToken);
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: oldHash },
    include: { user: true },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    // Replay attack or stale token — nuke everything for this user session set.
    await prisma.refreshToken.updateMany({
      where: { userId: row ? row.userId : '', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }
  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
  const decoded = verifyRefreshToken(oldToken);
  return issueTokens(row.user, req, decoded.fam);
}

async function revokeAllForUser(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  signAccessToken, verifyAccessToken, verifyRefreshToken,
  issueTokens, rotateRefreshToken, revokeAllForUser, hashToken,
};
