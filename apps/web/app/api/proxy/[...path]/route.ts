import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS, API_URL, REFRESH, clearSession, sameOrigin, setSession } from '@/lib/server';

/** Backend-for-frontend: tokens never reach browser JS; the API still enforces all authorization. */
async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const isWrite = !['GET', 'HEAD'].includes(req.method);
  if (isWrite && !sameOrigin(req)) return NextResponse.json({ message: 'Bad origin' }, { status: 403 });

  const url = `${API_URL}/${path.map(encodeURIComponent).join('/')}${new URL(req.url).search}`;
  const body = isWrite ? await req.text() : undefined;
  const jar = await cookies();
  const call = (token?: string) => fetch(url, {
    method: req.method, body,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

  let r = await call(jar.get(ACCESS)?.value);
  if (r.status === 401 && jar.get(REFRESH)?.value) {
    const rr = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: jar.get(REFRESH)!.value }),
    });
    if (rr.ok) {
      const t = await rr.json();
      await setSession(t.accessToken, t.refreshToken);
      r = await call(t.accessToken);
    } else {
      await clearSession();
    }
  }
  return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json' } });
}
export { handle as GET, handle as POST, handle as PUT };
