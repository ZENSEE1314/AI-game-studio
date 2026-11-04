'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

export default function Credits() {
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const load = useCallback(() => { api(`wallet/balances?page=${page}&limit=25${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(setData).catch((e) => setErr(e.message)); }, [page, search]);
  useEffect(load, [load]);

  async function grant(userId: string, name: string) {
    setErr(''); setNote('');
    const v = window.prompt(`Grant how many in-game credits to ${name}?`); if (!v) return;
    const amount = Number(v); if (!Number.isInteger(amount) || amount < 1) { setErr('Enter a whole number of credits'); return; }
    try { await api('wallet/grant', { method: 'POST', body: { userId, amount, idempotencyKey: crypto.randomUUID(), note: 'admin grant' } }); setNote(`Granted ${amount.toLocaleString()} credits to ${name}`); load(); }
    catch (e: any) { setErr(e.message); }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">In-game credits</h1>
      <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Credits are for the internal game only. They have no cash value and cannot be bought, sold, transferred or withdrawn. Only Super Admin can grant them.</p>
      <input className="input sm:max-w-xs" placeholder="Search username or name…" onKeyDown={(e) => e.key === 'Enter' && (setPage(1), setSearch((e.target as HTMLInputElement).value))} />
      {err && <p className="text-red-600" role="alert">{err}</p>}{note && <p className="text-green-700">{note}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
        <thead className="border-b bg-slate-50 text-left text-slate-500"><tr>{['User', 'Level', 'Available', 'Held in open round', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{data?.items.map((u) => (<tr key={u.id} className="border-b last:border-0"><td className="px-3 py-2">{u.username} <span className="text-slate-500">{u.fullName}</span></td><td className="px-3 py-2">{u.role}</td>
          <td className="px-3 py-2">{Number(u.available).toLocaleString()}</td><td className="px-3 py-2">{Number(u.held).toLocaleString()}</td>
          <td className="px-3 py-2 text-right"><button className="btn btn-ghost" onClick={() => grant(u.id, u.username)}>Grant credits</button></td></tr>))}</tbody></table></div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page} / {pages}</span>
        <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
