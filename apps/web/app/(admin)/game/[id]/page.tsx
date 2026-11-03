'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

export default function Round() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null); const [num, setNum] = useState(''); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const load = useCallback(() => { api(`game/rounds/${id}`).then(setR).catch((e) => setErr(e.message)); }, [id]);
  useEffect(load, [load]);

  async function act(path: string, body?: unknown, ask?: string) {
    setErr(''); setNote('');
    if (ask && !confirm(ask)) return;
    try { await api(`game/rounds/${id}/${path}`, { method: 'POST', body: body ?? {} }); setNote(`${path} done`); load(); } catch (x: any) { setErr(x.message); }
  }
  if (!r) return <p>{err || 'Loading…'}</p>;
  const max = Math.max(1, ...(r.byNumber ?? []).map((b: any) => b.players));
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{r.name} <span className="text-base font-normal text-slate-500">{r.status}</span></h1>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}{note && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{note}</p>}
      <div className="flex flex-wrap items-end gap-2">
        {r.status === 'DRAFT' && <button className="btn btn-primary" onClick={() => act('open')}>Open for picks</button>}
        {r.status === 'OPEN' && <button className="btn btn-primary" onClick={() => act('lock', undefined, 'Lock the round? Players can no longer change picks.')}>Lock picks</button>}
        {(r.status === 'LOCKED' || r.status === 'RESULT_PENDING') && <>
          <input type="number" min={1} max={27} className="input w-28" placeholder="1–27" value={num} onChange={(e) => setNum(e.target.value)} />
          <button className="btn btn-ghost" disabled={!num} onClick={() => act('result', { number: Number(num) })}>Set result (preview)</button></>}
        {r.status === 'RESULT_PENDING' && <button className="btn btn-primary" onClick={() => act('publish', undefined, `Publish result ${r.pendingNumber}? This is final and cannot be changed.`)}>Publish result {r.pendingNumber}</button>}
        {['DRAFT', 'OPEN', 'LOCKED', 'RESULT_PENDING'].includes(r.status) && <button className="btn btn-danger" onClick={() => act('cancel', undefined, 'Cancel this round? All held credits are returned.')}>Cancel round</button>}
      </div>
      {r.status === 'RESULT_PENDING' && <div className="card"><h2 className="font-semibold">Preview: number {r.pendingNumber}</h2>
        <p className="text-sm text-slate-600">Winners if published: {r.previewWinners?.length ? r.previewWinners.map((w: any) => w.username).join(', ') : 'nobody picked this number'}</p></div>}
      {r.result && <div className="card"><h2 className="font-semibold">Published result: {r.result.number}</h2>
        <ul className="mt-1 text-sm">{r.winners?.length ? r.winners.map((w: any) => <li key={w.userId}>🏆 {w.fullName} (@{w.username}) — {Number(w.stake).toLocaleString()} credits on it</li>) : <li>No winners this round</li>}</ul></div>}
      <div className="card"><h2 className="mb-2 font-semibold">Picks by number</h2>
        <div className="space-y-1">{Array.from({ length: 27 }, (_, i) => i + 1).map((n) => { const b = r.byNumber?.find((x: any) => x.number === n); return (
          <div key={n} className="flex items-center gap-2 text-xs"><span className="w-6 text-right">{n}</span>
            <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-indigo-500" style={{ width: `${((b?.players ?? 0) / max) * 100}%` }} /></div>
            <span className="w-32 text-slate-500">{b ? `${b.players} player(s) · ${Number(b.stake).toLocaleString()}` : '—'}</span></div>); })}</div></div>
    </div>
  );
}
