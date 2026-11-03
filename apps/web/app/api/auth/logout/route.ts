import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS, API_URL, clearSession, sameOrigin } from '@/lib/server';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ message: 'Bad origin' }, { status: 403 });
  const at = (await cookies()).get(ACCESS)?.value;
  if (at) await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${at}` } }).catch(() => {});
  await clearSession();
  return NextResponse.json({ ok: true });
}
