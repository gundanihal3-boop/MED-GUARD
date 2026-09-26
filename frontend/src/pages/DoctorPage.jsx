import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

export default function DoctorPage() {
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const [att, enc] = await Promise.all([
      api('/attendance/me'),
      api('/encounters'),
    ]);
    setSession(att.session);
    setQueue(enc.encounters.filter((e) => ['waiting', 'in_consultation', 'consultation_completed'].includes(e.status)));
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function checkIn() {
    setError('');
    try {
      await api('/attendance/check-in', { method: 'POST', body: { locationLabel: user.department } });
      setMessage('Checked in — attendance recorded');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function checkOut() {
    setError('');
    try {
      await api('/attendance/check-out', { method: 'POST', body: {} });
      setMessage('Checked out');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startConsult(id) {
    setError('');
    try {
      await api(`/encounters/${id}/start`, { method: 'POST', body: {} });
      setMessage('Consultation started');
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid">
      <div className="panel">
        <h1>Doctor — {user.displayName}</h1>
        <p className="lead">Lightweight workflow: check in, open encounter, complete consult, print prescription.</p>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {session ? (
            <>
              <span className="badge ok">Present since {new Date(session.check_in_at).toLocaleTimeString()}</span>
              <button className="btn" type="button" onClick={checkOut}>Check out</button>
            </>
          ) : (
            <button className="btn primary large" type="button" onClick={checkIn}>Check in for today</button>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>Queue</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Patient</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((e) => (
              <tr key={e.id}>
                <td><strong>{e.opd_token}</strong></td>
                <td>
                  {e.patient?.full_name} · {e.patient?.age_years}/{e.patient?.sex}
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{e.department}</div>
                </td>
                <td><span className="badge">{e.status}</span></td>
                <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {e.status === 'waiting' && (
                    <button className="btn primary" type="button" onClick={() => startConsult(e.id)}>Start</button>
                  )}
                  {(e.status === 'in_consultation' || e.status === 'consultation_completed') && (
                    <Link className="btn primary" to={`/doctor/encounter/${e.id}`}>Open</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
