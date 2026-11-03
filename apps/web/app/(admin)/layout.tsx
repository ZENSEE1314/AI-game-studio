'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const NAV = [
  ['Dashboard', '/dashboard'], ['Account Management', '/accounts'],
  ['Agency Management', '/accounts?role=AGENCY'], ['Agent Management', '/accounts?role=AGENT'],
  ['Staff Management', '/accounts?role=STAFF'], ['User Management', '/accounts?role=USER'],
  ['System Settings', '/system'], ['Audit Logs', '/audit'],
] as const;

function Sidebar() {
  const path = usePathname(); const sp = useSearchParams();
  const current = path + (sp.get('role') ? `?role=${sp.get('role')}` : '');
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3">
      <div className="mb-4 px-2 text-sm font-semibold">Platform Admin</div>
      <nav className="flex-1 space-y-0.5">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href}
            className={`block rounded-md px-2 py-1.5 text-sm ${current === href ? 'bg-indigo-50 font-medium text-indigo-700' : 'hover:bg-slate-100'}`}>
            {label}
          </Link>
        ))}
      </nav>
      <button onClick={logout} className="btn btn-ghost mt-3">Sign out</button>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<aside className="w-60" />}><Sidebar /></Suspense>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
