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
  if (data.user?.role !== 'SUPER_ADMIN') {
    // Admin panel is Super Admin only; revoke the session we just created.
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${data.accessToken}` } });
    return NextResponse.json({ message: 'This panel is for Super Admin accounts only' }, { status: 403 });
  }
  await setSession(data.accessToken, data.refreshToken);
  return NextResponse.json({ user: data.user, twoFactorSetupRequired: data.twoFactorSetupRequired });
}
