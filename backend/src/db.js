const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'medguard.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      hospital_name TEXT NOT NULL,
      language_primary TEXT NOT NULL DEFAULT 'te',
      language_secondary TEXT NOT NULL DEFAULT 'en',
      sms_grace_hours REAL NOT NULL DEFAULT 2,
      confirmation_expire_hours REAL NOT NULL DEFAULT 48,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      login_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('reception','doctor','admin','kiosk_staff')),
      pin_hash TEXT NOT NULL,
      department TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      location_role TEXT NOT NULL CHECK (location_role IN ('reception','doctor','kiosk','admin')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      uhid TEXT UNIQUE,
      full_name TEXT NOT NULL,
      age_years INTEGER NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('male','female','other')),
      phone TEXT,
      registration_source TEXT NOT NULL CHECK (registration_source IN ('hospital_uhid','medguard_minimal')),
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL REFERENCES users(id),
      check_in_at TEXT NOT NULL,
      check_out_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('open','closed','auto_closed')),
      device_id TEXT,
      location_label TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      opd_token TEXT NOT NULL,
      department TEXT NOT NULL,
      doctor_id TEXT REFERENCES users(id),
      status TEXT NOT NULL,
      notes TEXT,
      no_medicines INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      token_day TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_local TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      default_unit TEXT NOT NULL DEFAULT 'tablet',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL UNIQUE REFERENCES encounters(id),
      doctor_id TEXT NOT NULL REFERENCES users(id),
      no_medicines INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      printed_at TEXT,
      print_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prescription_items (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL REFERENCES prescriptions(id),
      medicine_id TEXT REFERENCES medicines(id),
      freetext_name TEXT,
      is_freetext INTEGER NOT NULL DEFAULT 0,
      icon_key TEXT NOT NULL,
      timing_morning INTEGER NOT NULL DEFAULT 0,
      timing_afternoon INTEGER NOT NULL DEFAULT 0,
      timing_night INTEGER NOT NULL DEFAULT 0,
      after_food INTEGER NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 3,
      quantity TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS confirmations (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      method TEXT NOT NULL CHECK (method IN ('tablet','sms')),
      result TEXT NOT NULL CHECK (result IN ('confirmed','disputed')),
      feedback TEXT CHECK (feedback IS NULL OR feedback IN ('sad','neutral','happy')),
      staff_assisted INTEGER NOT NULL DEFAULT 0,
      assisted_by_user_id TEXT REFERENCES users(id),
      device_id TEXT,
      offline_synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id),
      direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
      phone TEXT NOT NULL,
      body TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL,
      related_confirmation_id TEXT REFERENCES confirmations(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      actor_user_id TEXT,
      actor_role TEXT,
      actor_kind TEXT NOT NULL DEFAULT 'staff',
      device_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patients_uhid ON patients(uhid);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
    CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status);
    CREATE INDEX IF NOT EXISTS idx_encounters_token ON encounters(opd_token);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_encounters_token_day ON encounters(opd_token, token_day);
    CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_confirmations_encounter ON confirmations(encounter_id);
  `);
}

migrate();

module.exports = db;
