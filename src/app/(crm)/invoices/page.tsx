'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import NewDocumentDialog from '@/components/dialogs/NewDocumentDialog';
import { useAuth } from '@/components/AuthProvider';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import ChecksTab from './ChecksTab';
import CollectionTab from './CollectionTab';
import DocumentsTab from './DocumentsTab';
import PaymentsTab from './PaymentsTab';
import RecurringTab from './RecurringTab';
import type { ActiveTab } from './types';
import { useLedgerFilters } from './useLedgerFilters';
import styles from './invoices.module.css';

/** The tabs in order, each with the line under the title that says what it is for. */
const TABS: ReadonlyArray<{ key: ActiveTab; label: string; subtitle: string }> = [
  {
    key: 'מסמכים',
    label: 'מסמכים',
    subtitle: 'כל החשבוניות והקבלות שהופקו — מאיפה הגיע כל מסמך, כמה שולם ומה עוד פתוח',
  },
  {
    key: 'תשלומים',
    label: 'תשלומים',
    subtitle: 'כל החיובים: הרשמה, הוראת קבע, שיעורי ניסיון והחנות — כולל הסבר וזיכוי',
  },
  {
    key: 'גבייה',
    label: 'גבייה',
    subtitle: 'כל מה שהונפק ועוד לא נגבה — מהחוב הוותיק ביותר, עם תזכורת במייל',
  },
  {
    key: 'הוראת קבע',
    label: 'הוראת קבע',
    subtitle: 'כל הוראות הקבע הפעילות והמבוטלות של לקוחות החוגים',
  },
  {
    key: "צ'קים",
    label: 'צ׳קים',
    subtitle: 'רישום צ׳קים במשרד: קבלה ברישום, וחשבונית מס אוטומטית בכל חודש',
  },
];

const PANEL_ID = 'invoices-tabpanel';
const tabId = (index: number) => `invoices-tab-${index}`;

/**
 * The invoices page: a header, the tab switcher, the new-document action, and
 * the filters every tab shares. Each tab lives in its own file and owns its
 * rows, its loading and the fields that are its alone.
 */
export default function InvoicesPage() {
  const { user } = useAuth();
  // סליקת אשראי is a manager-only screen, so a partner is not shown a tab that
  // the shell would only bounce them off.
  const isManager = user?.role === 'manager';
  const [activeTab, setActiveTab] = useState<ActiveTab>('מסמכים');
  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  // The filters every tab shares live here, above the tabs, so a choice made
  // on one tab is still in force on the next.
  const ledger = useLedgerFilters();
  // Bumped when the new-document dialog closes, so a tab that lists documents
  // reloads and the one just issued is there.
  const [documentsVersion, setDocumentsVersion] = useState(0);

  const activeIndex = Math.max(0, TABS.findIndex((tab) => tab.key === activeTab));
  const current = TABS[activeIndex];

  return (
    <>
      <div className={`${theme.tokens} ${theme.scope} ${styles.page}`}>
        {/* The theme reserves room for AppLayout's sidebar toggle on the first
            child of .tokens — on the wrong side for RTL. This spacer takes
            that reservation, and the header clears the toggle's corner itself. */}
        <div aria-hidden className={styles.toggleSpacer} />

        <header className={`${theme.ph} ${styles.pageHead}`}>
          <div>
            <h1 className={theme.phTitle}>{current.label}</h1>
            <p className={theme.phSub}>{current.subtitle}</p>
          </div>

          <div className={styles.headActions}>
            <div className={styles.tabRail}>
              <div role="tablist" aria-label="מסכי החשבוניות" className={styles.tabList}>
                {TABS.map((tab, index) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={tabId(index)}
                    aria-selected={activeTab === tab.key}
                    aria-controls={PANEL_ID}
                    className={styles.tabPill}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* A tab that leaves the page instead of switching one, so it is a link. */}
              {isManager && (
                <Link href="/settings/billing" className={`${styles.tabPill} ${styles.tabPillLink}`}>
                  סליקת אשראי
                </Link>
              )}
            </div>

            <button type="button" className={styles.primaryAction} onClick={() => setIsNewDocOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              מסמך חדש
            </button>
          </div>
        </header>

        {/* Keyed on the tab, so each tab gets the shell's entrance as it opens. */}
        <div
          key={activeTab}
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={tabId(activeIndex)}
          className={styles.panel}
        >
          {activeTab === 'מסמכים' && <DocumentsTab ledger={ledger} refreshKey={documentsVersion} />}
          {activeTab === 'תשלומים' && <PaymentsTab ledger={ledger} />}
          {activeTab === 'גבייה' && <CollectionTab ledger={ledger} refreshKey={documentsVersion} />}
          {activeTab === 'הוראת קבע' && <RecurringTab ledger={ledger} />}
          {activeTab === "צ'קים" && (
            <ChecksTab ledger={ledger} />
          )}
        </div>
      </div>

      <NewDocumentDialog
        open={isNewDocOpen}
        onClose={() => {
          setIsNewDocOpen(false);
          setDocumentsVersion((version) => version + 1);
        }}
      />
    </>
  );
}
