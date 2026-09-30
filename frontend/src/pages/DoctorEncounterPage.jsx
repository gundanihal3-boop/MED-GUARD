import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

const ICONS = {
  tablet: '💊',
  capsule: '💊',
  syrup: '🧴',
  sachet: '📦',
  ointment: '🩹',
};

function emptyItem(medicineId = '') {
  return {
    medicineId,
    timingMorning: true,
    timingAfternoon: false,
    timingNight: true,
    afterFood: true,
    durationDays: 3,
    quantity: '',
    isFreetext: false,
    freetextName: '',
    iconKey: 'tablet',
  };
}

export default function DoctorEncounterPage() {
  const { id } = useParams();
  const [encounter, setEncounter] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [items, setItems] = useState([emptyItem()]);
  const [noMedicines, setNoMedicines] = useState(false);
  const [notes, setNotes] = useState('');
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [enc, meds] = await Promise.all([
      api(`/encounters/${id}`),
      api('/prescriptions/medicines'),
    ]);
    setEncounter(enc.encounter);
    setNotes(enc.encounter.notes || '');
    setMedicines(meds.medicines);
    try {
      const rx = await api(`/prescriptions/encounters/${id}`);
      setBundle(rx.bundle);
    } catch {
      setBundle(null);
    }
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const canComplete = encounter?.status === 'in_consultation';
  const canPrescribe = encounter && ['in_consultation', 'consultation_completed', 'confirmation_pending', 'confirmed_tablet', 'confirmed_sms'].includes(encounter.status);

  async function complete() {
    setError('');
    try {
      await api(`/encounters/${id}/complete`, {
        method: 'POST',
        body: { notes, noMedicines },
      });
      setMessage('Consultation completed — awaiting patient confirmation');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function savePrescription() {
    setError('');
    try {
      if (encounter.status === 'in_consultation') {
        await api(`/encounters/${id}/complete`, {
          method: 'POST',
          body: { notes, noMedicines },
        });
      }
      const data = await api(`/prescriptions/encounters/${id}`, {
        method: 'POST',
        body: {
          noMedicines,
          items: noMedicines ? [] : items.map((it) => ({
            ...it,
            medicineId: it.isFreetext ? null : it.medicineId,
          })),
        },
      });
      setBundle(data.bundle);
      setMessage('Prescription saved');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function printRx() {
    if (!bundle) return;
    await api(`/prescriptions/${bundle.prescription.id}/print`, { method: 'POST', body: {} });
    window.print();
    await load();
  }

  const timingPreview = useMemo(() => items, [items]);

  if (!encounter) {
    return <div className="panel">{error || 'Loading…'}</div>;
  }

  return (
    <div className="grid">
      <div className="panel no-print">
        <Link to="/doctor">← Back to queue</Link>
        <h1>Token {encounter.opd_token}</h1>
        <p className="lead">
          {encounter.patient?.full_name} · {encounter.patient?.age_years}/{encounter.patient?.sex}
          {encounter.patient?.uhid ? ` · UHID ${encounter.patient.uhid}` : ''}
          <br />
          Status: <span className="badge">{encounter.status}</span>
        </p>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        <label>
          Optional notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {canComplete && (
          <button className="btn" style={{ marginTop: '0.75rem' }} type="button" onClick={complete}>
            Complete without prescription yet
          </button>
        )}
      </div>

      {canPrescribe && !bundle && (
        <div className="panel no-print">
          <h2>Prescription</h2>
          <label style={{ marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={noMedicines} onChange={(e) => setNoMedicines(e.target.checked)} /> Advice only — no medicines
          </label>

          {!noMedicines && items.map((item, idx) => (
            <div key={idx} className="panel" style={{ boxShadow: 'none' }}>
              <div className="grid two">
                <label>
                  Medicine
                  <select
                    value={item.isFreetext ? '__free__' : item.medicineId}
                    onChange={(e) => {
                      const next = [...items];
                      if (e.target.value === '__free__') {
                        next[idx] = { ...item, isFreetext: true, medicineId: '' };
                      } else {
                        next[idx] = { ...item, isFreetext: false, medicineId: e.target.value };
                      }
                      setItems(next);
                    }}
                  >
                    <option value="">Select…</option>
                    {medicines.map((m) => (
                      <option key={m.id} value={m.id}>{m.name_en} / {m.name_local}</option>
                    ))}
                    <option value="__free__">Other (free text — flagged)</option>
                  </select>
                </label>
                {item.isFreetext && (
                  <label>
                    Free-text name
                    <input value={item.freetextName} onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, freetextName: e.target.value };
                      setItems(next);
                    }} />
                  </label>
                )}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <div className="timing">
                  {[
                    ['timingMorning', 'Morning'],
                    ['timingAfternoon', 'Afternoon'],
                    ['timingNight', 'Night'],
                    ['afterFood', 'After food'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`chip ${item[key] ? 'on' : ''}`}
                      onClick={() => {
                        const next = [...items];
                        next[idx] = { ...item, [key]: !item[key] };
                        setItems(next);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid two" style={{ marginTop: '0.75rem' }}>
                <label>
                  Days
                  <input type="number" min="1" value={item.durationDays} onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...item, durationDays: Number(e.target.value) };
                    setItems(next);
                  }} />
                </label>
                <label>
                  Quantity (optional)
                  <input value={item.quantity} onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...item, quantity: e.target.value };
                    setItems(next);
                  }} />
                </label>
              </div>
            </div>
          ))}

          {!noMedicines && (
            <button className="btn" type="button" onClick={() => setItems([...items, emptyItem()])}>Add medicine</button>
          )}
          <button className="btn primary large block" style={{ marginTop: '0.75rem' }} type="button" onClick={savePrescription}>
            Save prescription & complete
          </button>
          <p className="lead" style={{ marginTop: '0.5rem' }}>{timingPreview.length} line(s) ready</p>
        </div>
      )}

      {bundle && (
        <div className="panel">
          <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button className="btn primary large" type="button" onClick={printRx}>🖨️ Print Prescription Sheet</button>
          </div>
          <div className="rx-sheet">
            <div style={{ borderBottom: '2px solid var(--ink)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h2 style={{ marginTop: 0, marginBottom: '0.2rem', color: 'var(--brand-dark)' }}>
                {bundle.settings?.hospital_name || 'GOVERNMENT HOSPITAL'} — MED-GUARD
              </h2>
              <div style={{ fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600 }}>
                Outpatient Department Prescription (మందుల చీటీ)
              </div>
            </div>

            <div className="grid two" style={{ marginBottom: '1rem', background: '#f8f9fa', padding: '0.85rem', borderRadius: 12 }}>
              <div>
                <strong>Patient:</strong> {bundle.patient.full_name} ({bundle.patient.age_years} yrs / {bundle.patient.sex})
                <br />
                <strong>UHID:</strong> {bundle.patient.uhid || 'N/A (Minimal Reg)'}
              </div>
              <div>
                <strong>OPD Token:</strong> <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>#{bundle.encounter.opd_token}</span>
                <br />
                <strong>Doctor:</strong> Dr. {bundle.doctor?.display_name || 'Medical Officer'}
                <br />
                <strong>Date:</strong> {new Date(bundle.prescription.created_at).toLocaleDateString()}
              </div>
            </div>

            {bundle.prescription.no_medicines ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: '#fff8e6', borderRadius: 12, border: '1px solid #ffd591' }}>
                <strong style={{ fontSize: '1.1rem' }}>Advice only — no medicines prescribed. (సలహా మాత్రమే)</strong>
              </div>
            ) : (
              <div>
                <h3 style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>Prescribed Medicines (సూచించిన మందులు):</h3>
                {bundle.items.map((it) => (
                  <div className="rx-row" key={it.id}>
                    <div className="rx-icon">{ICONS[it.icon_key] || '💊'}</div>
                    <div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                        {it.name_en || it.freetext_name}
                        {it.is_freetext ? <span className="badge warn" style={{ marginLeft: '0.5rem' }}>free text</span> : null}
                      </div>
                      {it.name_local && <div style={{ fontSize: '1rem', color: 'var(--brand-dark)', fontWeight: 700 }}>{it.name_local}</div>}
                      <div style={{ marginTop: '0.4rem', fontSize: '0.95rem', fontWeight: 600 }}>
                        Timing: {' '}
                        {it.timing_morning ? '☀️ Morning (ఉదయం)  ' : ''}
                        {it.timing_afternoon ? '🌤️ Afternoon (మధ్యాహ్నం)  ' : ''}
                        {it.timing_night ? '🌙 Night (రాత్రి)  ' : ''}
                        <br />
                        Food: {it.after_food ? '🍽️ After food (భోజనం తర్వాత)' : '🥣 Before food (భోజనం ముందు)'}
                        {' · '}Duration: <strong>{it.duration_days} days</strong>
                        {it.quantity ? ` · Qty: ${it.quantity}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div style={{ marginTop: '1.5rem', paddingTop: '0.85rem', borderTop: '1px solid var(--line)', textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem' }}>
              ℹ️ Please present this token (#{bundle.encounter.opd_token}) at the Exit Kiosk before leaving the hospital.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
