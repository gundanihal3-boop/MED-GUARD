import { createContext, useContext, useMemo, useState } from 'react';
import { api, clearSession, getStoredUser, getToken, setSession } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(getToken());

  const value = useMemo(() => ({
    user,
    token,
    async login(loginId, pin, deviceId) {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { loginId, pin, deviceId },
      });
      setSession(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    async logout() {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      clearSession();
      setToken(null);
      setUser(null);
    },
  }), [user, token]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
