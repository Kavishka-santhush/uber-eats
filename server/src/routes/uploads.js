const express = require('express');
const { authenticateRest } = require('../middleware/authenticate');
const { upload, SCOPES } = require('../middleware/upload');
const { toPublicUrl } = require('../middleware/upload');
const { audit } = require('../services/settings');

/**
 * POST /upload/:scope   multipart/form-data
 *   field name: "files" (up to 10) or "file" (single)
 * Returns the list of local public URLs (/uploads/<scope>/<file>).
 * All uploads require an authenticated caller; sensitive scopes are
 * restricted to the appropriate roles.
 */

const router = express.Router();

// scopes that only staff / restaurant partners may write to
const RESTRICTED = {
  licenses: ['RESTAURANT_OWNER', 'DRIVER', 'SUPER_ADMIN', 'ADMIN'],
  reports: ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER', 'RESTAURANT_OWNER'],
  delivery: ['DRIVER', 'SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER'],
};

router.use(authenticateRest);

router.post('/:scope', (req, res, next) => {
  const { scope } = req.params;
  if (!SCOPES.includes(scope)) return res.status(400).json({ error: 'Invalid upload scope' });
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

  const allowed = RESTRICTED[scope];
  if (allowed && !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden for this scope' });
  }
  return next();
}, (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ error: 'No file received' });
    const urls = files.map((f) => toPublicUrl(req.params.scope, f.filename));
    audit({ userId: req.user.id, action: 'file.upload', entity: req.params.scope, ip: req.ip, meta: { count: files.length } });
    return res.json({
      urls,
      files: files.map((f) => ({
        url: toPublicUrl(req.params.scope, f.filename),
        originalName: f.originalname,
        size: f.size,
        mimetype: f.mimetype,
      })),
    });
  });
});

module.exports = router;
