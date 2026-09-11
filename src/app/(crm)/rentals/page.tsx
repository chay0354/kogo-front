'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import CalendarSlotsView from './CalendarSlotsView';
import TenanciesView from './TenanciesView';
import styles from './rentals.module.css';

type RentalsView = 'tenants' | 'slots';

/** The two views, in order, each with the line under the title that says what it is for. */
const VIEWS: ReadonlyArray<{ key: RentalsView; label: string; subtitle: string }> = [
  {
    key: 'tenants',
    label: 'שוכרים',
    subtitle: 'כל שוכר הוא רשומה אחת: לקוח עסקי בסניף, ההסכם החודשי שלו והמשבצות שלו ביומן',
  },
  {
    key: 'slots',
    label: 'משבצות ביומן',
    subtitle: 'ניהול תקופות שבהן סטודיו מושכר — מוצג בלוח הזמנים ונחשב כהכנסה בלוח הבקרה',
  },
];

const PANEL_ID = 'rentals-view-panel';
const tabId = (key: RentalsView) => `rentals-view-${key}`;

/**
 * שכירויות. The tenants open first — one record per tenant, with its
 * agreement and the calendar slots that hang on it. The calendar's rental
 * events, which is what this page used to be, are the second view, unchanged.
 */
export default function RentalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<RentalsView>('tenants');
  const isWorker = user?.role === 'worker';

  // An instructor has no rentals screen, as before; the server refuses them the rentals too.
  useEffect(() => {
    if (isWorker) router.replace('/schedule');
  }, [isWorker, router]);

  if (isWorker) return null;

  const current = VIEWS.find((item) => item.key === view) ?? VIEWS[0];

  return (
    <div dir="rtl" className={`${theme.tokens} ${theme.scope} ${styles.page}`}>
      {/* The theme reserves room for AppLayout's sidebar toggle on the first
          child of .tokens — on the wrong side for RTL. This spacer takes that
          reservation, and the header clears the toggle's corner itself. */}
      <div aria-hidden className={styles.toggleSpacer} />

      <header className={`${theme.ph} ${styles.pageHead}`}>
        <div>
          <h1 className={theme.phTitle}>שכירויות</h1>
          <p className={theme.phSub}>{current.subtitle}</p>
        </div>

        <div role="tablist" aria-label="תצוגת השכירויות" className={styles.switchRail}>
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={tabId(item.key)}
              aria-selected={view === item.key}
              aria-controls={PANEL_ID}
              className={styles.switchPill}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Keyed on the view, so each view gets the shell's entrance as it opens. */}
      <div key={view} role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(view)} className={styles.panel}>
        {view === 'tenants' ? <TenanciesView /> : <CalendarSlotsView />}
      </div>
    </div>
  );
}
