/**
 * Security helpers for Paradise Hotel API
 * - HTTP security headers
 * - In-memory rate limiting (login / sensitive routes)
 * - Safe error responses (no stack traces to clients)
 */

const crypto = require('crypto');

/** Standard browser security headers (no extra npm package required) */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers use CSP; legacy header off
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  // API responses should not be cached by shared caches
  if (req.path && req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  // HSTS only when behind HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * Simple fixed-window rate limiter (per IP + key).
 * Works without express-rate-limit. Suitable for single-process Node.
 */
function clientIpFromReq(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().replace('::ffff:', '');
  return String(req.ip || req.connection?.remoteAddress || 'unknown').replace('::ffff:', '');
}

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const message = options.message || 'Too many requests. Please try again later.';
  const buckets = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (now - v.start > windowMs) buckets.delete(k);
    }
  }, Math.min(windowMs, 60 * 1000)).unref?.();

  return function rateLimit(req, res, next) {
    const ip = clientIpFromReq(req);
    // Optional: per-identity key (email) so one user cannot lock out all users on same IP/LAN
    let identity = '';
    if (typeof options.keyFromRequest === 'function') {
      try {
        identity = String(options.keyFromRequest(req) || '').trim().toLowerCase();
      } catch (_) {}
    }
    const key = identity
      ? `${options.keyPrefix || 'global'}:${identity}`
      : `${options.keyPrefix || 'global'}:${ip}`;

    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT',
        message,
      });
    }
    next();
  };
}

/**
 * Login: limit per EMAIL (or username), not per IP.
 * So user A failing does not block user B on the same Wi‑Fi / localhost.
 */
const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'login',
  message: 'Too many login attempts for this account. Wait 15 minutes or contact admin.',
  keyFromRequest: (req) => {
    const b = req.body || {};
    return b.email || b.username || b.loginId || '';
  },
});

/** Register / forgot / reset: per IP but higher allowance */
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyPrefix: 'auth',
  message: 'Too many authentication requests. Please wait a few minutes and try again.',
});

/** General API limiter (high — shared office IPs) */
const apiRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  keyPrefix: 'api',
  message: 'Too many requests. Please slow down.',
});

/** Hide internal errors from clients */
function safeErrorHandler(err, req, res, next) {
  console.error('[security] error:', err?.message || err);
  if (err && err.stack) console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  // Multer / upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large' });
  }
  if (err.message && /Only JPG|Only images|file type/i.test(err.message)) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(status >= 400 && status < 600 ? status : 500).json({
    success: false,
    message:
      status === 500 && isProd
        ? 'Internal server error'
        : err.message || 'Internal server error',
  });
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && String(secret).length >= 16) return String(secret);
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[security] FATAL: JWT_SECRET must be set to a strong value (16+ chars) in production'
    );
  } else {
    console.warn(
      '[security] JWT_SECRET missing or weak — using dev fallback. Set JWT_SECRET in backend/.env'
    );
  }
  return secret || 'dev-only-change-me-in-production';
}

function randomUploadName(prefix, ext) {
  const id = crypto.randomBytes(16).toString('hex');
  const safeExt = String(ext || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${prefix}-${Date.now()}-${id}${safeExt.startsWith('.') ? safeExt : '.' + safeExt}`;
}


/** Block obvious probe paths early */
function blockDangerousPaths(req, res, next) {
  const p = (req.path || '').toLowerCase();
  const bad = [
    '/.env', '/.git', '/wp-admin', '/wp-login', '/phpmyadmin',
    '/admin.php', '/xmlrpc.php', '/etc/passwd', '..%2f', '%2e%2e',
  ];
  if (bad.some((b) => p.includes(b))) {
    try {
      const { reportSuspicious } = require('./intrusion');
      reportSuspicious(req, 'path_probe', { path: req.path }).catch(() => {});
    } catch (_) {}
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  if (p.includes('..') || p.includes('%00')) {
    try {
      const { reportSuspicious } = require('./intrusion');
      reportSuspicious(req, 'path_traversal', { path: req.path }).catch(() => {});
    } catch (_) {}
    return res.status(400).json({ success: false, message: 'Bad request' });
  }
  next();
}

/** Hide Express fingerprint */
function hidePoweredBy(req, res, next) {
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = {
  securityHeaders,
  createRateLimiter,
  authRateLimit,
  loginRateLimit,
  apiRateLimit,
  safeErrorHandler,
  getJwtSecret,
  randomUploadName,
  blockDangerousPaths,
  hidePoweredBy,
};
