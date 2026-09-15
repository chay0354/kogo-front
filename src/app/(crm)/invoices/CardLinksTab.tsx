'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Copy, FileSearch, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { fetchLinkOverview, formatShekels, type LinkOverviewRow } from '@/lib/paymentLinksApi';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import LedgerFilterBar, { LedgerSelect } from './LedgerFilterBar';
import type { LedgerFilters } from './types';
import { useLedgerFilters, type LedgerFiltersState } from './useLedgerFilters';
import { daysAgoLocalISO, formatDate, isWithinRange, matchesLedgerFilters, withBranchCity } from './utils';
import pageStyles from './invoices.module.css';
import styles from './cardLinks.module.css';

// ---------------------------------------------------------------------------
// The rows and the rules — exported so cardLinksTab.test.ts can hold them.
// ---------------------------------------------------------------------------

export type CardLinkLedgerRow = LinkOverviewRow;

/**
 * What became of a link, in the four words the office asks in.
 *
 * The two tables behind this screen keep their own vocabularies — a card link
 * is `pending`, a card-update link is `opened` — and both are shown as they
 * are, in the row's own `status_label`. This is the coarser question on top:
 * is it still out there, is it finished, does somebody have to do something.
 */
export type LinkOutcome = 'waiting' | 'done' | 'problem' | 'cancelled';

export const LINK_OUTCOME_OPTIONS = [
  { value: 'waiting', label: 'ממתין' },
  { value: 'done', label: 'הסתיים' },
  { value: 'problem', label: 'דורש טיפול' },
  { value: 'cancelled', label: 'בוטל' },
] as const;

export const LINK_KIND_OPTIONS = [
  { value: 'standing_order', label: 'הוראת קבע' },
  { value: 'one_time', label: 'חיוב חד-פעמי' },
  { value: 'card_update', label: 'עדכון אשראי' },
] as const;

/** The range narrows on `created_at`, so every shared field is on screen. */
export const CARD_LINKS_HIDDEN_FIELDS = [] as const;

/** How many links are pulled in at once, and again each time the office asks for more. */
export const CARD_LINKS_PAGE_SIZE = 100;

/** A link that was created this many days ago or less counts as "just sent". */
export const RECENTLY_SENT_DAYS = 7;

export interface LinkSummary {
  total: number;
  waiting: number;
  done: number;
  problem: number;
  recent: number;
}

export function linkOutcome(row: LinkOverviewRow): LinkOutcome {
  if (row.status === 'completed' || row.status === 'charged' || row.status === 'card_saved') return 'done';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'review' || row.status === 'declined') return 'problem';
  // pending · processing · created · opened — still out there, unless the last
  // attempt left an error behind, which is somebody's to chase.
  return row.last_error ? 'problem' : 'waiting';
}

export function linkOutcomeLabel(outcome: LinkOutcome): string {
  return LINK_OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label ?? outcome;
}

function linkOutcomeClass(outcome: LinkOutcome): string {
  if (outcome === 'done') return pageStyles.statusCompleted;
  if (outcome === 'problem') return pageStyles.statusFailed;
  if (outcome === 'cancelled') return pageStyles.statusRefunded;
  return pageStyles.statusPending;
}

/** How the link left the office — and, when we know it, whether it got there. */
export function linkSentLabel(row: LinkOverviewRow): string {
  if (row.sent_via === 'whatsapp') return row.sent_at ? 'וואטסאפ' : 'וואטסאפ — לא נשלח';
  // Copied out of the CRM: we never learn when it was pasted, only that it was
  // the office and not us that carried it.
  if (row.sent_via === 'copy') return 'הועתק מהמשרד';
  return 'טרם נשלח';
}

/**
 * The one line under the status that says what actually happened last.
 *
 * The order is the order the office cares about: an error first, then the
 * ending, then the fact that somebody at least opened it.
 */
export function linkStatusNote(row: LinkOverviewRow): string {
  if (row.last_error) return row.last_error;
  if (row.completed_at) return `הסתיים ב-${formatDate(row.completed_at)}`;
  if (row.first_opened_at) return `נפתח ב-${formatDate(row.first_opened_at)}`;
  if (row.sent_at) return `נשלח ב-${formatDate(row.sent_at)}`;
  return '';
}

