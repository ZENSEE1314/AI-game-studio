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
  await setSession(data.accessToken, data.refreshToken);
  return NextResponse.json({ user: data.user, twoFactorSetupRequired: data.twoFactorSetupRequired });
}
