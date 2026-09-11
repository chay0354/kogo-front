'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  Download,
  FileCheck2,
  FilePlus2,
  History as HistoryIcon,
  KeyRound,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import {
  deleteTenancy,
  downloadContractPdf,
  downloadSignedContractPdf,
  fetchTenancies,
  fetchTenancySuggestions,
  issueTenancyContract,
  unlinkTenancySlot,
  type Tenancy,
  type TenancySlot,
  type TenancySuggestion,
} from '@/lib/rentalsApi';
import ContractHistoryDialog from './ContractHistoryDialog';
import ImportTenanciesDialog from './ImportTenanciesDialog';
import LinkSlotsDialog from './LinkSlotsDialog';
import SigningLinkDialog from './SigningLinkDialog';
import { SigningChips, StaleChip, ToneChip } from './StatusChips';
import TenancyDialog from './TenancyDialog';
import { contractCell, contractFileName, issueConfirmMessage, issuedMessage, type ContractCell } from './contractUtils';
import { sendForSigningState, signedByText } from './signingUtils';
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
  type TenancyListFilters,
} from './tenancyUtils';
import styles from './rentals.module.css';

const TENANCIES_KEY = ['rentals', 'tenancies'] as const;
const SUGGESTIONS_KEY = ['rentals', 'tenancy-suggestions'] as const;

const NO_TENANCIES: Tenancy[] = [];
const NO_SUGGESTIONS: TenancySuggestion[] = [];

const TABLE_COLUMNS = 11;

/** A later phase's column: on screen now, empty, and saying when it fills in. */
const LATER_COLUMNS = [
  { key: 'standing-order', label: 'הוראת קבע', phase: 'שלב 4', title: 'הוראת הקבע של השוכר תופיע כאן בשלב 4' },
] as const;

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; tenancy: Tenancy }
  | { kind: 'link'; tenancy: Tenancy }
  | { kind: 'import' }
  | { kind: 'history'; tenancy: Tenancy }
  | { kind: 'signing'; tenancy: Tenancy; contractId: string }
  | null;

type ConfirmState =
  | { kind: 'delete'; tenancy: Tenancy }
  | { kind: 'unlink'; tenancy: Tenancy; slot: TenancySlot }
  | { kind: 'issue'; tenancy: Tenancy }
  | null;

/** What a row's contract controls are waiting on while their request is out. */
type RowAction = 'issue' | 'download' | 'signed';

