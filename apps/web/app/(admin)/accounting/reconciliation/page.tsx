'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChartAccount, api, money } from '@/lib/client';

export default function Recons() {
  const [status, setStatus] = useState<any[]>([]); const [list, setList] = useState<any[]>([]); const [cash, setCash] = useState<ChartAccount[]>([]); const [err, setErr] = useState('');
  const load = useCallback(() => {
    api('accounting/reconciliations/status').then(setStatus).catch((e) => setErr(e.message));
    api('accounting/reconciliations').then(setList).catch(() => {});
    api('accounting/accounts').then((a: ChartAccount[]) => setCash(a.filter((x) => x.isCash))).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr('');
    try { const r = await api('accounting/reconciliations', { method: 'POST', body: Object.fromEntries(new FormData(e.currentTarget)) }); window.location.href = `/accounting/reconciliation/${r.id}`; }
    catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Bank reconciliation</h1>
      {err && <p className="text-red-600" role="alert">{err}</p>}
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
        <thead className="border-b bg-slate-50 text-left text-slate-500"><tr>{['Cash account', 'Book balance', 'Unreconciled lines', 'Last reconciled'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{status.map((s) => <tr key={s.accountId} className="border-b last:border-0"><td className="px-3 py-2">{s.code} {s.name}</td><td className="px-3 py-2">{money(s.bookBalance)}</td>
          <td className={`px-3 py-2 ${s.unreconciledLines ? 'text-amber-700' : ''}`}>{s.unreconciledLines}</td><td className="px-3 py-2">{s.lastReconciledDate ? String(s.lastReconciledDate).slice(0, 10) : 'never'}</td></tr>)}
          {!status.length && <tr><td colSpan={4} className="px-3 py-4 text-slate-500">No cash accounts. Mark an asset account as “cash” under Chart & Periods.</td></tr>}</tbody></table></div>
      <form onSubmit={start} className="card grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select name="accountId" className="input" required><option value="">Cash account…</option>{cash.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
        <input name="statementDate" type="date" className="input" required />
        <input name="statementBalance" className="input" placeholder="Statement ending balance" inputMode="decimal" required />
        <button className="btn btn-primary">Start reconciliation</button>
      </form>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><tbody>{list.map((r) => (
        <tr key={r.id} className="border-b last:border-0"><td className="px-3 py-2"><Link className="text-indigo-600 hover:underline" href={`/accounting/reconciliation/${r.id}`}>{r.account.code} {r.account.name}</Link></td>
          <td className="px-3 py-2">{String(r.statementDate).slice(0, 10)}</td><td className="px-3 py-2">{money(r.statementBalance)}</td><td className="px-3 py-2">{r._count.items} cleared</td><td className="px-3 py-2">{r.status}</td></tr>))}</tbody></table></div>
    </div>
  );
}
