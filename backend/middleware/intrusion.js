/**
 * Intrusion detection:
 * - Path probes / SQLi / XSS → block IP (not localhost unless BLOCK_LOCALHOST=1)
 * - Failed passwords → lock that USER ACCOUNT only (admin can unlock)
 * System must keep running for everyone else.
 */
const db = require('../config/db');
const { sendMail, smtpConfigured } = require('../utils/email');

const WINDOW_MS = 15 * 60 * 1000;
const FAIL_THRESHOLD = Number(process.env.INTRUSION_FAIL_THRESHOLD || 8);
const BLOCK_HOURS = Number(process.env.INTRUSION_BLOCK_HOURS || 24);
const LOGIN_FAIL_LOCK = Number(process.env.LOGIN_FAIL_LOCK || 8);

const failBuckets = new Map();
const memoryBlocks = new Map();
const loginFailByEmail = new Map();
const recentAlerts = [];
const MAX_ALERTS = 100;

let tablesReady = false;

function isLocalIp(ip) {
  if (!ip) return true;
  const s = String(ip).replace('::ffff:', '');
  return (
    s === '127.0.0.1' ||
    s === '::1' ||
    s === 'localhost' ||
    s === 'unknown'
  );
}

async function ensureTables() {
  if (tablesReady) return;
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS blocked_ips (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip VARCHAR(64) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      details TEXT NULL,
      blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX (ip),
      INDEX (active)
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS security_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip VARCHAR(64) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      path VARCHAR(500) NULL,
      method VARCHAR(20) NULL,
      user_agent VARCHAR(500) NULL,
      details TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX (ip),
      INDEX (created_at)
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS locked_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(255) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      fail_count INT NOT NULL DEFAULT 0,
      locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unlocked_at DATETIME NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      INDEX (email),
      INDEX (active)
    )`);
    tablesReady = true;
  } catch (e) {
    console.warn('[intrusion] table setup:', e.message);
  }
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim().replace('::ffff:', '');
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
  return String(ip).replace('::ffff:', '');
}

function pushAlert(alert) {
  recentAlerts.unshift(alert);
  if (recentAlerts.length > MAX_ALERTS) recentAlerts.pop();
}

async function getAdminEmails() {
  const emails = new Set();
  if (process.env.ADMIN_ALERT_EMAIL) {
    process.env.ADMIN_ALERT_EMAIL.split(',').forEach((e) => {
      const t = e.trim();
      if (t) emails.add(t);
    });
  }
  try {
    const [rows] = await db.execute(
      `SELECT email FROM users WHERE LOWER(role) = 'admin' AND (status = 'active' OR status IS NULL) AND email IS NOT NULL AND email != ''`
    );
    (rows || []).forEach((r) => {
      if (r.email) emails.add(String(r.email).trim().toLowerCase());
    });
  } catch (_) {}
  return [...emails];
}

async function notifyAdmins(subject, text, alertPayload) {
  pushAlert({
    id: Date.now() + Math.floor(Math.random() * 1000),
    at: new Date().toISOString(),
    subject,
    message: text,
    ...alertPayload,
    read: false,
  });
  if (!smtpConfigured()) {
    console.warn('[intrusion] SMTP not configured — alert stored for admin dashboard only');
    return;
  }
  const emails = await getAdminEmails();
  if (!emails.length) {
    console.warn('[intrusion] No admin emails. Set ADMIN_ALERT_EMAIL in .env');
    return;
  }
  const html =
    `<div style="font-family:Arial,sans-serif;padding:16px">` +
    `<h2 style="color:#c0392b">Paradise Hotel — Security Alert</h2>` +
    `<pre style="background:#f8f8f8;padding:12px;border-radius:8px;white-space:pre-wrap">${String(text)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre></div>`;
  for (const to of emails) {
    try {
      await sendMail(to, subject, text, html);
    } catch (e) {
      console.error('[intrusion] email failed', to, e.message);
    }
  }
}

async function logEvent(ip, eventType, req, details) {
  await ensureTables();
  try {
    await db.execute(
      `INSERT INTO security_events (ip, event_type, path, method, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        ip,
        eventType,
        String(req?.originalUrl || req?.url || '').slice(0, 500),
        req?.method || '',
        String(req?.headers?.['user-agent'] || '').slice(0, 500),
        typeof details === 'string' ? details : JSON.stringify(details || {}),
      ]
    );
  } catch (e) {
    console.warn('[intrusion] logEvent:', e.message);
  }
}

