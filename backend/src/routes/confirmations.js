const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authRequired, requireRoles, verifyPin } = require('../middleware/auth');
const { writeAudit } = require('../audit');
const { ENCOUNTER_STATUSES, CONFIRMABLE_FROM } = require('../services/encounterStatus');
const { hasSuccessfulConfirmation } = require('../services/sms');

const router = express.Router();

router.post('/tablet', authRequired, requireRoles('kiosk_staff', 'reception', 'admin'), (req, res) => {
  const {
    encounterId,
    opdToken,
    result,
    feedback,
    staffAssisted,
    assistLoginId,
    assistPin,
    offlineSynced,
    deviceId,
  } = req.body || {};

  if (!['confirmed', 'disputed'].includes(result)) {
    return res.status(400).json({ error: 'result must be confirmed or disputed' });
  }
  if (feedback && !['sad', 'neutral', 'happy'].includes(feedback)) {
    return res.status(400).json({ error: 'Invalid feedback' });
  }

  let enc = null;
  if (encounterId) {
    enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(encounterId);
  } else if (opdToken) {
    const day = new Date().toISOString().slice(0, 10);
    enc = db.prepare('SELECT * FROM encounters WHERE opd_token = ? AND token_day = ?').get(String(opdToken), day);
  }
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });

  if (!CONFIRMABLE_FROM.has(enc.status) && enc.status !== ENCOUNTER_STATUSES.CONSULTATION_COMPLETED) {
    // allow confirmation_pending and consultation_completed only
    if (![ENCOUNTER_STATUSES.CONSULTATION_COMPLETED, ENCOUNTER_STATUSES.CONFIRMATION_PENDING].includes(enc.status)) {
      return res.status(409).json({ error: `Cannot confirm encounter in status ${enc.status}` });
    }
  }

  if (hasSuccessfulConfirmation(enc.id) && result === 'confirmed') {
    return res.status(409).json({ error: 'Already confirmed' });
  }

  let assistedBy = null;
  let assisted = !!staffAssisted;
  if (assisted) {
    if (!assistLoginId || !assistPin) {
      return res.status(400).json({ error: 'assistLoginId and assistPin required for staff-assisted confirmation' });
    }
    const helper = db.prepare('SELECT * FROM users WHERE login_id = ? AND active = 1').get(assistLoginId);
    if (!helper || !verifyPin(assistPin, helper.pin_hash)) {
      return res.status(401).json({ error: 'Invalid staff assist credentials' });
    }
    if (!['kiosk_staff', 'reception', 'admin'].includes(helper.role)) {
      return res.status(403).json({ error: 'Only authorized support staff can assist patient confirmations' });
    }
    assistedBy = helper.id;
  }

  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO confirmations
      (id, encounter_id, method, result, feedback, staff_assisted, assisted_by_user_id, device_id, offline_synced, created_at)
    VALUES (?, ?, 'tablet', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    enc.id,
    result,
    feedback || null,
    assisted ? 1 : 0,
    assistedBy,
    deviceId || req.user.deviceId || null,
    offlineSynced ? 1 : 0,
    now
  );

  const newStatus = result === 'confirmed'
    ? ENCOUNTER_STATUSES.CONFIRMED_TABLET
    : ENCOUNTER_STATUSES.PATIENT_DISPUTED;
  db.prepare('UPDATE encounters SET status = ? WHERE id = ?').run(newStatus, enc.id);

  writeAudit({
    actorUserId: assistedBy || req.user.id,
    actorRole: req.user.role,
    actorKind: assisted ? 'staff_assisted_patient' : 'patient_kiosk',
    deviceId: deviceId || req.user.deviceId,
    entityType: 'encounter',
    entityId: enc.id,
    action: 'encounter.status_changed',
    payload: { fromStatus: enc.status, toStatus: newStatus, confirmationId: id },
  });

  writeAudit({
    actorUserId: assistedBy || req.user.id,
    actorRole: req.user.role,
    actorKind: assisted ? 'staff_assisted_patient' : 'patient_kiosk',
    deviceId: deviceId || req.user.deviceId,
    entityType: 'confirmation',
    entityId: id,
    action: result === 'confirmed' ? 'confirmation.tablet' : 'confirmation.tablet_disputed',
    payload: {
      encounterId: enc.id,
      staffAssisted: assisted,
      assistedBy,
      feedback: feedback || null,
      offlineSynced: !!offlineSynced,
    },
  });

  if (assistedBy) {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const recentCount = db.prepare(`
      SELECT COUNT(*) AS c FROM confirmations
      WHERE staff_assisted = 1 AND assisted_by_user_id = ? AND created_at > ?
    `).get(assistedBy, fifteenMinsAgo).c;
    
    if (recentCount > 5) {
      writeAudit({
        actorUserId: assistedBy,
        actorRole: req.user.role,
        entityType: 'staff_user',
        entityId: assistedBy,
        action: 'anomaly.high_volume_staff_confirmations',
        payload: { recentCount, threshold: 5, timeframe: '15m' },
      });
    }
  }

  res.status(201).json({
    confirmation: db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id),
    encounter: db.prepare('SELECT * FROM encounters WHERE id = ?').get(enc.id),
  });
});

module.exports = router;
