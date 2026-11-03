import { NextResponse } from 'next/server';
import { API_URL, sameOrigin, setSession } from '@/lib/server';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ message: 'Bad origin' }, { status: 403 });
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': req.headers.get('user-agent') ?? '' },
    body: await req.text(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json(data, { status: r.status });
  if (!['SUPER_ADMIN', 'AGENCY', 'AGENT', 'STAFF'].includes(data.user?.role)) {
    // End users use the mobile app; revoke the session we just created.
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${data.accessToken}` } });
    return NextResponse.json({ message: 'Users sign in with the mobile app' }, { status: 403 });
  }
  await setSession(data.accessToken, data.refreshToken);
  return NextResponse.json({ user: data.user, twoFactorSetupRequired: data.twoFactorSetupRequired });
}