async function blockIp(ip, reason, details, req) {
  // Never lock out the whole machine in normal local development
  if (isLocalIp(ip) && process.env.BLOCK_LOCALHOST !== '1') {
    console.warn('[intrusion] skip IP block for local address:', ip, reason);
    await logEvent(ip, 'block_skipped_local', req, { reason, details });
    pushAlert({
      id: Date.now(),
      at: new Date().toISOString(),
      subject: `[Dev] Would block IP ${ip} (skipped on localhost)`,
      message: reason,
      ip,
      reason,
      severity: 'info',
    });
    return false;
  }

  const until = new Date(Date.now() + BLOCK_HOURS * 3600 * 1000);
  memoryBlocks.set(ip, { until: until.getTime(), reason });

  await ensureTables();
  try {
    await db.execute(`UPDATE blocked_ips SET active = 0 WHERE ip = ? AND active = 1`, [ip]);
    await db.execute(
      `INSERT INTO blocked_ips (ip, reason, details, expires_at, active) VALUES (?, ?, ?, ?, 1)`,
      [ip, String(reason).slice(0, 500), typeof details === 'string' ? details : JSON.stringify(details || {}), until]
    );
  } catch (e) {
    console.warn('[intrusion] blockIp db:', e.message);
  }

  const text =
    `SECURITY ALERT — IP blocked\n\n` +
    `IP: ${ip}\nReason: ${reason}\nPath: ${req?.originalUrl || 'n/a'}\n` +
    `User-Agent: ${req?.headers?.['user-agent'] || 'n/a'}\n` +
    `Time: ${new Date().toISOString()}\nBlocked until: ${until.toISOString()}\n` +
    `Admin can unblock this IP from the Admin → Security monitor panel.`;

  await notifyAdmins(`[Paradise Hotel] IP blocked — ${ip}`, text, {
    ip,
    reason,
    severity: 'high',
    blockedUntil: until.toISOString(),
    type: 'ip_block',
  });
  console.error('[intrusion] BLOCKED IP', ip, reason);
  return true;
}

/** Lock a specific user account after repeated wrong passwords */
async function lockAccount(email, userId, reason, req) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  await ensureTables();
  try {
    await db.execute(`UPDATE locked_accounts SET active = 0 WHERE email = ? AND active = 1`, [em]);
    await db.execute(
      `INSERT INTO locked_accounts (user_id, email, reason, fail_count, active)
       VALUES (?, ?, ?, ?, 1)`,
      [userId || null, em, String(reason).slice(0, 500), LOGIN_FAIL_LOCK]
    );
    // Mark user suspended-style flag without deleting
    if (userId) {
      try {
        await db.execute(
          `UPDATE users SET status = 'locked' WHERE id = ? AND LOWER(role) != 'admin'`,
          [userId]
        );
      } catch (_) {
        // status enum might not include locked — ignore
      }
    }
  } catch (e) {
    console.warn('[intrusion] lockAccount:', e.message);
  }

  const ip = clientIp(req);
  const text =
    `SECURITY ALERT — User account locked\n\n` +
    `Email / login: ${em}\nUser ID: ${userId || 'n/a'}\n` +
    `Reason: ${reason}\nIP of attempts: ${ip}\n` +
    `Time: ${new Date().toISOString()}\n\n` +
    `This account cannot log in until an admin unlocks it.\n` +
    `Other users and the website continue to work normally.`;

  await notifyAdmins(`[Paradise Hotel] Account locked — ${em}`, text, {
    ip,
    email: em,
    userId,
    reason,
    severity: 'high',
    type: 'account_lock',
  });
  console.error('[intrusion] LOCKED ACCOUNT', em);
}