/** The contract column once a version is on file. */
type IssuedCell = Exclude<ContractCell, { state: 'none' }>;

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * שוכרים — one row per tenancy: the tenant, its branch, the calendar slots it
 * holds, the agreement (the monthly amount before VAT and with it, the billing
 * day, the dates, the status), its contract — the version on file, its PDF and
 * whether it still matches the agreement — and the column a later phase fills.
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
  // Contract requests run per row, so one row's issue or download never holds up another's.
  // The ref is what a second click reads, before the state has re-rendered.
  const [rowActions, setRowActions] = useState<Record<string, RowAction>>({});
  const rowActionsRef = useRef<Record<string, RowAction>>({});
  // A contract request's failure, in the server's words, shown under that row's contract.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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

  function openHistory(tenancy: Tenancy) {
    setActionError('');
    setDialog({ kind: 'history', tenancy });
  }

  // ---- the contract ----

  /** Mark a row's contract request as out. false when one already is, so a second click sends nothing. */
  function startRowAction(tenancyId: string, action: RowAction): boolean {
    if (rowActionsRef.current[tenancyId]) return false;
    rowActionsRef.current = { ...rowActionsRef.current, [tenancyId]: action };
    setRowActions(rowActionsRef.current);
    setRowErrors((prev) => withoutKey(prev, tenancyId));
    return true;
  }

  function endRowAction(tenancyId: string) {
    rowActionsRef.current = withoutKey(rowActionsRef.current, tenancyId);
    setRowActions(rowActionsRef.current);
  }

  function setRowError(tenancyId: string, text: string) {
    setRowErrors((prev) => ({ ...prev, [tenancyId]: text }));
  }

  /**
   * Issue a version: at once when nothing would be replaced, else once the
   * office confirms that the unsigned version on file goes. The question is
   * asked from the row as the list last read it; the server voids whatever
   * unsigned version it holds either way.
   */
  function requestIssue(tenancy: Tenancy) {
    if (rowActionsRef.current[tenancy.id]) return;
    if (issueConfirmMessage(tenancy.current_contract)) {
      setConfirm({ kind: 'issue', tenancy });
      return;
    }
    void issue(tenancy);
  }

  async function issue(tenancy: Tenancy) {
    if (!startRowAction(tenancy.id, 'issue')) return;
    try {
      const issued = await issueTenancyContract(tenancy.id);
      toast.success(issuedMessage(issued, tenancy.current_contract));
    } catch (err) {
      setRowError(
        tenancy.id,
        isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם החוזה הופק. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.'
          : tenancyApiError(err, 'הפקת החוזה נכשלה'),
      );
    } finally {
      endRowAction(tenancy.id);
      // Issued, refused or unanswered — the row shows what the server holds now.
      refresh();
    }
  }

  async function download(tenancy: Tenancy, cell: IssuedCell) {
    if (!startRowAction(tenancy.id, 'download')) return;
    try {
      await downloadContractPdf(
        cell.contractId,
        contractFileName({ tenantName: tenantName(tenancy.tenant), version: cell.version }),
      );
    } catch (err) {
      setRowError(tenancy.id, tenancyApiError(err, 'הורדת החוזה נכשלה'));
    } finally {
      endRowAction(tenancy.id);
    }
  }

  /** The signed copy: the version's PDF with the tenant's signature on it. */
  async function downloadSigned(tenancy: Tenancy, cell: IssuedCell) {
    if (!startRowAction(tenancy.id, 'signed')) return;
    try {
      await downloadSignedContractPdf(
        cell.contractId,
        contractFileName({ tenantName: tenantName(tenancy.tenant), version: cell.version, signed: true }),
      );
    } catch (err) {
      setRowError(tenancy.id, tenancyApiError(err, 'הורדת העותק החתום נכשלה'));
    } finally {
      endRowAction(tenancy.id);
    }
  }

  /** "שליחה לחתימה" for the version in force — from its row, or from the history, which it replaces on screen. */
  function openSigning(tenancy: Tenancy, contractId: string) {
    setActionError('');
    setDialog({ kind: 'signing', tenancy, contractId });
  }

  async function runConfirmed(choice: boolean) {
    const target = confirm;
    if (!choice || !target) return;
    // A new version's failure belongs under its row, with the row's other contract messages.
    if (target.kind === 'issue') {
      await issue(target.tenancy);
      return;
    }
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
        : confirm?.kind === 'issue'
          ? {
              title: 'הפקת גרסה חדשה',
              message: `${issueConfirmMessage(confirm.tenancy.current_contract)}.\nהגרסה הקודמת תבוטל ותישאר בהיסטוריית החוזים של ${confirmTarget}, והחדשה תופק מההסכם כפי שהוא עכשיו.`,
              confirmText: 'הפקת גרסה חדשה',
            }
          : { title: '', message: '', confirmText: 'אישור' };

  function renderRow(tenancy: Tenancy): ReactNode {
    const name = tenantName(tenancy.tenant);
    const identifier = tenantIdentifier(tenancy.tenant);
    const slots = sortSlots(tenancy.slots ?? []);
    const deletable = tenancy.status === 'draft' && slots.length === 0;
    const busy = busyId === tenancy.id;
    const contract = contractCell(tenancy.current_contract);
    const rowAction = rowActions[tenancy.id];
    const rowError = rowErrors[tenancy.id];
    const sendState = sendForSigningState(tenancy.current_contract);

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
          <ToneChip tone={tenancyStatusTone(tenancy.status)}>{tenancyStatusLabel(tenancy.status, tenancy.status_label)}</ToneChip>
        </td>
        <td className={styles.contractCell}>
          {contract.state === 'none' ? (
            <button
              type="button"
              className={styles.contractIssue}
              aria-label={`הפקת חוזה ל־${name}`}
              disabled={Boolean(rowAction)}
              onClick={() => requestIssue(tenancy)}
            >
              {rowAction === 'issue' ? (
                <Loader2 size={13} className={styles.spin} aria-hidden="true" />
              ) : (
                <FilePlus2 size={13} aria-hidden="true" />
              )}
              {rowAction === 'issue' ? 'מפיק…' : 'הפק חוזה'}
            </button>
          ) : (
            <div className={styles.contractStack}>
              <div className={styles.contractLine}>
                <ToneChip tone={contract.tone}>{contract.statusLabel}</ToneChip>
                <span className={styles.contractVersion}>{contract.versionLabel}</span>
                <button
                  type="button"
                  className={styles.contractDownload}
                  title={`הורדת ${contract.versionLabel}`}
                  aria-label={`הורדת ${contract.versionLabel} של החוזה של ${name}`}
                  disabled={Boolean(rowAction)}
                  onClick={() => void download(tenancy, contract)}
                >
                  {rowAction === 'download' ? (
                    <Loader2 size={13} className={styles.spin} aria-hidden="true" />
                  ) : (
                    <Download size={13} aria-hidden="true" />
                  )}
                </button>
              </div>
              {contract.stale && <StaleChip title={contract.staleTitle} />}
              <SigningChips contract={tenancy.current_contract} />
              {contract.state === 'signed' && (
                <div className={styles.signedLine}>
                  <button
                    type="button"
                    className={styles.signedCopy}
                    aria-label={`הורדת העותק החתום של החוזה של ${name}`}
                    disabled={Boolean(rowAction)}
                    onClick={() => void downloadSigned(tenancy, contract)}
                  >
                    {rowAction === 'signed' ? (
                      <Loader2 size={13} className={styles.spin} aria-hidden="true" />
                    ) : (
                      <FileCheck2 size={13} aria-hidden="true" />
                    )}
                    הורדת עותק חתום
                  </button>
                  {signedByText(tenancy.current_contract?.signer_name) && (
                    <span className={styles.signerName}>{signedByText(tenancy.current_contract?.signer_name)}</span>
                  )}
                </div>
              )}
            </div>
          )}
          {rowError && (
            <p className={styles.contractError} role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{rowError}</span>
            </p>
          )}
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
            {/* A signed version is never replaced (the server refuses), and with none on file the column offers the first. */}
            {contract.state !== 'none' && contract.replaceable && (
              <button
                type="button"
                className={styles.iconBtn}
                title="הפק גרסה חדשה"
                aria-label={`הפקת גרסה חדשה של החוזה של ${name}`}
                disabled={busy || Boolean(rowAction)}
                onClick={() => requestIssue(tenancy)}
              >
                {rowAction === 'issue' ? (
                  <Loader2 size={16} className={styles.spin} aria-hidden="true" />
                ) : (
                  <FilePlus2 size={16} aria-hidden="true" />
                )}
              </button>
            )}
            {/* The version in force, unsigned. One that no longer matches the agreement is held back: the server refuses it. */}
            {contract.state !== 'none' && sendState.offered && (
              <button
                type="button"
                className={styles.iconBtn}
                title={sendState.blockedReason || 'שליחה לחתימה'}
                aria-label={
                  sendState.blockedReason
                    ? `שליחה לחתימה — ${sendState.blockedReason}`
                    : `שליחת החוזה של ${name} לחתימה`
                }
                disabled={busy || Boolean(sendState.blockedReason)}
                onClick={() => openSigning(tenancy, contract.contractId)}
              >
                <Send size={16} aria-hidden="true" />
              </button>
            )}
            {/* Always offered: once every version is voided the row carries none, and the history still holds them. */}
            <button
              type="button"
              className={styles.iconBtn}
              title="היסטוריית חוזים"
              aria-label={`היסטוריית החוזים של ${name}`}
              disabled={busy}
              onClick={() => openHistory(tenancy)}
            >
              <HistoryIcon size={16} aria-hidden="true" />
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
              <th scope="col">חוזה</th>
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
          onIssueContract={requestIssue}
        />
      )}

      {dialog?.kind === 'history' && (
        <ContractHistoryDialog
          // The row as the list reads it now, so a version voided here stops showing as the one in force.
          tenancy={tenancies.find((item) => item.id === dialog.tenancy.id) ?? dialog.tenancy}
          onClose={() => setDialog(null)}
          onChanged={refresh}
          onSendForSigning={(contract) => openSigning(dialog.tenancy, contract.id)}
        />
      )}

      {dialog?.kind === 'signing' && (
        <SigningLinkDialog
          key={dialog.contractId}
          // The row as the list reads it now: a phone corrected in the tenant's edit is the one WhatsApp opens.
          tenancy={tenancies.find((item) => item.id === dialog.tenancy.id) ?? dialog.tenancy}
          contractId={dialog.contractId}
          onClose={() => setDialog(null)}
          onChanged={refresh}
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
