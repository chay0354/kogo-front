'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!user) return null;
  if (user.role === 'worker' && pathname !== '/schedule') return null;

  const isWorker = user.role === 'worker';

  return (
    <div className="min-h-screen bg-background">
      {/* Hide sidebar for worker users */}
      {!isWorker && <Sidebar />}
      
      {/* Main Content Area - full width for workers, with sidebar margin for managers */}
      <main className={`min-h-screen ${!isWorker ? 'mr-64' : ''}`}>
        <div className="container mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

