'use client';
import { useState } from 'react';

export default function Login() {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr('');
    const f = new FormData(e.currentTarget);
    const totp = String(f.get('totp') ?? '');
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: f.get('username'), password: f.get('password'), ...(totp ? { totp } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { window.location.href = '/dashboard'; return; }
    if (/two-factor/i.test(d.message ?? '')) setNeedTotp(true);
    setErr(Array.isArray(d.message) ? d.message.join(', ') : d.message ?? 'Login failed');
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form onSubmit={submit} className="card space-y-3">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <input name="username" className="input" placeholder="Username" autoComplete="username" required />
        <input name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" required />
        {needTotp && <input name="totp" className="input" placeholder="6-digit 2FA code" inputMode="numeric" maxLength={6} />}
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-600">New here? <a className="text-indigo-600 hover:underline" href="/signup">Create an account</a></p>
      </form>
    </main>
  );
}
