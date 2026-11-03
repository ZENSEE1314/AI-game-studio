'use client';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Audit() {
  const [page, setPage] = useState(1); const [action, setAction] = useState('');
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null); const [err, setErr] = useState('');
  const limit = 50;
  useEffect(() => {
    api(`audit?page=${page}&limit=${limit}${action ? `&action=${encodeURIComponent(action)}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [page, action]);
  const pages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit logs</h1>
      <input className="input max-w-xs" placeholder="Filter by exact action, e.g. ACCOUNT_SUSPENDED"
        onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setAction((e.target as HTMLInputElement).value.trim()); } }} />
      {err && <p className="text-red-600">{err}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-500"><tr>{['Time', 'Action', 'Entity', 'Actor', 'Details'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data?.items.map((a) => (
            <tr key={a.id} className="border-b last:border-0 align-top">
              <td className="px-3 py-2 whitespace-nowrap">{fmt(a.createdAt)}</td><td className="px-3 py-2">{a.action}</td>
              <td className="px-3 py-2">{a.entityType}{a.entityId ? ` ${String(a.entityId).slice(0, 8)}` : ''}</td>
              <td className="px-3 py-2">{a.actorId ? String(a.actorId).slice(0, 8) : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs">{a.metadata ? JSON.stringify(a.metadata) : ''}</td>
            </tr>))}</tbody>
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
