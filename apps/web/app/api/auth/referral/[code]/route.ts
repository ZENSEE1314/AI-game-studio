import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/server';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await fetch(`${API_URL}/auth/referral/${encodeURIComponent(code.slice(0, 16))}`);
  return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
}
