'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/**
 * Printable reports: the office's own pages, without the office shell.
 *
 * A report is a sheet of paper on screen, so the sidebar and the page motion of
 * (crm)/layout.tsx stay out of it — but the same people get in: staff only,
 * the rest sent where AppLayout sends them. The server refuses the data to
 * anyone else regardless.
 *
 * The round type is switched on here as it is for the CRM screens.
 */
const STAFF = new Set(['manager', 'partner']);

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const here = typeof window !== 'undefined' ? `${pathname}${window.location.search}` : pathname;
      router.replace(`/signin?next=${encodeURIComponent(here || '/')}`);
      return;
    }
    if (!STAFF.has(user.role as string)) router.replace('/schedule');
  }, [loading, user, router, pathname]);

  const allowed = !loading && user && STAFF.has(user.role as string);

  return (
    <div data-app-font="round" dir="rtl">
      {allowed ? children : <div style={{ minHeight: '100vh', background: '#ecebf6' }} aria-busy="true" />}
    </div>
  );
}
