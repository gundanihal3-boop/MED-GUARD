# MED-GUARD

Hospital infrastructure for **accountability and transparency** in government healthcare.

Pilot target: **one government hospital**.

Core principle: **Recorded -> Confirmed -> Auditable -> Visible**. Consultations are never auto-confirmed.

## What This MVP Includes

End-to-end vertical slice:

1. Reception: UHID lookup or minimal registration; create encounter and OPD token.
2. Doctor: attendance check-in/out; start and complete consultation; formulary prescription with icon print.
3. Kiosk: patient confirmation or dispute; optional 3-level feedback; staff-assisted flag with staff PIN.
4. SMS fallback: simulated outbound and inbound YES/NO for development and pilot demos.
5. Admin: today overview, confirmation funnel, attendance, rule-based anomalies, encounter audit timeline.

## What This MVP Does Not Yet Claim

- Full offline-first synchronization is **not implemented**.
- Doctor absence detection is **not complete** without an official duty roster.
- SMS is simulated unless a hospital-approved real gateway is provided.
- The admin view is a practical pilot dashboard, not a nationwide government dashboard.

## Pilot Operating Assumption

For the current MVP, assume:

> Local hospital server + local network + SQLite

Full offline queue/synchronization is a post-MVP capability unless pilot conditions demonstrate that it is required. If the pilot hospital cannot reliably operate on a local network, pause before building a large offline architecture.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| API | Node.js + Express | Simple one-process backend |
| DB | SQLite (`better-sqlite3`) | Low-ops for a single hospital laptop/server |
| UI | React + Vite | Shared tablets through browser or installed PWA |

SQLite is suitable for the first pilot. Move to PostgreSQL only when deployment requirements justify it.

## Quick Start

```bash
# Terminal 1: API at http://localhost:4000
cd backend
npm install
npm run dev

# Terminal 2: UI at http://localhost:5173
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Development Logins

Development seeding creates these users:

| Login | Role |
| --- | --- |
| `reception` | Reception |
| `doctor1` / `doctor2` | Doctor |
| `kiosk` | Kiosk staff |
| `admin` | Hospital admin |

In development/test, the default seed PIN is `1234`.

For production or a real pilot, do **not** use demo credentials. Set `MEDGUARD_SEED_PIN` to a site-specific initial PIN before first startup, then rotate staff PINs operationally.

The backend refuses to seed production users with PIN `1234` unless `ALLOW_DEMO_CREDENTIALS=true` is explicitly set for a non-production demo environment.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | API port, default `4000` |
| `DB_PATH` | SQLite file path, default `backend/data/medguard.sqlite` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `MEDGUARD_SEED_PIN` | Required initial seed PIN for production database seeding |
| `SMS_WEBHOOK_SECRET` | Optional shared secret for future authenticated SMS webhooks |
| `LOGIN_MAX_FAILURES` | Failed login attempts before temporary lockout, default `5` |
| `LOGIN_WINDOW_MS` | Login failure window, default `10 minutes` |
| `LOGIN_LOCK_MS` | Temporary lockout duration, default `5 minutes` |

## Demo Path

1. Login as reception, register or search patient, create encounter, note OPD token.
2. Login as doctor, check in, start encounter, complete consultation, save prescription, print.
3. Login as kiosk staff, enter token, patient confirms or disputes, optionally records feedback.
4. Login as admin, review attendance, confirmation funnel, anomalies, and audit timeline.
5. For SMS, use admin to send simulated SMS for a completed unconfirmed encounter, then simulate inbound `YES` or `NO`.

## SMS Status

The current provider is a simulator. It preserves the provider abstraction so a real gateway can be plugged in later.

If a hospital pilot requires actual SMS, collect:

- Approved provider or government gateway name
- API credentials and sender ID
- Webhook signing/verification method
- Message template approval requirements
- Delivery receipt format
- Local language requirements
- Phone-number format rules

## Attendance Status

The current system accurately records:

> Who checked in and when.

It cannot honestly determine:

> Who was absent when they were supposed to be working.

Absence detection requires an official doctor duty roster from the hospital. Do not invent expected shifts.

## Testing

```bash
cd backend
npm test

cd ../frontend
npm run build
npm run lint
```

## Operations

See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) and [docs/PILOT_RUNBOOK.md](docs/PILOT_RUNBOOK.md).

## Out of Scope

- Consumer healthcare app
- Nationwide government dashboard
- Full HIS/EMR integration
- Full offline synchronization
- AI fraud detection
- Complex duty roster management
- Real SMS integration before provider approval
- Payments, telemedicine, or marketplace features

## Author

Nihal
