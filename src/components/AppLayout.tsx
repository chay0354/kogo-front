'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, PanelRightOpen } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from './AuthProvider';
import { LG_MEDIA_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';

const SIDEBAR_STORAGE_KEY = 'kogo-sidebar-open';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Roles that may see the office screens at all. Anything else — a worker, an
 * account whose profile was never created, a role added server-side that this
 * build predates — gets the instructor screen and nothing more.
 */
const CRM_ROLES = new Set(['manager', 'partner']);

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useMediaQuery(LG_MEDIA_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  useEffect(() => {
    if (isDesktop) {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setSidebarOpen(stored === null ? true : stored === 'true');
    } else {
      setSidebarOpen(false);
    }
    setSidebarReady(true);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  }, [pathname, isDesktop]);

  useEffect(() => {
    if (!isDesktop && sidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isDesktop, sidebarOpen]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (isDesktop) {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const closeSidebar = () => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const next = pathname ? encodeURIComponent(pathname) : '';
      router.replace(next ? `/signin?next=${next}` : '/signin');
      return;
    }

    // Default deny. Only a role that is explicitly allowed the office screens
    // gets them: an account with no profile, or one carrying a role this build
    // does not know, previously fell through every check and was handed the
    // whole CRM shell. The server refuses the data either way, but the shell
    // itself must never open for anyone but staff.
    if (!CRM_ROLES.has(user.role as string) && pathname !== '/schedule') {
      router.replace('/schedule');
      return;
    }

    if (user.role === 'partner') {
      const blocked = ['/settings', '/partners', '/whatsapp', '/discounts', '/credit-charge'];
      if (blocked.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
        router.replace('/');
      }
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>מאמת משתמש...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  if (!CRM_ROLES.has(user.role as string) && pathname !== '/schedule') return null;

  const showSidebar = CRM_ROLES.has(user.role as string);

  return (
    <div className="min-h-screen bg-background">
      {showSidebar && sidebarReady && (
        <>
          {sidebarOpen && !isDesktop && (
            <button
              type="button"
              className="fixed inset-0 bg-black/50 z-40"
              onClick={closeSidebar}
              aria-label="סגור תפריט"
            />
          )}
          <Sidebar
            open={sidebarOpen}
            onToggle={toggleSidebar}
            onNavigate={closeSidebar}
          />
          {!sidebarOpen && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="fixed top-3 right-3 z-50 flex items-center justify-center w-10 h-10 rounded-lg bg-sidebar-background text-sidebar-foreground shadow-lg hover:bg-sidebar-accent transition-colors lg:top-4 lg:right-4"
              title="הצג תפריט"
              aria-label="הצג תפריט"
            >
              <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
        </>
      )}

      <main
        className={`min-h-screen transition-[margin] duration-300 ease-in-out ${
          showSidebar && sidebarOpen && isDesktop ? 'lg:mr-64' : ''
        }`}
      >
        <div
          className={
            showSidebar
              ? 'container mx-auto px-4 py-4 sm:px-6 sm:py-8 max-w-full'
              : ''
          }
        >
          {children}
        </div>
      </main>

    </div>
  );
}
