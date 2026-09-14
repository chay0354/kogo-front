'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Loader2, RotateCcw } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import {
  downloadChargeReceipt,
  fetchOrderCharges,
  issueChargeReceipt,
  markChargeCharged,
  retryCharge,
  voidCharge,
  type StandingOrder,
  type TenantCharge,
} from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { ToneChip } from './StatusChips';
import {
  EMPTY_MARK_CHARGED_FORM,
  RETRY_OFF_TEXT,
  billingApiError,
  billingMoney,
  billingMonthLabel,
  chargeActions,
  chargeAmountsLine,
  chargeChip,
  chargeMetaLines,
  markChargedCopy,
  markChargedErrors,
  markChargedPayload,
  missedPeriods,
  orderStatusLabel,
  orderStatusTone,
  receiptLine,
  retryConfirmText,
  retryOutcomeText,
  reviewRowText,
  voidCopy,
  voidErrors,
  type MarkChargedForm,
} from './billingUtils';
import { isUnknownOutcome, tenantName } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

type FormKind = 'retry' | 'mark' | 'void';
type BusyAction = FormKind | 'receipt' | 'download';

interface Problem {
  chargeId: string;
  text: string;
}

interface ChargesDialogProps {
  tenancy: Tenancy;
  /** The order, as the list reads it now. */
  order: StandingOrder;
  billingEnabled: boolean;
  /** A manager: the only one the server lets retry, mark charged, void or issue a receipt. */
  canDecide: boolean;
  onClose: () => void;
  /** A charge changed, or may have — the order's row (its status, its next charge) should be read again. */
  onChanged: () => void;
}

/**
 * "חיובים": an order's months, newest first — where each stands, what it came
 * to, its receipt — and the office's decisions on them. A failed month can be
 * charged again now (not while charging is off). A month whose outcome is
 * unknown is the office's to settle from Tranzila: marked charged with the
 * transaction id found there, or voided with a reason, for good. Each decision
 * is asked for under its month rather than in a confirmation box — the shared
 * ConfirmDialog opens beneath this dialog's overlay — and every refusal shows
 * in the server's words.
 */
