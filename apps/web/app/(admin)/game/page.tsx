'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Rounds() {
  const [rounds, setRounds] = useState<any[]>([]); const [err, setErr] = useState('');
  const load = useCallback(() => { api('game/rounds').then(setRounds).catch((e) => setErr(e.message)); }, []);
  useEffect(load, [load]);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(''); const form = e.currentTarget; const f = new FormData(form);
    try { await api('game/rounds', { method: 'POST', body: { name: f.get('name'), minStake: Number(f.get('minStake')) } }); form.reset(); load(); } catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Game rounds</h1>
      <form onSubmit={create} className="card grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input name="name" className="input sm:col-span-2" placeholder="Round name" required minLength={2} />
        <input name="minStake" type="number" min={1} defaultValue={10000} className="input" title="Minimum credits per selected number" />
        <button className="btn btn-primary">Create round</button>
      </form>
      {err && <p className="text-red-600" role="alert">{err}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
        <thead className="border-b bg-slate-50 text-left text-slate-500"><tr>{['Round', 'Status', 'Min per number', 'Picks', 'Result', 'Created'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rounds.map((r) => (<tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
          <td className="px-3 py-2"><Link className="text-indigo-600 hover:underline" href={`/game/${r.id}`}>{r.name}</Link></td><td className="px-3 py-2">{r.status}</td>
          <td className="px-3 py-2">{Number(r.minStake).toLocaleString()}</td><td className="px-3 py-2">{r._count.selections}</td><td className="px-3 py-2">{r.result?.number ?? '—'}</td><td className="px-3 py-2">{fmt(r.createdAt)}</td></tr>))}
          {!rounds.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No rounds yet</td></tr>}</tbody></table></div>
    </div>
  );
}
