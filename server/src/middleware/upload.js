const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

/**
 * Local Multer disk storage. Every upload is written under
 * `<UPLOAD_DIR>/<scope>/` and served back as `/uploads/<scope>/<file>`.
 * No cloud storage — per spec, all uploads stay local.
 */

const root = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.join(process.cwd(), env.UPLOAD_DIR);

/** Whitelisted upload scopes (also act as a soft directory allow-list). */
const SCOPES = [
  'avatars', 'restaurants', 'menu', 'licenses', 'reviews',
  'reports', 'delivery', 'misc',
];

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
];

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const scope = SCOPES.includes(req.params?.scope) ? req.params.scope : 'misc';
    const dir = path.join(root, scope);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
  cb(new Error(`Unsupported file type: ${file.mimetype}`));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxFileSizeBytes, files: 10 },
});

/** Public URL for a stored file, relative to the server origin. */
const toPublicUrl = (scope, filename) => `/uploads/${SCOPES.includes(scope) ? scope : 'misc'}/${filename}`;

module.exports = { upload, toPublicUrl, SCOPES, root };
