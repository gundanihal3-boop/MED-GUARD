const express = require('express');
const db = require('../db');
const { createSession, verifyPin, authRequired, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../audit');

const router = express.Router();

const loginAttempts = new Map();
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 10 * 60 * 1000);
const LOCK_MS = Number(process.env.LOGIN_LOCK_MS || 5 * 60 * 1000);
const MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 5);

function attemptKey(req, loginId) {
  return `${req.ip || 'local'}:${String(loginId || '').toLowerCase()}`;
}

function getAttempt(req, loginId) {
  const key = attemptKey(req, loginId);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.windowStartedAt > WINDOW_MS) {
    const fresh = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
    loginAttempts.set(key, fresh);
    return { key, state: fresh };
  }
  return { key, state: current };
}

router.get('/users', authRequired, requireRoles('admin'), (_req, res) => {
  const users = db.prepare(`
    SELECT id, display_name, login_id, role, department, active
    FROM users WHERE active = 1 ORDER BY role, display_name
  `).all();
  res.json({ users });
});

router.post('/login', (req, res) => {
  const { loginId, pin, deviceId } = req.body || {};
  if (!loginId || !pin) return res.status(400).json({ error: 'loginId and pin required' });

  const { key, state } = getAttempt(req, loginId);
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: 'Too many invalid attempts. Please wait before retrying.', retryAfterSeconds });
  }

  const user = db.prepare('SELECT * FROM users WHERE login_id = ? AND active = 1').get(loginId);
  if (!user || !verifyPin(pin, user.pin_hash)) {
    state.failures += 1;
    if (state.failures >= MAX_FAILURES) {
      state.lockedUntil = Date.now() + LOCK_MS;
      state.failures = 0;
    }
    loginAttempts.set(key, state);
    return res.status(401).json({ error: 'Invalid login or PIN' });
  }

  loginAttempts.delete(key);
  const session = createSession(user.id, deviceId || null);
  writeAudit({
    actorUserId: user.id,
    actorRole: user.role,
    deviceId: deviceId || null,
    entityType: 'user',
    entityId: user.id,
    action: 'auth.login',
    payload: { deviceId },
  });

  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      displayName: user.display_name,
      loginId: user.login_id,
      role: user.role,
      department: user.department,
    },
  });
});

router.post('/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user.token);
  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'user',
    entityId: req.user.id,
    action: 'auth.logout',
  });
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
