import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import ReceptionPage from './pages/ReceptionPage';
import DoctorPage from './pages/DoctorPage';
import DoctorEncounterPage from './pages/DoctorEncounterPage';
import KioskPage from './pages/KioskPage';
import AdminPage from './pages/AdminPage';
import AdminEncounterPage from './pages/AdminEncounterPage';

import { useEffect, useState } from 'react';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    // 10 minutes timeout, show warning at 9 minutes
    const IDLE_TIMEOUT = 10 * 60 * 1000;
    const WARNING_TIME = 9 * 60 * 1000;
    
    let warningTimer;
    let logoutTimer;

    const resetTimers = () => {
      setShowIdleWarning(false);
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);

      warningTimer = setTimeout(() => {
        setShowIdleWarning(true);
      }, WARNING_TIME);

      logoutTimer = setTimeout(() => {
        logout();
      }, IDLE_TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetTimers));
    resetTimers();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, resetTimers));
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
    };
  }, [user, logout]);

  if (!user) return children;

  const links = [];
  if (user.role === 'reception' || user.role === 'admin') links.push(['/reception', 'Reception']);
  if (user.role === 'doctor' || user.role === 'admin') links.push(['/doctor', 'Doctor']);
  if (user.role === 'kiosk_staff' || user.role === 'admin' || user.role === 'reception') links.push(['/kiosk', 'Kiosk']);
  if (user.role === 'admin') links.push(['/admin', 'Admin']);

  return (
    <div className="app-shell">
      {showIdleWarning && (
        <div style={{ background: '#fff1d6', color: '#9a5b00', padding: '0.8rem', textAlign: 'center', fontWeight: 'bold', borderRadius: '12px', marginBottom: '1rem', border: '1px solid #ffcc80' }}>
          ⚠️ Your session is about to expire due to inactivity. Move your mouse or tap to stay logged in.
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          MED-GUARD
          <span>{user.displayName} · {user.role}</span>
        </div>
        <button className="btn" type="button" onClick={logout}>Sign out</button>
      </header>
      <nav className="nav-row">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}

function Private({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const map = {
    reception: '/reception',
    doctor: '/doctor',
    admin: '/admin',
    kiosk_staff: '/kiosk',
  };
  return <Navigate to={map[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/reception" element={<Private roles={['reception']}><ReceptionPage /></Private>} />
          <Route path="/doctor" element={<Private roles={['doctor']}><DoctorPage /></Private>} />
          <Route path="/doctor/encounter/:id" element={<Private roles={['doctor']}><DoctorEncounterPage /></Private>} />
          <Route path="/kiosk" element={<Private roles={['kiosk_staff', 'reception']}><KioskPage /></Private>} />
          <Route path="/admin" element={<Private roles={['admin']}><AdminPage /></Private>} />
          <Route path="/admin/encounter/:id" element={<Private roles={['admin']}><AdminEncounterPage /></Private>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthProvider>
  );
}
