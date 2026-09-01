'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Ref } from 'react';
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
  PanelRightOpen,
  LogOut,
  CreditCard,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import type { UserRole } from '@/lib/auth';
import { SIDEBAR_WIDTH, type SidebarMode } from '@/components/sidebarShell';
import styles from '@/components/Sidebar.module.css';

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

export const SIDEBAR_ID = 'kogo-sidebar';

interface SidebarProps {
  mode: SidebarMode;
  onToggle?: () => void;
  onNavigate?: () => void;
  /** Held by the shell so a phone can hand focus back and forth with it. */
  toggleRef?: Ref<HTMLButtonElement>;
}

export default function Sidebar({ mode, onToggle, onNavigate, toggleRef }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const menuItems = getMenuItems(user?.role);
  const railed = mode === 'rail';
  const open = mode === 'expanded' || mode === 'drawer';

  /**
   * On a desktop the same button narrows and widens the menu in place, so it
   * says which of the two it is about to do. On a phone the menu is a drawer
   * lying over the page and the only thing it can do is get out of the way.
   */
  const toggleLabel = railed
    ? 'הרחב תפריט'
    : mode === 'expanded'
      ? 'צמצם תפריט'
      : 'סגור תפריט';

  const handleLogout = async () => {
    await logout();
    router.replace('/signin');
  };

  return (
    <aside
      id={SIDEBAR_ID}
      aria-label="תפריט ראשי"
      className={`fixed start-0 top-0 h-screen bg-sidebar-background text-sidebar-foreground shadow-xl z-50 flex flex-col overflow-hidden ${
        styles.shell
      } ${mode === 'hidden' ? styles.hidden : ''} ${
        railed ? SIDEBAR_WIDTH.rail : SIDEBAR_WIDTH.full
      }`}
    >
      <div
        className={`flex items-center h-20 border-b border-sidebar-accent ${
          railed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <h1
          className={`text-2xl font-bold text-sidebar-primary whitespace-nowrap ${
            railed ? 'sr-only' : 'flex-1 text-center'
          }`}
        >
          קוגומלו
        </h1>
        {onToggle && (
          <button
            ref={toggleRef}
            type="button"
            onClick={onToggle}
            className="p-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={open}
            aria-controls={SIDEBAR_ID}
          >
            {railed ? (
              <PanelRightOpen className="w-5 h-5" />
            ) : (
              <PanelRightClose className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      <nav className={`flex-1 min-h-0 py-6 overflow-y-auto ${railed ? 'px-2' : 'px-3'}`}>
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  // Narrowed to a rail the icon is all that is left of the
                  // entry, so the name carries on as the link's own label and
                  // as the tooltip a mouse gets.
                  title={railed ? item.name : undefined}
                  className={`
                    flex items-center gap-3 py-3 rounded-lg
                    transition-all duration-200
                    ${railed ? 'justify-center px-3' : 'px-4'}
                    ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    }
                  `}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className={railed ? 'sr-only' : 'whitespace-nowrap'}>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className={`h-16 border-t border-sidebar-accent flex items-center justify-center ${
          railed ? 'px-2' : 'px-4'
        }`}
      >
        {user ? (
          railed ? (
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-lg text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              title="התנתק"
              aria-label="התנתק"
            >
              <LogOut className="w-5 h-5" />
            </button>
          ) : (
            <Button size="sm" className="w-full justify-center" onClick={handleLogout}>
              התנתק
            </Button>
          )
        ) : (
          !railed && <p className="text-xs text-sidebar-foreground/60">© 2025 קוגומלו</p>
        )}
      </div>
    </aside>
  );
}
