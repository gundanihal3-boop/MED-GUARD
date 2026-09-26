const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { listAuditForEntity } = require('../audit');
const { processSmsFallbackAndExpiry } = require('../services/sms');

const router = express.Router();

router.use(authRequired, requireRoles('admin'));

router.get('/overview', async (req, res) => {
  await processSmsFallbackAndExpiry();
  const day = req.query.day || new Date().toISOString().slice(0, 10);

  const doctorsPresent = db.prepare(`
    SELECT COUNT(*) AS c FROM attendance_sessions
    WHERE status = 'open' AND date(check_in_at) = date(?)
  `).get(day).c;

  const counts = db.prepare(`
    SELECT status, COUNT(*) AS c FROM encounters
    WHERE token_day = ?
    GROUP BY status
  `).all(day);

  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.c]));
  const total = counts.reduce((s, r) => s + r.c, 0);
  const completed = (byStatus.consultation_completed || 0)
    + (byStatus.confirmation_pending || 0)
    + (byStatus.confirmed_tablet || 0)
    + (byStatus.confirmed_sms || 0)
    + (byStatus.confirmation_not_received || 0)
    + (byStatus.patient_disputed || 0);

  const feedback = db.prepare(`
    SELECT c.feedback, COUNT(*) AS c
    FROM confirmations c
    JOIN encounters e ON e.id = c.encounter_id
    WHERE e.token_day = ? AND c.feedback IS NOT NULL
    GROUP BY c.feedback
  `).all(day);

  const staffAssisted = db.prepare(`
    SELECT COUNT(*) AS c
    FROM confirmations c
    JOIN encounters e ON e.id = c.encounter_id
    WHERE e.token_day = ? AND c.staff_assisted = 1 AND c.result = 'confirmed'
  `).get(day).c;

  const tabletConfirmed = byStatus.confirmed_tablet || 0;
  const smsConfirmed = byStatus.confirmed_sms || 0;

  res.json({
    day,
    doctorsPresent,
    totalEncounters: total,
    byStatus,
    funnel: {
      completed,
      tabletConfirmed,
      smsConfirmed,
      pending: (byStatus.confirmation_pending || 0) + (byStatus.consultation_completed || 0),
      notReceived: byStatus.confirmation_not_received || 0,
      disputed: byStatus.patient_disputed || 0,
      staffAssisted,
    },
    feedback,
  });
});

router.get('/anomalies', async (req, res) => {
  await processSmsFallbackAndExpiry();
  const day = req.query.day || new Date().toISOString().slice(0, 10);
  const anomalies = [];

  // Present but zero consultations
  const present = db.prepare(`
    SELECT a.*, u.display_name
    FROM attendance_sessions a
    JOIN users u ON u.id = a.doctor_id
    WHERE date(a.check_in_at) = date(?) AND a.status IN ('open','closed','auto_closed')
  `).all(day);

  for (const s of present) {
    const consultCount = db.prepare(`
      SELECT COUNT(*) AS c FROM encounters
      WHERE doctor_id = ? AND token_day = ?
        AND status NOT IN ('cancelled','no_show','registered','waiting')
    `).get(s.doctor_id, day).c;
    if (consultCount === 0) {
      anomalies.push({
        type: 'present_zero_consults',
        severity: 'medium',
        message: `${s.display_name} checked in but has 0 consultations`,
        doctorId: s.doctor_id,
      });
    }
  }

  // High volume (> 40 / day — simple pilot threshold)
  const volumes = db.prepare(`
    SELECT e.doctor_id, u.display_name, COUNT(*) AS c
    FROM encounters e
    JOIN users u ON u.id = e.doctor_id
    WHERE e.token_day = ? AND e.doctor_id IS NOT NULL
      AND e.status NOT IN ('cancelled','no_show')
    GROUP BY e.doctor_id
    HAVING c > 40
  `).all(day);
  for (const v of volumes) {
    anomalies.push({
      type: 'high_consult_volume',
      severity: 'medium',
      message: `${v.display_name} has ${v.c} encounters today`,
      doctorId: v.doctor_id,
    });
  }

  // Pending confirmations past grace (still pending)
  const pendingOld = db.prepare(`
    SELECT e.id, e.opd_token, e.completed_at, p.full_name
    FROM encounters e
    JOIN patients p ON p.id = e.patient_id
    WHERE e.token_day = ?
      AND e.status IN ('consultation_completed','confirmation_pending')
      AND e.completed_at IS NOT NULL
  `).all(day);
  for (const e of pendingOld) {
    const ageH = (Date.now() - new Date(e.completed_at).getTime()) / 3600000;
    if (ageH >= 2) {
      anomalies.push({
        type: 'confirmation_pending',
        severity: 'low',
        message: `Token ${e.opd_token} (${e.full_name}) unconfirmed for ${ageH.toFixed(1)}h`,
        encounterId: e.id,
      });
    }
  }

  // Duplicate patient same day
  const dupes = db.prepare(`
    SELECT patient_id, COUNT(*) AS c FROM encounters
    WHERE token_day = ? AND status NOT IN ('cancelled')
    GROUP BY patient_id HAVING c > 1
  `).all(day);
  for (const d of dupes) {
    const p = db.prepare('SELECT full_name FROM patients WHERE id = ?').get(d.patient_id);
    anomalies.push({
      type: 'duplicate_patient_day',
      severity: 'low',
      message: `${p.full_name} has ${d.c} encounters today`,
      patientId: d.patient_id,
    });
  }

  // Staff-assisted rate spike (> 50% of tablet confirms)
  const confStats = db.prepare(`
    SELECT
      SUM(CASE WHEN method='tablet' AND result='confirmed' THEN 1 ELSE 0 END) AS tablet_conf,
      SUM(CASE WHEN method='tablet' AND result='confirmed' AND staff_assisted=1 THEN 1 ELSE 0 END) AS assisted
    FROM confirmations c
    JOIN encounters e ON e.id = c.encounter_id
    WHERE e.token_day = ?
  `).get(day);
  if (confStats.tablet_conf > 5 && confStats.assisted / confStats.tablet_conf > 0.5) {
    anomalies.push({
      type: 'high_staff_assisted_rate',
      severity: 'high',
      message: `Staff-assisted confirmations are ${Math.round(100 * confStats.assisted / confStats.tablet_conf)}% of tablet confirms`,
    });
  }

  res.json({ anomalies });
});

