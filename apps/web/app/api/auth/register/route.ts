import { NextResponse } from 'next/server';
import { API_URL, sameOrigin } from '@/lib/server';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ message: 'Bad origin' }, { status: 403 });
  const r = await fetch(`${API_URL}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await req.text() });
  return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
}
