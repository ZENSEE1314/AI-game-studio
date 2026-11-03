'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

export default function System() {
  const [status, setStatus] = useState('ACTIVE'); const [message, setMessage] = useState('');
  const [note, setNote] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { api('system/status').then((s) => { setStatus(s.status); setMessage(s.message ?? ''); }).catch((e) => setErr(e.message)); }, []);

  async function save() {
    setErr(''); setNote('');
    if (status !== 'ACTIVE' && !confirm(`Switch application to ${status}? Non-admin users will lose access.`)) return;
    try { await api('system/status', { method: 'PUT', body: { status, message: message || undefined } }); setNote('Saved'); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">System settings</h1>
      <div className="card space-y-3">
        <label className="block text-sm font-medium">Application status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>ACTIVE</option><option>MAINTENANCE</option><option>SUSPENDED</option></select>
        <label className="block text-sm font-medium">Message shown to users</label>
        <textarea className="input" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        <p className="text-xs text-slate-500">Super Admin keeps access in every state. This is separate from individual account suspension.</p>
        {err && <p className="text-sm text-red-600">{err}</p>}{note && <p className="text-sm text-green-700">{note}</p>}
        <button className="btn btn-primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}
