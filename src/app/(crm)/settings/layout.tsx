'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { SETTINGS_TABS } from './settingsTabs';

/**
 * Settings is a hub: one header, one row of category tabs, and a page per
 * category underneath. Each tab is a real route, so a bookmark or a back
 * button lands on the same category.
 */


export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const active = SETTINGS_TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));

  return (
    <>
      <PageHeader title="הגדרות" description={active?.description ?? 'ניהול המערכת לפי נושא'} />
      <nav aria-label="קטגוריות הגדרות" className="mb-6 -mt-2 sm:-mt-4 animate-fade-in">
        <ul className="flex flex-wrap gap-1 rounded-lg bg-muted/40 p-1" role="tablist">
          {SETTINGS_TABS.map((tab) => {
            const isActive = active?.href === tab.href;
            return (
              <li key={tab.href} role="presentation">
                <Link
                  href={tab.href}
                  role="tab"
                  aria-selected={isActive}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-background text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </>
  );
}
