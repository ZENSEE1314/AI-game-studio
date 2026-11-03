'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

const count = (q: string) => api(`accounts?limit=1&${q}`).then((r) => r.total as number);

const LEVELS = ['AGENCY', 'AGENT', 'STAFF', 'USER'] as const;
const BELOW: Record<string, readonly string[]> = { SUPER_ADMIN: LEVELS, AGENCY: ['AGENT', 'STAFF', 'USER'], AGENT: ['STAFF', 'USER'], STAFF: ['USER'] };
const LABEL: Record<string, string> = { AGENCY: 'Agencies', AGENT: 'Agents', STAFF: 'Staff', USER: 'Users' };

export default function Dashboard() {
  const [role, setRole] = useState(''); const [name, setName] = useState('');
  const [d, setD] = useState<Record<string, number> | null>(null);
  const [sys, setSys] = useState<{ status: string; message: string | null } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const me = await api('auth/me'); setRole(me.role); setName(me.fullName);
      const levels = BELOW[me.role] ?? [];
      const [counts, active, suspended, s] = await Promise.all([
        Promise.all(levels.map((r) => count(`role=${r}`))), count('status=ACTIVE'), count('status=SUSPENDED'), api('system/status'),
      ]);
      setD({ ...Object.fromEntries(levels.map((r, i) => [r, counts[i]])), active, suspended }); setSys(s);
    })().catch((e) => setErr(e.message));
  }, []);

  const levels = BELOW[role] ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{name ? `Welcome, ${name}` : 'Dashboard'}</h1>
      {err && <p className="text-red-600">{err}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {levels.map((r) => (
          <a key={r} href={`/accounts?role=${r}`} className="card hover:border-indigo-300"><div className="text-sm text-slate-500">{LABEL[r]}</div>
            <div className="text-2xl font-semibold">{d ? d[r] : '…'}</div></a>))}
        <div className="card"><div className="text-sm text-slate-500">Active accounts</div><div className="text-2xl font-semibold">{d ? d.active : '…'}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Suspended accounts</div><div className="text-2xl font-semibold">{d ? d.suspended : '…'}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Application status</div>
          <div className={`text-2xl font-semibold ${sys?.status === 'ACTIVE' ? 'text-green-600' : 'text-amber-600'}`}>{sys?.status ?? '…'}</div></div>
      </div>
    </div>
  );
}
