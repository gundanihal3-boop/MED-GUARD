const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authRequired, requireRoles } = require('../middleware/auth');
const { writeAudit } = require('../audit');

const router = express.Router();

function getPrescriptionBundle(prescriptionId) {
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionId);
  if (!prescription) return null;
  const items = db.prepare(`
    SELECT pi.*, m.name_en, m.name_local
    FROM prescription_items pi
    LEFT JOIN medicines m ON m.id = pi.medicine_id
    WHERE pi.prescription_id = ?
    ORDER BY pi.sort_order ASC
  `).all(prescriptionId);
  const encounter = db.prepare('SELECT * FROM encounters WHERE id = ?').get(prescription.encounter_id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(encounter.patient_id);
  const doctor = db.prepare('SELECT id, display_name, department FROM users WHERE id = ?').get(prescription.doctor_id);
  const settings = db.prepare('SELECT * FROM hospital_settings WHERE id = 1').get();
  return { prescription, items, encounter, patient, doctor, settings };
}

router.get('/medicines', authRequired, (req, res) => {
  const medicines = db.prepare('SELECT * FROM medicines WHERE active = 1 ORDER BY name_en').all();
  res.json({ medicines });
});

router.post('/medicines', authRequired, requireRoles('admin'), (req, res) => {
  const { nameEn, nameLocal, iconKey, defaultUnit } = req.body || {};
  if (!nameEn || !nameLocal || !iconKey) {
    return res.status(400).json({ error: 'nameEn, nameLocal, iconKey required' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO medicines (id, name_en, name_local, icon_key, default_unit, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, nameEn, nameLocal, iconKey, defaultUnit || 'tablet');
  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'medicine',
    entityId: id,
    action: 'formulary.created',
  });
  res.status(201).json({ medicine: db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) });
});

router.post('/encounters/:encounterId', authRequired, requireRoles('doctor', 'admin'), (req, res) => {
  const enc = db.prepare('SELECT * FROM encounters WHERE id = ?').get(req.params.encounterId);
  if (!enc) return res.status(404).json({ error: 'Encounter not found' });
  if (!['consultation_completed', 'confirmation_pending'].includes(enc.status)) {
    return res.status(409).json({ error: 'Encounter not ready for prescription' });
  }
  if (req.user.role === 'doctor' && enc.doctor_id && enc.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your encounter' });
  }

  const existing = db.prepare('SELECT id FROM prescriptions WHERE encounter_id = ?').get(enc.id);
  if (existing) return res.status(409).json({ error: 'Prescription already exists', prescriptionId: existing.id });

  const { noMedicines, items } = req.body || {};
  if (!noMedicines && (!Array.isArray(items) || items.length === 0)) {
    return res.status(400).json({ error: 'items required unless noMedicines' });
  }

  const id = uuid();
  const now = new Date().toISOString();
  const doctorId = enc.doctor_id || req.user.id;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO prescriptions (id, encounter_id, doctor_id, no_medicines, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, enc.id, doctorId, noMedicines ? 1 : 0, now);

    if (!noMedicines) {
      const insertItem = db.prepare(`
        INSERT INTO prescription_items
          (id, prescription_id, medicine_id, freetext_name, is_freetext, icon_key,
           timing_morning, timing_afternoon, timing_night, after_food, duration_days, quantity, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item, idx) => {
        let medicineId = item.medicineId || null;
        let iconKey = item.iconKey || 'tablet';
        let isFreetext = item.isFreetext ? 1 : 0;
        let freetextName = item.freetextName || null;
        if (medicineId) {
          const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId);
          if (!med) throw new Error('Invalid medicine');
          iconKey = med.icon_key;
          isFreetext = 0;
          freetextName = null;
        } else if (freetextName) {
          isFreetext = 1;
        } else {
          throw new Error('medicineId or freetextName required');
        }
        insertItem.run(
          uuid(),
          id,
          medicineId,
          freetextName,
          isFreetext,
          iconKey,
          item.timingMorning ? 1 : 0,
          item.timingAfternoon ? 1 : 0,
          item.timingNight ? 1 : 0,
          item.afterFood ? 1 : 0,
          Number(item.durationDays || 3),
          item.quantity || null,
          idx
        );
      });
    }

    if (noMedicines) {
      db.prepare('UPDATE encounters SET no_medicines = 1 WHERE id = ?').run(enc.id);
    }
  });

  try {
    tx();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'prescription',
    entityId: id,
    action: 'prescription.created',
    payload: { encounterId: enc.id, noMedicines: !!noMedicines, itemCount: items?.length || 0 },
  });

  res.status(201).json({ bundle: getPrescriptionBundle(id) });
});

router.get('/encounters/:encounterId', authRequired, (req, res) => {
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE encounter_id = ?').get(req.params.encounterId);
  if (!prescription) return res.status(404).json({ error: 'No prescription' });
  res.json({ bundle: getPrescriptionBundle(prescription.id) });
});

router.post('/:id/print', authRequired, requireRoles('doctor', 'reception', 'admin'), (req, res) => {
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
  if (!prescription) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE prescriptions SET printed_at = ?, print_count = print_count + 1 WHERE id = ?
  `).run(now, prescription.id);

  writeAudit({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    entityType: 'prescription',
    entityId: prescription.id,
    action: 'prescription.printed',
    payload: { printCount: prescription.print_count + 1 },
  });

  res.json({ bundle: getPrescriptionBundle(prescription.id) });
});

module.exports = router;
