'use client';

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileCheck2, Loader2, Send } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import {
  downloadContractPdf,
  downloadSignedContractPdf,
  fetchTenancyContracts,
  voidContract,
  type RentalContract,
  type Tenancy,
} from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { SigningChips, StaleChip, ToneChip } from './StatusChips';
import {
  contractFileName,
  contractHistoryRow,
  currentContractOf,
  formatDateTime,
  sortContracts,
  staleContractTitle,
} from './contractUtils';
import { sendForSigningState, signedByText } from './signingUtils';
import { isUnknownOutcome, tenancyApiError, tenantName } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

interface ContractHistoryDialogProps {
  /** The row as the list last read it — for the tenant's name and whether the version in force is stale. */
  tenancy: Tenancy;
  onClose: () => void;
  /** A version was voided, or may have been — the list should read the server again. */
  onChanged: () => void;
  /**
   * "שליחה לחתימה" on the version in force. The tenants view closes this
   * dialog and opens the sending one in its place, so two dialogs never stack.
   */
  onSendForSigning?: (contract: RentalContract) => void;
}

/** A failure, shown under the version it happened to. */
interface Problem {
  contractId: string;
  text: string;
}

/**
 * Every version of a tenancy's contract, newest first: where each stands, when
 * and by whom it was issued, why a void one was voided, and its PDF — frozen
 * when it was issued, so a void version still downloads as it was. An
 * unsigned version can be voided here, with a reason.
 *
 * The reason is asked for under the version rather than in a confirmation
 * box: the shared ConfirmDialog opens beneath this dialog's overlay.
 */
