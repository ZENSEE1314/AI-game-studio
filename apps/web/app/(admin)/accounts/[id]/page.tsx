'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Account, api, fmt } from '@/lib/client';

const LEVELS = ['AGENCY', 'AGENT', 'STAFF', 'USER'];
const PARENT_OF: Record<string, string> = { AGENCY: 'SUPER_ADMIN', AGENT: 'AGENCY', STAFF: 'AGENT', USER: 'STAFF' };

function ChangeLevel({ acc, onDone }: { acc: Account; onDone: () => void }) {
  const [role, setRole] = useState(acc.role); const [parents, setParents] = useState<Account[]>([]); const [parentId, setParentId] = useState('');
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => { setParentId(''); const pr = PARENT_OF[role]; if (!pr || pr === 'SUPER_ADMIN') { setParents([]); return; }
    api(`accounts?role=${pr}&limit=100`).then((r) => setParents(r.items.filter((p: Account) => p.id !== acc.id))); }, [role, acc.id]);
  async function save() {
    setErr(''); setOk('');
    if (!confirm(`Change ${acc.username} to ${role} under the selected parent? Their sessions will be ended.`)) return;
    try { await api(`accounts/${acc.id}/change-role`, { method: 'POST', body: { role, parentId } }); setOk('Updated'); onDone(); } catch (e: any) { setErr(e.message); }
  }
  if (PARENT_OF[role] === 'SUPER_ADMIN') return <p className="text-sm text-slate-500">Agencies sit directly under the administrator and cannot be moved.</p>;
  return (
    <div className="card space-y-3"><h2 className="font-semibold">Change level / move</h2>
      <p className="text-xs text-slate-500">Only for accounts with nobody below them. The new parent must be one level above the chosen level.</p>
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label="New level">{LEVELS.filter((l) => l !== 'AGENCY').map((l) => <option key={l}>{l}</option>)}</select>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="New parent"><option value="">Parent {PARENT_OF[role]}…</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.fullName} (@{p.username})</option>)}</select>
      </div>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}{ok && <p className="text-sm text-green-700">{ok}</p>}
      <button className="btn btn-primary" disabled={!parentId} onClick={save}>Apply change</button></div>
  );
}

