export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) { super(message); }
}
export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`/api/proxy/${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (r.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
  // Server says this account must finish onboarding first: send them to the profile page.
  if (r.status === 403 && ['PASSWORD_CHANGE_REQUIRED', 'TWO_FACTOR_REQUIRED'].includes(data?.code) && typeof window !== 'undefined' && !window.location.pathname.startsWith('/profile')) window.location.href = '/profile';
  if (!r.ok) {
    const m = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(r.status, m ?? `Request failed (${r.status})`, data);
  }
  return data as T;
}
export type Account = {
  id: string; username: string; email: string; phone: string | null; fullName: string; role: string;
  parentId: string | null; status: 'ACTIVE' | 'SUSPENDED'; suspendedAt: string | null;
  suspensionReason: string | null; lastLogin: string | null; createdAt: string; referralCode?: string | null;
};
export type ChartAccount = { id: string; code: string; name: string; class: string; isActive: boolean; isCash: boolean; cashFlowActivity: string | null };
export const money = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
