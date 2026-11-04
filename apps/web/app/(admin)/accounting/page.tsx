'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChartAccount, api, fmt, money } from '@/lib/client';

type Line = { accountId: string; debit: string; credit: string };
const STATUSES = ['', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REVERSED'];

function NewEntry({ accounts, onDone }: { accounts: ChartAccount[]; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState<Line[]>([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const [err, setErr] = useState('');
  const td = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0), tc = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  const set = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function submit() {
    setErr('');
    try {
      await api('accounting/journals', { method: 'POST', body: {
        entryDate: date, description: desc,
        lines: lines.map((l) => ({ accountId: l.accountId, ...(l.debit ? { debit: l.debit } : {}), ...(l.credit ? { credit: l.credit } : {}) })),
      } });
      onDone();
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input sm:col-span-2" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <select className="input sm:col-span-6" value={l.accountId} onChange={(e) => set(i, 'accountId', e.target.value)}>
            <option value="">Account…</option>{accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>
          <input className="input sm:col-span-3" placeholder="Debit" inputMode="decimal" value={l.debit} onChange={(e) => set(i, 'debit', e.target.value)} />
          <input className="input sm:col-span-3" placeholder="Credit" inputMode="decimal" value={l.credit} onChange={(e) => set(i, 'credit', e.target.value)} />
        </div>))}
      <div className="flex items-center justify-between text-sm">
        <button className="btn btn-ghost" onClick={() => setLines([...lines, { accountId: '', debit: '', credit: '' }])}>Add line</button>
        <span className={td === tc && td > 0 ? 'text-green-700' : 'text-red-600'}>Debit {money(td)} / Credit {money(tc)}</span>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn btn-primary" disabled={td !== tc || td === 0 || desc.length < 3} onClick={submit}>Save as draft</button>
    </div>
  );
}

export default function Journals() {
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]); const [open, setOpen] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(() => {
    api(`accounting/journals?page=${page}&limit=25${status ? `&status=${status}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [page, status]);
  useEffect(load, [load]);
  useEffect(() => { api('accounting/accounts').then(setAccounts).catch(() => {}); }, []);
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Journal entries</h1>
        <button className="btn btn-primary" onClick={() => setOpen(!open)}>{open ? 'Close' : 'New entry'}</button>
      </div>
      {open && <NewEntry accounts={accounts} onDone={() => { setOpen(false); load(); }} />}
      <select className="input w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}</select>
      {err && <p className="text-red-600">{err}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-500"><tr>{['Reference', 'Date', 'Description', 'Amount', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data?.items.map((e) => (
            <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
              <td className="px-3 py-2"><Link className="text-indigo-600 hover:underline" href={`/accounting/${e.id}`}>{e.reference}</Link></td>
              <td className="px-3 py-2">{String(e.entryDate).slice(0, 10)}</td><td className="px-3 py-2">{e.description}</td>
              <td className="px-3 py-2">{money(e.lines.reduce((a: number, l: any) => a + Number(l.debit), 0))}</td><td className="px-3 py-2">{e.status}</td>
            </tr>))}
            {data && !data.items.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No entries</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-sm">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span>Page {page} / {pages}</span>
        <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
