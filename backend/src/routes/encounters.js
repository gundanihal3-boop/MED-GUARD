const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../audit');
const { ENCOUNTER_STATUSES, canTransition } = require('../services/encounterStatus');

const router = express.Router();

function auditStatusChange(req, enc, toStatus, action, payload = {}) {
  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    deviceId: req.user.deviceId,
    entityType: 'encounter',
    entityId: enc.id,
    action,
    payload: { fromStatus: enc.status, toStatus, ...payload },
  });
}

function nextToken(day) {
  const count = db.prepare(`
    SELECT COUNT(*) AS c FROM encounters WHERE token_day = ?
  `).get(day).c;
  return String(count + 1).padStart(3, '0');
}

function enrichEncounter(row) {
  if (!row) return null;
  const patient = db.prepare('SELECT id, uhid, full_name, age_years, sex, phone, registration_source FROM patients WHERE id = ?').get(row.patient_id);
  const doctor = row.doctor_id
    ? db.prepare('SELECT id, display_name, department FROM users WHERE id = ?').get(row.doctor_id)
    : null;
  const confirmation = db.prepare(`
    SELECT * FROM confirmations WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(row.id);
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE encounter_id = ?').get(row.id);
  return { ...row, patient, doctor, confirmation, prescription };
}

router.post('/', authRequired, requireRoles('reception', 'admin'), (req, res) => {
  const { patientId, department, opdToken } = req.body || {};
  if (!patientId || !department) {
    return res.status(400).json({ error: 'patientId and department required' });
  }
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const now = new Date();
  const tokenDay = now.toISOString().slice(0, 10);
  const token = opdToken ? String(opdToken).trim() : nextToken(tokenDay);
  const existing = db.prepare('SELECT id FROM encounters WHERE opd_token = ? AND token_day = ?').get(token, tokenDay);
  if (existing) return res.status(409).json({ error: 'Token already used today' });

  const id = uuid();
  const createdAt = now.toISOString();

  db.prepare(`
    INSERT INTO encounters
      (id, patient_id, opd_token, department, status, created_by, created_at, token_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, patientId, token, department, ENCOUNTER_STATUSES.WAITING, req.user.id, createdAt, tokenDay);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    deviceId: req.user.deviceId,
    entityType: 'encounter',
    entityId: id,
    action: 'encounter.created',
    payload: { patientId, opdToken: token, department },
  });

  res.status(201).json({ encounter: enrichEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(id)) });
});

router.get('/', authRequired, (req, res) => {
  const { status, day, doctorId, q } = req.query;
  const tokenDay = day || new Date().toISOString().slice(0, 10);
  let sql = `
    SELECT e.* FROM encounters e
    JOIN patients p ON p.id = e.patient_id
    WHERE e.token_day = ?
  `;
  const params = [tokenDay];
  if (status) {
    sql += ' AND e.status = ?';
    params.push(status);
  }
  if (doctorId) {
    sql += ' AND e.doctor_id = ?';
    params.push(doctorId);
  }
  if (q) {
    sql += ' AND (e.opd_token = ? OR p.full_name LIKE ? OR p.uhid = ?)';
    params.push(String(q), `%${q}%`, String(q));
  }
  sql += ' ORDER BY e.created_at DESC';
  const rows = db.prepare(sql).all(...params).map(enrichEncounter);
  res.json({ encounters: rows });
});