export function matchesLinkSearch(row: LinkOverviewRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const has = (value: string | null | undefined) => String(value ?? '').toLowerCase().includes(q);
  return [
    row.child_name,
    row.family_name,
    row.description,
    row.branch_name,
    row.kind_label,
    row.status_label,
    row.created_by_name,
  ].some(has);
}

export function matchesLinkFilters(row: CardLinkLedgerRow, filters: LedgerFilters): boolean {
  return (
    matchesLedgerFilters(row, filters)
    && isWithinRange(row.created_at, filters)
    && matchesLinkSearch(row, filters.search)
  );
}

/** Newest first — the link just sent is the one being asked about. */
export function compareLinks(a: LinkOverviewRow, b: LinkOverviewRow): number {
  return String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || String(a.id).localeCompare(String(b.id));
}

export function summarizeLinks(rows: readonly LinkOverviewRow[], sentSince: string): LinkSummary {
  const summary: LinkSummary = { total: rows.length, waiting: 0, done: 0, problem: 0, recent: 0 };
  rows.forEach((row) => {
    const outcome = linkOutcome(row);
    if (outcome === 'waiting') summary.waiting += 1;
    else if (outcome === 'done') summary.done += 1;
    else if (outcome === 'problem') summary.problem += 1;
    if (String(row.created_at ?? '').slice(0, 10) >= sentSince) summary.recent += 1;
  });
  return summary;
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

const TABLE_COLUMNS = 7;

type LoadState = 'loading' | 'ready' | 'error';

const count = (n: number) => n.toLocaleString('he-IL');

interface CardLinksTabProps {
  ledger?: LedgerFiltersState;
}

/**
 * קישורי אשראי — every link the office handed a parent, and what became of it.
 *
 * One list over two kinds of link: the card links sent per child, and the
 * standing-order card-update links. The server merges them newest first; this
 * tab loads a window of them and narrows it with the page's shared filters, so
 * a branch chosen on another tab still holds here.
 */
export default function CardLinksTab({ ledger: pageLedger }: CardLinksTabProps) {
  const ownLedger = useLedgerFilters();
  const ledger = pageLedger ?? ownLedger;
  const { filters } = ledger;
  const { branches } = useScopedBranches();

  const [links, setLinks] = useState<LinkOverviewRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [kind, setKind] = useState('');
  const [outcome, setOutcome] = useState('');
  const [copiedUrl, setCopiedUrl] = useState('');
  const latestRequest = useRef(0);
  const copiedTimer = useRef<number | null>(null);

  // An answer that arrives after a newer request went out is dropped, so a
  // reload racing a "load more" cannot leave the list half from each.
  const load = useCallback(async (offset: number) => {
    const request = ++latestRequest.current;
    try {
      const page = await fetchLinkOverview({ limit: CARD_LINKS_PAGE_SIZE, offset });
      if (request !== latestRequest.current) return;
      setLinks((prev) => {
        const merged = offset === 0 ? page.results : [...prev, ...page.results];
        // Two windows can overlap when a link is created between them; the id
        // is what keeps one link one row.
        const byId = new Map(merged.map((row) => [row.id, row]));
        return [...byId.values()].sort(compareLinks);
      });
      setHasMore(page.has_more);
      setLoadState('ready');
    } catch (error) {
      if (request !== latestRequest.current) return;
      console.error('Error loading card links:', error);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load(0);
    return () => {
      latestRequest.current += 1;
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, [load]);

  function retry() {
    setLoadState('loading');
    void load(0);
  }

  async function loadMore() {
    setLoadingMore(true);
    await load(links.length);
    setLoadingMore(false);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
      setCopiedUrl(url);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedUrl(''), 1800);
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  }

  const cityByBranch = useMemo(() => {
    const ids = new Map<string, string>();
    branches.forEach((branch) => {
      if (branch.city) ids.set(branch.id, String(branch.city));
    });
    return ids;
  }, [branches]);

  const rows = useMemo<CardLinkLedgerRow[]>(
    () => links.map((row) => withBranchCity(row, cityByBranch)),
    [links, cityByBranch],
  );
  const scoped = useMemo(() => rows.filter((row) => matchesLinkFilters(row, filters)), [rows, filters]);
  const visible = useMemo(
    () => scoped.filter((row) => (!kind || row.kind === kind) && (!outcome || linkOutcome(row) === outcome)),
    [scoped, kind, outcome],
  );
  const summary = useMemo(
    () => summarizeLinks(scoped, daysAgoLocalISO(RECENTLY_SENT_DAYS)),
    [scoped],
  );

  const loading = loadState === 'loading';
  const extraActiveCount = (kind ? 1 : 0) + (outcome ? 1 : 0);

  function clearAllFilters() {
    ledger.reset();
    setKind('');
    setOutcome('');
  }

  function renderRow(row: CardLinkLedgerRow): ReactNode {
    const state = linkOutcome(row);
    const note = linkStatusNote(row);
    const copied = Boolean(row.public_url) && copiedUrl === row.public_url;

    return (
      <tr key={row.id}>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.child_name || '—'}</span>
          {row.family_name && <span className={styles.subLine}>משפחת {row.family_name}</span>}
        </td>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{row.kind_label}</span>
          {(row.description || row.mode_label) && (
            <span className={styles.subLine}>{row.description || row.mode_label}</span>
          )}
        </td>
        <td className={styles.wrapCell}>
          {row.branch_name ? <span>{row.branch_name}</span> : <span className={styles.dash}>—</span>}
        </td>
        <td className={`${theme.n} ${styles.money}`}>
          {row.amount ? formatShekels(row.amount) : <span className={styles.dash}>—</span>}
        </td>
        <td>
          <span>{linkSentLabel(row)}</span>
          <span className={styles.subLine}>
            {row.sent_at ? formatDate(row.sent_at) : `נוצר ב-${formatDate(row.created_at)}`}
          </span>
          {row.created_by_name && <span className={styles.subLine}>{row.created_by_name}</span>}
        </td>
        <td className={styles.wrapCell}>
          <span className={`${pageStyles.statusBadge} ${linkOutcomeClass(state)}`}>{row.status_label}</span>
          {note && (
            <span className={`${styles.subLine} ${state === 'problem' ? styles.problemNote : ''}`}>{note}</span>
          )}
        </td>
        <td className={theme.n}>
          {row.public_url ? (
            <button
              type="button"
              className={styles.actionBtn}
              aria-label={`העתקת הקישור של ${row.child_name || 'הלקוח'}`}
              onClick={() => void copy(row.public_url)}
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? 'הועתק' : 'העתקה'}
            </button>
          ) : (
            <span className={styles.dash}>—</span>
          )}
        </td>
      </tr>
    );
  }

  function renderList(): ReactNode {
    if (loading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען קישורי אשראי" />;
    }

    if (loadState === 'error') {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את הקישורים"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (links.length === 0) {
      return (
        <EmptyPanel
          icon={<Link2 className={styles.emptyIcon} aria-hidden="true" />}
          title="עוד לא נשלח אף קישור אשראי"
          text="קישור נוצר מתוך כרטיס הילד — הוראת קבע, חיוב חד-פעמי או עדכון פרטי אשראי — וכאן רואים מה קרה איתו."
        />
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title="אף קישור לא מתאים לסינון"
          text={`נטענו ${count(links.length)} קישורים, אבל הסינון שנבחר מסתיר את כולם. נקו את הסינון כדי לראות אותם.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={clearAllFilters}>
            נקה סינון
          </button>
        </EmptyPanel>
      );
    }

    return (
      <>
        <div className={theme.tableScroll}>
          <table className={`${theme.table} ${styles.table}`}>
            <caption className={styles.srOnly}>קישורי האשראי שנשלחו, מהחדש לישן</caption>
            <thead>
              <tr>
                <th scope="col">ילד</th>
                <th scope="col">סוג הקישור</th>
                <th scope="col">סניף</th>
                <th scope="col" className={theme.n}>סכום</th>
                <th scope="col">נשלח</th>
                <th scope="col">מה קרה</th>
                <th scope="col" className={theme.n}>קישור</th>
              </tr>
            </thead>
            <tbody>{visible.map(renderRow)}</tbody>
          </table>
        </div>
        {hasMore && (
          <div className={styles.moreRow}>
            <button type="button" className={styles.emptyBtn} disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'טוען...' : 'טען קישורים ישנים יותר'}
            </button>
          </div>
        )}
        <p className={styles.footnote}>
          קישור שכבר מומש אינו ניתן לשליחה חוזרת, ולכן אין לו כפתור העתקה. קישור אשראי לילד נוצר ומבוטל מתוך כרטיס
          הילד; קישור לעדכון פרטי אשראי נוצר מתוך הוראת הקבע.
        </p>
      </>
    );
  }

  return (
    <div className={styles.tab}>
      <div className={`${theme.grid} ${theme.g4} ${styles.kpis}`}>
        <Kpi
          label="ממתינים לתשלום"
          loading={loading}
          value={count(summary.waiting)}
          foot={`מתוך ${count(summary.total)} קישורים`}
        />
        <Kpi
          label="הסתיימו"
          loading={loading}
          value={count(summary.done)}
          foot="כרטיס נשמר או חיוב עבר"
        />
        <Kpi
          label="דורשים טיפול"
          loading={loading}
          value={count(summary.problem)}
          foot={summary.problem > 0 ? 'נדחה, נכשל או ממתין לבדיקה' : 'אין קישור תקוע'}
          negative={summary.problem > 0}
        />
        <Kpi
          label={`נשלחו ב-${RECENTLY_SENT_DAYS} הימים האחרונים`}
          loading={loading}
          value={count(summary.recent)}
          foot="לפי מועד יצירת הקישור"
        />
      </div>

      <LedgerFilterBar
        ledger={ledger}
        rows={rows}
        rowsLoading={loading}
        hide={CARD_LINKS_HIDDEN_FIELDS}
        searchPlaceholder="ילד, משפחה, תיאור, סניף…"
        extraActiveCount={extraActiveCount}
        onClearExtra={() => { setKind(''); setOutcome(''); }}
        result={loading || loadState === 'error'
          ? undefined
          : { shown: visible.length, total: links.length, noun: 'קישורים' }}
        idPrefix="card-links"
      >
        <LedgerSelect
          id="card-links-kind"
          label="סוג הקישור"
          value={kind}
          onChange={setKind}
          options={LINK_KIND_OPTIONS}
          allLabel="כל הסוגים"
        />
        <LedgerSelect
          id="card-links-outcome"
          label="מה קרה"
          value={outcome}
          onChange={setOutcome}
          options={LINK_OUTCOME_OPTIONS}
          allLabel="הכול"
        />
      </LedgerFilterBar>

      <section className={theme.card} aria-labelledby="card-links-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="card-links-list-title" className={theme.cardTitle}>
              קישורי האשראי
            </h2>
            <p className={styles.cardSub}>מהחדש לישן · כל הילדים, כולל קישורי עדכון פרטי אשראי</p>
          </div>
        </div>

        {renderList()}
      </section>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  foot: string;
  loading: boolean;
  negative?: boolean;
}

function Kpi({ label, value, foot, loading, negative = false }: KpiProps) {
  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      {loading ? (
        <Skeleton className="h-7 w-24 my-1" />
      ) : (
        <div className={`${theme.kpiVal} ${negative ? theme.down : ''}`}>{value}</div>
      )}
      <div className={theme.kpiFoot}>{loading ? ' ' : foot}</div>
    </div>
  );
}

interface EmptyPanelProps {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}

function EmptyPanel({ icon, title, text, children }: EmptyPanelProps) {
  return (
    <div className={styles.empty} role="status">
      {icon}
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyText}>{text}</p>
      {children ? <div className={styles.emptyActions}>{children}</div> : null}
    </div>
  );
}