router.get('/encounters/:id/timeline', (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.id);
  if (!enc) return res.status(404).json({ error: 'Not found' });
  const audit = listAuditForEntity('encounter', enc.id);
  const confAudit = db.prepare(`
    SELECT * FROM audit_events
    WHERE entity_type = 'confirmation'
      AND json_extract(payload, '$.encounterId') = ?
    ORDER BY occurred_at ASC
  `).all(enc.id).map((r) => ({ ...r, payload: JSON.parse(r.payload || '{}') }));
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE encounter_id = ?').get(enc.id);
  let rxAudit = [];
  if (prescription) rxAudit = listAuditForEntity('prescription', prescription.id);
  const confirmations = db.prepare('SELECT * FROM confirmations WHERE encounter_id = ? ORDER BY created_at').all(enc.id);
  const sms = db.prepare('SELECT * FROM sms_messages WHERE encounter_id = ? ORDER BY created_at').all(enc.id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(enc.patient_id);

  res.json({
    encounter: enc,
    patient,
    confirmations,
    sms,
    timeline: [...audit, ...confAudit, ...rxAudit].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
  });
});

router.get('/users', (_req, res) => {
  const users = db.prepare(`
    SELECT id, display_name, login_id, role, department, active, created_at FROM users ORDER BY role, display_name
  `).all();
  res.json({ users });
});

router.post('/users/:id/toggle-active', (req, res) => {
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  const newActive = targetUser.active === 1 ? 0 : 1;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(newActive, targetUser.id);
  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'user',
    entityId: targetUser.id,
    action: newActive ? 'user.reactivated' : 'user.deactivated',
    payload: { targetLoginId: targetUser.login_id },
  });
  res.json({ ok: true, user: db.prepare('SELECT id, display_name, login_id, role, department, active FROM users WHERE id = ?').get(targetUser.id) });
});

router.get('/settings', (_req, res) => {
  res.json({ settings: db.prepare('SELECT * FROM hospital_settings WHERE id = 1').get() });
});

router.put('/settings', (req, res) => {
  const { hospital_name, language_primary, sms_grace_hours, confirmation_expire_hours } = req.body || {};
  if (!hospital_name) return res.status(400).json({ error: 'hospital_name is required' });
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE hospital_settings
    SET hospital_name = ?,
        language_primary = ?,
        sms_grace_hours = ?,
        confirmation_expire_hours = ?,
        updated_at = ?
    WHERE id = 1
  `).run(
    hospital_name,
    language_primary || 'te',
    Number(sms_grace_hours) || 2,
    Number(confirmation_expire_hours) || 48,
    now
  );
  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'hospital_settings',
    entityId: '1',
    action: 'settings.updated',
    payload: { hospital_name, language_primary, sms_grace_hours, confirmation_expire_hours },
  });
  res.json({ settings: db.prepare('SELECT * FROM hospital_settings WHERE id = 1').get() });
});

module.exports = router;
