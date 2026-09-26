import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export default function AdminEncounterPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/admin/encounters/${id}/timeline`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="panel error">{error}</div>;
  if (!data) return <div className="panel">Loading…</div>;

  return (
    <div className="grid">
      <div className="panel">
        <Link to="/admin">← Admin</Link>
        <h1>Encounter timeline</h1>
        <p className="lead">
          Token {data.encounter.opd_token} · {data.patient.full_name}
          <br />
          Status: <span className="badge">{data.encounter.status}</span>
          <br />
          ID: {data.encounter.id}
        </p>
      </div>

      <div className="panel">
        <h2>Audit events</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {data.timeline.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.occurred_at).toLocaleString()}</td>
                <td><span className="badge">{ev.action}</span></td>
                <td>{ev.actor_kind}{ev.actor_user_id ? ` · ${ev.actor_user_id.slice(0, 8)}` : ''}</td>
                <td><code style={{ fontSize: '0.75rem' }}>{JSON.stringify(ev.payload)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two">
        <div className="panel">
          <h2>Confirmations</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.confirmations, null, 2)}</pre>
        </div>
        <div className="panel">
          <h2>SMS</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.sms, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
