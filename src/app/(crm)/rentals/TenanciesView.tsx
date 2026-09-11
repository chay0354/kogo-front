'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, KeyRound, Link2, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import {
  deleteTenancy,
  fetchTenancies,
  fetchTenancySuggestions,
  unlinkTenancySlot,
  type Tenancy,
  type TenancySlot,
  type TenancySuggestion,
} from '@/lib/rentalsApi';
import ImportTenanciesDialog from './ImportTenanciesDialog';
import LinkSlotsDialog from './LinkSlotsDialog';
import TenancyDialog from './TenancyDialog';
import {
  EMPTY_TENANCY_FILTERS,
  TENANCY_STATUS_OPTIONS,
  billingDayLabel,
  contractRangeLabel,
  countActiveTenancyFilters,
  formatShekels,
  isUnknownOutcome,
  matchesTenancyFilters,
  slotSummary,
  sortSlots,
  sortTenancies,
  tenancyApiError,
  tenancyKpis,
  tenancyStatusLabel,
  tenancyStatusTone,
  tenantIdentifier,
  tenantName,
  type StatusTone,
  type TenancyListFilters,
} from './tenancyUtils';
import styles from './rentals.module.css';

const TENANCIES_KEY = ['rentals', 'tenancies'] as const;
const SUGGESTIONS_KEY = ['rentals', 'tenancy-suggestions'] as const;

const NO_TENANCIES: Tenancy[] = [];
const NO_SUGGESTIONS: TenancySuggestion[] = [];

const TABLE_COLUMNS = 11;

const TONE_CLASS: Record<StatusTone, string> = {
  ok: theme.tagOk,
  progress: styles.toneProgress,
  signed: theme.tagType,
  off: theme.tagOff,
  bad: theme.tagLow,
};

/** The later phases' columns: on screen now, empty, and saying when they fill in. */
const LATER_COLUMNS = [
  { key: 'contract', label: 'חוזה', phase: 'שלב 2', title: 'החוזה השמור והחתימה עליו יופיעו כאן בשלב 2' },
  { key: 'standing-order', label: 'הוראת קבע', phase: 'שלב 4', title: 'הוראת הקבע של השוכר תופיע כאן בשלב 4' },
] as const;

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; tenancy: Tenancy }
  | { kind: 'link'; tenancy: Tenancy }
  | { kind: 'import' }
  | null;

type ConfirmState =
  | { kind: 'delete'; tenancy: Tenancy }
  | { kind: 'unlink'; tenancy: Tenancy; slot: TenancySlot }
  | null;

/**
 * שוכרים — one row per tenancy: the tenant, its branch, the calendar slots it
 * holds, the agreement (the monthly amount before VAT and with it, the billing
 * day, the dates, the status), and the columns later phases will fill.
 *
 * The list is small and arrives whole, scoped to the user's branches by the
 * server, so the branch, the status and the search narrow it here — instantly,
 * and without the figures above it dropping to zero while one status is
 * looked at. Every change goes to the server and the list is read again: this
 * screen never edits its own copy.
 */
