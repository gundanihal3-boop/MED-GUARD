# MED-GUARD Backup and Recovery

This pilot uses SQLite. The operational database is one file plus temporary WAL files while the server is running.

## What to Back Up

Back up the SQLite database configured by `DB_PATH`.

Default path:

```text
backend/data/medguard.sqlite
```

When the server is running, SQLite may also have:

```text
backend/data/medguard.sqlite-wal
backend/data/medguard.sqlite-shm
```

For a simple manual backup, stop the API first, then copy `medguard.sqlite`.

## Backup Frequency

For a single-hospital pilot:

- At least once daily after OPD hours.
- Before any software update.
- Immediately after a pilot day with unusual incidents or disputes.

## Where to Store Backups

Keep at least two copies:

- One on the hospital server or admin laptop.
- One on approved external storage or secure hospital/government storage.

Do not store backups in GitHub, public cloud folders, chat apps, or personal email. Backups may contain patient and staff data.

## Manual Backup

1. Stop the API server.
2. Copy `backend/data/medguard.sqlite` to the backup location.
3. Name the backup with date and time, for example:

```text
medguard-2026-08-15-1800.sqlite
```

4. Restart the API server.
5. Open the admin page and confirm recent encounters are visible.

## Restore

1. Stop the API server.
2. Move the damaged/current database file aside.
3. Copy the selected backup into the configured `DB_PATH`.
4. Start the API server.
5. Log in as admin and verify:
   - Today overview loads.
   - Recent encounters are visible.
   - Audit timelines load.
   - Users can log in.

## Hardware Failure

If the hospital server or laptop fails:

1. Set up MED-GUARD on replacement hardware.
2. Copy the latest valid backup to `DB_PATH`.
3. Start backend and frontend.
4. Confirm staff can log in on the local network.
5. Record the outage window manually in the pilot notes.

Any paper prescriptions printed during the outage should be kept and reconciled after recovery.
