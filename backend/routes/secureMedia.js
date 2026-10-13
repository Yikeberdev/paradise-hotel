/**
 * Authenticated access to sensitive uploads (ID cards, payment receipts).
 * Public marketing images (rooms/desks/foods) stay on /uploads static.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/security');

const UPLOAD_ROOT = path.resolve(path.join(__dirname, '..', 'uploads'));
const ALLOWED_SENSITIVE = new Set(['id_cards', 'receipts']);

/** Auth from Bearer header or access_token query (for <img src>) */
function authMedia(req, res, next) {
  let token = null;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) token = h.slice(7).trim();
  if (!token && req.query.access_token) token = String(req.query.access_token).trim();
  if (!token && req.query.token) token = String(req.query.token).trim();
  if (!token) {
    return res.status(401).json({ success: false, message: 'Login required to view this file' });
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = {
      ...decoded,
      id: decoded.id || decoded.userId || decoded.user_id,
      role: (decoded.role || '').toString().toLowerCase(),
    };
    if (!req.user.id) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    next();
  } catch (e) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
}

function safeResolve(subdir, fileName) {
  const base = path.resolve(path.join(UPLOAD_ROOT, subdir));
  const target = path.resolve(path.join(base, path.basename(fileName)));
  if (!target.startsWith(base + path.sep) && target !== base) return null;
  return target;
}

/**
 * GET /api/secure-media/:folder/:file
 * folder: id_cards | receipts
 * Requires login. Staff can view all; customers only their own files.
 */
router.get('/:folder/:file', authMedia, async (req, res) => {
  try {
    const folder = String(req.params.folder || '').replace(/[^a-z_]/gi, '');
    const file = path.basename(String(req.params.file || ''));
    if (!ALLOWED_SENSITIVE.has(folder) || !file) {
      return res.status(400).json({ success: false, message: 'Invalid media path' });
    }

    const full = safeResolve(folder, file);
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const role = (req.user.role || '').toLowerCase();
    const isStaff = ['admin', 'manager', 'receptionist'].includes(role);

    if (!isStaff) {
      // Customer: must own the file (referenced on their customer/payment rows)
      const rel = `/uploads/${folder}/${file}`;
      let owns = [];
      try {
        const [rows] = await db.execute(
          `SELECT c.id FROM customers c
           WHERE c.user_id = ?
             AND (c.id_card_image LIKE ? OR c.id_card_image LIKE ?)
           LIMIT 1`,
          [req.user.id, `%${file}`, rel]
        );
        owns = rows;
      } catch (_) {
        owns = [];
      }
      // Optional back-side column
      if (!owns.length) {
        try {
          const [rows2] = await db.execute(
            `SELECT c.id FROM customers c
             WHERE c.user_id = ?
               AND (c.id_card_back_image LIKE ? OR c.id_card_back_image LIKE ?)
             LIMIT 1`,
            [req.user.id, `%${file}`, rel]
          );
          owns = rows2;
        } catch (_) {}
      }

      let allowed = owns && owns.length > 0;
      if (!allowed && folder === 'receipts') {
        const [pay] = await db.execute(
          `SELECT p.id FROM payments p
           INNER JOIN customers c ON c.id = p.customer_id
           WHERE c.user_id = ?
             AND (p.receipt_image LIKE ? OR p.receipt_image LIKE ?)
           LIMIT 1`,
          [req.user.id, `%${file}`, rel]
        ).catch(() => [[]]);
        allowed = pay && pay.length > 0;
      }
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this file',
        });
      }
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(full);
  } catch (e) {
    console.error('secure-media:', e.message);
    return res.status(500).json({ success: false, message: 'Could not load file' });
  }
});

module.exports = router;