export default function TenanciesView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { branches } = useScopedBranches();
  const [filters, setFilters] = useState<TenancyListFilters>(EMPTY_TENANCY_FILTERS);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Read afresh whenever the view opens: a rental added in the calendar view,
  // or a tenancy changed elsewhere, belongs here, not a copy from minutes ago.
  const tenanciesQuery = useQuery({
    queryKey: TENANCIES_KEY,
    queryFn: () => fetchTenancies(),
    enabled: Boolean(user),
    staleTime: 0,
  });
  const suggestionsQuery = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: fetchTenancySuggestions,
    enabled: Boolean(user),
    staleTime: 0,
  });

  const tenancies = tenanciesQuery.data ?? NO_TENANCIES;
  const suggestions = suggestionsQuery.data ?? NO_SUGGESTIONS;
  const isPartner = user?.role === 'partner';

  const visible = useMemo(
    () => sortTenancies(tenancies.filter((tenancy) => matchesTenancyFilters(tenancy, filters))),
    [tenancies, filters],
  );
  const kpis = useMemo(() => tenancyKpis(tenancies, suggestions, filters.branchId), [tenancies, suggestions, filters.branchId]);
  const branchSuggestions = useMemo(
    () => suggestions.filter((group) => !filters.branchId || group.branch === filters.branchId),
    [suggestions, filters.branchId],
  );
  const unlinkedEverywhere = useMemo(
    () => suggestions.reduce((sum, group) => sum + (group.slots?.length ?? 0), 0),
    [suggestions],
  );
  const activeFilterCount = countActiveTenancyFilters(filters);

  const branchOptions = useMemo(() => {
    const options = branches.map((branch) => ({ value: branch.id, label: branch.name }));
    // A branch a tenancy sits in but the list lacks (closed since) can still be filtered by.
    tenancies.forEach((tenancy) => {
      if (tenancy.branch && !options.some((option) => option.value === tenancy.branch)) {
        options.push({ value: tenancy.branch, label: tenancy.branch_name || 'סניף' });
      }
    });
    return options.sort((a, b) => a.label.localeCompare(b.label, 'he'));
  }, [branches, tenancies]);
  const branchName = branchOptions.find((option) => option.value === filters.branchId)?.label ?? '';
  const scopeLabel = filters.branchId ? `ב${branchName}` : isPartner ? 'בסניפים שלך' : 'בכל הסניפים';

  function setFilter<K extends keyof TenancyListFilters>(key: K, value: TenancyListFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: TENANCIES_KEY });
    void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
  }

  function saved(message: string) {
    refresh();
    toast.success(message);
  }

  // The free slots are read again whenever a dialog that offers them opens.
  function open(next: Exclude<DialogState, null>) {
    setActionError('');
    void suggestionsQuery.refetch();
    setDialog(next);
  }

  async function runConfirmed(choice: boolean) {
    const target = confirm;
    if (!choice || !target) return;
    setActionError('');
    setBusyId(target.tenancy.id);
    try {
      if (target.kind === 'delete') {
        await deleteTenancy(target.tenancy.id);
        toast.success('הטיוטה נמחקה');
      } else {
        await unlinkTenancySlot(target.tenancy.id, target.slot.id);
        toast.success('המשבצת נותקה מהשוכר');
      }
    } catch (err) {
      setActionError(
        isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת. הרשימה מתרעננת — בדקו בה מה קרה לפני שמנסים שוב.'
          : tenancyApiError(err, target.kind === 'delete' ? 'המחיקה נכשלה' : 'ניתוק המשבצת נכשל'),
      );
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  const confirmTarget = confirm ? tenantName(confirm.tenancy.tenant) : '';
  const confirmCopy =
    confirm?.kind === 'delete'
      ? {
          title: 'מחיקת טיוטה',
          message: `למחוק את הטיוטה של ${confirmTarget}?\nאין לה משבצות ביומן, כך ששום שכירות לא תושפע. הפעולה אינה הפיכה.`,
          confirmText: 'מחיקה',
        }
      : confirm?.kind === 'unlink'
        ? {
            title: 'ניתוק משבצת',
            message: `לנתק את "${slotSummary(confirm.slot)}" מ־${confirmTarget}?\nהשכירות נשארת ביומן, וחוזרת לרשימת השכירויות שלא חוברו לשוכר.`,
            confirmText: 'ניתוק',
          }
        : { title: '', message: '', confirmText: 'אישור' };

  function renderRow(tenancy: Tenancy): ReactNode {
    const name = tenantName(tenancy.tenant);
    const identifier = tenantIdentifier(tenancy.tenant);
    const slots = sortSlots(tenancy.slots ?? []);
    const deletable = tenancy.status === 'draft' && slots.length === 0;
    const busy = busyId === tenancy.id;

    return (
      <tr key={tenancy.id}>
        <td className={styles.wrapCell}>
          <span className={styles.strong}>{name}</span>
          {identifier && <span className={styles.subLine}>{identifier}</span>}
        </td>
        <td>{tenancy.branch_name || '—'}</td>
        <td className={styles.slotsCell}>
          {slots.length === 0 ? (
            <span className={styles.dash}>אין משבצות</span>
          ) : (
            <ul className={styles.slotList}>
              {slots.map((slot) => {
                const summary = slotSummary(slot);
                return (
                  <li key={slot.id} className={styles.slotLine}>
                    <span className={styles.slotText}>
                      {summary}
                      {slot.is_active === false && <span className={styles.slotOff}>לא פעילה</span>}
                    </span>
                    <button
                      type="button"
                      className={styles.slotUnlink}
                      title="ניתוק המשבצת מהשוכר"
                      aria-label={`ניתוק ${summary} מ־${name}`}
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'unlink', tenancy, slot })}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </td>
        <td className={`${theme.n} ${styles.money}`}>{formatShekels(tenancy.monthly_amount)}</td>
        <td className={`${theme.n} ${styles.muted}`}>{formatShekels(tenancy.monthly_total)}</td>
        <td>{billingDayLabel(tenancy.billing_day)}</td>
        <td>{contractRangeLabel(tenancy.start_date, tenancy.end_date)}</td>
        <td>
          <span className={`${theme.tag} ${TONE_CLASS[tenancyStatusTone(tenancy.status)]}`}>
            {tenancyStatusLabel(tenancy.status, tenancy.status_label)}
          </span>
        </td>
        {LATER_COLUMNS.map((column) => (
          <td key={column.key}>
            <span className={styles.later} title={column.title} aria-hidden="true">
              —
            </span>
            <span className={styles.srOnly}>{column.title}</span>
          </td>
        ))}
        <td>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="עריכה"
              aria-label={`עריכת ${name}`}
              disabled={busy}
              onClick={() => open({ kind: 'edit', tenancy })}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title="חיבור משבצות"
              aria-label={`חיבור משבצות ל־${name}`}
              disabled={busy}
              onClick={() => open({ kind: 'link', tenancy })}
            >
              <Link2 size={16} aria-hidden="true" />
            </button>
            {deletable && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconDanger}`}
                title="מחיקת הטיוטה"
                aria-label={`מחיקת הטיוטה של ${name}`}
                disabled={busy}
                onClick={() => setConfirm({ kind: 'delete', tenancy })}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  function renderList(): ReactNode {
    if (tenanciesQuery.isLoading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען שוכרים" />;
    }

    if (tenanciesQuery.isError && tenancies.length === 0) {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את השוכרים"
          text="אפשר לנסות שוב בעוד רגע."
        >
          <button
            type="button"
            className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
            onClick={() => void tenanciesQuery.refetch()}
          >
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (tenancies.length === 0) {
      return (
        <EmptyPanel
          icon={<Users className={styles.emptyIcon} aria-hidden="true" />}
          title="עדיין אין שוכרים"
          text={
            unlinkedEverywhere > 0
              ? `ביומן יש ${unlinkedEverywhere.toLocaleString('he-IL')} שכירויות שעוד לא שייכות לשוכר. אפשר לחבר אותן בבת אחת, או להוסיף שוכר חדש.`
              : 'כל שוכר הוא לקוח עסקי בסניף, עם הסכם חודשי והמשבצות שלו ביומן.'
          }
        >
          {unlinkedEverywhere > 0 && (
            <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={() => open({ kind: 'import' })}>
              חיבור שכירויות קיימות
            </button>
          )}
          <button type="button" className={styles.emptyBtn} onClick={() => open({ kind: 'create' })}>
            שוכר חדש
          </button>
        </EmptyPanel>
      );
    }

    if (visible.length === 0) {
      return (
        <EmptyPanel
          icon={<Search className={styles.emptyIcon} aria-hidden="true" />}
          title="אף שוכר לא מתאים לסינון"
          text={`ברשימה יש ${tenancies.length.toLocaleString('he-IL')} שוכרים, אבל הסינון שנבחר מסתיר את כולם. נקו את הסינון כדי לראות אותם.`}
        >
          <button
            type="button"
            className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`}
            onClick={() => setFilters(EMPTY_TENANCY_FILTERS)}
          >
            נקה סינון
          </button>
        </EmptyPanel>
      );
    }

    return (
      <div className={theme.tableScroll}>
        <table className={`${theme.table} ${styles.table}`}>
          <caption className={styles.srOnly}>שוכרים — פעילים קודם, אחר כך לפי שם</caption>
          <thead>
            <tr>
              <th scope="col">שוכר</th>
              <th scope="col">סניף</th>
              <th scope="col">משבצות ביומן</th>
              <th scope="col" className={theme.n}>
                לחודש, לפני מע״מ
              </th>
              <th scope="col" className={theme.n}>
                כולל מע״מ
              </th>
              <th scope="col">יום חיוב</th>
              <th scope="col">תקופת ההסכם</th>
              <th scope="col">סטטוס</th>
              {LATER_COLUMNS.map((column) => (
                <th key={column.key} scope="col" title={column.title}>
                  {column.label}
                  <span className={styles.phaseTag}>{column.phase}</span>
                </th>
              ))}
              <th scope="col" className={theme.n}>
                פעולות
              </th>
            </tr>
          </thead>
          <tbody>{visible.map(renderRow)}</tbody>
        </table>
      </div>
    );
  }

  const unlinkedFoot: ReactNode = suggestionsQuery.isError
    ? 'לא נטען — נסו לרענן את הדף'
    : kpis.unlinkedSlots > 0
      ? (
        <button type="button" className={styles.footLink} onClick={() => open({ kind: 'import' })}>
          {kpis.unlinkedGroups === 1
            ? 'שוכר מוצע אחד — לחיבור'
            : `${kpis.unlinkedGroups.toLocaleString('he-IL')} שוכרים מוצעים — לחיבור`}
        </button>
      )
      : `כל השכירויות ${scopeLabel} מחוברות`;

  return (
    <div className={styles.view}>
      <div className={`${theme.grid} ${theme.g3} ${styles.kpis}`}>
        <Kpi
          label="שוכרים פעילים"
          loading={tenanciesQuery.isLoading}
          value={kpis.activeCount.toLocaleString('he-IL')}
          foot={`מתוך ${kpis.totalCount.toLocaleString('he-IL')} שוכרים ${scopeLabel}`}
        />
        <Kpi
          label="סה״כ חודשי של הפעילים, לפני מע״מ"
          loading={tenanciesQuery.isLoading}
          value={formatShekels(kpis.activeMonthlyNet)}
          foot={`כולל מע״מ: ${formatShekels(kpis.activeMonthlyGross)}`}
        />
        <Kpi
          label="שכירויות שלא חוברו לשוכר"
          loading={suggestionsQuery.isLoading}
          value={suggestionsQuery.isError ? '—' : kpis.unlinkedSlots.toLocaleString('he-IL')}
          foot={unlinkedFoot}
        />
      </div>

      <section className={theme.card} aria-label="סינון">
        <div className={styles.filterRow}>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="tenancies-search" className={styles.fieldLabel}>
              חיפוש
            </label>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} aria-hidden="true" />
              <input
                id="tenancies-search"
                type="search"
                autoComplete="off"
                className={`${styles.control} ${styles.searchControl} ${filters.search ? styles.controlOn : ''}`}
                placeholder="שם, ח.פ, ת.ז, טלפון או סטודיו…"
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="tenancies-branch" className={styles.fieldLabel}>
              סניף
            </label>
            <select
              id="tenancies-branch"
              className={`${styles.control} ${filters.branchId ? styles.controlOn : ''}`}
              value={filters.branchId}
              onChange={(event) => setFilter('branchId', event.target.value)}
            >
              <option value="">{isPartner ? 'כל הסניפים שלי' : 'כל הסניפים'}</option>
              {branchOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="tenancies-status" className={styles.fieldLabel}>
              סטטוס
            </label>
            <select
              id="tenancies-status"
              className={`${styles.control} ${filters.status ? styles.controlOn : ''}`}
              value={filters.status}
              onChange={(event) => setFilter('status', event.target.value)}
            >
              <option value="">כל הסטטוסים</option>
              {TENANCY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(tenancies.length > 0 || activeFilterCount > 0) && (
          <div className={styles.filterFooter}>
            <p className={styles.resultLine}>
              <span aria-live="polite">
                מציג <b>{visible.length.toLocaleString('he-IL')}</b> מתוך{' '}
                <b>{tenancies.length.toLocaleString('he-IL')}</b> שוכרים
              </span>
              {activeFilterCount > 0 && (
                <>
                  <span className={styles.sep} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.activeCount}>
                    {activeFilterCount === 1 ? 'מסנן אחד פעיל' : `${activeFilterCount} מסננים פעילים`}
                  </span>
                  <button type="button" className={styles.clearLink} onClick={() => setFilters(EMPTY_TENANCY_FILTERS)}>
                    <X size={13} aria-hidden="true" />
                    נקה סינון
                  </button>
                </>
              )}
            </p>
          </div>
        )}
      </section>

      <section className={theme.card} aria-labelledby="tenancies-list-title">
        <div className={styles.cardHead}>
          <div>
            <h2 id="tenancies-list-title" className={theme.cardTitle}>
              רשימת השוכרים
            </h2>
            <p className={styles.cardSub}>פעילים קודם, אחר כך לפי שם</p>
          </div>
          <div className={styles.headActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => open({ kind: 'import' })}>
              <KeyRound size={15} aria-hidden="true" />
              חיבור שכירויות קיימות
              {kpis.unlinkedGroups > 0 && <span className={styles.countBadge}>{kpis.unlinkedGroups}</span>}
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => open({ kind: 'create' })}>
              <Plus size={15} aria-hidden="true" />
              שוכר חדש
            </button>
          </div>
        </div>

        {actionError && (
          <div className={styles.notice} role="alert">
            <span>{actionError}</span>
            <button type="button" className={styles.noticeClose} onClick={() => setActionError('')} aria-label="סגירת ההודעה">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {tenanciesQuery.isError && tenancies.length > 0 && (
          <div className={styles.notice} role="status">
            <span>הרשימה לא התעדכנה — מוצגת הגרסה האחרונה שנטענה.</span>
            <button type="button" className={styles.clearLink} onClick={() => void tenanciesQuery.refetch()}>
              נסו שוב
            </button>
          </div>
        )}

        {renderList()}
      </section>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <TenancyDialog
          key={dialog.kind === 'edit' ? dialog.tenancy.id : 'new'}
          tenancy={dialog.kind === 'edit' ? dialog.tenancy : null}
          branches={branches}
          defaultBranchId={filters.branchId}
          suggestions={suggestions}
          onClose={() => setDialog(null)}
          onChanged={refresh}
          onSaved={saved}
        />
      )}

      {dialog?.kind === 'link' && (
        <LinkSlotsDialog
          tenancy={dialog.tenancy}
          suggestions={suggestions}
          suggestionsLoading={suggestionsQuery.isFetching}
          onClose={() => setDialog(null)}
          onChanged={refresh}
          onSaved={saved}
        />
      )}

      {dialog?.kind === 'import' && (
        <ImportTenanciesDialog
          suggestions={branchSuggestions}
          loading={suggestionsQuery.isLoading}
          failed={suggestionsQuery.isError}
          onRetry={() => void suggestionsQuery.refetch()}
          branchName={filters.branchId ? branchName : undefined}
          onClose={() => setDialog(null)}
          onChanged={refresh}
          onImported={(count) => saved(count === 1 ? 'נוצר שוכר אחד' : `נוצרו ${count.toLocaleString('he-IL')} שוכרים`)}
        />
      )}

      <BodyPortal>
        <ConfirmDialog
          isOpen={confirm !== null}
          onClose={() => setConfirm(null)}
          onConfirm={runConfirmed}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmText={confirmCopy.confirmText}
          type="warning"
        />
      </BodyPortal>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  foot: ReactNode;
  loading: boolean;
}

function Kpi({ label, value, foot, loading }: KpiProps) {
  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      {loading ? <Skeleton className="h-7 w-24 my-1" /> : <div className={theme.kpiVal}>{value}</div>}
      <div className={theme.kpiFoot}>{foot}</div>
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