type Preview = { target: Account; affectedAccounts: number; byRole: Record<string, number> };

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const [acc, setAcc] = useState<Account | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [kids, setKids] = useState<Account[]>([]);
  const [parent, setParent] = useState<Account | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<'suspend' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { api('auth/me').then((m) => setIsAdmin(m.role === 'SUPER_ADMIN')).catch(() => {}); }, []);

  const load = useCallback(() => {
    api(`accounts/${id}`).then((a: Account) => {
      setAcc(a);
      setParent(null);
      if (a.parentId) api(`accounts/${a.parentId}`).then(setParent).catch(() => {});
    }).catch((e) => setErr(e.message));
    api(`accounts?parentId=${id}&limit=100`).then((r) => setKids(r.items)).catch(() => {});
    api(`accounts/${id}/history`).then(setHist).catch(() => {});
  }, [id]);
  useEffect(load, [load]);

  async function open(m: 'suspend' | 'reactivate') {
    setErr(''); setMsg(''); setReason('');
    try { if (m === 'suspend') setPreview(await api(`accounts/${id}/suspension-preview`)); setMode(m); }
    catch (e: any) { setErr(e.message); }
  }
  async function confirm() {
    setErr('');
    try {
      const r = await api(`accounts/${id}/${mode}`, { method: 'POST', body: { reason } });
      setMsg(mode === 'suspend' ? `Suspended. ${r.affectedDescendants} subordinate accounts blocked, ${r.sessionsRevoked} sessions revoked.` : 'Reactivated.');
      setMode(null); setPreview(null); load();
    } catch (e: any) { setErr(e.message); }
  }

  if (!acc) return <p>{err || 'Loading…'}</p>;
  const rows: [string, string][] = [
    ['Role', acc.role], ['Email', acc.email], ['Phone', acc.phone ?? '—'], ['Status', acc.status],
    ['Last login', fmt(acc.lastLogin)], ['Created', fmt(acc.createdAt)],
    ...(acc.status === 'SUSPENDED' ? [['Suspended at', fmt(acc.suspendedAt)], ['Reason', acc.suspensionReason ?? '—']] as [string, string][] : []),
  ];
  return (
    <div className="max-w-3xl space-y-4">
      {parent && <Link className="text-sm text-indigo-600 hover:underline" href={`/accounts/${parent.id}`}>↑ {parent.role.toLowerCase()} {parent.username}</Link>}
      <h1 className="text-xl font-semibold">{acc.fullName} <span className="text-base font-normal text-slate-500">@{acc.username}</span></h1>
      {msg && <p className="rounded bg-green-50 p-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
      <dl className="card grid grid-cols-2 gap-2 text-sm">
        {rows.map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {isAdmin && acc.role !== 'SUPER_ADMIN' && !mode && (acc.status === 'ACTIVE'
        ? <button className="btn btn-danger" onClick={() => open('suspend')}>Suspend…</button>
        : <button className="btn btn-primary" onClick={() => open('reactivate')}>Reactivate…</button>)}

      {mode && (
        <div className="card space-y-3 border-amber-300">
          <h2 className="font-semibold">{mode === 'suspend' ? 'Confirm suspension' : 'Confirm reactivation'}</h2>
          {mode === 'suspend' && preview && (
            <p className="text-sm">This will block <b>{preview.affectedAccounts}</b> subordinate account(s)
              {Object.keys(preview.byRole).length > 0 && <> ({Object.entries(preview.byRole).map(([r, n]) => `${n} ${r.toLowerCase()}`).join(', ')})</>}
              {' '}in addition to <b>{acc.username}</b>, and revoke all their sessions immediately. Records and history are kept.</p>
          )}
          <textarea className="input" rows={3} placeholder="Reason (min 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className={`btn ${mode === 'suspend' ? 'btn-danger' : 'btn-primary'}`} disabled={reason.trim().length < 5} onClick={confirm}>
              {mode === 'suspend' ? 'Suspend account' : 'Reactivate account'}</button>
            <button className="btn btn-ghost" onClick={() => { setMode(null); setPreview(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {isAdmin && acc.role !== 'SUPER_ADMIN' && acc.role !== 'AGENCY' && <ChangeLevel acc={acc} onDone={load} />}
      {acc.referralCode && <div className="card text-sm"><span className="text-slate-500">Referral code:</span> <b>{acc.referralCode}</b> <a className="ml-2 text-indigo-600 hover:underline" href="/referrals">see links</a></div>}
      {kids.length > 0 && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Direct subordinates ({kids.length})</h2>
            <a className="btn btn-ghost" href={`/api/proxy/accounts/export.csv?parentId=${id}`}>Export CSV</a></div>
          <ul className="space-y-1 text-sm">{kids.map((k) => (
            <li key={k.id}><Link className="text-indigo-600 hover:underline" href={`/accounts/${k.id}`}>{k.username}</Link>
              {' '}<span className="text-slate-500">{k.role.toLowerCase()} · {k.status.toLowerCase()}</span></li>))}</ul>
        </div>)}
      <div className="card">
        <h2 className="mb-2 font-semibold">Status history</h2>
        {hist.length === 0 ? <p className="text-sm text-slate-500">No changes yet</p> : (
          <ul className="space-y-1 text-sm">{hist.map((h) => (
            <li key={h.id}>{fmt(h.createdAt)} — {h.fromStatus} → {h.toStatus}: {h.reason}{h.affectedCount ? ` (${h.affectedCount} affected)` : ''}</li>
          ))}</ul>)}
      </div>
    </div>
  );
}
