# MED-GUARD: Comprehensive Project Documentation & Architecture

## 1. Executive Summary

**MED-GUARD** is a light-touch, high-accountability hospital management infrastructure designed for government healthcare pilot deployments. 

The core operational principle is **Recorded -> Confirmed -> Auditable -> Visible**:
- **Recorded**: Consultations and prescriptions are captured digitally at the point of care.
- **Confirmed**: Patients explicitly confirm or dispute their consultation at an exit kiosk or via SMS. Consultations are **never auto-confirmed**.
- **Auditable**: Every status change, login attempt, prescription, and confirmation is logged into an immutable audit trail.
- **Visible**: Hospital administrators and governance staff have real-time visibility into OPD volume, consultation duration anomalies, attendance, and confirmation funnels.

Target Pilot: **One Government Hospital / District Hospital**.

---

## 2. Technology Stack & Architecture

| Layer | Component | Description & Rationale |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | Single Page Application (SPA), PWA-ready, local language (Telugu/English) support. |
| **Backend API** | Node.js + Express 5 | Light-weight RESTful API server running as a single process. |
| **Database** | SQLite (`better-sqlite3`) | Zero-config, low-ops file database suitable for local hospital servers. |
| **Auth & Security** | Role-Based PIN Auth | bcrypt PIN hashing, JWT session tokens, 5-strike login failure lockouts. |
| **Testing Engine** | Node Test Runner (`node --test`) | Native integration test suite validating end-to-end user workflows. |

---

## 3. End-to-End Core Workflows

### 3.1 Reception Desk (`/reception`)
- **UHID Lookup & Intake**: Search existing patients by UHID, phone number, or name.
- **Patient Registration**: Minimal intake form (Full Name, Age, Sex, Phone).
- **Duplicate Prevention**: Real-time warning modal if potential matches exist based on name and phone.
- **OPD Token Generation**: Creates an active encounter assigned to a specific department.

### 3.2 Doctor Consultation & OPD (`/doctor`)
- **Attendance Check-In**: Doctors record check-in/check-out with location labels.
- **Queue Management**: Real-time view of waiting patients for the doctor's department.
- **Consultation Timer**: Enforces a minimum 1-minute consultation duration to prevent "ghost" or rapid click-through consultations.
- **Formulary Prescription**: Pre-loaded essential medicines with dosage icons (tablet, capsule, syrup, sachet, ointment), timings (morning, afternoon, night), and Telugu local names.
- **Printable Prescription**: Icon-based printable layout designed for low-literacy patient understanding.

### 3.3 Patient Exit Kiosk (`/kiosk`)
- **Token Lookup**: Exit kiosk tablet where patients or kiosk staff enter the OPD token.
- **Patient Confirmation**: Patient verifies consultation completed as expected (`Confirmed` or `Disputed`).
- **Feedback Collection**: Optional 3-level feedback rating.
- **Staff-Assisted Mode**: When patients require assistance, staff enter their staff PIN to sign off as an assisted confirmation.

### 3.4 SMS Fallback & Verification (`/sms`)
- **Outbound Trigger**: Simulated outbound SMS sent for completed consultations that remain unconfirmed after desk exit.
- **Inbound Webhook**: Processes incoming SMS replies (`YES` -> Confirmed, `NO` -> Disputed).
- **Grace & Expiry Worker**: Periodic background job tracking grace hours and automated expiration rules.

### 3.5 Admin Governance & Anomaly Detection (`/admin`)
- **Confirmation Funnel Metrics**: Real-time analytics tracking (Total Encounters -> Consultation Completed -> Tablet Confirmed -> SMS Confirmed -> Disputed).
- **Attendance Tracking**: Log of daily doctor check-ins and check-outs.
- **Rule-Based Anomaly Flags**: Automatically flags suspicious activity (e.g. consultations completed in under 1 minute, unconfirmed high-volume trends, staff-assisted flags).
- **Encounter Audit Timeline**: Complete chronological history of any encounter from registration to final verification.

---

## 4. Security & Compliance Controls

- **Role-Based Access Control (RBAC)**: Distinct user roles (`reception`, `doctor`, `kiosk_staff`, `admin`).
- **Brute-Force Protection**: 5 failed login attempts trigger an automatic 5-minute lockout period.
- **Self-Confirmation Prevention**: Doctor accounts are strictly forbidden from submitting patient kiosk confirmations for their own consultations.
- **Audit Logging**: All system actions, logins, and status transitions generate structured audit log entries.

---

## 5. Verification & Testing Suite

The project includes an end-to-end integration test suite in `backend/tests/accountability.test.js`.

### Test Execution Commands

```bash
# Run Backend Integration Tests
cd backend
npm test

# Run Frontend Build Verification
cd ../frontend
npm run build

# Run Frontend Linter
npm run lint
```

### Verified Test Scenarios

1. **RBAC & Auth Security**: Rejection of unauthenticated calls, non-admin role restriction, rate-limit lockout triggering on 5 failed PIN attempts.
2. **Patient Registration & Duplicate Warning**: Registration of patient, duplicate search trigger.
3. **Doctor Workflow & Rapid Completion Safeguard**: Verification that instant completion (<1 min) returns HTTP 422, while valid duration completes successfully.
4. **Prescription Formulation**: Invalid empty prescription rejection, successful multi-item prescription save.
5. **Kiosk Confirmation & Self-Confirm Prevention**: Doctor self-confirmation blocked (HTTP 403), kiosk patient confirmation succeeded (HTTP 201).
6. **Staff-Assisted Confirmation**: Validation of staff PIN entry during assisted kiosk verification.
7. **SMS Fallback & Inbound Parsing**: Outbound SMS trigger, inbound webhook parsing of `YES`/`NO` responses.
8. **Admin Governance**: Timeline event generation (`encounter.created`, `consultation.completed`, `confirmation.tablet`), funnel count accuracy.

---

## 6. Seed Credentials (Development & Demo)

In development environments, default seeding generates the following credentials (PIN: `1234`):

| Login ID | Role | Department |
| :--- | :--- | :--- |
| `reception` | Reception | OPD |
| `doctor1` | Doctor | General Medicine |
| `doctor2` | Doctor | Pediatrics |
| `kiosk` | Kiosk Staff | Exit Desk |
| `admin` | Hospital Admin | Administration |

*Note: Production deployments require `MEDGUARD_SEED_PIN` environment variable and refuse default `1234` credentials.*

---

## 7. Pilot Deployment Runbook

1. **Database Location**: Local SQLite DB stored at `backend/data/medguard.sqlite`.
2. **Network Model**: Single hospital local server + local Wi-Fi / Ethernet network.
3. **Backup Strategy**: Automated daily SQLite WAL checkpoint & snapshot backup (refer to `docs/BACKUP_AND_RECOVERY.md`).
