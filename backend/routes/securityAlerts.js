const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, authorize } = require('../middleware/auth');
const {
  getRecentAlerts,
  unblockIp,
  unlockAccount,
  ensureTables,
} = require('../middleware/intrusion');

router.get('/alerts', auth, authorize('admin'), async (req, res) => {
  try {
    const since = Number(req.query.since || 0);
    res.json({ success: true, alerts: getRecentAlerts(since) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/blocked-ips', auth, authorize('admin'), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await db.execute(
      `SELECT id, ip, reason, details, blocked_at, expires_at, active
       FROM blocked_ips
       WHERE active = 1 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC LIMIT 200`
    );
    res.json({ success: true, blocked: rows || [] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/locked-accounts', auth, authorize('admin'), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await db.execute(
      `SELECT id, user_id, email, reason, fail_count, locked_at, active
       FROM locked_accounts
       WHERE active = 1
       ORDER BY id DESC LIMIT 200`
    );
    res.json({ success: true, locked: rows || [] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/events', auth, authorize('admin'), async (req, res) => {
  try {
    await ensureTables();
    const [rows] = await db.execute(
      `SELECT id, ip, event_type, path, method, user_agent, details, created_at
       FROM security_events
       ORDER BY id DESC LIMIT 200`
    );
    res.json({ success: true, events: rows || [] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/unblock', auth, authorize('admin'), async (req, res) => {
  try {
    const ip = String(req.body.ip || '').trim();
    if (!ip) return res.status(400).json({ success: false, message: 'IP required' });
    await unblockIp(ip);
    res.json({ success: true, message: `Unblocked IP ${ip}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Admin grants access back to a locked user */
router.post('/unlock-account', auth, authorize('admin'), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });
    await unlockAccount(email);
    res.json({ success: true, message: `Unlocked account ${email}. User can log in again.` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
