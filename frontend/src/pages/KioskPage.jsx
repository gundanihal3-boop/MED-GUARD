import { useState } from 'react';
import { api } from '../api';
import { getTranslation } from '../i18n';

export default function KioskPage() {
  const [lang, setLang] = useState('en');
  const [token, setToken] = useState('');
  const [encounter, setEncounter] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [staffAssisted, setStaffAssisted] = useState(false);
  const [assistLoginId, setAssistLoginId] = useState('kiosk');
  const [assistPin, setAssistPin] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const t = getTranslation(lang);

  async function lookup() {
    setError('');
    setDone(null);
    if (!token.trim()) return;
    try {
      const data = await api(`/encounters/by-token/${encodeURIComponent(token.trim())}`);
      setEncounter(data.encounter);
    } catch (err) {
      setEncounter(null);
      setError(err.message || 'Token not found');
    }
  }

  async function submit(result) {
    setError('');
    try {
      const data = await api('/confirmations/tablet', {
        method: 'POST',
        body: {
          encounterId: encounter.id,
          result,
          feedback: result === 'confirmed' ? feedback : null,
          staffAssisted,
          assistLoginId: staffAssisted ? assistLoginId : undefined,
          assistPin: staffAssisted ? assistPin : undefined,
          deviceId: 'dev-kiosk',
        },
      });
      setDone(data);
      setEncounter(null);
      setToken('');
      setFeedback(null);
      setStaffAssisted(false);
      setAssistPin('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="kiosk-wrap">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>{t.kioskTitle}</h1>
          <div className="lang-switch no-print">
            <button
              type="button"
              className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={`lang-btn ${lang === 'te' ? 'active' : ''}`}
              onClick={() => setLang('te')}
            >
              తెలుగు
            </button>
          </div>
        </div>

        <p className="lead" style={{ fontSize: '1.15rem' }}>{t.kioskSubtitle}</p>
        {error && <div className="error">{error}</div>}
        {done && (
          <div className="success" style={{ fontSize: '1.2rem', padding: '1.25rem' }}>
            {done.confirmation.result === 'confirmed' ? t.recordedSuccess : t.recordedDispute}
            {done.confirmation.staff_assisted ? ` (${t.staffAssisting})` : ''}
          </div>
        )}

        {!encounter && (
          <div className="grid" style={{ gap: '1.25rem' }}>
            <label style={{ fontSize: '1.1rem' }}>
              {t.token} (OPD Token)
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t.opdTokenPlaceholder}
                inputMode="numeric"
                style={{ fontSize: '1.8rem', minHeight: 76, textAlign: 'center', fontWeight: 800, letterSpacing: '0.1em' }}
                onKeyDown={(e) => e.key === 'Enter' && lookup()}
              />
            </label>
            <button className="btn primary xlarge block" type="button" onClick={lookup}>
              {t.continue} →
            </button>
          </div>
        )}

        {encounter && (
          <div className="grid" style={{ gap: '1.25rem' }}>
            <div className="stat" style={{ background: '#f0f7f4', borderColor: '#b7ddcf' }}>
              <div className="l">{t.patient}</div>
              <div className="n" style={{ fontSize: '1.6rem' }}>
                {encounter.patient?.full_name}, {encounter.patient?.age_years} yrs
              </div>
              <div className="l" style={{ marginTop: '0.35rem', fontSize: '1.05rem' }}>
                {t.doctor}: <strong>{encounter.doctor?.display_name || '—'}</strong> · {t.token} <strong>#{encounter.opd_token}</strong>
              </div>
            </div>

            <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--brand-dark)', textAlign: 'center' }}>
              {t.didYouConsult}
            </p>

            <div style={{ marginTop: '0.25rem' }}>
              <p className="lead" style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{t.optionalFeedback}</p>
              <div className="face-row" aria-label="Optional feedback">
                {[
                  ['sad', '😢'],
                  ['neutral', '😐'],
                  ['happy', '😊'],
                ].map(([key, face]) => (
                  <button
                    key={key}
                    type="button"
                    className={`face-btn ${feedback === key ? 'selected' : ''}`}
                    onClick={() => setFeedback(key)}
                  >
                    {face}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: 14, border: '1.5px solid var(--line)' }}>
              <label style={{ fontSize: '1.05rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 22, height: 22, minHeight: 'auto', accentColor: 'var(--brand)' }}
                  checked={staffAssisted}
                  onChange={(e) => setStaffAssisted(e.target.checked)}
                />{' '}
                {t.staffAssisting}
              </label>
              {staffAssisted && (
                <div className="grid two" style={{ marginTop: '0.85rem' }}>
                  <label>
                    {t.staffId}
                    <input value={assistLoginId} onChange={(e) => setAssistLoginId(e.target.value)} />
                  </label>
                  <label>
                    {t.staffPin}
                    <input type="password" value={assistPin} onChange={(e) => setAssistPin(e.target.value)} />
                  </label>
                </div>
              )}
            </div>

            <button className="btn primary xlarge block" type="button" onClick={() => submit('confirmed')}>
              {t.yesConsulted}
            </button>
            <button className="btn danger large block" type="button" onClick={() => submit('disputed')}>
              {t.noDidNotConsult}
            </button>
            <button className="btn ghost" type="button" onClick={() => setEncounter(null)}>
              {t.cancel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

