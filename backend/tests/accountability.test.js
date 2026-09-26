const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const Database = require('better-sqlite3');

async function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startApi() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medguard-api-'));
  const dbPath = path.join(tmp, 'medguard.sqlite');
  const port = await getPort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      PORT: String(port),
      LOGIN_MAX_FAILURES: '3',
      LOGIN_LOCK_MS: '60000',
      CORS_ORIGINS: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API did not start in time')), 5000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('MED-GUARD API listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      if (text.includes('EADDRINUSE')) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited early with code ${code}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    dbPath,
    stop() {
      child.kill();
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // Ignore file lock cleanup errors on Windows teardown
      }
    },
  };
}

async function request(ctx, method, route, { token, body } = {}) {
  const res = await fetch(`${ctx.baseUrl}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(ctx, loginId, pin = '1234') {
  const res = await request(ctx, 'POST', '/auth/login', { body: { loginId, pin, deviceId: `test-${loginId}` } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.token;
}

test('core accountability workflow is recorded, confirmed, auditable, and visible', async (t) => {
  const ctx = await startApi();
  t.after(() => ctx.stop());

  const receptionToken = await login(ctx, 'reception');
  const doctorToken = await login(ctx, 'doctor1');
  const kioskToken = await login(ctx, 'kiosk');
  const adminToken = await login(ctx, 'admin');

  assert.equal((await request(ctx, 'GET', '/admin/overview')).status, 401);
  assert.equal((await request(ctx, 'GET', '/auth/users')).status, 401);
  assert.equal((await request(ctx, 'GET', '/auth/users', { token: adminToken })).status, 200);

  const locked1 = await request(ctx, 'POST', '/auth/login', { body: { loginId: 'missing', pin: 'bad' } });
  const locked2 = await request(ctx, 'POST', '/auth/login', { body: { loginId: 'missing', pin: 'bad' } });
  const locked3 = await request(ctx, 'POST', '/auth/login', { body: { loginId: 'missing', pin: 'bad' } });
  const locked4 = await request(ctx, 'POST', '/auth/login', { body: { loginId: 'missing', pin: 'bad' } });
  assert.equal(locked1.status, 401);
  assert.equal(locked2.status, 401);
  assert.equal(locked3.status, 401);
  assert.equal(locked4.status, 429);

  const noAuthPatient = await request(ctx, 'POST', '/patients', {
    token: doctorToken,
    body: { fullName: 'Unauthorized Patient', ageYears: 50, sex: 'male' },
  });
  assert.equal(noAuthPatient.status, 403);

  const patientRes = await request(ctx, 'POST', '/patients', {
    token: receptionToken,
    body: { fullName: 'Asha Rao', ageYears: 42, sex: 'female', phone: '9000000001' },
  });
  assert.equal(patientRes.status, 201, JSON.stringify(patientRes.data));
  const patient = patientRes.data.patient;

  const duplicate = await request(
    ctx,
    'GET',
    `/patients/check-duplicate?fullName=${encodeURIComponent('Asha Rao')}&phone=9000000001`,
    { token: receptionToken },
  );
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.hasWarnings, true);

  const encounterRes = await request(ctx, 'POST', '/encounters', {
    token: receptionToken,
    body: { patientId: patient.id, department: 'General Medicine' },
  });
  assert.equal(encounterRes.status, 201);
  const encounter = encounterRes.data.encounter;

  const invalidRx = await request(ctx, 'POST', `/prescriptions/encounters/${encounter.id}`, {
    token: doctorToken,
    body: { noMedicines: true, items: [] },
  });
  assert.equal(invalidRx.status, 409);

  const attendance = await request(ctx, 'POST', '/attendance/check-in', {
    token: doctorToken,
    body: { locationLabel: 'General Medicine' },
  });
  assert.equal(attendance.status, 201);

  const started = await request(ctx, 'POST', `/encounters/${encounter.id}/start`, {
    token: doctorToken,
    body: {},
  });
  assert.equal(started.status, 200);

  const rapidComplete = await request(ctx, 'POST', `/encounters/${encounter.id}/complete`, {
    token: doctorToken,
    body: { notes: 'too fast', noMedicines: false },
  });
  assert.equal(rapidComplete.status, 422);

  const db = new Database(ctx.dbPath);
  db.prepare('UPDATE encounters SET started_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), encounter.id);

  const completed = await request(ctx, 'POST', `/encounters/${encounter.id}/complete`, {
    token: doctorToken,
    body: { notes: 'Fever and body pain', noMedicines: false },
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.encounter.status, 'consultation_completed');

  const meds = await request(ctx, 'GET', '/prescriptions/medicines', { token: doctorToken });
  assert.equal(meds.status, 200);
  const rx = await request(ctx, 'POST', `/prescriptions/encounters/${encounter.id}`, {
    token: doctorToken,
    body: {
      noMedicines: false,
      items: [{
        medicineId: meds.data.medicines[0].id,
        timingMorning: true,
        timingAfternoon: false,
        timingNight: true,
        afterFood: true,
        durationDays: 3,
      }],
    },
  });
  assert.equal(rx.status, 201, JSON.stringify(rx.data));

  const doctorSelfConfirm = await request(ctx, 'POST', '/confirmations/tablet', {
    token: doctorToken,
    body: { encounterId: encounter.id, result: 'confirmed' },
  });
  assert.equal(doctorSelfConfirm.status, 403);

  const confirmed = await request(ctx, 'POST', '/confirmations/tablet', {
    token: kioskToken,
    body: { encounterId: encounter.id, result: 'confirmed', feedback: 'happy', deviceId: 'dev-kiosk' },
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.encounter.status, 'confirmed_tablet');

  const staffPatient = await request(ctx, 'POST', '/patients', {
    token: receptionToken,
    body: { fullName: 'Balu Das', ageYears: 60, sex: 'male', phone: '9000000002' },
  });
  const staffEncounter = await request(ctx, 'POST', '/encounters', {
    token: receptionToken,
    body: { patientId: staffPatient.data.patient.id, department: 'General Medicine' },
  });
  await request(ctx, 'POST', `/encounters/${staffEncounter.data.encounter.id}/start`, { token: doctorToken, body: {} });
  db.prepare('UPDATE encounters SET started_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), staffEncounter.data.encounter.id);
  await request(ctx, 'POST', `/encounters/${staffEncounter.data.encounter.id}/complete`, {
    token: doctorToken,
    body: { noMedicines: true },
  });
  const assisted = await request(ctx, 'POST', '/confirmations/tablet', {
    token: kioskToken,
    body: {
      encounterId: staffEncounter.data.encounter.id,
      result: 'confirmed',
      staffAssisted: true,
      assistLoginId: 'kiosk',
      assistPin: '1234',
    },
  });
  assert.equal(assisted.status, 201);
  assert.equal(assisted.data.confirmation.staff_assisted, 1);

  const smsPatient = await request(ctx, 'POST', '/patients', {
    token: receptionToken,
    body: { fullName: 'Chandra Devi', ageYears: 34, sex: 'female', phone: '9000000003' },
  });
  const smsEncounter = await request(ctx, 'POST', '/encounters', {
    token: receptionToken,
    body: { patientId: smsPatient.data.patient.id, department: 'General Medicine' },
  });
  await request(ctx, 'POST', `/encounters/${smsEncounter.data.encounter.id}/start`, { token: doctorToken, body: {} });
  db.prepare('UPDATE encounters SET started_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), smsEncounter.data.encounter.id);
  await request(ctx, 'POST', `/encounters/${smsEncounter.data.encounter.id}/complete`, {
    token: doctorToken,
    body: { noMedicines: true },
  });
  const smsSent = await request(ctx, 'POST', `/sms/send/${smsEncounter.data.encounter.id}`, {
    token: adminToken,
    body: {},
  });
  assert.equal(smsSent.status, 200);
  assert.equal(smsSent.data.sms.status, 'sent');

  const inbound = await request(ctx, 'POST', '/sms/inbound', {
    body: { phone: '9000000003', body: 'YES' },
  });
  assert.equal(inbound.status, 200);
  assert.equal(inbound.data.result, 'confirmed');

  const timeline = await request(ctx, 'GET', `/admin/encounters/${encounter.id}/timeline`, { token: adminToken });
  assert.equal(timeline.status, 200);
  assert.ok(timeline.data.timeline.some((event) => event.action === 'encounter.created'));
  assert.ok(timeline.data.timeline.some((event) => event.action === 'consultation.completed'));
  assert.ok(timeline.data.timeline.some((event) => event.action === 'confirmation.tablet'));

  const overview = await request(ctx, 'GET', '/admin/overview', { token: adminToken });
  assert.equal(overview.status, 200);
  assert.ok(overview.data.totalEncounters >= 3);
  assert.ok(overview.data.funnel.tabletConfirmed >= 2);
  assert.ok(overview.data.funnel.smsConfirmed >= 1);

  db.close();
});