router.get('/by-token/:token', authRequired, (req, res) => {
  const tokenDay = req.query.day || new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT * FROM encounters WHERE opd_token = ? AND token_day = ?
  `).get(req.params.token, tokenDay);
  if (!row) return res.status(404).json({ error: 'Encounter not found' });
  res.json({ encounter: enrichEncounter(row) });
});

router.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Encounter not found' });
  res.json({ encounter: enrichEncounter(row) });
});

router.post('/:id/start', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (req.user.role === 'doctor' && !req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!canTransition(enc.status, ENCOUNTER_STATUSES.IN_CONSULTATION)) {
    return res.status(409).json({ error: `Cannot start from status ${enc.status}` });
  }

  const doctorId = req.user.role === 'doctor' ? req.user.id : (req.body.doctorId || req.user.id);

  const openAttendance = db.prepare(`
    SELECT id FROM attendance_sessions
    WHERE doctor_id = ? AND status = 'open'
    ORDER BY check_in_at DESC LIMIT 1
  `).get(doctorId);

  let usedAdminOverride = false;
  if (!openAttendance) {
    if (req.user.role === 'admin' && req.body.adminOverride) {
      usedAdminOverride = true;
      if (!req.body.overrideReason) {
        return res.status(400).json({ error: 'overrideReason required when bypassing attendance' });
      }
    } else {
      return res.status(400).json({ error: 'Doctor must be checked in to start consultations. Admin override required if bypassing.' });
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE encounters SET status = ?, doctor_id = ?, started_at = ? WHERE id = ?
  `).run(ENCOUNTER_STATUSES.IN_CONSULTATION, doctorId, now, enc.id);

  auditStatusChange(req, enc, ENCOUNTER_STATUSES.IN_CONSULTATION, 'consultation.started', {
    doctorId,
    adminOverride: usedAdminOverride,
    overrideReason: req.body.overrideReason || null,
  });

  res.json({ encounter: enrichEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id)) });
});

router.post('/:id/complete', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (req.user.role === 'doctor' && enc.doctor_id && enc.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your encounter' });
  }
  if (!canTransition(enc.status, ENCOUNTER_STATUSES.CONSULTATION_COMPLETED)) {
    return res.status(409).json({ error: `Cannot complete from status ${enc.status}` });
  }

  const durationSec = enc.started_at ? (new Date().getTime() - new Date(enc.started_at).getTime()) / 1000 : 0;
  if (durationSec < 30) {
    writeAudit({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      entityType: 'encounter',
      entityId: enc.id,
      action: 'anomaly.rapid_consultation_attempt',
      payload: { durationSec },
    });
    return res.status(422).json({ error: 'Consultation completed too quickly. Minimum 30 seconds required to prevent phantom records.' });
  }

  const { notes, noMedicines } = req.body || {};
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE encounters
    SET status = ?, completed_at = ?, notes = ?, no_medicines = ?
    WHERE id = ?
  `).run(
    ENCOUNTER_STATUSES.CONSULTATION_COMPLETED,
    now,
    notes || null,
    noMedicines ? 1 : 0,
    enc.id
  );

  auditStatusChange(req, enc, ENCOUNTER_STATUSES.CONSULTATION_COMPLETED, 'consultation.completed', {
    noMedicines: !!noMedicines,
    durationSec,
  });

  res.json({ encounter: enrichEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id)) });
});

router.post('/:id/no-show', authRequired, requireRoles('reception', 'doctor', 'admin'), (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (!canTransition(enc.status, ENCOUNTER_STATUSES.NO_SHOW)) {
    return res.status(409).json({ error: `Cannot mark no-show from ${enc.status}` });
  }
  db.prepare(`UPDATE encounters SET status = ? WHERE id = ?`).run(ENCOUNTER_STATUSES.NO_SHOW, enc.id);
  auditStatusChange(req, enc, ENCOUNTER_STATUSES.NO_SHOW, 'encounter.no_show');
  res.json({ encounter: enrichEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id)) });
});

router.post('/:id/cancel', authRequired, requireRoles('reception', 'doctor', 'admin'), (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (!canTransition(enc.status, ENCOUNTER_STATUSES.CANCELLED)) {
    return res.status(409).json({ error: `Cannot cancel from ${enc.status}` });
  }
  const reason = req.body?.reason || 'cancelled';
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE encounters SET status = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?
  `).run(ENCOUNTER_STATUSES.CANCELLED, now, reason, enc.id);
  auditStatusChange(req, enc, ENCOUNTER_STATUSES.CANCELLED, 'encounter.cancelled', { reason });
  res.json({ encounter: enrichEncounter(db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id)) });
});

module.exports = router;
