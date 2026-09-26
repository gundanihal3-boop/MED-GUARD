import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const ALL_STATUSES = [
  'waiting', 'in_consultation', 'consultation_completed',
  'confirmation_pending', 'confirmed_tablet', 'confirmed_sms',
  'confirmation_not_received', 'patient_disputed', 'no_show', 'cancelled',
];

// ──────────────────────────────────────────────────────────────
// Collapsible section wrapper
// ──────────────────────────────────────────────────────────────
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.4rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '1.05rem',
          color: 'var(--brand-dark)',
          minHeight: 'unset',
        }}
      >
        {title}
        <span style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 1.4rem 1.2rem' }}>{children}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Admin Page
// ──────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [overview, setOverview] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [smsSim, setSmsSim] = useState({ encounterId: '', phone: '', body: 'YES' });
  const [smsMsg, setSmsMsg] = useState('');

  // Staff management
  const [users, setUsers] = useState([]);
  const [staffMsg, setStaffMsg] = useState('');

  // Formulary management
  const [medicines, setMedicines] = useState([]);
  const [newMed, setNewMed] = useState({ nameEn: '', nameLocal: '', iconKey: 'tablet', defaultUnit: 'tablet' });
  const [medMsg, setMedMsg] = useState('');

  // Settings
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    const day = selectedDay;
    const encQuery = statusFilter ? `?day=${day}&status=${statusFilter}` : `?day=${day}`;
    const [ov, an, att, enc] = await Promise.all([
      api(`/admin/overview?day=${day}`),
      api(`/admin/anomalies?day=${day}`),
      api(`/attendance/today?day=${day}`),
      api(`/encounters${encQuery}`),
    ]);
    setOverview(ov);
    setAnomalies(an.anomalies);
    setAttendance(att.sessions);
    setEncounters(enc.encounters);
  }, [selectedDay, statusFilter]);

  async function loadManagementData() {
    const [usersRes, medsRes, settingsRes] = await Promise.all([
      api('/admin/users'),
      api('/prescriptions/medicines'),
      api('/admin/settings'),
    ]);
    setUsers(usersRes.users);
    setMedicines(medsRes.medicines);
    setSettingsForm(settingsRes.settings);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);

  useEffect(() => {
    loadManagementData().catch(() => {});
  }, []);

  async function sendSms(encounterId) {
    setSmsMsg('');
    try {
      const data = await api(`/sms/send/${encounterId}`, { method: 'POST', body: {} });
      setSmsMsg(`SMS sent (simulated): ${data.sms.body}`);
      setSmsSim((s) => ({ ...s, encounterId, phone: data.sms.phone }));
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function simulateInbound() {
    setError('');
    try {
      const data = await api('/sms/inbound', { method: 'POST', body: { phone: smsSim.phone, body: smsSim.body } });
      setSmsMsg(JSON.stringify(data));
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleUserActive(user) {
    setStaffMsg('');
    try {
      await api(`/admin/users/${user.id}/toggle-active`, { method: 'POST', body: {} });
      setStaffMsg(`${user.display_name} ${user.active ? 'deactivated' : 'reactivated'}.`);
      const res = await api('/admin/users');
      setUsers(res.users);
    } catch (err) {
      setStaffMsg(`Error: ${err.message}`);
    }
  }

  async function addMedicine(e) {
    e.preventDefault();
    setMedMsg('');
    try {
      await api('/prescriptions/medicines', { method: 'POST', body: newMed });
      setMedMsg(`Medicine "${newMed.nameEn}" added.`);
      setNewMed({ nameEn: '', nameLocal: '', iconKey: 'tablet', defaultUnit: 'tablet' });
      const res = await api('/prescriptions/medicines');
      setMedicines(res.medicines);
    } catch (err) {
      setMedMsg(`Error: ${err.message}`);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsMsg('');
    try {
      await api('/admin/settings', { method: 'PUT', body: settingsForm });
      setSettingsMsg('Settings saved.');
      const res = await api('/admin/settings');
      setSettingsForm(res.settings);
    } catch (err) {
      setSettingsMsg(`Error: ${err.message}`);
    }
  }

  if (!overview) return <div className="panel">{error || 'Loading…'}</div>;

  const isToday = selectedDay === todayIso();

  return (
    <div className="grid">

      {/* ── Header & Day Picker ── */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ margin: 0 }}>Hospital Admin</h1>
            <p className="lead" style={{ marginBottom: 0 }}>
              Attendance, confirmation funnel, feedback, anomalies.
            </p>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 180 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)' }}>Viewing day</span>
            <input
              type="date"
              value={selectedDay}
              max={todayIso()}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={{ minHeight: 44, fontSize: '0.95rem' }}
            />
          </label>
        </div>
        {!isToday && (
          <div className="warning-banner" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            📅 Viewing historical data for <strong>{selectedDay}</strong>.{' '}
            <button
              className="btn"
              type="button"
              style={{ padding: '0.2rem 0.6rem', minHeight: 32, fontSize: '0.85rem' }}
              onClick={() => setSelectedDay(todayIso())}
            >
              Back to today
            </button>
          </div>
        )}
        {error && <div className="error" style={{ marginTop: '0.75rem' }}>{error}</div>}
        {smsMsg && <div className="success" style={{ marginTop: '0.75rem' }}>{smsMsg}</div>}
        <div className="grid three" style={{ marginTop: '1rem' }}>
          <div className="stat"><div className="n">{overview.doctorsPresent}</div><div className="l">Doctors present</div></div>
          <div className="stat"><div className="n">{overview.totalEncounters}</div><div className="l">Encounters</div></div>
          <div className="stat"><div className="n">{overview.funnel.tabletConfirmed + overview.funnel.smsConfirmed}</div><div className="l">Confirmed</div></div>
          <div className="stat"><div className="n">{overview.funnel.pending}</div><div className="l">Pending confirmation</div></div>
          <div className="stat"><div className="n">{overview.funnel.disputed}</div><div className="l">Disputed</div></div>
          <div className="stat"><div className="n">{overview.funnel.staffAssisted}</div><div className="l">Staff-assisted confirms</div></div>
        </div>
      </div>

      {/* ── Funnel + Anomalies ── */}
      <div className="grid two">
        <div className="panel">
          <h2>Confirmation funnel</h2>
          <table className="table">
            <tbody>
              <tr><td>Completed pathway</td><td>{overview.funnel.completed}</td></tr>
              <tr><td>Tablet confirmed</td><td>{overview.funnel.tabletConfirmed}</td></tr>
              <tr><td>SMS confirmed</td><td>{overview.funnel.smsConfirmed}</td></tr>
              <tr><td>Pending</td><td>{overview.funnel.pending}</td></tr>
              <tr><td>Not received</td><td>{overview.funnel.notReceived}</td></tr>
              <tr><td>Disputed</td><td>{overview.funnel.disputed}</td></tr>
            </tbody>
          </table>
          <h3>Feedback</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {(overview.feedback || []).map((f) => (
              <span key={f.feedback} className="badge">{f.feedback}: {f.c}</span>
            ))}
            {!overview.feedback?.length && <span className="lead">No feedback yet</span>}
          </div>
        </div>

        <div className="panel">
          <h2>Anomalies</h2>
          {anomalies.length === 0 && <p className="lead">No rule-based anomalies right now.</p>}
          <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {anomalies.map((a, i) => (
              <li key={i} style={{ marginBottom: '0.5rem' }}>
                <span className={`badge ${a.severity === 'high' ? 'danger' : a.severity === 'medium' ? 'warn' : ''}`}>
                  {a.type}
                </span>{' '}
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Attendance ── */}
      <div className="panel">
        <h2>Attendance</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Doctor</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Consults</th>
            </tr>
          </thead>
          <tbody>
            {attendance.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No attendance records for this day.</td></tr>
            )}
            {attendance.map((s) => (
              <tr key={s.id}>
                <td>{s.display_name}</td>
                <td>{new Date(s.check_in_at).toLocaleTimeString()}</td>
                <td>{s.check_out_at ? new Date(s.check_out_at).toLocaleTimeString() : '—'}</td>
                <td><span className="badge">{s.status}</span></td>
                <td>{s.consultCount ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Encounters with Status Filter ── */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <h2 style={{ margin: 0 }}>Encounters</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Filter:
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minHeight: 40, fontSize: '0.9rem', width: 'auto', padding: '0.4rem 0.75rem' }}
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Token</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {encounters.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No encounters match this filter.</td></tr>
            )}
            {encounters.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.opd_token}</strong></td>
                <td>{e.patient?.full_name}</td>
                <td>{e.doctor?.display_name || '—'}</td>
                <td><span className="badge">{e.status}</span></td>
                <td style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <Link className="btn" to={`/admin/encounter/${e.id}`}>Timeline</Link>
                  {['consultation_completed', 'confirmation_pending'].includes(e.status) && e.patient?.phone && (
                    <button className="btn" type="button" onClick={() => sendSms(e.id)}>Send SMS</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Staff Management ── */}
      <Section title="👥 Staff Management">
        {staffMsg && <div className={staffMsg.startsWith('Error') ? 'error' : 'success'} style={{ marginBottom: '0.75rem' }}>{staffMsg}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Login ID</th><th>Role</th><th>Department</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                <td>{u.display_name}</td>
                <td><code>{u.login_id}</code></td>
                <td><span className="badge">{u.role}</span></td>
                <td>{u.department || '—'}</td>
                <td><span className={`badge ${u.active ? 'ok' : 'warn'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <button
                    className={`btn ${u.active ? 'danger' : 'primary'}`}
                    type="button"
                    style={{ minHeight: 36, padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={() => toggleUserActive(u)}
                  >
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lead" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          Deactivating a user prevents login but preserves all audit records.
        </p>
      </Section>

      {/* ── Formulary Management ── */}
      <Section title="💊 Formulary Management">
        {medMsg && <div className={medMsg.startsWith('Error') ? 'error' : 'success'} style={{ marginBottom: '0.75rem' }}>{medMsg}</div>}
        <h3 style={{ marginTop: 0 }}>Add new medicine</h3>
        <form className="grid two" onSubmit={addMedicine} style={{ marginBottom: '1.25rem' }}>
          <label>
            English name
            <input required value={newMed.nameEn} onChange={(e) => setNewMed({ ...newMed, nameEn: e.target.value })} placeholder="e.g. Paracetamol 500mg" />
          </label>
          <label>
            Local name (Telugu)
            <input required value={newMed.nameLocal} onChange={(e) => setNewMed({ ...newMed, nameLocal: e.target.value })} placeholder="e.g. పారాసిటమాల్ 500mg" />
          </label>
          <label>
            Icon type
            <select value={newMed.iconKey} onChange={(e) => setNewMed({ ...newMed, iconKey: e.target.value })}>
              <option value="tablet">💊 Tablet</option>
              <option value="capsule">💊 Capsule</option>
              <option value="syrup">🧴 Syrup</option>
              <option value="sachet">📦 Sachet</option>
              <option value="ointment">🩹 Ointment</option>
            </select>
          </label>
          <label>
            Default unit
            <select value={newMed.defaultUnit} onChange={(e) => setNewMed({ ...newMed, defaultUnit: e.target.value })}>
              <option value="tablet">tablet</option>
              <option value="capsule">capsule</option>
              <option value="ml">ml</option>
              <option value="sachet">sachet</option>
              <option value="tube">tube</option>
            </select>
          </label>
          <button className="btn primary" type="submit" style={{ gridColumn: '1 / -1', maxWidth: 200 }}>Add medicine</button>
        </form>
        <h3>Current formulary ({medicines.length} medicines)</h3>
        <table className="table">
          <thead>
            <tr><th>English</th><th>Telugu</th><th>Icon</th><th>Unit</th><th>Active</th></tr>
          </thead>
          <tbody>
            {medicines.map((m) => (
              <tr key={m.id}>
                <td>{m.name_en}</td>
                <td>{m.name_local}</td>
                <td>{m.icon_key}</td>
                <td>{m.default_unit}</td>
                <td><span className={`badge ${m.active ? 'ok' : 'warn'}`}>{m.active ? 'Yes' : 'No'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── Hospital Settings ── */}
      <Section title="⚙️ Hospital Settings">
        {settingsMsg && <div className={settingsMsg.startsWith('Error') ? 'error' : 'success'} style={{ marginBottom: '0.75rem' }}>{settingsMsg}</div>}
        {settingsForm && (
          <form className="grid two" onSubmit={saveSettings}>
            <label>
              Hospital name
              <input value={settingsForm.hospital_name} onChange={(e) => setSettingsForm({ ...settingsForm, hospital_name: e.target.value })} />
            </label>
            <label>
              Primary language
              <select value={settingsForm.language_primary} onChange={(e) => setSettingsForm({ ...settingsForm, language_primary: e.target.value })}>
                <option value="te">Telugu (te)</option>
                <option value="en">English (en)</option>
              </select>
            </label>
            <label>
              SMS grace period (hours)
              <input type="number" min="0.5" max="24" step="0.5" value={settingsForm.sms_grace_hours} onChange={(e) => setSettingsForm({ ...settingsForm, sms_grace_hours: parseFloat(e.target.value) })} />
            </label>
            <label>
              Confirmation expiry (hours)
              <input type="number" min="1" max="168" step="1" value={settingsForm.confirmation_expire_hours} onChange={(e) => setSettingsForm({ ...settingsForm, confirmation_expire_hours: parseInt(e.target.value, 10) })} />
            </label>
            <button className="btn primary" type="submit" style={{ maxWidth: 180 }}>Save settings</button>
          </form>
        )}
      </Section>

      {/* ── SMS Simulator ── */}
      <Section title="📱 SMS Simulator (feature-phone fallback)">
        <p className="lead">Real gateway can call POST /api/sms/inbound. For the pilot, simulate replies here.</p>
        <div className="grid two">
          <label>Phone<input value={smsSim.phone} onChange={(e) => setSmsSim({ ...smsSim, phone: e.target.value })} /></label>
          <label>Reply body<input value={smsSim.body} onChange={(e) => setSmsSim({ ...smsSim, body: e.target.value })} /></label>
        </div>
        <button className="btn primary" style={{ marginTop: '0.75rem' }} type="button" onClick={simulateInbound}>
          Simulate inbound SMS
        </button>
      </Section>

    </div>
  );
}
