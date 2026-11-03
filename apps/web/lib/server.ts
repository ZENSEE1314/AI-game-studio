import { cookies } from 'next/headers';

export const API_URL = process.env.API_URL ?? 'http://localhost:3000/api/v1';
export const ACCESS = 'at';
export const REFRESH = 'rt';

const base = () => ({
  httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/',
});

export async function setSession(access: string, refresh: string) {
  const c = await cookies();
  c.set(ACCESS, access, { ...base(), maxAge: 15 * 60 });
  c.set(REFRESH, refresh, { ...base(), maxAge: 30 * 24 * 3600 });
}
export async function clearSession() {
  const c = await cookies();
  c.delete(ACCESS); c.delete(REFRESH);
}
/** CSRF defence for state-changing requests: Origin must match Host (plus SameSite=Strict cookies). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try { return new URL(origin).host === host; } catch { return false; }
}
