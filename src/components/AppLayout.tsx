'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from './AuthProvider';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const next = pathname ? encodeURIComponent(pathname) : '';
      router.replace(next ? `/signin?next=${next}` : '/signin');
      return;
    }

    if (user.role === 'worker' && pathname !== '/schedule') {
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
  if (user.role === 'worker' && pathname !== '/schedule') return null;

  const showSidebar = user.role !== 'worker';

  return (
    <div className="min-h-screen bg-background">
      {/* Hide sidebar for worker users */}
      {showSidebar && <Sidebar />}
      
      <main className={`min-h-screen ${showSidebar ? 'mr-64' : ''}`}>
        <div className="container mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

