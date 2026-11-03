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
  if (!r.ok) {
    const m = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(r.status, m ?? `Request failed (${r.status})`, data);
  }
  return data as T;
}
export type Account = {
  id: string; username: string; email: string; phone: string | null; fullName: string; role: string;
  parentId: string | null; status: 'ACTIVE' | 'SUSPENDED'; suspendedAt: string | null;
  suspensionReason: string | null; lastLogin: string | null; createdAt: string;
};
export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—');
