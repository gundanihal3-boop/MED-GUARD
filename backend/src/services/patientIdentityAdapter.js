/**
 * Patient Identity Adapter Interface & Implementations for MED-GUARD.
 * Allows current single-hospital local patient storage (SQLite) while establishing a clean interface
 * so future external Hospital Information System (HIS) / UHID integrations can be added without refactoring business logic.
 */

const db = require('../db');

class PatientIdentityAdapter {
  async searchPatients(query) {
    throw new Error('searchPatients must be implemented');
  }

  async getPatientByUhid(uhid) {
    throw new Error('getPatientByUhid must be implemented');
  }

  async checkDuplicates({ fullName, phone, uhid }) {
    throw new Error('checkDuplicates must be implemented');
  }
}

class LocalPatientIdentityAdapter extends PatientIdentityAdapter {
  async searchPatients(q) {
    const queryStr = String(q || '').trim();
    if (!queryStr) return [];
    return db.prepare(`
      SELECT id, uhid, full_name, age_years, sex, phone, registration_source, created_at
      FROM patients
      WHERE uhid = ? OR full_name LIKE ? OR phone = ?
      ORDER BY created_at DESC
      LIMIT 25
    `).all(queryStr, `%${queryStr}%`, queryStr);
  }

  async getPatientByUhid(uhid) {
    if (!uhid) return null;
    return db.prepare('SELECT * FROM patients WHERE uhid = ?').get(String(uhid).trim());
  }

  async checkDuplicates({ fullName, phone, uhid }) {
    const warnings = [];
    const cleanUhid = uhid ? String(uhid).trim() : null;
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanName = fullName ? String(fullName).trim() : null;

    if (cleanUhid) {
      const exactUhid = db.prepare('SELECT * FROM patients WHERE uhid = ?').get(cleanUhid);
      if (exactUhid) {
        warnings.push({
          type: 'exact_uhid_match',
          message: `Patient already registered with UHID ${cleanUhid}`,
          existingPatient: exactUhid,
        });
      }
    }

    if (cleanPhone) {
      const phoneMatches = db.prepare('SELECT * FROM patients WHERE phone = ?').all(cleanPhone);
      if (phoneMatches.length > 0) {
        warnings.push({
          type: 'phone_match',
          message: `Found ${phoneMatches.length} existing patient(s) with phone ${cleanPhone}`,
          existingPatients: phoneMatches,
        });
      }
    }

    if (cleanName) {
      const nameMatches = db.prepare('SELECT * FROM patients WHERE LOWER(full_name) = LOWER(?)').all(cleanName);
      if (nameMatches.length > 0) {
        warnings.push({
          type: 'name_match',
          message: `Found ${nameMatches.length} existing patient(s) with identical name '${cleanName}'`,
          existingPatients: nameMatches,
        });
      }
    }

    return {
      hasWarnings: warnings.length > 0,
      warnings,
    };
  }
}

let currentAdapter = new LocalPatientIdentityAdapter();

function getPatientIdentityAdapter() {
  return currentAdapter;
}

function setPatientIdentityAdapter(adapter) {
  if (!(adapter instanceof PatientIdentityAdapter)) {
    throw new Error('Adapter must extend PatientIdentityAdapter');
  }
  currentAdapter = adapter;
}

module.exports = {
  PatientIdentityAdapter,
  LocalPatientIdentityAdapter,
  getPatientIdentityAdapter,
  setPatientIdentityAdapter,
};
