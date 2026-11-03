'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Admins() {
  const [list, setList] = useState<any[]>([]); const [me, setMe] = useState<any>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const load = useCallback(() => { api('admins').then(setList).catch((e) => setErr(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => { api('auth/me').then(setMe).catch(() => {}); }, []);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(''); setNote(''); const form = e.currentTarget; const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try { await api('admins', { method: 'POST', body: f }); form.reset(); setNote(`Administrator ${f.username} created. Give them the temporary password through a secure channel; they must change it at first sign-in.`); load(); }
    catch (x: any) { setErr(x.message); }
  }
  async function act(a: any, kind: 'suspend' | 'reactivate') {
    setErr(''); setNote('');
    const reason = window.prompt(`Reason to ${kind} ${a.username} (min 5 characters):`); if (!reason) return;
    const currentPassword = window.prompt('Confirm with YOUR password:'); if (!currentPassword) return;
    try { await api(`admins/${a.id}/${kind}`, { method: 'POST', body: { reason, currentPassword } }); setNote(`${a.username} ${kind === 'suspend' ? 'suspended; their sessions were revoked' : 'reactivated'}`); load(); }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Administrators</h1>
      <p className="text-sm text-slate-600">Administrators have full access. A second administrator lets accounting entries and reconciliations be approved by someone other than their creator.</p>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}{note && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{note}</p>}
      <form onSubmit={create} className="card grid grid-cols-2 gap-2">
        <h2 className="col-span-2 font-semibold">Add administrator</h2>
        <input name="username" className="input" placeholder="Username" required /><input name="fullName" className="input" placeholder="Full name" required />
        <input name="email" type="email" className="input" placeholder="Email" required />
        <input name="temporaryPassword" type="password" minLength={12} className="input" placeholder="Temporary password (min 12)" autoComplete="new-password" required />
        <input name="currentPassword" type="password" className="input col-span-2" placeholder="Your password (to confirm)" autoComplete="current-password" required />
        <button className="btn btn-primary col-span-2">Create administrator</button>
      </form>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
        <thead className="border-b bg-slate-50 text-left text-slate-500"><tr>{['Administrator', 'Status', '2FA', 'Last login', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.map((a) => (<tr key={a.id} className="border-b last:border-0">
          <td className="px-3 py-2">{a.username} <span className="text-slate-500">{a.fullName}</span>{a.mustChangePassword && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">temp password</span>}</td>
          <td className="px-3 py-2">{a.status}</td><td className="px-3 py-2">{a.totpEnabled ? 'on' : 'off'}</td><td className="px-3 py-2">{fmt(a.lastLogin)}</td>
          <td className="px-3 py-2 text-right">{a.id !== me?.id && (a.status === 'ACTIVE' ? <button className="btn btn-danger" onClick={() => act(a, 'suspend')}>Suspend</button> : <button className="btn btn-ghost" onClick={() => act(a, 'reactivate')}>Reactivate</button>)}</td></tr>))}</tbody></table></div>
    </div>
  );
}
