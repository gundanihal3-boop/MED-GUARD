import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const emptyForm = {
  uhid: '',
  fullName: '',
  ageYears: '',
  sex: 'female',
  phone: '',
  department: 'General Medicine',
};

function TokenSlip({ encounter, onDismiss }) {
  const slipRef = useRef(null);

  function printSlip() {
    const content = slipRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=380,height=500');
    win.document.write(`
      <html>
        <head>
          <title>OPD Token</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 1.5rem; color: #143028; }
            .slip { border: 2px dashed #0b6b4f; border-radius: 16px; padding: 1.5rem; max-width: 320px; }
            h1 { font-size: 1rem; margin: 0 0 0.5rem; color: #084c39; }
            .token { font-size: 4rem; font-weight: 900; color: #0b6b4f; text-align: center; margin: 1rem 0; letter-spacing: 0.1em; }
            .detail { font-size: 0.9rem; margin: 0.25rem 0; }
            .label { color: #4a635a; font-size: 0.75rem; }
            .footer { margin-top: 1rem; font-size: 0.75rem; color: #4a635a; border-top: 1px dashed #c5d7d0; padding-top: 0.5rem; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }

  const patient = encounter.patient;
  const now = new Date(encounter.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="token-slip-wrapper" style={{ marginBottom: '1rem' }}>
      {/* Printable content */}
      <div ref={slipRef} className="slip">
        <h1>🏥 {encounter.department} — OPD Token</h1>
        <div className="token">#{encounter.opd_token}</div>
        {patient && (
          <>
            <div className="detail"><span className="label">Patient: </span><strong>{patient.full_name}</strong></div>
            <div className="detail"><span className="label">Age / Sex: </span>{patient.age_years} yrs / {patient.sex}</div>
            {patient.uhid && <div className="detail"><span className="label">UHID: </span>{patient.uhid}</div>}
          </>
        )}
        <div className="detail"><span className="label">Time: </span>{now}</div>
        <div className="footer">Please show this token to the doctor, then visit the Exit Kiosk before leaving.</div>
      </div>

      {/* Screen controls — not printed */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button className="btn primary" type="button" onClick={printSlip}>🖨️ Print Token Slip</button>
        <button className="btn ghost" type="button" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

export default function ReceptionPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [today, setToday] = useState([]);
  const [lastEncounter, setLastEncounter] = useState(null);

  async function loadToday() {
    const data = await api('/encounters');
    setToday(data.encounters);
  }

  useEffect(() => {
    loadToday().catch((e) => setError(e.message));
  }, []);

  async function search() {
    setError('');
    const data = await api(`/patients/search?q=${encodeURIComponent(query)}`);
    setResults(data.patients);
  }

  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [isCheckingDups, setIsCheckingDups] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function checkDuplicates() {
    if (!form.fullName && !form.phone && !form.uhid) {
      setDuplicateWarning(null);
      return;
    }
    setIsCheckingDups(true);
    try {
      const params = new URLSearchParams();
      if (form.fullName) params.append('fullName', form.fullName);
      if (form.phone) params.append('phone', form.phone);
      if (form.uhid) params.append('uhid', form.uhid);
      const data = await api(`/patients/check-duplicate?${params.toString()}`);
      if (data.hasWarnings) {
        setDuplicateWarning(data.warnings);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      setDuplicateWarning(null);
    } finally {
      setIsCheckingDups(false);
    }
  }

  async function registerPatient(e, force = false) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!force && duplicateWarning && duplicateWarning.length > 0) {
      // Prompt receptionist to review duplicate warning before saving
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await api('/patients', {
        method: 'POST',
        body: {
          uhid: form.uhid || null,
          fullName: form.fullName,
          ageYears: Number(form.ageYears),
          sex: form.sex,
          phone: form.phone || null,
          overrideDuplicate: force,
        },
      });
      setSelected(data.patient);
      setMessage(`Patient registered (${data.patient.registration_source})`);
      setForm(emptyForm);
      setDuplicateWarning(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createEncounter() {
    if (!selected) return;
    setError('');
    setMessage('');
    setLastEncounter(null);
    try {
      const data = await api('/encounters', {
        method: 'POST',
        body: {
          patientId: selected.id,
          department: form.department,
        },
      });
      // Attach patient info for the token slip display
      setLastEncounter({ ...data.encounter, patient: selected });
      setMessage(`Encounter created. OPD token: ${data.encounter.opd_token}`);
      await loadToday();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid">
      <div className="panel">
        <h1>Reception</h1>
        <p className="lead">Lookup UHID or register with minimal details. Phone is optional.</p>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {lastEncounter && (
          <TokenSlip encounter={lastEncounter} onDismiss={() => setLastEncounter(null)} />
        )}

        <div className="grid two">
          <label>
            Search UHID / name / phone
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="UHID or name" />
              <button className="btn primary" type="button" onClick={() => search().catch((e) => setError(e.message))}>Search</button>
            </div>
          </label>
          <label>
            Department for new encounter
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option>General Medicine</option>
              <option>Pediatrics</option>
              <option>Surgery</option>
              <option>Gynecology</option>
            </select>
          </label>
        </div>

        {results.length > 0 && (
          <table className="table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>UHID</th>
                <th>Age/Sex</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>{p.uhid || '—'}</td>
                  <td>{p.age_years} / {p.sex}</td>
                  <td><span className="badge">{p.registration_source}</span></td>
                  <td>
                    <button className="btn" type="button" onClick={() => setSelected(p)}>Select</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid two">
        <div className="panel">
          <h2>Register patient</h2>
          <p className="lead">Use UHID if hospital-registered. Otherwise leave UHID blank.</p>
          
          {duplicateWarning && duplicateWarning.length > 0 && (
            <div className="warning-banner">
              ⚠️ Possible Duplicate Patient Detected:
              <ul style={{ margin: '0.4rem 0 0.8rem', paddingLeft: '1.2rem' }}>
                {duplicateWarning.map((w, idx) => (
                  <li key={idx}>
                    {w.message}
                    {w.existingPatient && (
                      <button
                        className="btn"
                        type="button"
                        style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem', minHeight: 32, fontSize: '0.85rem' }}
                        onClick={() => setSelected(w.existingPatient)}
                      >
                        Use Existing ({w.existingPatient.full_name})
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <button
                className="btn danger"
                type="button"
                style={{ width: '100%', minHeight: 44 }}
                onClick={(e) => registerPatient(e, true)}
              >
                Create New Patient Anyway (Override Warning)
              </button>
            </div>
          )}

          <form className="grid" onSubmit={registerPatient}>
            <label>
              UHID (optional)
              <input
                value={form.uhid}
                onChange={(e) => setForm({ ...form, uhid: e.target.value })}
                onBlur={checkDuplicates}
              />
            </label>
            <label>
              Full name
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                onBlur={checkDuplicates}
              />
            </label>
            <div className="grid two">
              <label>
                Age
                <input required type="number" min="0" value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value })} />
              </label>
              <label>
                Sex
                <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <label>
              Phone (optional)
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={checkDuplicates}
                placeholder="For SMS fallback only"
              />
            </label>
            <button className="btn primary" type="submit" disabled={isCheckingDups || isSubmitting}>
              {isSubmitting ? 'Saving...' : (isCheckingDups ? 'Checking...' : 'Save patient')}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Create encounter</h2>
          {selected ? (
            <>
              <p className="lead">
                <strong>{selected.full_name}</strong> · {selected.age_years} / {selected.sex}
                <br />
                UHID: {selected.uhid || 'none'} · <span className="badge">{selected.registration_source}</span>
                <br />
                Phone: {selected.phone || 'not provided'}
              </p>
              <button className="btn primary large block" type="button" onClick={createEncounter}>
                Issue OPD token & create encounter
              </button>
            </>
          ) : (
            <p className="lead">Select or register a patient first.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Today’s encounters</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Patient</th>
              <th>Dept</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {today.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.opd_token}</strong></td>
                <td>{e.patient?.full_name}</td>
                <td>{e.department}</td>
                <td><span className="badge">{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