export default function ContractHistoryDialog({
  tenancy,
  onClose,
  onChanged,
  onSendForSigning,
}: ContractHistoryDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const contractsQuery = useQuery({
    queryKey: ['rentals', 'tenancy-contracts', tenancy.id],
    queryFn: () => fetchTenancyContracts(tenancy.id),
    staleTime: 0,
    // Nothing kept between openings: a version issued or voided since must never show as it was.
    gcTime: 0,
  });
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const submittingRef = useRef(false);

  const contracts = useMemo(() => sortContracts(contractsQuery.data ?? []), [contractsQuery.data]);
  const current = useMemo(() => currentContractOf(contracts), [contracts]);
  const name = tenantName(tenancy.tenant);
  // Only the row knows whether the version in force still matches the agreement.
  const currentStaleTitle =
    current && tenancy.current_contract?.id === current.id ? staleContractTitle(tenancy.current_contract) : '';

  function startVoid(contract: RentalContract) {
    setProblem(null);
    setReason('');
    setVoidingId(contract.id);
  }

  function stopVoid() {
    setVoidingId(null);
    setReason('');
    setProblem(null);
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>, contract: RentalContract, title: string) {
    event.preventDefault();
    if (submittingRef.current) return;
    const text = reason.trim();
    if (!text) {
      setProblem({ contractId: contract.id, text: 'יש לכתוב את סיבת הביטול' });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setProblem(null);
    try {
      await voidContract(contract.id, text);
      toast.success(`${title} בוטלה`);
      setVoidingId(null);
      setReason('');
    } catch (err) {
      setProblem({
        contractId: contract.id,
        text: isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הגרסה בוטלה. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.'
          : tenancyApiError(err, 'ביטול הגרסה נכשל'),
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      // Voided, refused or unanswered — what the server holds now is what the dialog and the list show next.
      void contractsQuery.refetch();
      onChanged();
    }
  }

  async function download(contract: RentalContract) {
    if (downloadingId) return;
    setDownloadingId(contract.id);
    setProblem(null);
    try {
      await downloadContractPdf(
        contract.id,
        contractFileName({ tenantName: name, version: contract.version, voided: contract.status === 'void' }),
      );
    } catch (err) {
      setProblem({ contractId: contract.id, text: tenancyApiError(err, 'הורדת החוזה נכשלה') });
    } finally {
      setDownloadingId(null);
    }
  }

  /** The signed copy; its download is told apart from the version's own PDF by its key. */
  async function downloadSigned(contract: RentalContract) {
    if (downloadingId) return;
    setDownloadingId(`signed:${contract.id}`);
    setProblem(null);
    try {
      await downloadSignedContractPdf(
        contract.id,
        contractFileName({ tenantName: name, version: contract.version, signed: true }),
      );
    } catch (err) {
      setProblem({ contractId: contract.id, text: tenancyApiError(err, 'הורדת העותק החתום נכשלה') });
    } finally {
      setDownloadingId(null);
    }
  }

  function renderItem(contract: RentalContract): ReactNode {
    const row = contractHistoryRow(contract);
    const isCurrent = current?.id === contract.id;
    const voiding = voidingId === contract.id && row.canVoid;
    const downloading = downloadingId === contract.id;
    const downloadingSigned = downloadingId === `signed:${contract.id}`;
    const reasonId = `contract-void-reason-${contract.id}`;
    const meta = [row.issued, row.issuedBy].filter(Boolean).join(' · ');
    // Only the version in force is sent, and only the row knows whether it still matches the agreement.
    const send =
      isCurrent && onSendForSigning
        ? sendForSigningState({ status: contract.status, is_stale: Boolean(currentStaleTitle) })
        : { offered: false, blockedReason: '' };
    const blockedId = `contract-send-blocked-${contract.id}`;
    const signedLine =
      contract.status === 'signed'
        ? [signedByText(contract.signer_name), formatDateTime(contract.signed_at)].filter(Boolean).join(' · ')
        : '';
    const itemClass = [styles.historyItem, isCurrent ? styles.historyItemCurrent : '', row.isVoid ? styles.historyItemVoid : '']
      .filter(Boolean)
      .join(' ');

    return (
      <li key={contract.id} className={itemClass}>
        <div className={styles.historyHead}>
          <div className={styles.historyTitleLine}>
            <span className={styles.historyTitle}>{row.title}</span>
            <ToneChip tone={row.tone}>{row.statusLabel}</ToneChip>
            {isCurrent && <span className={styles.tag}>הנוכחית</span>}
            {isCurrent && currentStaleTitle && <StaleChip title={currentStaleTitle} />}
          </div>
          <div className={styles.historyActions}>
            {send.offered && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => onSendForSigning?.(contract)}
                disabled={Boolean(send.blockedReason) || submitting}
                aria-label={`שליחת ${row.title} לחתימה`}
                aria-describedby={send.blockedReason ? blockedId : undefined}
              >
                <Send size={14} aria-hidden="true" />
                שליחה לחתימה
              </button>
            )}
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() => void download(contract)}
              disabled={downloadingId !== null}
              aria-label={`הורדה של ${row.title}`}
            >
              {downloading ? (
                <Loader2 size={14} className={styles.spin} aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              הורדה
            </button>
            {contract.status === 'signed' && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => void downloadSigned(contract)}
                disabled={downloadingId !== null}
                aria-label={`הורדת העותק החתום של ${row.title}`}
              >
                {downloadingSigned ? (
                  <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                ) : (
                  <FileCheck2 size={14} aria-hidden="true" />
                )}
                הורדת עותק חתום
              </button>
            )}
            {row.canVoid && !voiding && (
              <button
                type="button"
                className={styles.voidBtn}
                onClick={() => startVoid(contract)}
                disabled={submitting}
                aria-label={`בטל את ${row.title}`}
              >
                בטל
              </button>
            )}
          </div>
        </div>

        {meta && <p className={styles.historyMeta}>{meta}</p>}
        {signedLine && <p className={styles.historyMeta}>{signedLine}</p>}
        <SigningChips contract={contract} className={styles.historySign} />
        {send.blockedReason && (
          <p id={blockedId} className={styles.help}>
            {send.blockedReason}
          </p>
        )}
        {row.isVoid && (
          <p className={styles.historyVoid}>
            {row.voided}
            {row.voidReason && ` · ${row.voidReason}`}
          </p>
        )}

        {voiding && (
          <form className={styles.voidForm} onSubmit={(event) => void submitVoid(event, contract, row.title)} noValidate>
            <label htmlFor={reasonId} className={styles.label}>
              למה מבטלים את {row.title}?
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id={reasonId}
              className={`${styles.input} ${styles.textarea}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="למשל: נפלה טעות בסכום"
              aria-required
              aria-describedby={`${reasonId}-help`}
              autoFocus
              disabled={submitting}
            />
            <p id={`${reasonId}-help`} className={styles.help}>
              הסיבה נשמרת בהיסטוריה. הגרסה לא נמחקת, ואפשר להוריד אותה גם אחרי הביטול.
            </p>
            <div className={styles.voidActions}>
              <button type="button" className={styles.secondaryBtn} onClick={stopVoid} disabled={submitting}>
                חזרה
              </button>
              <button type="submit" className={styles.dangerBtn} disabled={submitting}>
                {submitting && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
                {submitting ? 'מבטל…' : `בטל את ${row.title}`}
              </button>
            </div>
          </form>
        )}

        {problem?.contractId === contract.id && (
          <p className={styles.error} role="alert">
            {problem.text}
          </p>
        )}
      </li>
    );
  }

  function renderBody(): ReactNode {
    if (contractsQuery.isLoading) {
      return (
        <p className={styles.stateBox} role="status">
          טוען את גרסאות החוזה…
        </p>
      );
    }
    if (contractsQuery.isError && contracts.length === 0) {
      return (
        <div className={styles.stateBox} role="alert">
          <p className={styles.stateTitle}>לא הצלחנו לטעון את היסטוריית החוזים</p>
          <p>אפשר לנסות שוב בעוד רגע.</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => void contractsQuery.refetch()}>
            נסו שוב
          </button>
        </div>
      );
    }
    if (contracts.length === 0) {
      return (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>עדיין לא הופק חוזה לשוכר הזה</p>
          <p>את החוזה מפיקים מהשורה של השוכר ברשימה, בכפתור &quot;הפק חוזה&quot;.</p>
        </div>
      );
    }
    return (
      <ul className={styles.historyList} aria-label={`גרסאות החוזה של ${name}`}>
        {contracts.map(renderItem)}
      </ul>
    );
  }

  return (
    <DialogShell
      id="contract-history"
      title={`היסטוריית חוזים — ${name}`}
      hint="כל גרסה נשמרת כפי שהופקה: התנאים וה־PDF שלה לא משתנים אחר כך. גרסה חדשה מפיקים מהשורה ברשימה."
      closing={closing}
      onRequestClose={requestClose}
      busy={submitting}
      footer={
        <>
          {contracts.length > 0 && (
            <span className={styles.footNote}>
              {contracts.length === 1 ? (
                'גרסה אחת'
              ) : (
                <>
                  <b>{contracts.length}</b> גרסאות
                </>
              )}
            </span>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={submitting}>
            סגירה
          </button>
        </>
      }
    >
      {renderBody()}
    </DialogShell>
  );
}