async function isAccountLocked(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return false;
  await ensureTables();
  try {
    const [rows] = await db.execute(
      `SELECT id FROM locked_accounts WHERE email = ? AND active = 1 ORDER BY id DESC LIMIT 1`,
      [em]
    );
    return rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function unlockAccount(email) {
  const em = String(email || '').trim().toLowerCase();
  await ensureTables();
  await db.execute(
    `UPDATE locked_accounts SET active = 0, unlocked_at = NOW() WHERE email = ? AND active = 1`,
    [em]
  );
  loginFailByEmail.delete(em);
  try {
    await db.execute(
      `UPDATE users SET status = 'active' WHERE LOWER(email) = ? AND status = 'locked'`,
      [em]
    );
  } catch (_) {}
}

/**
 * Report suspicious activity.
 * failed_login → account lock only (not whole IP)
 * path_probe / sqli / xss → IP block (except localhost in dev)
 */
async function reportSuspicious(req, eventType, details) {
  const ip = clientIp(req);
  await logEvent(ip, eventType, req, details);

  // --- Password failures: lock user only ---
  if (eventType === 'failed_login') {
    const loginId = String(details?.loginId || details?.email || '')
      .trim()
      .toLowerCase();
    if (loginId) {
      const key = loginId;
      let n = (loginFailByEmail.get(key) || 0) + 1;
      loginFailByEmail.set(key, n);
      if (n >= LOGIN_FAIL_LOCK) {
        let userId = null;
        try {
          const [u] = await db.execute(
            `SELECT id, email FROM users WHERE LOWER(email) = ? OR username = ? LIMIT 1`,
            [loginId, loginId]
          );
          if (u.length) {
            userId = u[0].id;
          }
        } catch (_) {}
        // Only lock if we found a real account (don't "lock" random emails forever as IP)
        if (userId) {
          await lockAccount(loginId.includes('@') ? loginId : details?.loginId, userId, `${n} failed login attempts`, req);
          loginFailByEmail.delete(key);
          return { blocked: false, accountLocked: true, email: loginId };
        }
      }
    }
    // Unknown emails: do NOT IP-block the whole browser/network for wrong guesses
    return { blocked: false, accountLocked: false, ip };
  }

  // --- High severity: IP block ---
  const immediate = ['path_probe', 'path_traversal', 'sqli_attempt', 'xss_attempt'];
  if (immediate.includes(eventType)) {
    const blocked = await blockIp(ip, `Immediate block: ${eventType}`, { details }, req);
    return { blocked, ip };
  }

  const now = Date.now();
  let b = failBuckets.get(ip);
  if (!b || now - b.first > WINDOW_MS) {
    b = { first: now, count: 0, reasons: [] };
    failBuckets.set(ip, b);
  }
  // Do not count failed_login toward IP threshold (handled above)
  if (eventType !== 'failed_login') {
    b.count += 1;
    b.reasons.push(eventType);
  }
  if (b.count >= FAIL_THRESHOLD) {
    const blocked = await blockIp(
      ip,
      `Auto-block: ${b.count} suspicious events in 15 minutes`,
      { details, recent: b.reasons },
      req
    );
    failBuckets.delete(ip);
    return { blocked, ip };
  }
  return { blocked: false, ip, count: b.count };
}

async function isBlocked(ip) {
  if (isLocalIp(ip) && process.env.BLOCK_LOCALHOST !== '1') {
    return { blocked: false };
  }
  const mem = memoryBlocks.get(ip);
  if (mem) {
    if (Date.now() < mem.until) return { blocked: true, reason: mem.reason };
    memoryBlocks.delete(ip);
  }
  await ensureTables();
  try {
    const [rows] = await db.execute(
      `SELECT reason, expires_at FROM blocked_ips
       WHERE ip = ? AND active = 1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC LIMIT 1`,
      [ip]
    );
    if (rows.length) {
      const exp = rows[0].expires_at ? new Date(rows[0].expires_at).getTime() : Date.now() + 86400000;
      memoryBlocks.set(ip, { until: exp, reason: rows[0].reason });
      return { blocked: true, reason: rows[0].reason };
    }
  } catch (_) {}
  return { blocked: false };
}

async function blockMiddleware(req, res, next) {
  try {
    const ip = clientIp(req);
    const status = await isBlocked(ip);
    if (status.blocked) {
      return res.status(403).json({
        success: false,
        code: 'IP_BLOCKED',
        message:
          'Your IP address was temporarily blocked due to suspicious activity. Contact the hotel admin to request access again.',
      });
    }
    next();
  } catch (e) {
    next();
  }
}

function inspectRequestMiddleware(req, res, next) {
  try {
    const raw = JSON.stringify({
      q: req.query,
      b: req.body && typeof req.body === 'object' ? req.body : {},
      u: req.originalUrl || req.url,
    }).toLowerCase();

    const sqli =
      /(\bunion\b.+\bselect\b)|(\bor\b\s+1\s*=\s*1)|(';\s*drop\s+table)|(\bsleep\s*\()|(\bbenchmark\s*\()|(information_schema)/i;
    const xss = /(<script|javascript:|onerror\s*=|onload\s*=)/i;
    const traverse = /\.\.|%2e%2e|%252e|\/etc\/passwd/i;

    if (traverse.test(raw) || traverse.test(req.url || '')) {
      reportSuspicious(req, 'path_traversal', { url: req.url }).catch(() => {});
      return res.status(400).json({ success: false, message: 'Bad request' });
    }
    if (sqli.test(raw)) {
      reportSuspicious(req, 'sqli_attempt', { url: req.url }).catch(() => {});
      return res.status(400).json({ success: false, message: 'Bad request' });
    }
    if (xss.test(raw)) {
      reportSuspicious(req, 'xss_attempt', { url: req.url }).catch(() => {});
      return res.status(400).json({ success: false, message: 'Bad request' });
    }
  } catch (_) {}
  next();
}

function getRecentAlerts(sinceId) {
  if (!sinceId) return recentAlerts.slice(0, 30);
  return recentAlerts.filter((a) => a.id > sinceId).slice(0, 30);
}

async function unblockIp(ip) {
  memoryBlocks.delete(ip);
  failBuckets.delete(ip);
  await ensureTables();
  await db.execute(`UPDATE blocked_ips SET active = 0 WHERE ip = ?`, [ip]);
}

/** Clear accidental localhost blocks from earlier versions */
async function clearLocalBlocks() {
  memoryBlocks.delete('127.0.0.1');
  memoryBlocks.delete('::1');
  memoryBlocks.delete('::ffff:127.0.0.1');
  await ensureTables();
  try {
    await db.execute(
      `UPDATE blocked_ips SET active = 0
       WHERE active = 1 AND (ip = '127.0.0.1' OR ip = '::1' OR ip LIKE '%127.0.0.1%')`
    );
  } catch (_) {}
}

module.exports = {
  clientIp,
  reportSuspicious,
  blockIp,
  isBlocked,
  blockMiddleware,
  inspectRequestMiddleware,
  getRecentAlerts,
  unblockIp,
  unlockAccount,
  isAccountLocked,
  ensureTables,
  clearLocalBlocks,
  FAIL_THRESHOLD,
  BLOCK_HOURS,
  LOGIN_FAIL_LOCK,
};
