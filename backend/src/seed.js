const { v4: uuid } = require('uuid');
const db = require('./db');
const { hashPin } = require('./middleware/auth');
const { writeAudit } = require('./audit');

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return { seeded: false };

  const now = new Date().toISOString();
  const seedPin = process.env.MEDGUARD_SEED_PIN || (process.env.NODE_ENV === 'production' ? null : '1234');
  if (!seedPin) {
    throw new Error('MEDGUARD_SEED_PIN is required when seeding a production database');
  }
  if (process.env.NODE_ENV === 'production' && seedPin === '1234' && process.env.ALLOW_DEMO_CREDENTIALS !== 'true') {
    throw new Error('Refusing to seed production users with demo PIN 1234');
  }
  const pin = hashPin(seedPin);

  const users = [
    { id: uuid(), name: 'Reception Desk', login: 'reception', role: 'reception', dept: 'OPD' },
    { id: uuid(), name: 'Dr. Priya Sharma', login: 'doctor1', role: 'doctor', dept: 'General Medicine' },
    { id: uuid(), name: 'Dr. Ravi Kumar', login: 'doctor2', role: 'doctor', dept: 'Pediatrics' },
    { id: uuid(), name: 'Kiosk Helper', login: 'kiosk', role: 'kiosk_staff', dept: 'Exit Desk' },
    { id: uuid(), name: 'Hospital Admin', login: 'admin', role: 'admin', dept: 'Administration' },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, display_name, login_id, role, pin_hash, department, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO hospital_settings
        (id, hospital_name, language_primary, language_secondary, sms_grace_hours, confirmation_expire_hours, updated_at)
      VALUES (1, 'Govt. District Hospital (Pilot)', 'te', 'en', 2, 48, ?)
    `).run(now);

    for (const u of users) {
      insertUser.run(u.id, u.name, u.login, u.role, pin, u.dept, now);
    }

    const devices = [
      { id: 'dev-reception', label: 'Reception Tablet', role: 'reception' },
      { id: 'dev-doctor-1', label: 'Doctor Room 1', role: 'doctor' },
      { id: 'dev-kiosk', label: 'Exit Confirmation Kiosk', role: 'kiosk' },
      { id: 'dev-admin', label: 'Admin Office', role: 'admin' },
    ];
    const insertDevice = db.prepare(`
      INSERT INTO devices (id, label, location_role, created_at) VALUES (?, ?, ?, ?)
    `);
    for (const d of devices) insertDevice.run(d.id, d.label, d.role, now);

    const medicines = [
      { en: 'Paracetamol 500mg', local: 'పారాసిటమాల్ 500mg', icon: 'tablet', unit: 'tablet' },
      { en: 'Amoxicillin 250mg', local: 'అమాక్సిసిలిన్ 250mg', icon: 'capsule', unit: 'capsule' },
      { en: 'ORS Powder', local: 'ORS పౌడర్', icon: 'sachet', unit: 'sachet' },
      { en: 'Cough Syrup', local: 'దగ్గు సిరప్', icon: 'syrup', unit: 'ml' },
      { en: 'Ibuprofen 400mg', local: 'ఇబుప్రోఫెన్ 400mg', icon: 'tablet', unit: 'tablet' },
      { en: 'Antacid Gel', local: 'ఆంటాసిడ్ జెల్', icon: 'syrup', unit: 'ml' },
      { en: 'Cetirizine 10mg', local: 'సెటిరిజిన్ 10mg', icon: 'tablet', unit: 'tablet' },
      { en: 'Vitamin B Complex', local: 'విటమిన్ బి', icon: 'tablet', unit: 'tablet' },
      { en: 'Povidone Iodine Ointment', local: 'ఆయింట్మెంట్', icon: 'ointment', unit: 'tube' },
      { en: 'Metformin 500mg', local: 'మెట్‌ఫార్మిన్ 500mg', icon: 'tablet', unit: 'tablet' },
    ];
    const insertMed = db.prepare(`
      INSERT INTO medicines (id, name_en, name_local, icon_key, default_unit, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    for (const m of medicines) {
      insertMed.run(uuid(), m.en, m.local, m.icon, m.unit);
    }

    writeAudit({
      actorKind: 'system',
      entityType: 'hospital',
      entityId: 'pilot',
      action: 'system.seeded',
      payload: {
        users: users.map((u) => u.login),
        demoPinUsed: seedPin === '1234',
        production: process.env.NODE_ENV === 'production',
      },
    });
  });

  tx();
  return { seeded: true, demoPinUsed: seedPin === '1234', logins: users.map((u) => u.login) };
}

module.exports = { seedIfEmpty };
