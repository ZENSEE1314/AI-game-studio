'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/client';

type Nav = readonly [label: string, href: string];
const ACCOUNTS: Record<string, Nav[]> = {
  SUPER_ADMIN: [['Account Management', '/accounts'], ['Agency Management', '/accounts?role=AGENCY'], ['Agent Management', '/accounts?role=AGENT'],
    ['Staff Management', '/accounts?role=STAFF'], ['User Management', '/accounts?role=USER']],
  AGENCY: [['All downline', '/accounts'], ['My agents', '/accounts?role=AGENT'], ['Staff', '/accounts?role=STAFF'], ['Users', '/accounts?role=USER']],
  AGENT: [['All downline', '/accounts'], ['My staff', '/accounts?role=STAFF'], ['Users', '/accounts?role=USER']],
  STAFF: [['My users', '/accounts?role=USER']],
};
const ADMIN_ONLY: Nav[] = [['Game Rounds', '/game'], ['Credits', '/credits'], ['Administrators', '/admins'], ['Accounting', '/accounting'], ['Chart & Periods', '/accounting/setup'], ['Financial Reports', '/accounting/reports'],
  ['Reconciliation', '/accounting/reconciliation'], ['System Settings', '/system'], ['Audit Logs', '/audit']];
const navFor = (role: string): Nav[] => [['Dashboard', '/dashboard'], ['Notifications', '/notifications'], ...(role === 'SUPER_ADMIN' ? [] : ([['Play', '/play']] as Nav[])), ...(ACCOUNTS[role] ?? []), ...(role === 'SUPER_ADMIN' ? ADMIN_ONLY : []), ['My profile', '/profile']];
const adminOnlyPath = (p: string) => ADMIN_ONLY.some(([, h]) => p === h || p.startsWith(h + '/'));

function Sidebar({ role, name }: { role: string; name: string }) {
  const path = usePathname(); const sp = useSearchParams();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const tick = () => api('notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {});
    tick(); const t = setInterval(tick, 30000); window.addEventListener('notifications-changed', tick);
    return () => { clearInterval(t); window.removeEventListener('notifications-changed', tick); };
  }, [path]);
  const current = path + (sp.get('role') ? `?role=${sp.get('role')}` : '');
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3">
      <div className="mb-4 px-2"><div className="text-sm font-semibold">Platform</div><div className="text-xs text-slate-500">{name} · {role.replace('_', ' ').toLowerCase()}</div></div>
      <nav className="flex-1 space-y-0.5">
        {navFor(role).map(([label, href]) => (
          <Link key={href} href={href}
            className={`block rounded-md px-2 py-1.5 text-sm ${current === href ? 'bg-indigo-50 font-medium text-indigo-700' : 'hover:bg-slate-100'}`}>
            {label}{href === '/notifications' && unread > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white" aria-label={`${unread} unread`}>{unread}</span>}
          </Link>
        ))}
      </nav>
      <button onClick={logout} className="btn btn-ghost mt-3">Sign out</button>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<{ role: string; fullName: string } | null>(null);
  const path = usePathname();
  useEffect(() => { api('auth/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => { if (me && me.role !== 'SUPER_ADMIN' && adminOnlyPath(path)) window.location.replace('/dashboard');
    if (me && me.role === 'SUPER_ADMIN' && path.startsWith('/play')) window.location.replace('/game'); }, [me, path]);
  if (!me) return <div className="p-6 text-slate-500">Loading…</div>;
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<aside className="w-60" />}><Sidebar role={me.role} name={me.fullName} /></Suspense>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
