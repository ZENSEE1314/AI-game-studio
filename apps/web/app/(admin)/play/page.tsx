'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

const NUMS = Array.from({ length: 27 }, (_, i) => i + 1);

export default function Play() {
  const [w, setW] = useState<any>(null); const [rounds, setRounds] = useState<any[]>([]); const [rid, setRid] = useState('');
  const [round, setRound] = useState<any>(null); const [picks, setPicks] = useState<Record<number, string>>({});
  const [board, setBoard] = useState<any[]>([]); const [hist, setHist] = useState<any[]>([]);
  const [err, setErr] = useState(''); const [note, setNote] = useState('');

  const loadAll = useCallback(() => {
    api('wallet/me').then(setW).catch((e) => setErr(e.message));
    api('game/rounds').then((rs: any[]) => { setRounds(rs); setRid((cur) => cur || rs.find((r) => r.status === 'OPEN')?.id || rs[0]?.id || ''); }).catch(() => {});
    api('game/leaderboard?limit=10').then(setBoard).catch(() => {});
    api('game/me/history').then(setHist).catch(() => {});
  }, []);
  useEffect(loadAll, [loadAll]);
  useEffect(() => {
    if (!rid) return;
    api(`game/rounds/${rid}`).then((r) => { setRound(r); setPicks(Object.fromEntries(r.mine.map((m: any) => [m.number, String(m.stake)]))); }).catch((e) => setErr(e.message));
  }, [rid]);

  const open = round?.status === 'OPEN'; const min = Number(round?.minStake ?? 0);
  const toggle = (n: number) => open && setPicks((p) => { const c = { ...p }; if (c[n] !== undefined) delete c[n]; else c[n] = String(min); return c; });
  const entries = Object.entries(picks).map(([n, s]) => ({ number: Number(n), stake: Number(s) }));
  const total = entries.reduce((a, e) => a + (Number.isFinite(e.stake) ? e.stake : 0), 0);
  const heldNow = (round?.mine ?? []).reduce((a: number, m: any) => a + Number(m.stake), 0);
  const afford = w ? total <= w.available + (open ? heldNow : 0) : false;
  const valid = entries.every((e) => Number.isInteger(e.stake) && e.stake >= min);

  async function save() {
    setErr(''); setNote('');
    try { await api(`game/rounds/${rid}/selections`, { method: 'POST', body: { picks: entries } }); setNote(entries.length ? 'Picks saved' : 'Picks cleared'); loadAll(); const r = await api(`game/rounds/${rid}`); setRound(r); }
    catch (e: any) { setErr(e.message); }
  }
  const winNum = round?.result?.number;
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Play</h1>
      <p className="text-xs text-slate-500">In-game credits have no cash value and cannot be bought, sold, transferred or withdrawn. Your credits are only held while a round is open and are always returned.</p>
      <div className="grid grid-cols-3 gap-3">
        {[['Available', w?.available], ['Held in open round', w?.held], ['Total', w?.total]].map(([k, v]) => <div key={k as string} className="card"><div className="text-sm text-slate-500">{k}</div><div className="text-xl font-semibold">{v === undefined ? '…' : Number(v).toLocaleString()}</div></div>)}</div>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}{note && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{note}</p>}
      <select className="input w-auto" value={rid} onChange={(e) => { setNote(''); setRid(e.target.value); }}>
        {rounds.length === 0 && <option>No rounds yet</option>}{rounds.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.status}</option>)}</select>
      {round && <div className="card space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{round.name}</h2><span className="text-sm text-slate-500">{round.status} · min {min.toLocaleString()} per number</span></div>
        {winNum && <p className="rounded bg-indigo-50 p-2 text-sm">Winning number: <b>{winNum}</b>. Winners: {round.winners?.length ? round.winners.map((x: any) => x.fullName).join(', ') : 'nobody'}</p>}
        <div className="grid grid-cols-9 gap-2">{NUMS.map((n) => { const on = picks[n] !== undefined; return (
          <button key={n} type="button" disabled={!open} aria-pressed={on} onClick={() => toggle(n)}
            className={`rounded-md border py-2 text-sm font-medium ${winNum === n ? 'ring-2 ring-indigo-500' : ''} ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'} disabled:opacity-60`}>{n}</button>); })}</div>
        {entries.length > 0 && <div className="space-y-1">{entries.map((e) => (
          <div key={e.number} className="flex items-center gap-2 text-sm"><span className="w-16">Number {e.number}</span>
            <input className="input w-36" inputMode="numeric" disabled={!open} value={picks[e.number]} onChange={(ev) => setPicks({ ...picks, [e.number]: ev.target.value.replace(/\D/g, '') })} aria-label={`credits for ${e.number}`} />
            {open && <button className="text-xs text-red-600" onClick={() => toggle(e.number)}>remove</button>}</div>))}</div>}
        {open && <div className="flex items-center gap-3"><button className="btn btn-primary" disabled={!valid || !afford} onClick={save}>{entries.length ? `Save picks (${total.toLocaleString()} credits held)` : 'Clear my picks'}</button>
          {!afford && <span className="text-sm text-red-600">Not enough credits</span>}{!valid && <span className="text-sm text-red-600">Each number needs at least {min.toLocaleString()}</span>}</div>}
        {!open && round.status !== 'COMPLETED' && <p className="text-sm text-slate-500">Picks are {round.status === 'CANCELLED' ? 'closed (round cancelled)' : 'locked'}.</p>}
      </div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h2 className="mb-2 font-semibold">Leaderboard (rounds won)</h2>
          {board.length === 0 ? <p className="text-sm text-slate-500">No winners yet</p> : <ol className="space-y-1 text-sm">{board.map((b) => <li key={b.userId}>#{b.rank} {b.fullName} (@{b.username}) — {b.wins} win(s)</li>)}</ol>}</div>
        <div className="card"><h2 className="mb-2 font-semibold">My history</h2>
          {hist.length === 0 ? <p className="text-sm text-slate-500">No picks yet</p> : <ul className="space-y-1 text-sm">{hist.slice(0, 15).map((h, i) => <li key={i}>{h.round}: #{h.number} ({Number(h.stake).toLocaleString()}) {h.won === true ? '🏆 won' : h.won === false ? '— not this time' : `· ${h.status.toLowerCase()}`}</li>)}</ul>}</div>
      </div>
    </div>
  );
}
