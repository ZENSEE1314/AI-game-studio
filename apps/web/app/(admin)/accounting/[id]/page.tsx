'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, fmt, money } from '@/lib/client';

export default function Entry() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<any>(null); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const load = useCallback(() => { api(`accounting/journals/${id}`).then(setE).catch((x) => setErr(x.message)); }, [id]);
  useEffect(load, [load]);

  async function act(path: string, body?: unknown, ask?: string) {
    setErr(''); setNote('');
    let payload = body;
    if (ask) { const v = window.prompt(ask); if (!v) return; payload = { [path === 'reverse' ? 'reason' : 'comment']: v }; }
    try { await api(`accounting/journals/${id}/${path}`, { method: 'POST', body: payload ?? {} }); setNote(`${path} done`); load(); }
    catch (x: any) { setErr(x.message); }
  }
  if (!e) return <p>{err || 'Loading…'}</p>;
  const td = e.lines.reduce((a: number, l: any) => a + Number(l.debit), 0);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{e.reference} <span className="text-base font-normal text-slate-500">{e.status}</span></h1>
      <p className="text-sm">{String(e.entryDate).slice(0, 10)} — {e.description}</p>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}{note && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{note}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="border-b bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
          <tbody>{e.lines.map((l: any) => (<tr key={l.id} className="border-b last:border-0"><td className="px-3 py-2">{l.account.code} {l.account.name}</td>
            <td className="px-3 py-2 text-right">{Number(l.debit) ? money(l.debit) : ''}</td><td className="px-3 py-2 text-right">{Number(l.credit) ? money(l.credit) : ''}</td></tr>))}
            <tr className="font-medium"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{money(td)}</td><td className="px-3 py-2 text-right">{money(td)}</td></tr></tbody></table>
      </div>
      <div className="flex gap-2">
        {e.status === 'DRAFT' && <button className="btn btn-primary" onClick={() => act('submit')}>Submit for approval</button>}
        {e.status === 'PENDING_APPROVAL' && <><button className="btn btn-primary" onClick={() => act('approve')}>Approve</button>
          <button className="btn btn-ghost" onClick={() => act('reject', undefined, 'Reason for rejection')}>Reject</button></>}
        {e.status === 'APPROVED' && <button className="btn btn-primary" onClick={() => act('post')}>Post to ledger</button>}
        {e.status === 'POSTED' && <button className="btn btn-danger" onClick={() => act('reverse', undefined, 'Reason for reversal (creates a mirror entry dated today)')}>Reverse…</button>}
      </div>
      <div className="card"><h2 className="mb-2 font-semibold">Approval trail</h2>
        {e.approvals.length === 0 ? <p className="text-sm text-slate-500">No actions yet</p> :
          <ul className="space-y-1 text-sm">{e.approvals.map((a: any) => <li key={a.id}>{fmt(a.createdAt)} — {a.action}{a.comment ? `: ${a.comment}` : ''}</li>)}</ul>}</div>
    </div>
  );
}
