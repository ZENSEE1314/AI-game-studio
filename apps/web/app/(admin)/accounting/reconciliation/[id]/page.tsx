'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, money } from '@/lib/client';

export default function Recon() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null); const [sel, setSel] = useState<Set<string>>(new Set()); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const load = useCallback(() => { api(`accounting/reconciliations/${id}`).then((x) => { setR(x); setSel(new Set()); }).catch((e) => setErr(e.message)); }, [id]);
  useEffect(load, [load]);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  async function run(path: string, body?: unknown) {
    setErr(''); setNote('');
    try { const x = await api(`accounting/reconciliations/${id}/${path}`, { method: 'POST', body: body ?? {} }); if (path === 'cancel') { window.location.href = '/accounting/reconciliation'; return; } setR(x); setSel(new Set()); if (path === 'complete') setNote('Reconciliation completed'); }
    catch (e: any) { setErr(e.message); }
  }
  if (!r) return <p>{err || 'Loading…'}</p>;
  const draft = r.status === 'DRAFT'; const diff = Number(r.summary.difference);
  const Row = ({ l, k, action }: { l: any; k: string; action: 'add' | 'remove' | null }) => (
    <tr className="border-b last:border-0">
      <td className="px-3 py-1">{action && <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={`select ${l.entry.reference}`} />}</td>
      <td className="px-3 py-1">{String(l.entry.entryDate).slice(0, 10)}</td><td className="px-3 py-1">{l.entry.reference}</td><td className="px-3 py-1">{l.entry.description}</td>
      <td className="px-3 py-1 text-right">{Number(l.debit) ? money(l.debit) : ''}</td><td className="px-3 py-1 text-right">{Number(l.credit) ? money(l.credit) : ''}</td></tr>);
  const Table = ({ title, rows, action }: { title: string; rows: any[]; action: 'add' | 'remove' | null }) => (
    <div className="card p-0"><div className="border-b px-3 py-2 font-medium">{title} ({rows.length})</div>
      <table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="w-8" /><th className="px-3 py-1">Date</th><th className="px-3 py-1">Ref</th><th className="px-3 py-1">Description</th><th className="px-3 py-1 text-right">Deposit (Dr)</th><th className="px-3 py-1 text-right">Withdrawal (Cr)</th></tr></thead>
        <tbody>{rows.map((l) => <Row key={l.id} l={l} k={l.id} action={action} />)}</tbody></table></div>);
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-semibold">{r.account.code} {r.account.name} <span className="text-base font-normal text-slate-500">statement {String(r.statementDate).slice(0, 10)} · {r.status}</span></h1>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}{note && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{note}</p>}
      <dl className="card grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
        <div><dt className="text-slate-500">Opening</dt><dd>{money(r.openingBalance)}</dd></div>
        <div><dt className="text-slate-500">Cleared balance</dt><dd>{money(r.summary.clearedBalance)}</dd></div>
        <div><dt className="text-slate-500">Statement balance</dt><dd>{money(r.statementBalance)}</dd></div>
        <div><dt className="text-slate-500">Difference</dt><dd className={diff === 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>{money(diff)}</dd></div>
      </dl>
      {draft && <Table title="Uncleared book lines" rows={r.candidates} action="add" />}
      <Table title="Cleared lines" rows={r.cleared} action={draft ? 'remove' : null} />
      {draft && <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" disabled={!sel.size} onClick={() => run('clear', { lineIds: [...sel].filter((x) => r.candidates.some((c: any) => c.id === x)) })}>Mark selected as cleared</button>
        <button className="btn btn-ghost" disabled={!sel.size} onClick={() => run('unclear', { lineIds: [...sel].filter((x) => r.cleared.some((c: any) => c.id === x)) })}>Unclear selected</button>
        <button className="btn btn-primary" disabled={diff !== 0} onClick={() => run('complete')}>Complete reconciliation</button>
        <button className="btn btn-danger" onClick={() => confirm('Discard this draft reconciliation?') && run('cancel')}>Discard</button></div>}
    </div>
  );
}
