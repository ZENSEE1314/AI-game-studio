'use client';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Profile() {
  const [me, setMe] = useState<any>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  useEffect(() => { api('auth/me').then(setMe).catch((e) => setErr(e.message)); }, []);

  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(''); setNote('');
    const f = new FormData(e.currentTarget);
    if (f.get('newPassword') !== f.get('confirm')) { setErr('New passwords do not match'); return; }
    try { await api('auth/change-password', { method: 'POST', body: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') } }); setNote('Password changed. Other devices were signed out.'); e.currentTarget.reset(); }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">My profile</h1>
      {me && <dl className="card grid grid-cols-2 gap-2 text-sm">
        {[['Name', me.fullName], ['Username', me.username], ['Level', me.role], ['Email', me.email], ['Phone', me.phone ?? '—'], ['Last login', fmt(me.lastLogin)]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>)}</dl>}
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
