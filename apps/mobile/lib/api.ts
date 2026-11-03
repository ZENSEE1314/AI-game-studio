import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const K_ACCESS = 'access', K_REFRESH = 'refresh';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

let access: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};
export const setSessionLostHandler = (fn: () => void) => { onSessionLost = fn; };

export async function saveTokens(a: string, r: string) {
  access = a;
  await SecureStore.setItemAsync(K_ACCESS, a);
  await SecureStore.setItemAsync(K_REFRESH, r);
}
export async function clearTokens() {
  access = null;
  await SecureStore.deleteItemAsync(K_ACCESS).catch(() => {});
  await SecureStore.deleteItemAsync(K_REFRESH).catch(() => {});
}
export async function hasStoredSession() {
  return !!(await SecureStore.getItemAsync(K_REFRESH));
}
async function loadAccess() {
  if (!access) access = await SecureStore.getItemAsync(K_ACCESS);
  return access;
}

/** One refresh at a time; concurrent 401s share the same attempt. Refresh tokens rotate. */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const rt = await SecureStore.getItemAsync(K_REFRESH);
      if (!rt) return false;
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return false;
      const t = await r.json();
      await saveTokens(t.accessToken, t.refreshToken);
      return true;
    } catch { return false; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function request<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const call = async () => fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(opts.auth !== false && (await loadAccess()) ? { authorization: `Bearer ${await loadAccess()}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let r: Response;
  try { r = await call(); } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.'); }
  if (r.status === 401 && opts.auth !== false) {
    if (await refresh()) r = await call();
    else { await clearTokens(); onSessionLost(); }
  }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(r.status, msg ?? `Request failed (${r.status})`, data?.code);
  }
  return data as T;
}
