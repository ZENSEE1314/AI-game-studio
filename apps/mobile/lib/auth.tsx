import * as LocalAuth from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, clearTokens, hasStoredSession, request, saveTokens, setSessionLostHandler } from './api';

export type Profile = {
  id: string; username: string; email: string; phone: string | null; fullName: string;
  role: string; status: string; lastLogin: string | null; createdAt: string;
};
type State = 'loading' | 'locked' | 'out' | 'in';
type Ctx = {
  state: State; profile: Profile | null; biometricEnabled: boolean; biometricAvailable: boolean;
  login: (u: string, p: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
  unlock: () => Promise<boolean>;
  setBiometric: (on: boolean) => Promise<void>;
  reload: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);
const K_BIO = 'biometric_enabled';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [biometricEnabled, setBio] = useState(false);
  const [biometricAvailable, setAvail] = useState(false);

  const reload = useCallback(async () => { setProfile(await request<Profile>('/auth/me')); }, []);

  const finishSignIn = useCallback(async () => {
    try { await reload(); setState('in'); }
    catch (e) {
      // Suspended/maintenance/revoked: drop to login so the message can be shown there.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { await clearTokens(); setState('out'); }
      else setState('in'); // offline: keep the session, screens show their own errors
    }
  }, [reload]);

  useEffect(() => {
    setSessionLostHandler(() => { setProfile(null); setState('out'); });
    (async () => {
      const hw = await LocalAuth.hasHardwareAsync() && await LocalAuth.isEnrolledAsync();
      setAvail(hw);
      const bio = hw && (await SecureStore.getItemAsync(K_BIO)) === '1';
      setBio(bio);
      if (!(await hasStoredSession())) return setState('out');
      if (bio) return setState('locked');
      await finishSignIn();
    })();
  }, [finishSignIn]);

  const unlock = useCallback(async () => {
    const r = await LocalAuth.authenticateAsync({ promptMessage: 'Unlock', cancelLabel: 'Cancel', disableDeviceFallback: false });
    if (r.success) { await finishSignIn(); return true; }
    return false;
  }, [finishSignIn]);

  const login: Ctx['login'] = async (username, password, totp) => {
    const r = await request<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST', auth: false, body: { username, password, ...(totp ? { totp } : {}) },
    });
    await saveTokens(r.accessToken, r.refreshToken);
    await finishSignIn();
  };

  const logout = async () => {
    try { await request('/auth/logout', { method: 'POST' }); } catch {}
    await clearTokens(); await SecureStore.deleteItemAsync(K_BIO).catch(() => {});
    setBio(false); setProfile(null); setState('out');
  };

  const setBiometric = async (on: boolean) => {
    if (on) {
      const r = await LocalAuth.authenticateAsync({ promptMessage: 'Confirm to enable biometric unlock' });
      if (!r.success) return;
      await SecureStore.setItemAsync(K_BIO, '1');
    } else await SecureStore.deleteItemAsync(K_BIO);
    setBio(on);
  };

  return (
    <AuthCtx.Provider value={{ state, profile, biometricEnabled, biometricAvailable, login, logout, unlock, setBiometric, reload }}>
      {children}
    </AuthCtx.Provider>
  );
}