export default function ChargesDialog({
  tenancy,
  order,
  billingEnabled,
  canDecide,
  onClose,
  onChanged,
}: ChargesDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const chargesQuery = useQuery({
    queryKey: ['rental-billing', 'order-charges', order.id],
    queryFn: () => fetchOrderCharges(order.id),
    staleTime: 0,
    // Nothing kept between openings: a month decided since must never show as it was.
    gcTime: 0,
  });
  const [openForm, setOpenForm] = useState<{ kind: FormKind; chargeId: string } | null>(null);
  const [markForm, setMarkForm] = useState<MarkChargedForm>(EMPTY_MARK_CHARGED_FORM);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<{ chargeId: string; action: BusyAction } | null>(null);
  // One request at a time across the dialog; the ref is what a second click reads, before the state re-renders.
  const busyRef = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const charges = chargesQuery.data ?? [];
  // Months that passed with no charge, when the server lists them; a month with a charge row is that row.
  const missed = missedPeriods(order).filter(
    (period) => !charges.some((charge) => charge.period.slice(0, 7) === period.slice(0, 7)),
  );
  const rows = [
    ...charges.map((charge) => ({ period: charge.period, charge: charge as TenantCharge | null })),
    ...missed.map((period) => ({ period, charge: null as TenantCharge | null })),
  ].sort((a, b) => b.period.localeCompare(a.period));
  const name = tenantName(tenancy.tenant);
  // A decision in flight holds the dialog open, so how it ended is never hidden.
  const deciding = busy !== null && busy.action !== 'download';

  function startForm(kind: FormKind, charge: TenantCharge) {
    setProblem(null);
    setMarkForm(EMPTY_MARK_CHARGED_FORM);
    setReason('');
    setOpenForm({ kind, chargeId: charge.id });
  }

  function stopForm() {
    setOpenForm(null);
    setProblem(null);
  }

  async function act(
    charge: TenantCharge,
    action: BusyAction,
    request: () => Promise<void>,
    { unknownText, fallback, reread = true }: { unknownText: string; fallback: string; reread?: boolean },
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy({ chargeId: charge.id, action });
    setProblem(null);
    try {
      await request();
    } catch (err) {
      setProblem({ chargeId: charge.id, text: isUnknownOutcome(err) ? unknownText : billingApiError(err, fallback) });
    } finally {
      busyRef.current = false;
      setBusy(null);
      // Done, refused or unanswered — the months and the row show what the server holds now.
      if (reread) {
        void chargesQuery.refetch();
        onChanged();
      }
    }
  }

  function monthOf(charge: TenantCharge): string {
    return billingMonthLabel(charge.period) || charge.period;
  }

  function retry(charge: TenantCharge) {
    void act(
      charge,
      'retry',
      async () => {
        const { outcome, charge: fresh } = await retryCharge(charge.id);
        const said = retryOutcomeText(outcome, fresh);
        setOpenForm(null);
        if (said.ok) toast.success(said.text);
        else setProblem({ chargeId: charge.id, text: said.text });
      },
      {
        unknownText:
          'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הכרטיס חויב. אל תנסו שוב לפני שבודקים בטרנזילה — הרשימה מתרעננת.',
        fallback: 'הניסיון החוזר נכשל',
      },
    );
  }

  function submitMark(event: FormEvent<HTMLFormElement>, charge: TenantCharge) {
    event.preventDefault();
    const errors = markChargedErrors(markForm);
    if (errors.length) {
      setProblem({ chargeId: charge.id, text: errors.join('\n') });
      return;
    }
    void act(
      charge,
      'mark',
      async () => {
        await markChargeCharged(charge.id, markChargedPayload(markForm));
        setOpenForm(null);
        toast.success(`${monthOf(charge)} סומן כחויב`);
      },
      {
        unknownText: 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם החיוב סומן. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.',
        fallback: 'הסימון כחויב נכשל',
      },
    );
  }

  function submitVoid(event: FormEvent<HTMLFormElement>, charge: TenantCharge) {
    event.preventDefault();
    const errors = voidErrors(reason);
    if (errors.length) {
      setProblem({ chargeId: charge.id, text: errors.join('\n') });
      return;
    }
    void act(
      charge,
      'void',
      async () => {
        await voidCharge(charge.id, reason.trim());
        setOpenForm(null);
        toast.success(`החיוב של ${monthOf(charge)} בוטל`);
      },
      {
        unknownText: 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם החיוב בוטל. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.',
        fallback: 'ביטול החיוב נכשל',
      },
    );
  }

  function issueReceipt(charge: TenantCharge) {
    void act(
      charge,
      'receipt',
      async () => {
        await issueChargeReceipt(charge.id);
        toast.success(`הקבלה של ${monthOf(charge)} הופקה`);
      },
      {
        unknownText: 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הקבלה הופקה. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.',
        fallback: 'הפקת הקבלה נכשלה',
      },
    );
  }

  function downloadReceipt(charge: TenantCharge) {
    const receipt = charge.receipt;
    if (!receipt) return;
    void act(charge, 'download', () => downloadChargeReceipt(receipt), {
      unknownText: 'ההורדה לא הושלמה. נסו שוב בעוד רגע.',
      fallback: 'הורדת הקבלה נכשלה',
      reread: false,
    });
  }

  function renderRetry(charge: TenantCharge): ReactNode {
    const out = busy?.chargeId === charge.id && busy.action === 'retry';
    return (
      <div className={styles.voidForm} role="group" aria-labelledby={`retry-title-${charge.id}`}>
        <p id={`retry-title-${charge.id}`} className={styles.savedTitle}>
          {retryConfirmText(charge, order)}
        </p>
        <p className={styles.help}>הכרטיס יחויב מיד בטרנזילה. אם החיוב יידחה שוב, הוא יישאר כאן כנדחה.</p>
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={stopForm} disabled={busy !== null}>
            חזרה
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => retry(charge)} disabled={busy !== null} autoFocus>
            {out && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {out ? 'מחייב…' : 'חיוב עכשיו'}
          </button>
        </div>
      </div>
    );
  }

  function renderMark(charge: TenantCharge): ReactNode {
    const copy = markChargedCopy(charge);
    const out = busy?.chargeId === charge.id && busy.action === 'mark';
    const idPrefix = `mark-${charge.id}`;
    return (
      <form className={styles.voidForm} onSubmit={(event) => submitMark(event, charge)} noValidate>
        <p className={styles.savedTitle}>{copy.title}</p>
        <p className={styles.reviewBox} role="note">
          {copy.warning}
        </p>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor={`${idPrefix}-tx`} className={styles.label}>
              מזהה העסקה בטרנזילה
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id={`${idPrefix}-tx`}
              className={`${styles.input} ${styles.ltr}`}
              value={markForm.transactionId}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, transactionId: event.target.value }))}
              autoComplete="off"
              aria-required
              autoFocus
              disabled={busy !== null}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${idPrefix}-code`} className={styles.label}>
              מספר אישור (לא חובה)
            </label>
            <input
              id={`${idPrefix}-code`}
              className={`${styles.input} ${styles.ltr}`}
              value={markForm.confirmationCode}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, confirmationCode: event.target.value }))}
              autoComplete="off"
              disabled={busy !== null}
            />
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor={`${idPrefix}-note`} className={styles.label}>
              הערה (לא חובה)
            </label>
            <textarea
              id={`${idPrefix}-note`}
              className={`${styles.input} ${styles.textarea}`}
              value={markForm.note}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, note: event.target.value }))}
              rows={2}
              disabled={busy !== null}
            />
          </div>
        </div>
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={stopForm} disabled={busy !== null}>
            חזרה
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={busy !== null}>
            {out && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {out ? 'מסמן…' : copy.submit}
          </button>
        </div>
      </form>
    );
  }

  function renderVoid(charge: TenantCharge): ReactNode {
    const copy = voidCopy(charge);
    const out = busy?.chargeId === charge.id && busy.action === 'void';
    const reasonId = `void-${charge.id}`;
    return (
      <form className={styles.voidForm} onSubmit={(event) => submitVoid(event, charge)} noValidate>
        <p className={styles.savedTitle}>{copy.title}</p>
        <p className={styles.reviewBox} role="note">
          {copy.warning}
        </p>
        <label htmlFor={reasonId} className={styles.label}>
          למה מבטלים?
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
          placeholder="למשל: נבדק בטרנזילה — החיוב לא עבר"
          aria-required
          autoFocus
          disabled={busy !== null}
        />
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={stopForm} disabled={busy !== null}>
            חזרה
          </button>
          <button type="submit" className={styles.dangerBtn} disabled={busy !== null}>
            {out && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {out ? 'מבטל…' : copy.submit}
          </button>
        </div>
      </form>
    );
  }

  function renderItem(charge: TenantCharge): ReactNode {
    const chip = chargeChip(charge);
    const actions = chargeActions(charge, { billingEnabled, canDecide, order });
    const reviewText = reviewRowText(charge, canDecide);
    const formKind = openForm?.chargeId === charge.id ? openForm.kind : null;
    const out = (action: BusyAction) => busy?.chargeId === charge.id && busy.action === action;
    const blockedId = `retry-blocked-${charge.id}`;
    const showError = (charge.status === 'failed' || charge.status === 'review' || charge.undecided) && charge.error;

    return (
      <li key={charge.id} className={styles.historyItem}>
        <div className={styles.historyHead}>
          <div className={styles.historyTitleLine}>
            <span className={styles.historyTitle}>{billingMonthLabel(charge.period) || charge.period}</span>
            <ToneChip tone={chip.tone}>{chip.label}</ToneChip>
          </div>
          <div className={styles.historyActions}>
            {actions.downloadReceipt && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => downloadReceipt(charge)}
                disabled={busy !== null}
                aria-label={`הורדת הקבלה של ${monthOf(charge)}`}
              >
                {out('download') ? (
                  <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                ) : (
                  <Download size={14} aria-hidden="true" />
                )}
                קבלה
              </button>
            )}
            {actions.issueReceipt && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => issueReceipt(charge)}
                disabled={busy !== null}
                aria-label={`הפקת קבלה ל־${monthOf(charge)}`}
              >
                {out('receipt') ? (
                  <Loader2 size={14} className={styles.spin} aria-hidden="true" />
                ) : (
                  <FileText size={14} aria-hidden="true" />
                )}
                הפקת קבלה
              </button>
            )}
            {actions.retry.offered && !formKind && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => startForm('retry', charge)}
                disabled={busy !== null || Boolean(actions.retry.blockedReason)}
                aria-describedby={actions.retry.blockedReason ? blockedId : undefined}
              >
                <RotateCcw size={14} aria-hidden="true" />
                ניסיון חוזר
              </button>
            )}
            {actions.markCharged && !formKind && (
              <button
                type="button"
                className={styles.smallBtn}
                title="רק אחרי שבדקתם בטרנזילה שהחיוב עבר"
                onClick={() => startForm('mark', charge)}
                disabled={busy !== null}
              >
                סימון כחויב
              </button>
            )}
            {actions.void && !formKind && (
              <button type="button" className={styles.voidBtn} onClick={() => startForm('void', charge)} disabled={busy !== null}>
                ביטול
              </button>
            )}
          </div>
        </div>

        <p className={`${styles.historyMeta} ${styles.chargeAmounts}`}>{chargeAmountsLine(charge)}</p>
        {reviewText && (
          <p className={styles.reviewBox} role="note">
            {reviewText}
          </p>
        )}
        {chargeMetaLines(charge).map((line) => (
          <p key={line} className={styles.historyMeta}>
            {line}
          </p>
        ))}
        {charge.receipt && <p className={styles.historyMeta}>{receiptLine(charge.receipt)}</p>}
        {showError && <p className={styles.historyVoid}>{charge.error}</p>}
        {charge.needs_receipt && (
          <p className={styles.historyVoid}>
            אין עדיין קבלה לחיוב הזה{charge.receipt_error ? `: ${charge.receipt_error}` : ''}
          </p>
        )}
        {actions.retry.offered && actions.retry.blockedReason && !formKind && (
          <p id={blockedId} className={styles.help}>
            {actions.retry.blockedReason}
          </p>
        )}

        {formKind === 'retry' && renderRetry(charge)}
        {formKind === 'mark' && renderMark(charge)}
        {formKind === 'void' && renderVoid(charge)}

        {problem?.chargeId === charge.id && (
          <p className={styles.error} role="alert">
            {problem.text}
          </p>
        )}
      </li>
    );
  }

  function renderMissed(period: string): ReactNode {
    return (
      <li key={`missed-${period}`} className={`${styles.historyItem} ${styles.historyItemVoid}`}>
        <div className={styles.historyTitleLine}>
          <span className={styles.historyTitle}>{billingMonthLabel(period) || period}</span>
          <ToneChip tone="off">לא חויב</ToneChip>
        </div>
        <p className={styles.historyMeta}>החודש עבר בלי חיוב, והוא לא ייגבה אוטומטית.</p>
      </li>
    );
  }

  function renderBody(): ReactNode {
    if (chargesQuery.isLoading) {
      return (
        <p className={styles.stateBox} role="status">
          טוען את החיובים…
        </p>
      );
    }
    if (chargesQuery.isError && charges.length === 0) {
      return (
        <div className={styles.stateBox} role="alert">
          <p className={styles.stateTitle}>לא הצלחנו לטעון את החיובים</p>
          <p>אפשר לנסות שוב בעוד רגע.</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => void chargesQuery.refetch()}>
            נסו שוב
          </button>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>עדיין אין חיובים בהוראת הקבע הזאת</p>
          <p>
            {order.status === 'pending_card'
              ? 'החיוב הראשון יירד כשהשוכר יזין כרטיס בקישור — או ביום החיוב הראשון, אם ההסכם מתחיל מאוחר יותר.'
              : 'כל חודש שיחויב יופיע כאן, עם הקבלה שלו.'}
          </p>
        </div>
      );
    }
    return (
      <ul className={styles.historyList} aria-label={`החיובים של ${name}`}>
        {rows.map((row) => (row.charge ? renderItem(row.charge) : renderMissed(row.period)))}
      </ul>
    );
  }

  const cardLine = order.has_card && order.card_last4 ? (
    <>
      {' · '}כרטיס <bdi dir="ltr">••{order.card_last4}</bdi>
    </>
  ) : null;

  return (
    <DialogShell
      id="rental-charges"
      title={`חיובים — ${name}`}
      hint="כל חודש של הוראת הקבע: מה נגבה, הקבלה שלו, והחלטות המשרד על חיוב שנכשל או שהתוצאה שלו לא ידועה."
      closing={closing}
      onRequestClose={requestClose}
      busy={deciding}
      wide
      footer={
        <>
          {charges.length > 0 && (
            <span className={styles.footNote}>
              {charges.length === 1 ? (
                'חיוב אחד'
              ) : (
                <>
                  <b>{charges.length}</b> חיובים
                </>
              )}
            </span>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={deciding}>
            סגירה
          </button>
        </>
      }
    >
      <div className={styles.signHead}>
        <ToneChip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status, order.status_label)}</ToneChip>
        <span className={styles.historyMeta}>
          {billingMoney(order.monthly_total)} לחודש כולל מע״מ
          {cardLine}
        </span>
      </div>

      {canDecide && !billingEnabled && (
        <div className={styles.savedNotice} role="note">
          <p className={styles.savedText}>{RETRY_OFF_TEXT}.</p>
        </div>
      )}
      {!canDecide && (
        <p className={styles.help}>ניסיון חוזר, סימון כחויב, ביטול והפקת קבלה — למנהלים בלבד. כאן רואים איפה עומד כל חודש.</p>
      )}

      {renderBody()}
    </DialogShell>
  );
}
