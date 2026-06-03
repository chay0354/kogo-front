'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Users,
  BookOpen,
  Calendar,
  MapPin,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Tag,
  ShoppingBag,
  KeyRound,
  CreditCard,
  MessageCircle,
  FileText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';

function getMenuItems(role: string | null | undefined) {
  // Worker: schedule-only
  if (role === 'worker') {
    return [
      { name: 'לוח זמנים', href: '/schedule', icon: Calendar },
    ];
  }

  // Manager (or unknown): full access
  return [
    { name: 'דף הבית', href: '/', icon: LayoutDashboard },
    { name: 'לקוחות', href: '/customers', icon: Users },
    { name: 'קטלוג חוגים', href: '/courses', icon: BookOpen },
    { name: 'לוח זמנים', href: '/schedule', icon: Calendar },
    { name: 'שכירויות', href: '/rentals', icon: KeyRound },
    { name: 'סניפים', href: '/branches', icon: MapPin },
    { name: 'מדריכים', href: '/instructors', icon: GraduationCap },
    { name: 'חנות', href: '/store', icon: ShoppingBag },
    { name: 'חשבוניות', href: '/invoices', icon: FileText },
    { name: 'הנחות', href: '/discounts', icon: Tag },
    { name: 'סליקת אשראי', href: '/credit-charge', icon: CreditCard },
    { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
    { name: 'הגדרות', href: '/settings', icon: Settings },
  ];
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const menuItems = getMenuItems(user?.role);

  return (
    <aside className="fixed right-0 top-0 h-screen w-64 bg-sidebar-background text-sidebar-foreground shadow-xl z-50 flex flex-col">
      {/* Logo/Brand */}
      <div className="flex items-center justify-center h-20 border-b border-sidebar-accent">
        <h1 className="text-2xl font-bold text-sidebar-primary">קוגומלו</h1>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 min-h-0 py-6 px-3 overflow-y-auto">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    transition-all duration-200
                    ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="h-16 border-t border-sidebar-accent flex items-center justify-center px-4">
        {user ? (
          <Button
            size="sm"
            className="w-full justify-center"
            onClick={async () => {
              await logout();
              router.replace('/signin');
            }}
          >
            התנתק
          </Button>
        ) : (
          <p className="text-xs text-sidebar-foreground/60">© 2025 קוגומלו</p>
        )}
      </div>
    </aside>
  );
}

