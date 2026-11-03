'use client';
import { useEffect, useState } from 'react';
import { api, money } from '@/lib/client';

const today = new Date().toISOString().slice(0, 10);
type Kind = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow';

export default function Reports() {
  const [kind, setKind] = useState<Kind>('trial-balance');
  const [from, setFrom] = useState(today.slice(0, 4) + '-01-01'); const [to, setTo] = useState(today);
  const [res, setRes] = useState<{ key: string; data: any } | null>(null); const [err, setErr] = useState('');
  const ranged = kind === 'income-statement' || kind === 'cash-flow';
  const q = ranged ? `from=${from}&to=${to}` : `asOf=${to}`;
  const key = `${kind}?${q}`;
  useEffect(() => { setErr(''); api(`accounting/reports/${key}`).then((data) => setRes({ key, data })).catch((e) => setErr(e.message)); }, [key]);
  // Only render data that belongs to the selected report; a stale result of another kind has a different shape.
  const r = res && res.key.startsWith(kind + '?') ? res.data : null;

  const Section = ({ title, rows, total }: { title: string; rows: any[]; total?: string }) => (
    <><tr className="bg-slate-50"><td colSpan={2} className="px-3 py-1 font-medium">{title}</td></tr>
      {rows.map((l) => <tr key={l.code}><td className="px-3 py-1">{l.code} {l.name}</td><td className="px-3 py-1 text-right">{money(l.amount)}</td></tr>)}
      {total !== undefined && <tr className="font-medium"><td className="px-3 py-1">Total {title.toLowerCase()}</td><td className="px-3 py-1 text-right">{money(total)}</td></tr>}</>);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Financial reports</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="trial-balance">Trial balance</option><option value="income-statement">Profit & loss</option><option value="balance-sheet">Balance sheet</option><option value="cash-flow">Cash flow</option></select>
        {ranged && <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />}
        <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <a className="btn btn-ghost" href={`/api/proxy/accounting/reports/${kind}/export.csv?${q}`}>Export CSV</a>
      </div>
      <p className="text-xs text-slate-500">Posted entries only. Excel and PDF export are not available yet.</p>
      {err && <p className="text-red-600">{err}</p>}
      {r && <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><tbody>
        {kind === 'trial-balance' && <>
          <tr className="border-b text-left text-slate-500"><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr>
          {r.lines.map((l: any) => <tr key={l.code}><td className="px-3 py-1">{l.code} {l.name}</td><td className="px-3 py-1 text-right">{Number(l.debit) ? money(l.debit) : ''}</td><td className="px-3 py-1 text-right">{Number(l.credit) ? money(l.credit) : ''}</td></tr>)}
          <tr className="border-t font-medium"><td className="px-3 py-2">Total {r.balanced ? '✓ balanced' : '✗ OUT OF BALANCE'}</td><td className="px-3 py-2 text-right">{money(r.totalDebit)}</td><td className="px-3 py-2 text-right">{money(r.totalCredit)}</td></tr></>}
        {kind === 'income-statement' && <><Section title="Income" rows={r.income} total={r.totalIncome} /><Section title="Expenses" rows={r.expenses} total={r.totalExpenses} />
          <tr className="border-t font-semibold"><td className="px-3 py-2">Net profit</td><td className="px-3 py-2 text-right">{money(r.netProfit)}</td></tr></>}
        {kind === 'cash-flow' && <>
          {(['OPERATING', 'INVESTING', 'FINANCING'] as const).map((k) => (
            <Section key={k} title={`${k[0]}${k.slice(1).toLowerCase()} activities`} rows={r.sections[k].map((l: any) => ({ code: l.code, name: l.name, amount: l.net }))} total={r[k.toLowerCase()]} />))}
          <tr className="border-t font-medium"><td className="px-3 py-2">Net change in cash</td><td className="px-3 py-2 text-right">{money(r.netChange)}</td></tr>
          <tr><td className="px-3 py-1">Opening cash</td><td className="px-3 py-1 text-right">{money(r.openingCash)}</td></tr>
          <tr><td className="px-3 py-1">Closing cash {r.reconciles ? '✓ reconciles' : '✗ DOES NOT RECONCILE'}</td><td className="px-3 py-1 text-right">{money(r.closingCash)}</td></tr></>}
        {kind === 'balance-sheet' && <><Section title="Assets" rows={r.assets} total={r.totalAssets} /><Section title="Liabilities" rows={r.liabilities} total={r.totalLiabilities} />
          <Section title="Equity" rows={[...r.equity, { code: '', name: 'Current earnings', amount: r.currentEarnings }]} total={r.totalEquity} />
          <tr className="border-t font-medium"><td className="px-3 py-2" colSpan={2}>{r.balanced ? '✓ Assets = Liabilities + Equity' : '✗ OUT OF BALANCE'}</td></tr></>}
      </tbody></table></div>}
    </div>
  );
}
