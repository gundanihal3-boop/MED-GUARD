# MED-GUARD Pilot Runbook

This runbook is for a single-government-hospital pilot using a local server, local network, SQLite, shared tablets, and simulated SMS unless a real gateway is approved.

## Reception

1. Log in with the reception staff ID.
2. Search by UHID, name, or phone.
3. If the patient exists, select the patient.
4. If the patient does not exist, register with minimal details:
   - UHID if available
   - Name
   - Age
   - Sex
   - Phone if available
5. Review duplicate warnings before creating a new patient.
6. Select department.
7. Issue OPD token and tell the patient to visit the doctor.

## Doctor

1. Log in with doctor staff ID.
2. Check in before seeing patients.
3. Open the queue.
4. Start the patient's encounter.
5. Complete the consultation.
6. Add prescription items or mark advice-only/no medicines.
7. Save prescription and print.
8. Tell patient to go to the exit kiosk before leaving.
9. Check out at the end of duty.

## Kiosk Staff

1. Log in with kiosk staff ID.
2. Ask the patient for OPD token.
3. Enter token.
4. Ask whether the patient met the doctor.
5. Patient selects:
   - Yes, met doctor
   - No, did not meet doctor
6. Patient may choose feedback: sad, neutral, or happy.
7. If the patient cannot use the tablet, enable staff-assisted mode and enter staff credentials.
8. Staff-assisted confirmations are audited and monitored.

## Administrator

1. Log in with admin ID.
2. Review doctors present.
3. Review total encounters and confirmation funnel.
4. Check disputed and unconfirmed encounters.
5. Review rule-based anomalies.
6. Open encounter timeline for audit details.
7. For development/pilot demo, use simulated SMS only when needed.

## Recovery Procedures

### Network Fails

- Keep registration and prescriptions on paper temporarily.
- Do not enter fake confirmations.
- When the local network returns, enter missed encounters from paper notes and mark confirmations according to what actually happened.
- Record the outage window in pilot notes.

### Printer Fails

- Doctor completes consultation in MED-GUARD.
- Write prescription manually on hospital paper.
- Do not repeatedly click print unless a reprint is actually attempted.
- Repair or replace printer before relying on printed icon prescriptions again.

### SMS Fails

- Use tablet/kiosk confirmation where possible.
- SMS simulator failure does not block the encounter record.
- Record real SMS dependency as unresolved until the hospital approves a provider.

### Tablet Fails

- Use another shared device on the local network.
- If no device is available, continue hospital care on paper.
- Reconcile records later from paper notes.

### Server Fails

- Stop using MED-GUARD until the server is restored.
- Follow `docs/BACKUP_AND_RECOVERY.md`.
- Keep manual paper records during downtime.
- After restore, admin verifies recent records and notes the downtime.

### Patient Cannot Use Kiosk

- Kiosk staff may assist using staff-assisted mode.
- Staff should read the question clearly and record the patient's actual answer.
- Never mark confirmation without patient response.

## Important Limits

- MED-GUARD records doctor check-in/out; it does not prove absence without an official duty roster.
- SMS is simulated unless an approved real gateway is configured.
- Full offline synchronization is post-MVP.
- The pilot goal is workflow trust, not a nationwide platform.
