const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');

const SESSION_HOURS = 8;

function createSession(userId, deviceId = null) {
  const token = uuid();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO sessions (token, user_id, device_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, deviceId, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

function getSessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, s.expires_at, s.device_id, u.id, u.display_name, u.login_id, u.role, u.department, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  if (!row.active) return null;
  return {
    token: row.token,
    deviceId: row.device_id,
    id: row.id,
    displayName: row.display_name,
    loginId: row.login_id,
    role: row.role,
    department: row.department,
  };
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = getSessionUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function verifyPin(pin, pinHash) {
  return bcrypt.compareSync(String(pin), pinHash);
}

function hashPin(pin) {
  return bcrypt.hashSync(String(pin), 10);
}

module.exports = {
  createSession,
  getSessionUser,
  authRequired,
  requireRoles,
  verifyPin,
  hashPin,
};
