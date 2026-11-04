'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from '@/lib/client';

export default function Notifications() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false); const [page, setPage] = useState(1); const [role, setRole] = useState('');
  const [data, setData] = useState<{ items: any[]; total: number; unread: number } | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => { api(`notifications?page=${page}&limit=20${unreadOnly ? '&unread=true' : ''}`).then(setData).catch((e) => setErr(e.message)); }, [page, unreadOnly]);
  useEffect(load, [load]);
  useEffect(() => { api('auth/me').then((m) => setRole(m.role)).catch(() => {}); }, []);
  const changed = () => window.dispatchEvent(new Event('notifications-changed'));

  async function open(n: any) {
    if (!n.readAt) { await api(`notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => {}); changed(); }
    if (n.data?.roundId) router.push(role === 'SUPER_ADMIN' ? `/game/${n.data.roundId}` : '/play'); else load();
  }
  async function readAll() { await api('notifications/read-all', { method: 'POST', body: {} }); changed(); load(); }
  const pages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Notifications {data && data.unread > 0 && <span className="text-base font-normal text-slate-500">({data.unread} unread)</span>}</h1>
        <div className="flex gap-2"><label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setPage(1); setUnreadOnly(e.target.checked); }} /> Unread only</label>
          <button className="btn btn-ghost" disabled={!data?.unread} onClick={readAll}>Mark all read</button></div></div>
      {err && <p className="text-red-600">{err}</p>}
      <ul className="space-y-2">{data?.items.map((n) => (
        <li key={n.id}><button onClick={() => open(n)} className={`card w-full text-left hover:border-indigo-300 ${n.readAt ? '' : 'border-indigo-300 bg-indigo-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{n.title}</span><span className="text-xs text-slate-500">{fmt(n.createdAt)}</span></div>
          <div className="text-sm text-slate-600">{n.body}</div></button></li>))}
        {data && !data.items.length && <li className="card text-center text-slate-500">{unreadOnly ? 'No unread notifications' : 'Nothing yet — you will be told here when rounds open and results are published.'}</li>}</ul>
      <div className="flex items-center justify-end gap-2 text-sm">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page} / {pages}</span>
        <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
