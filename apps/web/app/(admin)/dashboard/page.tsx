'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

const count = (q: string) => api(`accounts?limit=1&${q}`).then((r) => r.total as number);

export default function Dashboard() {
  const [d, setD] = useState<Record<string, number> | null>(null);
  const [sys, setSys] = useState<{ status: string; message: string | null } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      count('role=AGENCY'), count('role=AGENT'), count('role=STAFF'), count('role=USER'),
      count('status=ACTIVE'), count('status=SUSPENDED'), api('system/status'),
    ]).then(([agencies, agents, staff, users, active, suspended, s]) => {
      setD({ agencies, agents, staff, users, active, suspended }); setSys(s);
    }).catch((e) => setErr(e.message));
  }, []);

  const tiles: [string, string][] = [
    ['Agencies', 'agencies'], ['Agents', 'agents'], ['Staff', 'staff'], ['Users', 'users'],
    ['Active accounts', 'active'], ['Suspended accounts', 'suspended'],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      {err && <p className="text-red-600">{err}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map(([label, k]) => (
          <div key={k} className="card"><div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{d ? d[k] : '…'}</div></div>
        ))}
        <div className="card"><div className="text-sm text-slate-500">Application status</div>
          <div className={`text-2xl font-semibold ${sys?.status === 'ACTIVE' ? 'text-green-600' : 'text-amber-600'}`}>{sys?.status ?? '…'}</div></div>
      </div>
    </div>
  );
}
