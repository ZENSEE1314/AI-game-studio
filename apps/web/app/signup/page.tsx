'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function Form() {
  const sp = useSearchParams();
  const [ref, setRef] = useState((sp.get('ref') ?? '').toUpperCase());
  const [who, setWho] = useState<{ valid: boolean; staffName?: string } | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWho(null);
    if (!/^[A-Za-z0-9]{4,16}$/.test(ref)) return;
    const t = setTimeout(() => fetch(`/api/auth/referral/${ref}`).then((r) => r.json()).then(setWho).catch(() => setWho(null)), 300);
    return () => clearTimeout(t);
  }, [ref]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr('');
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (f.password !== f.confirm) { setErr('Passwords do not match'); return; }
    const body: Record<string, string> = { username: f.username, fullName: f.fullName, email: f.email, password: f.password, referralCode: ref.trim() };
    if (f.phone) body.phone = f.phone;
    setBusy(true);
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setErr(Array.isArray(d.message) ? d.message.join(', ') : d.message ?? 'Sign-up failed'); return; }
    // Sign in straight away.
    const l = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: f.username, password: f.password }) });
    setBusy(false);
    window.location.href = l.ok ? '/play' : '/login';
  }

  return (
    <main className="mx-auto my-10 max-w-md px-4">
      <form onSubmit={submit} className="card space-y-3">
        <h1 className="text-lg font-semibold">Create your account</h1>
        <div>
          <input className="input uppercase" placeholder="Referral code" value={ref} onChange={(e) => setRef(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} maxLength={16} required aria-label="Referral code" />
          {who?.valid && <p className="mt-1 text-sm text-green-700" data-testid="joining">You are joining <b>{who.staffName}</b>&apos;s team.</p>}
          {who && !who.valid && <p className="mt-1 text-sm text-red-600">This referral code is not valid.</p>}
          {!ref && <p className="mt-1 text-xs text-slate-500">Ask your staff contact for their referral link or code.</p>}
        </div>
        <input name="fullName" className="input" placeholder="Full name" required />
        <input name="username" className="input" placeholder="Username (3–32 letters, digits, . _ -)" pattern="[a-zA-Z0-9_.\-]{3,32}" autoComplete="username" required />
        <input name="email" type="email" className="input" placeholder="Email" autoComplete="email" required />
        <input name="phone" className="input" placeholder="Phone (optional, digits only)" pattern="\+?[0-9]{8,15}" inputMode="tel" />
        <input name="password" type="password" className="input" placeholder="Password (min 10 characters)" minLength={10} autoComplete="new-password" required />
        <input name="confirm" type="password" className="input" placeholder="Repeat password" autoComplete="new-password" required />
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy || who?.valid === false}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-600">Already registered? <a className="text-indigo-600 hover:underline" href="/login">Sign in</a></p>
        <p className="text-xs text-slate-500">In-game credits have no cash value and cannot be bought, sold or withdrawn.</p>
      </form>
    </main>
  );
}
export default function Signup() { return <Suspense><Form /></Suspense>; }
