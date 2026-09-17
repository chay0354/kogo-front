'use client';

import { usePathname } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { LiquidGlassTabBar } from '@/components/liquid-glass';
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
      {/*
        The category bar is the settings hub's navigation layer, so it is the one
        thing here made of Liquid Glass: it floats, stays pinned, and the page's
        content scrolls beneath it — which is what gives the glass something to
        bend. Everything under it stays plain content. The wrapper carries no
        opacity animation of its own: an element fading in is, for that moment, a
        backdrop root, and glass inside one cannot see the page.
      */}
      <div className="sticky top-16 sm:top-3 z-30 mb-6 -mt-2 sm:-mt-4">
        <LiquidGlassTabBar tabs={SETTINGS_TABS} activeHref={active?.href} ariaLabel="קטגוריות הגדרות" />
      </div>
      {children}
    </>
  );
}
