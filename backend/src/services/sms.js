const { v4: uuid } = require('uuid');
const db = require('../db');
const { writeAudit } = require('../audit');
const { ENCOUNTER_STATUSES } = require('./encounterStatus');

function getSettings() {
  return db.prepare('SELECT * FROM hospital_settings WHERE id = 1').get();
}

function hasSuccessfulConfirmation(encounterId) {
  return !!db.prepare(`
    SELECT id FROM confirmations
    WHERE encounter_id = ? AND result = 'confirmed'
    LIMIT 1
  `).get(encounterId);
}

async function processSmsFallbackAndExpiry() {
  const settings = getSettings();
  const now = Date.now();
  const graceMs = (settings.sms_grace_hours || 2) * 60 * 60 * 1000;
  const expireMs = (settings.confirmation_expire_hours || 48) * 60 * 60 * 1000;

  const pending = db.prepare(`
    SELECT e.*, p.phone, u.display_name AS doctor_name
    FROM encounters e
    JOIN patients p ON p.id = e.patient_id
    LEFT JOIN users u ON u.id = e.doctor_id
    WHERE e.status IN ('consultation_completed', 'confirmation_pending')
      AND e.completed_at IS NOT NULL
  `).all();

  for (const enc of pending) {
    if (hasSuccessfulConfirmation(enc.id)) continue;
    const completedAt = new Date(enc.completed_at).getTime();
    const age = now - completedAt;

    if (age >= expireMs) {
      db.prepare(`UPDATE encounters SET status = ? WHERE id = ?`)
        .run(ENCOUNTER_STATUSES.CONFIRMATION_NOT_RECEIVED, enc.id);
      writeAudit({
        actorKind: 'system',
        entityType: 'encounter',
        entityId: enc.id,
        action: 'confirmation.expired',
        payload: { previousStatus: enc.status },
      });
      continue;
    }

    if (age >= graceMs && enc.phone) {
      const alreadySent = db.prepare(`
        SELECT id FROM sms_messages
        WHERE encounter_id = ? AND direction = 'outbound' AND status IN ('queued','sent','delivered')
        LIMIT 1
      `).get(enc.id);
      if (!alreadySent) {
        await sendConfirmationSms(enc, 'auto_grace');
      }
    } else if (enc.status === ENCOUNTER_STATUSES.CONSULTATION_COMPLETED && age >= graceMs && !enc.phone) {
      db.prepare(`UPDATE encounters SET status = ? WHERE id = ?`)
        .run(ENCOUNTER_STATUSES.CONFIRMATION_PENDING, enc.id);
      writeAudit({
        actorKind: 'system',
        entityType: 'encounter',
        entityId: enc.id,
        action: 'encounter.status_changed',
        payload: {
          fromStatus: enc.status,
          toStatus: ENCOUNTER_STATUSES.CONFIRMATION_PENDING,
          trigger: 'confirmation_grace_elapsed_no_phone',
        },
      });
    }
  }
}

const { getSmsProvider } = require('./smsProvider');

async function sendConfirmationSms(encounter, trigger = 'manual') {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(encounter.patient_id);
  if (!patient?.phone) {
    return { ok: false, error: 'No phone on file' };
  }
  if (hasSuccessfulConfirmation(encounter.id)) {
    return { ok: false, error: 'Already confirmed' };
  }

  const doctorName = encounter.doctor_name
    || (encounter.doctor_id
      ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(encounter.doctor_id)?.display_name
      : 'your doctor');

  const body = `MED-GUARD: Did you consult Dr. ${doctorName} today (token ${encounter.opd_token})? Reply YES or NO.`;
  const id = uuid();
  const now = new Date().toISOString();

  // Send via current SmsProvider instance
  const provider = getSmsProvider();
  let providerId = `sim_${id.slice(0, 8)}`;
  let isSimulated = true;
  let status = 'sent';
  let providerError = null;

  try {
    const result = await provider.sendSms({ to: patient.phone, body, encounterId: encounter.id });
    if (result && result.success === false) {
      status = 'failed';
      providerError = result.error || 'SMS provider returned failure';
    }
    if (result && result.providerMessageId) {
      providerId = result.providerMessageId;
      isSimulated = !!result.simulated;
    }
  } catch (err) {
    status = 'failed';
    providerError = err.message || 'SMS provider error';
    console.error('Error invoking SmsProvider', err);
  }

  db.prepare(`
    INSERT INTO sms_messages (id, encounter_id, direction, phone, body, provider_id, status, created_at)
    VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?)
  `).run(id, encounter.id, patient.phone, body, providerId, status, now);

  if (status === 'failed') {
    writeAudit({
      actorKind: 'system',
      entityType: 'sms_message',
      entityId: id,
      action: 'sms.outbound_failed',
      payload: { encounterId: encounter.id, phone: patient.phone, trigger, providerId, error: providerError },
    });
    return { ok: false, error: providerError || 'SMS send failed', sms: { id, providerId, phone: patient.phone, body, status, simulated: isSimulated } };
  }

  if (encounter.status === ENCOUNTER_STATUSES.CONSULTATION_COMPLETED) {
    db.prepare(`UPDATE encounters SET status = ? WHERE id = ?`)
      .run(ENCOUNTER_STATUSES.CONFIRMATION_PENDING, encounter.id);
    writeAudit({
      actorKind: 'system',
      entityType: 'encounter',
      entityId: encounter.id,
      action: 'encounter.status_changed',
      payload: {
        fromStatus: encounter.status,
        toStatus: ENCOUNTER_STATUSES.CONFIRMATION_PENDING,
        trigger: 'sms.outbound',
        smsMessageId: id,
      },
    });
  }

  writeAudit({
    actorKind: 'system',
    entityType: 'sms_message',
    entityId: id,
    action: 'sms.outbound',
    payload: { encounterId: encounter.id, phone: patient.phone, trigger, providerId },
  });

  return {
    ok: true,
    sms: { id, providerId, phone: patient.phone, body, status, simulated: isSimulated },
  };
}

