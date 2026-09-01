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
  ShoppingBag,
  KeyRound,
  MessageCircle,
  FileText,
  PanelRightClose,
  CreditCard,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import type { UserRole } from '@/lib/auth';

const MANAGER_MENU = [
  { name: 'דף הבית', href: '/', icon: LayoutDashboard },
  { name: 'לקוחות', href: '/customers', icon: Users },
  { name: 'קטלוג חוגים', href: '/courses', icon: BookOpen },
  { name: 'לוח זמנים', href: '/schedule', icon: Calendar },
  { name: 'שכירויות', href: '/rentals', icon: KeyRound },
  { name: 'סניפים', href: '/branches', icon: MapPin },
  { name: 'מדריכים', href: '/instructors', icon: GraduationCap },
  { name: 'חנות', href: '/store', icon: ShoppingBag },
  { name: 'חשבוניות', href: '/invoices', icon: FileText },
  { name: 'כרטיסי אשראי', href: '/credit-cards', icon: CreditCard },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle },
  { name: 'הגדרות', href: '/settings', icon: Settings },
];

/**
 * A manager reaches ספר-מערכת from inside הגדרות. A partner has no הגדרות
 * screen, so for them it has to stay an entry of its own — otherwise moving it
 * there would quietly take the page away from them.
 */
const MANUAL_ITEM = { name: 'ספר-מערכת', href: '/manual', icon: BookOpen };

const PARTNER_MENU = [
  ...MANAGER_MENU.filter(
    (item) => !['/settings', '/whatsapp', '/credit-cards'].includes(item.href)
  ),
  MANUAL_ITEM,
];

const INSTRUCTOR_MENU = [{ name: 'לוח זמנים', href: '/schedule', icon: Calendar }];

/**
 * Default deny: the manager menu is returned only for an explicit manager.
 * It used to be the fallback, so an account with no profile — or a role this
 * build does not know — was shown every office screen in the sidebar.
 */
function getMenuItems(role: UserRole | null | undefined) {
  if (role === 'manager') {
    return MANAGER_MENU;
  }
  if (role === 'partner') {
    return PARTNER_MENU;
  }
  return INSTRUCTOR_MENU;
}

interface SidebarProps {
  open?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}

export default function Sidebar({ open = true, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const menuItems = getMenuItems(user?.role);

  return (
    <aside
      className={`fixed right-0 top-0 h-screen w-64 bg-sidebar-background text-sidebar-foreground shadow-xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between h-20 border-b border-sidebar-accent px-4">
        <h1 className="text-2xl font-bold text-sidebar-primary flex-1 text-center">קוגומלו</h1>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="p-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="הסתר תפריט"
            aria-label="הסתר תפריט"
          >
            <PanelRightClose className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 min-h-0 py-6 px-3 overflow-y-auto">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
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
