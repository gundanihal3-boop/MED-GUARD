const express = require('express');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const {
  processSmsFallbackAndExpiry,
  sendConfirmationSms,
  handleInboundSms,
} = require('../services/sms');

const router = express.Router();

router.post('/send/:encounterId', authRequired, requireRoles('reception', 'admin', 'kiosk_staff'), async (req, res) => {
  const enc = db.prepare(`
    SELECT e.*, u.display_name AS doctor_name
    FROM encounters e
    LEFT JOIN users u ON u.id = e.doctor_id
    WHERE e.id = ?
  `).get(req.params.encounterId);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (!['consultation_completed', 'confirmation_pending'].includes(enc.status)) {
    return res.status(409).json({ error: `Cannot SMS from status ${enc.status}` });
  }
  const result = await sendConfirmationSms(enc, 'manual');
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.post('/inbound', (req, res) => {
  // Webhook / simulator endpoint — no staff auth (provider callback)
  const { phone, body, providerId } = req.body || {};
  const webhookSecret = process.env.SMS_WEBHOOK_SECRET;
  if (webhookSecret && req.get('x-medguard-sms-secret') !== webhookSecret) {
    return res.status(401).json({ error: 'Invalid SMS webhook signature' });
  }
  if (!phone || !body) return res.status(400).json({ error: 'phone and body required' });
  const result = handleInboundSms({ phone, body, providerId });
  res.json(result);
});

router.post('/process-jobs', authRequired, requireRoles('admin'), async (_req, res) => {
  await processSmsFallbackAndExpiry();
  res.json({ ok: true });
});

router.get('/encounter/:encounterId', authRequired, (req, res) => {
  const messages = db.prepare(`
    SELECT * FROM sms_messages WHERE encounter_id = ? ORDER BY created_at ASC
  `).all(req.params.encounterId);
  res.json({ messages });
});

module.exports = router;
