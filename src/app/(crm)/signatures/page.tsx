'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, Eye, FileSearch, Search, X } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import SignatureViewDialog from '@/components/signatures/SignatureViewDialog';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { downloadSignaturePdf } from '@/lib/signaturesApi';
import {
  SIGNATURE_KIND_OPTIONS,
  applySignatureFilterChange,
  countSignatureFilters,
  defaultSignatureFilters,
  formatSignedDate,
  formatSignedTime,
  signatureChildrenLabel,
  signatureKindLabel,
  signatureListParams,
  signaturePageCount,
  signaturePageSpan,
  signaturePdfError,
  signatureRangeLabel,
  signatureTitle,
  signaturesEmptyState,
  type SignatureFilters,
} from '@/lib/signatureUtils';
import type { SignatureSummary } from '@/types/signature';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import { LedgerField, LedgerSelect, ledgerControlClass } from '@/app/(crm)/invoices/LedgerFilterBar';
import { useSignaturesList } from './useSignaturesList';
import styles from './signatures.module.css';

const TABLE_COLUMNS = 7;

/**
 * היסטוריית חתימות — every signature the server keeps, newest first: what was
 * signed, by whom, for which children, at which branch and when, with the
 * signed text, the drawn signature and the PDF a click away.
 *
 * Built like the invoices page: the dashboard theme, one filter card, one
 * table card. The list is paginated on the server, so every filter is sent
 * with the request rather than applied to the page in hand.
 */
