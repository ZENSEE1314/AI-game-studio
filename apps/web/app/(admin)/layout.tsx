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
const REFERRAL: Nav[] = [['Referral links', '/referrals']];
const navFor = (role: string): Nav[] => [...(role === 'USER' ? [] : ([['Dashboard', '/dashboard']] as Nav[])), ['Notifications', '/notifications'], ...(role === 'SUPER_ADMIN' ? [] : ([['Play', '/play']] as Nav[])), ...(ACCOUNTS[role] ?? []), ...(role !== 'USER' ? REFERRAL : []), ...(role === 'SUPER_ADMIN' ? ADMIN_ONLY : []), ['My profile', '/profile']];
const adminOnlyPath = (p: string) => ADMIN_ONLY.some(([, h]) => p === h || p.startsWith(h + '/'));

function Sidebar({ role, name, unread, open, onClose }: { role: string; name: string; unread: number; open: boolean; onClose: () => void }) {
  const path = usePathname(); const sp = useSearchParams();
  const current = path + (sp.get('role') ? `?role=${sp.get('role')}` : '');
  useEffect(() => { onClose(); }, [current]); // close the drawer after navigating (phones)
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <aside id="sidebar" aria-label="Main menu"
      className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-xl transition-transform duration-200 md:static md:z-auto md:w-60 md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-4 flex items-start justify-between px-2">
        <div><div className="text-sm font-semibold">Platform</div><div className="text-xs text-slate-500">{name} · {role.replace('_', ' ').toLowerCase()}</div></div>
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100 md:hidden" onClick={onClose} aria-label="Close menu">✕</button>
      </div>
      <nav className="flex-1 space-y-0.5">
        {navFor(role).map(([label, href]) => (
          <Link key={href} href={href}
            className={`block rounded-md px-2 py-2.5 text-sm md:py-1.5 ${current === href ? 'bg-indigo-50 font-medium text-indigo-700' : 'hover:bg-slate-100'}`}>
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
  const [open, setOpen] = useState(false); const [unread, setUnread] = useState(0);
  const path = usePathname();
  useEffect(() => { api('auth/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => {
    const tick = () => api('notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {});
    tick(); const t = setInterval(tick, 30000); window.addEventListener('notifications-changed', tick);
    return () => { clearInterval(t); window.removeEventListener('notifications-changed', tick); };
  }, [path]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { if (me && me.role !== 'SUPER_ADMIN' && adminOnlyPath(path)) window.location.replace('/dashboard');
    if (me && me.role === 'USER' && (path === '/dashboard' || path.startsWith('/accounts'))) window.location.replace('/play');
    if (me && me.role === 'USER' && path.startsWith('/referrals')) window.location.replace('/play');
    if (me && me.role === 'SUPER_ADMIN' && path.startsWith('/play')) window.location.replace('/game'); }, [me, path]);
  if (!me) return <div className="p-6 text-slate-500">Loading…</div>;
  return (
    <div className="min-h-screen md:flex">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <button className="relative rounded-md border border-slate-300 px-3 py-2 text-lg leading-none" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar">
          ☰{unread > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-600" aria-label={`${unread} unread notifications`} />}
        </button>
        <span className="font-semibold">Platform</span><span className="ml-auto truncate text-xs text-slate-500">{me.fullName}</span>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <Suspense fallback={<aside className="hidden w-60 md:block" />}><Sidebar role={me.role} name={me.fullName} unread={unread} open={open} onClose={() => setOpen(false)} /></Suspense>
      <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
    </div>
  );
}
