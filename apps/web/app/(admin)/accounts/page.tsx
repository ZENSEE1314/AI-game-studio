'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Account, api, fmt } from '@/lib/client';

const ROLES = ['AGENCY', 'AGENT', 'STAFF', 'USER'];
const PARENT: Record<string, string> = { AGENCY: 'SUPER_ADMIN', AGENT: 'AGENCY', STAFF: 'AGENT', USER: 'STAFF' };

function Badge({ s }: { s: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${s === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{s}</span>;
}

const CREATABLE: Record<string, string[]> = { SUPER_ADMIN: ROLES, AGENCY: ['AGENT'], AGENT: ['STAFF'], STAFF: ['USER'] };

function CreateForm({ actorRole, defaultRole, onDone }: { actorRole: string; defaultRole: string; onDone: () => void }) {
  const allowed = CREATABLE[actorRole] ?? [];
  const isAdmin = actorRole === 'SUPER_ADMIN';
  const [role, setRole] = useState(allowed.includes(defaultRole) ? defaultRole : allowed[0] ?? 'AGENCY');
  const [parents, setParents] = useState<Account[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    const pr = PARENT[role];
    if (!isAdmin || pr === 'SUPER_ADMIN') { setParents([]); return; }
    api(`accounts?role=${pr}&limit=100`).then((r) => setParents(r.items));
  }, [role]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr('');
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!f.phone) delete f.phone;
    try { await api('accounts', { method: 'POST', body: { ...f, role } }); onDone(); }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <form onSubmit={submit} className="card grid grid-cols-2 gap-3">
      <select value={role} onChange={(e) => setRole(e.target.value)} className="input">{allowed.map((r) => <option key={r}>{r}</option>)}</select>
      {!isAdmin ? <div className="self-center text-sm text-slate-500">Will be created under your account</div> : PARENT[role] !== 'SUPER_ADMIN'
        ? <select name="parentId" className="input" required><option value="">Parent {PARENT[role]}…</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.username} ({p.fullName})</option>)}</select>
        : <div className="self-center text-sm text-slate-500">Parent: Super Admin</div>}
      <input name="username" className="input" placeholder="Username" required />
      <input name="fullName" className="input" placeholder="Full name" required />
      <input name="email" type="email" className="input" placeholder="Email" required />
      <input name="phone" className="input" placeholder="Phone (optional)" />
      <input name="password" type="password" minLength={10} className="input col-span-2" placeholder="Password (min 10 chars)" required />
      {err && <p className="col-span-2 text-sm text-red-600">{err}</p>}
      <button className="btn btn-primary col-span-2">Create account</button>
    </form>
  );
}

function List() {
  const sp = useSearchParams(); const router = useRouter();
  const role = sp.get('role') ?? ''; const status = sp.get('status') ?? ''; const search = sp.get('search') ?? '';
  const page = Math.max(1, +(sp.get('page') ?? 1));
  const [data, setData] = useState<{ items: Account[]; total: number } | null>(null);
  const [err, setErr] = useState(''); const [creating, setCreating] = useState(false);
  const [me, setMe] = useState<{ role: string } | null>(null);
  useEffect(() => { api('auth/me').then(setMe).catch(() => {}); }, []);
  const limit = 25;

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (role) q.set('role', role); if (status) q.set('status', status); if (search) q.set('search', search);
    api(`accounts?${q}`).then(setData).catch((e) => setErr(e.message));
  }, [role, status, search, page]);
  useEffect(load, [load]);

  const set = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString()); v ? q.set(k, v) : q.delete(k); if (k !== 'page') q.delete('page');
    router.push(`/accounts?${q}`);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{role ? `${role[0]}${role.slice(1).toLowerCase()} accounts` : 'All accounts'}</h1>
        <div className="flex gap-2">
          <a className="btn btn-ghost" href={`/api/proxy/accounts/export.csv?${new URLSearchParams(Object.entries({ role, status, search }).filter(([, v]) => v) as [string, string][])}`}>Export CSV</a>
          {me && (CREATABLE[me.role]?.length ?? 0) > 0 && <button className="btn btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Close' : `New ${CREATABLE[me.role].length === 1 ? CREATABLE[me.role][0].toLowerCase() : 'account'}`}</button>}
        </div>
      </div>
      {creating && me && <CreateForm actorRole={me.role} defaultRole={role || 'AGENCY'} onDone={() => { setCreating(false); load(); }} />}
      <div className="flex flex-wrap gap-2">
        <input defaultValue={search} placeholder="Search username, email, name…" className="input max-w-xs"
          onKeyDown={(e) => e.key === 'Enter' && set('search', (e.target as HTMLInputElement).value)} />
        <select value={role} onChange={(e) => set('role', e.target.value)} className="input w-auto"><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        <select value={status} onChange={(e) => set('status', e.target.value)} className="input w-auto"><option value="">Any status</option><option>ACTIVE</option><option>SUSPENDED</option></select>
      </div>
      {err && <p className="text-red-600">{err}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-500"><tr>{['Username', 'Name', 'Role', 'Status', 'Last login', 'Created'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2"><Link className="text-indigo-600 hover:underline" href={`/accounts/${a.id}`}>{a.username}</Link></td>
                <td className="px-3 py-2">{a.fullName}</td><td className="px-3 py-2">{a.role}</td>
                <td className="px-3 py-2"><Badge s={a.status} /></td>
                <td className="px-3 py-2">{fmt(a.lastLogin)}</td><td className="px-3 py-2">{fmt(a.createdAt)}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No accounts found</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>{data?.total ?? 0} accounts</span>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Prev</button>
          <span>Page {page} / {pages}</span>
          <button className="btn btn-ghost" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>Next</button>
        </div>
      </div>
    </div>
  );
}
export default function Accounts() { return <Suspense><List /></Suspense>; }