function handleInboundSms({ phone, body, providerId = null }) {
  const normalized = String(body || '').trim().toUpperCase();
  const reply = normalized.startsWith('YES') || normalized === 'Y' || normalized.startsWith('అవును')
    ? 'confirmed'
    : (normalized.startsWith('NO') || normalized === 'N' ? 'disputed' : null);

  const inboundId = uuid();
  const now = new Date().toISOString();

  // Find latest outbound SMS to this phone for a still-pending encounter
  const candidate = db.prepare(`
    SELECT e.*, s.id AS sms_id
    FROM sms_messages s
    JOIN encounters e ON e.id = s.encounter_id
    JOIN patients p ON p.id = e.patient_id
    WHERE s.direction = 'outbound'
      AND p.phone = ?
      AND e.status IN ('consultation_completed', 'confirmation_pending')
    ORDER BY s.created_at DESC
    LIMIT 1
  `).get(phone);

  if (!candidate) {
    writeAudit({
      actorKind: 'patient_sms',
      entityType: 'sms_message',
      entityId: inboundId,
      action: 'sms.inbound_unmatched',
      payload: { phone, body },
    });
    return { ok: false, error: 'No matching pending encounter' };
  }

  db.prepare(`
    INSERT INTO sms_messages (id, encounter_id, direction, phone, body, provider_id, status, created_at)
    VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?)
  `).run(
    inboundId,
    candidate.id,
    phone,
    body,
    providerId,
    reply ? 'processed' : 'ignored',
    now
  );
  if (!reply) {
    return { ok: true, ignored: true, help: 'Reply YES or NO' };
  }
  if (hasSuccessfulConfirmation(candidate.id)) {
    return { ok: false, error: 'Already confirmed' };
  }

  const confirmationId = uuid();
  const result = reply === 'confirmed' ? 'confirmed' : 'disputed';
  db.prepare(`
    INSERT INTO confirmations
      (id, encounter_id, method, result, feedback, staff_assisted, created_at)
    VALUES (?, ?, 'sms', ?, NULL, 0, ?)
  `).run(confirmationId, candidate.id, result, now);

  db.prepare(`UPDATE sms_messages SET related_confirmation_id = ? WHERE id = ?`)
    .run(confirmationId, inboundId);

  const newStatus = result === 'confirmed'
    ? ENCOUNTER_STATUSES.CONFIRMED_SMS
    : ENCOUNTER_STATUSES.PATIENT_DISPUTED;

  db.prepare(`UPDATE encounters SET status = ? WHERE id = ?`).run(newStatus, candidate.id);

  writeAudit({
    actorKind: 'patient_sms',
    entityType: 'encounter',
    entityId: candidate.id,
    action: 'encounter.status_changed',
    payload: { fromStatus: candidate.status, toStatus: newStatus, confirmationId },
  });

  writeAudit({
    actorKind: 'patient_sms',
    entityType: 'confirmation',
    entityId: confirmationId,
    action: result === 'confirmed' ? 'confirmation.sms' : 'confirmation.sms_disputed',
    payload: { encounterId: candidate.id, phone, body },
  });

  return { ok: true, confirmationId, result, encounterId: candidate.id };
}

module.exports = {
  processSmsFallbackAndExpiry,
  sendConfirmationSms,
  handleInboundSms,
  hasSuccessfulConfirmation,
  getSettings,
};
