'use client';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Profile() {
  const [me, setMe] = useState<any>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  useEffect(() => { api('auth/me').then(setMe).catch((e) => setErr(e.message)); }, []);

  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(''); setNote('');
    const form = e.currentTarget; const f = new FormData(form);
    if (f.get('newPassword') !== f.get('confirm')) { setErr('New passwords do not match'); return; }
    try { await api('auth/change-password', { method: 'POST', body: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') } }); setNote('Password changed. Other devices were signed out.'); form.reset(); }
    catch (x: any) { setErr(x.message); }
  }
  const [tf, setTf] = useState<{ secret: string; otpauthUrl: string } | null>(null); const [tfErr, setTfErr] = useState(''); const [tfOk, setTfOk] = useState(false);
  async function setup2fa() { setTfErr(''); try { setTf(await api('auth/2fa/setup', { method: 'POST', body: {} })); } catch (e: any) { setTfErr(e.message); } }
  async function enable2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setTfErr(''); const code = String(new FormData(e.currentTarget).get('code'));
    try { await api('auth/2fa/enable', { method: 'POST', body: { code } }); setTfOk(true); setTf(null); setMe({ ...me, totpEnabled: true }); } catch (x: any) { setTfErr(x.message); }
  }
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">My profile</h1>
      {me?.mustChangePassword && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">Your password is temporary. Change it below before you can use the panel.</p>}
      {me?.role === 'SUPER_ADMIN' && !me.totpEnabled && !tfOk && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">Two-factor authentication is not enabled on this administrator account. Set it up below.</p>}
      {me && <dl className="card grid grid-cols-2 gap-2 text-sm">
        {[['Name', me.fullName], ['Username', me.username], ['Level', me.role], ['Email', me.email], ['Phone', me.phone ?? '—'], ['Last login', fmt(me.lastLogin)]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>)}</dl>}
      {me?.role === 'SUPER_ADMIN' && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Two-factor authentication</h2>
          {me.totpEnabled || tfOk ? <p className="text-sm text-green-700">Enabled. You will be asked for a code from your authenticator app at every sign-in.</p> : !tf ? (
            <button className="btn btn-primary" onClick={setup2fa}>Set up authenticator app</button>) : (
            <form onSubmit={enable2fa} className="space-y-2">
              <p className="text-sm">Add this key to an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.</p>
              <code className="block break-all rounded bg-slate-100 p-2 text-sm" data-testid="totp-secret">{tf.secret}</code>
              <a className="text-xs text-indigo-600" href={tf.otpauthUrl}>Open in authenticator app</a>
              <input name="code" className="input" inputMode="numeric" maxLength={6} placeholder="6-digit code" required />
              <button className="btn btn-primary">Enable two-factor</button>
            </form>)}
          {tfErr && <p className="text-sm text-red-600" role="alert">{tfErr}</p>}
        </div>)}
      <form onSubmit={change} className="card space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <input name="currentPassword" type="password" className="input" placeholder="Current password" autoComplete="current-password" required />
        <input name="newPassword" type="password" minLength={10} className="input" placeholder="New password (min 10 characters)" autoComplete="new-password" required />
        <input name="confirm" type="password" className="input" placeholder="Repeat new password" autoComplete="new-password" required />
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}{note && <p className="text-sm text-green-700">{note}</p>}
        <button className="btn btn-primary">Change password</button>
      </form>
    </div>
  );
}
