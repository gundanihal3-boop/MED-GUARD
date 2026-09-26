const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../audit');

const { getPatientIdentityAdapter } = require('../services/patientIdentityAdapter');

const router = express.Router();

router.get('/check-duplicate', authRequired, requireRoles('reception', 'admin'), async (req, res) => {
  const { fullName, phone, uhid } = req.query;
  const adapter = getPatientIdentityAdapter();
  const result = await adapter.checkDuplicates({ fullName, phone, uhid });
  res.json(result);
});

router.get('/search', authRequired, requireRoles('reception', 'doctor', 'admin', 'kiosk_staff'), (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ patients: [] });

  const patients = db.prepare(`
    SELECT id, uhid, full_name, age_years, sex, phone, registration_source, created_at
    FROM patients
    WHERE uhid = ? OR full_name LIKE ? OR phone = ?
    ORDER BY created_at DESC
    LIMIT 25
  `).all(q, `%${q}%`, q);

  res.json({ patients });
});

router.post('/', authRequired, requireRoles('reception', 'admin'), async (req, res) => {
  const { uhid, fullName, ageYears, sex, phone, overrideDuplicate } = req.body || {};
  if (!fullName || ageYears == null || !sex) {
    return res.status(400).json({ error: 'fullName, ageYears, sex required' });
  }
  if (!['male', 'female', 'other'].includes(sex)) {
    return res.status(400).json({ error: 'Invalid sex' });
  }

  const cleanUhid = uhid ? String(uhid).trim() : null;
  const cleanPhone = phone ? String(phone).trim() : null;

  if (cleanUhid) {
    const existing = db.prepare('SELECT id FROM patients WHERE uhid = ?').get(cleanUhid);
    if (existing) {
      return res.status(409).json({ error: 'UHID already registered', patientId: existing.id });
    }
  }

  const adapter = getPatientIdentityAdapter();
  const dupCheck = await adapter.checkDuplicates({ fullName, phone: cleanPhone, uhid: cleanUhid });
  
  if (dupCheck.hasWarnings && !overrideDuplicate) {
    return res.status(409).json({ error: 'Duplicate patient detected. Use overrideDuplicate flag to create anyway.', warnings: dupCheck.warnings });
  }

  const id = uuid();
  const now = new Date().toISOString();
  const registrationSource = cleanUhid ? 'hospital_uhid' : 'medguard_minimal';

  db.prepare(`
    INSERT INTO patients
      (id, uhid, full_name, age_years, sex, phone, registration_source, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    cleanUhid,
    String(fullName).trim(),
    Number(ageYears),
    sex,
    cleanPhone,
    registrationSource,
    now,
    req.user.id
  );

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    deviceId: req.user.deviceId,
    entityType: 'patient',
    entityId: id,
    action: 'patient.created',
    payload: { 
      registrationSource, 
      uhid: cleanUhid, 
      hasPhone: !!phone,
      overrodeDuplicateWarning: !!overrideDuplicate,
      overrideReason: overrideDuplicate && dupCheck.hasWarnings ? 'User confirmed creation despite warnings' : null
    },
  });

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  res.status(201).json({ patient });
});

router.post('/:id/link-uhid', authRequired, requireRoles('reception', 'admin'), (req, res) => {
  const { uhid } = req.body || {};
  if (!uhid) return res.status(400).json({ error: 'uhid required' });
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const clash = db.prepare('SELECT id FROM patients WHERE uhid = ? AND id != ?').get(uhid, patient.id);
  if (clash) return res.status(409).json({ error: 'UHID already used' });

  db.prepare(`
    UPDATE patients SET uhid = ?, registration_source = 'hospital_uhid' WHERE id = ?
  `).run(String(uhid).trim(), patient.id);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'patient',
    entityId: patient.id,
    action: 'patient.uhid_linked',
    payload: { uhid },
  });

  res.json({ patient: db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id) });
});

router.patch('/:id/phone', authRequired, requireRoles('reception', 'admin'), (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const openEncounter = db.prepare(`
    SELECT id, status FROM encounters
    WHERE patient_id = ? AND status IN ('registered','waiting','in_consultation')
    ORDER BY created_at DESC LIMIT 1
  `).get(patient.id);

  // Plan: edit phone before consultation complete — allow until completed
  const completed = db.prepare(`
    SELECT id FROM encounters
    WHERE patient_id = ? AND status NOT IN ('registered','waiting','in_consultation','cancelled','no_show')
    ORDER BY created_at DESC LIMIT 1
  `).get(patient.id);

  const phone = req.body?.phone ? String(req.body.phone).trim() : null;
  db.prepare('UPDATE patients SET phone = ? WHERE id = ?').run(phone, patient.id);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'patient',
    entityId: patient.id,
    action: 'patient.phone_updated',
    payload: { phone, openEncounterId: openEncounter?.id || null, hadCompleted: !!completed },
  });

  res.json({ patient: db.prepare('SELECT * FROM patients WHERE id = ?').get(patient.id) });
});

router.get('/:id', authRequired, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient });
});

module.exports = router;
