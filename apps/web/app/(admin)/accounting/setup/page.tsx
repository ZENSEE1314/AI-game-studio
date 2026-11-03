'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChartAccount, api } from '@/lib/client';

export default function Setup() {
  const [accts, setAccts] = useState<ChartAccount[]>([]); const [periods, setPeriods] = useState<any[]>([]); const [err, setErr] = useState('');
  const load = useCallback(() => { api('accounting/accounts').then(setAccts).catch((e) => setErr(e.message)); api('accounting/periods').then(setPeriods).catch(() => {}); }, []);
  useEffect(load, [load]);

  async function post(path: string, form: HTMLFormElement, extra = {}) {
    setErr('');
    try { await api(path, { method: 'POST', body: { ...Object.fromEntries(new FormData(form)), ...extra } }); form.reset(); load(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Chart of accounts & periods</h1>
      {err && <p className="text-red-600" role="alert">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <form className="card grid grid-cols-6 gap-2" onSubmit={(e) => { e.preventDefault(); post('accounting/accounts', e.currentTarget); }}>
            <input name="code" className="input col-span-2" placeholder="Code" required /><input name="name" className="input col-span-4" placeholder="Name" required />
            <select name="class" className="input col-span-4">{['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((c) => <option key={c}>{c}</option>)}</select>
            <button className="btn btn-primary col-span-2">Add</button>
          </form>
          <div className="card p-0"><table className="w-full text-sm"><tbody>{accts.map((a) => (
            <tr key={a.id} className="border-b last:border-0"><td className="px-3 py-2">{a.code}</td><td className="px-3 py-2">{a.name}</td><td className="px-3 py-2 text-slate-500">{a.class}</td>
              <td className="px-3 py-2">{a.class === 'ASSET' && <label className="text-xs text-slate-600"><input type="checkbox" checked={a.isCash} onChange={(e) => api(`accounting/accounts/${a.id}/cash-settings`, { method: 'PATCH', body: { isCash: e.target.checked } }).then(load).catch((x) => setErr(x.message))} /> cash</label>}
                {!a.isCash && <select className="ml-1 text-xs" value={a.cashFlowActivity ?? ''} title="Cash flow section" onChange={(e) => api(`accounting/accounts/${a.id}/cash-settings`, { method: 'PATCH', body: { cashFlowActivity: e.target.value || null } }).then(load)}>
                  <option value="">auto</option><option value="OPERATING">operating</option><option value="INVESTING">investing</option><option value="FINANCING">financing</option></select>}</td>
              <td className="px-3 py-2 text-right"><button className="text-xs text-indigo-600" onClick={() => api(`accounting/accounts/${a.id}`, { method: 'PATCH', body: { isActive: !a.isActive } }).then(load)}>{a.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>))}</tbody></table></div>
        </div>
        <div className="space-y-3">
          <form className="card grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); post('accounting/periods', e.currentTarget); }}>
            <input name="name" className="input col-span-2" placeholder="Name, e.g. FY2027" required />
            <input name="startDate" type="date" className="input" required /><input name="endDate" type="date" className="input" required />
            <button className="btn btn-primary col-span-2">Add period</button>
          </form>
          <div className="card p-0"><table className="w-full text-sm"><tbody>{periods.map((p) => (
            <tr key={p.id} className="border-b last:border-0"><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-slate-500">{String(p.startDate).slice(0, 10)} → {String(p.endDate).slice(0, 10)}</td><td className="px-3 py-2">{p.status}</td>
              <td className="px-3 py-2 text-right">{p.status === 'OPEN' && <button className="text-xs text-indigo-600" onClick={() => confirm(`Close ${p.name}? No further postings.`) && api(`accounting/periods/${p.id}/close`, { method: 'POST', body: {} }).then(load).catch((e) => setErr(e.message))}>Close</button>}</td></tr>))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
}
