'use client';
import { useEffect, useState } from 'react';
import { Account, api } from '@/lib/client';

type A = Account & { referralCode: string | null; agencyId: string | null; agentId: string | null };

export default function Referrals() {
  const [me, setMe] = useState<any>(null);
  const [agencies, setAgencies] = useState<A[]>([]); const [agents, setAgents] = useState<A[]>([]); const [staff, setStaff] = useState<A[]>([]);
  const [agency, setAgency] = useState(''); const [agent, setAgent] = useState(''); const [copied, setCopied] = useState(''); const [err, setErr] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    (async () => {
      const m = await api('auth/me'); setMe(m);
      if (m.role === 'STAFF') return;
      const all = async (role: string): Promise<A[]> => (await api(`accounts?role=${role}&limit=100`)).items;
      const [ag, at, st] = await Promise.all([m.role === 'SUPER_ADMIN' ? all('AGENCY') : [], m.role !== 'AGENT' ? all('AGENT') : [], all('STAFF')]);
      setAgencies(ag); setAgents(at); setStaff(st);
    })().catch((e) => setErr(e.message));
  }, []);

  const name = (list: A[], id: string | null) => list.find((x) => x.id === id)?.fullName ?? '—';
  const link = (code: string) => `${origin}/signup?ref=${code}`;
  async function copy(code: string) { try { await navigator.clipboard.writeText(link(code)); setCopied(code); setTimeout(() => setCopied(''), 1500); } catch { setErr('Copy failed. Select the link and copy it manually.'); } }

  const visibleAgents = agents.filter((a) => !agency || a.agencyId === agency);
  const visibleStaff = staff.filter((s) => (!agency || s.agencyId === agency) && (!agent || s.agentId === agent));

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Referral links</h1>
      <p className="text-sm text-slate-600">Each staff member has a link. Anyone who signs up with it becomes a user under that staff member, their agent and their agency.</p>
      {err && <p className="text-red-600" role="alert">{err}</p>}
      {me?.role === 'STAFF' && (
        <div className="card space-y-2"><h2 className="font-semibold">Your link</h2>
          {me.referralCode ? <><code className="block break-all rounded bg-slate-100 p-2 text-sm" data-testid="my-link">{link(me.referralCode)}</code>
            <p className="text-sm text-slate-600">Code: <b>{me.referralCode}</b></p>
            <button className="btn btn-primary" onClick={() => copy(me.referralCode)}>{copied === me.referralCode ? 'Copied ✓' : 'Copy link'}</button></> : <p className="text-sm text-slate-500">No code yet.</p>}</div>)}
      {me && me.role !== 'STAFF' && (<>
        <div className="flex flex-wrap gap-2">
          {me.role === 'SUPER_ADMIN' && <select className="input w-auto" value={agency} onChange={(e) => { setAgency(e.target.value); setAgent(''); }} aria-label="Agency">
            <option value="">All agencies</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select>}
          {me.role !== 'AGENT' && <select className="input w-auto" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
            <option value="">All agents</option>{visibleAgents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}</select>}
        </div>
        <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-slate-500"><tr>{['Agency', 'Agent', 'Staff', 'Sign-up link', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{visibleStaff.map((s) => (<tr key={s.id} className="border-b last:border-0">
            <td className="px-3 py-2">{me.role === 'SUPER_ADMIN' ? name(agencies, s.agencyId) : '—'}</td><td className="px-3 py-2">{name(agents, s.agentId)}</td>
            <td className="px-3 py-2">{s.fullName} {s.status === 'SUSPENDED' && <span className="rounded bg-red-100 px-1 text-xs text-red-700">suspended</span>}</td>
            <td className="px-3 py-2"><code className="break-all text-xs">{s.referralCode ? link(s.referralCode) : '—'}</code></td>
            <td className="px-3 py-2 text-right">{s.referralCode && <button className="btn btn-ghost" onClick={() => copy(s.referralCode!)}>{copied === s.referralCode ? 'Copied ✓' : 'Copy'}</button>}</td></tr>))}
            {!visibleStaff.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No staff yet. Create a staff member under an agent first.</td></tr>}</tbody></table></div></>)}
    </div>
  );
}