export default function SignaturesPage() {
  const { branches } = useScopedBranches();
  const [filters, setFilters] = useState<SignatureFilters>(() => defaultSignatureFilters());
  // Any change to what is listed goes back to page one.
  const listKey = JSON.stringify(signatureListParams(filters));
  const [pageState, setPageState] = useState({ listKey, page: 1 });
  const page = pageState.listKey === listKey ? pageState.page : 1;
  const { rows, count, error, loading, retry } = useSignaturesList(filters, page);

  const [viewing, setViewing] = useState<SignatureSummary | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState('');

  const branchOptions = useMemo(
    () => branches
      .map((branch) => ({ value: branch.id, label: branch.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'he')),
    [branches],
  );

  const narrowedCount = countSignatureFilters(filters);
  const rangeLabel = signatureRangeLabel(filters.dateFrom, filters.dateTo);
  const pageCount = signaturePageCount(count ?? 0);

  function change(patch: Partial<SignatureFilters>) {
    setFilters((prev) => applySignatureFilterChange(prev, patch));
  }

  function clearNarrowing() {
    change({ search: '', kind: '', branch: '' });
  }

  function goToPage(next: number) {
    setPageState({ listKey, page: next });
  }

  async function handleDownload(signature: SignatureSummary) {
    if (downloadingIds.includes(signature.id)) return;
    setDownloadingIds((ids) => [...ids, signature.id]);
    setActionError('');
    try {
      await downloadSignaturePdf(signature);
    } catch (downloadError) {
      setActionError(signaturePdfError(downloadError));
    } finally {
      setDownloadingIds((ids) => ids.filter((id) => id !== signature.id));
    }
  }

  function renderList(): ReactNode {
    if (loading) {
      return <TableSkeleton columns={TABLE_COLUMNS} tableClassName={theme.table} label="טוען חתימות" />;
    }

    if (error) {
      return (
        <EmptyPanel
          icon={<AlertCircle className={styles.emptyIcon} aria-hidden="true" />}
          title="לא הצלחנו לטעון את החתימות"
          text={`${error} אפשר לנסות שוב; אם זה חוזר, נסו טווח תאריכים קצר יותר.`}
        >
          <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={retry}>
            נסו שוב
          </button>
        </EmptyPanel>
      );
    }

    if (rows.length === 0) {
      const copy = signaturesEmptyState({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        narrowed: narrowedCount > 0,
      });
      return (
        <EmptyPanel
          icon={<FileSearch className={styles.emptyIcon} aria-hidden="true" />}
          title={copy.title}
          text={copy.text}
        >
          {copy.offerClear && (
            <button type="button" className={`${styles.emptyBtn} ${styles.emptyBtnPrimary}`} onClick={clearNarrowing}>
              נקה סינון
            </button>
          )}
        </EmptyPanel>
      );
    }

    return (
      <div className={theme.tableScroll}>
        <table className={`${theme.table} ${styles.table}`}>
          <caption className={styles.srOnly}>חתימות {rangeLabel}, מהחדש לישן</caption>
          <thead>
            <tr>
              <th scope="col">נחתם</th>
              <th scope="col">סוג</th>
              <th scope="col">מסמך</th>
              <th scope="col">חתם/ה</th>
              <th scope="col">משפחה וילדים</th>
              <th scope="col">סניף</th>
              <th scope="col" className={theme.n}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((signature) => {
              const title = signatureTitle(signature);
              const downloading = downloadingIds.includes(signature.id);
              return (
                <tr key={signature.id}>
                  <td>
                    <span className={styles.strong}>{formatSignedDate(signature.signed_at) || '—'}</span>
                    <span className={styles.subLine}>{formatSignedTime(signature.signed_at)}</span>
                  </td>
                  <td>
                    <span className={`${theme.tag} ${theme.tagType}`}>{signatureKindLabel(signature)}</span>
                  </td>
                  <td className={styles.wrapCell}>
                    <span className={styles.strong}>{title}</span>
                  </td>
                  <td>
                    <span className={styles.strong}>{signature.signer_name || '—'}</span>
                    {signature.signer_id_number && (
                      <span className={styles.subLine}>ת״ז {signature.signer_id_number}</span>
                    )}
                  </td>
                  <td className={styles.wrapCell}>
                    <span className={styles.strong}>{signature.family_name || '—'}</span>
                    <span className={styles.subLine}>{signatureChildrenLabel(signature.children)}</span>
                  </td>
                  <td>{signature.branch_name || <span className={styles.dash}>—</span>}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.viewBtn}
                        onClick={() => setViewing(signature)}
                        aria-label={`צפייה ב${title} — ${signature.signer_name || 'חתימה'}`}
                      >
                        <Eye size={15} aria-hidden="true" />
                        צפייה
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="הורד PDF"
                        aria-label={`הורדת PDF — ${title}, ${signature.signer_name || 'חתימה'}`}
                        aria-busy={downloading || undefined}
                        disabled={downloading}
                        onClick={() => void handleDownload(signature)}
                      >
                        <Download size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <div className={`${theme.tokens} ${theme.scope} ${styles.page}`}>
        {/* The theme reserves room for AppLayout's sidebar toggle on the first
            child of .tokens — on the wrong side for RTL. This spacer takes
            that reservation, and the header clears the toggle's corner itself,
            as the invoices page does. */}
        <div aria-hidden className={styles.toggleSpacer} />

        <header className={`${theme.ph} ${styles.pageHead}`}>
          <div>
            <h1 className={theme.phTitle}>היסטוריית חתימות</h1>
            <p className={theme.phSub}>כל מה שלקוחות חתמו עליו — מה נחתם, מי חתם ומתי, עם החתימה, ההסכמות וקובץ PDF</p>
          </div>
        </header>

        <section className={theme.card} aria-label="סינון">
          <div className={styles.filterRow}>
            <LedgerField id="signatures-search" label="חיפוש" className={styles.wideField}>
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  id="signatures-search"
                  type="search"
                  autoComplete="off"
                  className={`${ledgerControlClass} ${styles.searchControl} ${filters.search ? styles.searchOn : ''}`}
                  placeholder="שם החותם, ת״ז, משפחה, ילד…"
                  value={filters.search}
                  onChange={(e) => change({ search: e.target.value })}
                />
              </div>
            </LedgerField>

            <LedgerField id="signatures-from" label="מתאריך" className={styles.field}>
              <input
                id="signatures-from"
                type="date"
                className={ledgerControlClass}
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => change({ dateFrom: e.target.value })}
              />
            </LedgerField>

            <LedgerField id="signatures-to" label="עד תאריך" className={styles.field}>
              <input
                id="signatures-to"
                type="date"
                className={ledgerControlClass}
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => change({ dateTo: e.target.value })}
              />
            </LedgerField>

            <LedgerSelect
              id="signatures-kind"
              label="סוג"
              value={filters.kind}
              onChange={(kind) => change({ kind })}
              options={SIGNATURE_KIND_OPTIONS}
              allLabel="כל הסוגים"
              className={styles.field}
            />

            <LedgerSelect
              id="signatures-branch"
              label="סניף"
              value={filters.branch}
              onChange={(branch) => change({ branch })}
              options={branchOptions}
              allLabel="כל הסניפים"
              className={styles.field}
            />
          </div>

          <div className={styles.footer}>
            <p className={styles.resultLine}>
              {count !== null && !loading ? (
                <span aria-live="polite">
                  מציג <b>{signaturePageSpan(page, rows.length)}</b> מתוך <b>{count.toLocaleString('he-IL')}</b> חתימות
                  {' · '}
                  {rangeLabel}
                </span>
              ) : (
                <span>{rangeLabel}</span>
              )}
              {narrowedCount > 0 && (
                <>
                  <span className={styles.sep} aria-hidden="true">
                    ·
                  </span>
                  <span className={styles.activeCount}>
                    {narrowedCount === 1 ? 'מסנן אחד פעיל' : `${narrowedCount} מסננים פעילים`}
                  </span>
                  <button type="button" className={styles.clearLink} onClick={clearNarrowing}>
                    <X size={13} aria-hidden="true" />
                    נקה סינון
                  </button>
                </>
              )}
            </p>
          </div>
        </section>

        <section className={theme.card} aria-labelledby="signatures-list-title">
          <div className={styles.cardHead}>
            <div>
              <h2 id="signatures-list-title" className={theme.cardTitle}>
                כל החתימות
              </h2>
              <p className={styles.cardSub}>{rangeLabel} · מהחדש לישן</p>
            </div>
          </div>

          {actionError && (
            <div className={styles.notice} role="alert">
              <span>{actionError}</span>
              <button
                type="button"
                className={styles.noticeClose}
                onClick={() => setActionError('')}
                aria-label="סגירת ההודעה"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          {renderList()}

          {count !== null && !error && count > rows.length && pageCount > 1 && (
            <nav className={styles.pager} aria-label="עמודי הרשימה">
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page <= 1 || loading}
                onClick={() => goToPage(Math.max(1, page - 1))}
              >
                <ChevronRight size={15} aria-hidden="true" />
                הקודם
              </button>
              <span className={styles.pagerStatus}>
                עמוד <b>{page}</b> מתוך <b>{pageCount}</b> · {count.toLocaleString('he-IL')} חתימות
              </span>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={page >= pageCount || loading}
                onClick={() => goToPage(page + 1)}
              >
                הבא
                <ChevronLeft size={15} aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      </div>

      {/* Out of the themed wrapper, as the invoices tabs send their dialogs:
          the entrance transform on the page would pull a fixed overlay off
          the viewport, and the dashboard tokens would re-tint it. */}
      <BodyPortal>
        <SignatureViewDialog signature={viewing} onClose={() => setViewing(null)} />
      </BodyPortal>
    </>
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
