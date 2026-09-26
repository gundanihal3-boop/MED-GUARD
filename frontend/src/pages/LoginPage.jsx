import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const ROLE_HOME = {
  reception: '/reception',
  doctor: '/doctor',
  admin: '/admin',
  kiosk_staff: '/kiosk',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(loginId, pin, 'dev-web');
      navigate(ROLE_HOME[user.role] || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel">
        <h1>MED-GUARD</h1>
        <p className="lead">Staff login for the one-hospital pilot. Shared tablet: choose your ID, enter PIN.</p>
        {error && <div className="error">{error}</div>}
        <form className="grid" onSubmit={onSubmit}>
          <label>
            Staff ID
            <select value={loginId} onChange={(e) => setLoginId(e.target.value)}>
              <option value="">Select staff ID…</option>
              <option value="reception">reception — Reception Desk</option>
              <option value="doctor1">doctor1 — Dr. Priya Sharma</option>
              <option value="doctor2">doctor2 — Dr. Ravi Kumar</option>
              <option value="kiosk">kiosk — Kiosk Helper</option>
              <option value="admin">admin — Hospital Admin</option>
            </select>
          </label>
          <label>
            PIN
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
          <button className="btn primary large" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
