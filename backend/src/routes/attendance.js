const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../audit');

const router = express.Router();

router.post('/check-in', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : (req.body.doctorId || req.user.id);
  const open = db.prepare(`
    SELECT * FROM attendance_sessions WHERE doctor_id = ? AND status = 'open' LIMIT 1
  `).get(doctorId);
  if (open) return res.status(409).json({ error: 'Already checked in', session: open });

  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attendance_sessions
      (id, doctor_id, check_in_at, status, device_id, location_label, created_at)
    VALUES (?, ?, ?, 'open', ?, ?, ?)
  `).run(id, doctorId, now, req.user.deviceId || null, req.body.locationLabel || null, now);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    deviceId: req.user.deviceId,
    entityType: 'attendance_session',
    entityId: id,
    action: 'attendance.check_in',
    payload: { doctorId },
  });

  res.status(201).json({ session: db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(id) });
});

router.post('/check-out', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : (req.body.doctorId || req.user.id);
  const open = db.prepare(`
    SELECT * FROM attendance_sessions WHERE doctor_id = ? AND status = 'open'
    ORDER BY check_in_at DESC LIMIT 1
  `).get(doctorId);
  if (!open) return res.status(404).json({ error: 'No open attendance session' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE attendance_sessions SET check_out_at = ?, status = 'closed' WHERE id = ?
  `).run(now, open.id);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'attendance_session',
    entityId: open.id,
    action: 'attendance.check_out',
  });

  res.json({ session: db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(open.id) });
});

router.get('/today', authRequired, (req, res) => {
  const day = (req.query.day || new Date().toISOString().slice(0, 10));
  const sessions = db.prepare(`
    SELECT a.*, u.display_name, u.department
    FROM attendance_sessions a
    JOIN users u ON u.id = a.doctor_id
    WHERE date(a.check_in_at) = date(?)
    ORDER BY a.check_in_at ASC
  `).all(day);

  const withCounts = sessions.map((s) => {
    const consultCount = db.prepare(`
      SELECT COUNT(*) AS c FROM encounters
      WHERE doctor_id = ? AND token_day = ? AND status NOT IN ('cancelled','no_show','registered','waiting')
    `).get(s.doctor_id, day).c;
    return { ...s, consultCount };
  });

  res.json({ sessions: withCounts });
});

router.get('/me', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : (req.query.doctorId || req.user.id);
  const open = db.prepare(`
    SELECT * FROM attendance_sessions WHERE doctor_id = ? AND status = 'open'
    ORDER BY check_in_at DESC LIMIT 1
  `).get(doctorId);
  res.json({ session: open || null });
});

module.exports = router;
