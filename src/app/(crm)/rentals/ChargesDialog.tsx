'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Download, FileText, Loader2, RotateCcw } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import {
  downloadChargeReceipt,
  fetchOrderCharges,
  issueChargeReceipt,
  markChargeCharged,
  recordOfflinePayment,
  retryCharge,
  voidCharge,
  type StandingOrder,
  type TenantCharge,
} from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { ToneChip } from './StatusChips';
import {
  BLOCKED_ROW_TEXT,
  EMPTY_MARK_CHARGED_FORM,
  OFFLINE_METHOD_OPTIONS,
  RETRY_OFF_TEXT,
  billingApiError,
  billingMoney,
  billingMonthLabel,
  blockedChargeNotice,
  chargeActions,
  chargeAmountsLine,
  chargeChip,
  chargeMetaLines,
  emptyOfflinePaymentForm,
  israelToday,
  lateCardChargeText,
  markChargedCopy,
  markChargedErrors,
  markChargedPayload,
  monthsNeverCharged,
  offlinePaymentCopy,
  offlinePaymentDoneText,
  offlinePaymentErrors,
  offlinePaymentPayload,
  orderStatusLabel,
  orderStatusTone,
  receiptDeliveryText,
  receiptLine,
  retryConfirmText,
  retryOutcomeText,
  reviewRowText,
  voidCopy,
  voidErrors,
  type MarkChargedForm,
  type OfflinePaymentForm,
  type ReceiptDeliveryTone,
} from './billingUtils';
import { isUnknownOutcome, tenantName } from './tenancyUtils';
import styles from './rentalsDialog.module.css';

type FormKind = 'retry' | 'mark' | 'void' | 'offline';
type BusyAction = FormKind | 'receipt' | 'download';

interface Problem {
  chargeId: string;
  text: string;
}

const DELIVERY_CLASS: Record<ReceiptDeliveryTone, string> = {
  sent: styles.deliverySent,
  hand: styles.deliveryHand,
  waiting: styles.deliveryWaiting,
  none: styles.deliveryNone,
};

interface ChargesDialogProps {
  tenancy: Tenancy;
  /** The order, as the list reads it now. */
  order: StandingOrder;
  billingEnabled: boolean;
  /** A manager: the only one the server lets retry, mark charged, void, issue a receipt or record a payment. */
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
 * transaction id found there, or voided with a reason, for good. A failed or
 * voided month the tenant paid at the office — cash, a check, a transfer — is
 * recorded here and gets its receipt, whose number the office is shown. Each decision
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
  const [offlineForm, setOfflineForm] = useState<OfflinePaymentForm>(() => emptyOfflinePaymentForm(israelToday()));
  // The receipt a payment recorded here came to, said under its month until the dialog closes.
  const [done, setDone] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<{ chargeId: string; action: BusyAction } | null>(null);
  // One request at a time across the dialog; the ref is what a second click reads, before the state re-renders.
  const busyRef = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const charges = chargesQuery.data ?? [];
  // Months never charged at all, when the server lists them; a month with a charge row is that row.
  const missed = monthsNeverCharged(order).filter(
    (period) => !charges.some((charge) => charge.period.slice(0, 7) === period.slice(0, 7)),
  );
  const rows = [
    ...charges.map((charge) => ({ period: charge.period, charge: charge as TenantCharge | null })),
    ...missed.map((period) => ({ period, charge: null as TenantCharge | null })),
  ].sort((a, b) => b.period.localeCompare(a.period));
  const name = tenantName(tenancy.tenant);
  // The month that holds this tenancy's charging up, and what it says at the top and on its own row.
  const blockedNotice = blockedChargeNotice(order, canDecide);
  const blockedId = order.blocked_by_charge?.id ?? '';
  // A decision in flight holds the dialog open, so how it ended is never hidden.
  const deciding = busy !== null && busy.action !== 'download';

  function startForm(kind: FormKind, charge: TenantCharge) {
    setProblem(null);
    setMarkForm(EMPTY_MARK_CHARGED_FORM);
    setReason('');
    setOfflineForm(emptyOfflinePaymentForm(israelToday()));
    setDone(null);
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

  function submitOffline(event: FormEvent<HTMLFormElement>, charge: TenantCharge) {
    event.preventDefault();
    const today = israelToday();
    const errors = offlinePaymentErrors(offlineForm, today);
    if (errors.length) {
      setProblem({ chargeId: charge.id, text: errors.join('\n') });
      return;
    }
    void act(
      charge,
      'offline',
      async () => {
        const result = await recordOfflinePayment(charge.id, offlinePaymentPayload(offlineForm, charge));
        const text = offlinePaymentDoneText(result, monthOf(charge));
        setOpenForm(null);
        setDone({ chargeId: charge.id, text });
        toast.success(text);
      },
      {
        unknownText:
          'לא התקבלה תשובה מהשרת, ולכן לא ברור אם התשלום נרשם. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב (רישום שני לא מפיק קבלה נוספת).',
        fallback: 'רישום התשלום נכשל',
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

  function patchOffline(patch: Partial<OfflinePaymentForm>) {
    setOfflineForm((prev) => ({ ...prev, ...patch }));
  }

  function renderOffline(charge: TenantCharge): ReactNode {
    const copy = offlinePaymentCopy(charge);
    const out = busy?.chargeId === charge.id && busy.action === 'offline';
    const idPrefix = `offline-${charge.id}`;
    const today = israelToday();
    const isCheck = offlineForm.method === 'check';
    const locked = busy !== null;
    const textField = (key: keyof OfflinePaymentForm, label: string, required = false, ltr = false) => (
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-${key}`} className={styles.label}>
          {label}
          {required && (
            <span className={styles.req} aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          id={`${idPrefix}-${key}`}
          className={`${styles.input}${ltr ? ` ${styles.ltr}` : ''}`}
          value={String(offlineForm[key] ?? '')}
          onChange={(event) => patchOffline({ [key]: event.target.value } as Partial<OfflinePaymentForm>)}
          autoComplete="off"
          aria-required={required || undefined}
          disabled={locked}
        />
      </div>
    );
    return (
      <form className={styles.voidForm} onSubmit={(event) => submitOffline(event, charge)} noValidate>
        <p className={styles.savedTitle}>{copy.title}</p>
        <p className={styles.help}>{copy.amount}</p>
        <p className={styles.reviewBox} role="note">
          {[copy.warning, copy.voidedWarning].filter(Boolean).join(' ')}
        </p>
        <div role="radiogroup" aria-label="אמצעי התשלום" className={styles.segment}>
          {OFFLINE_METHOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={offlineForm.method === option.value}
              className={styles.segmentBtn}
              onClick={() => patchOffline({ method: option.value })}
              disabled={locked}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor={`${idPrefix}-paid`} className={styles.label}>
              {isCheck ? "תאריך קבלת הצ'ק" : offlineForm.method === 'bank_transfer' ? 'תאריך ההעברה' : 'תאריך התשלום'}
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id={`${idPrefix}-paid`}
              type="date"
              className={styles.input}
              value={offlineForm.paidOn}
              max={today}
              onChange={(event) => patchOffline({ paidOn: event.target.value })}
              aria-required
              disabled={locked}
            />
          </div>
          {isCheck ? (
            <>
              {textField('checkNumber', "מספר הצ'ק", true, true)}
              {textField('checkBank', 'בנק', true, true)}
              {textField('checkBranch', 'סניף', true, true)}
              {textField('checkAccount', 'מספר חשבון', true, true)}
              <div className={styles.field}>
                <label htmlFor={`${idPrefix}-check-date`} className={styles.label}>
                  תאריך פירעון
                  <span className={styles.req} aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id={`${idPrefix}-check-date`}
                  type="date"
                  className={styles.input}
                  value={offlineForm.checkDate}
                  onChange={(event) => patchOffline({ checkDate: event.target.value })}
                  aria-required
                  disabled={locked}
                />
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <label className={styles.checkToggle}>
                  <input
                    type="checkbox"
                    checked={offlineForm.checkCrossed}
                    onChange={(event) => patchOffline({ checkCrossed: event.target.checked })}
                    aria-describedby={`${idPrefix}-crossed-help`}
                    disabled={locked}
                  />
                  הצ׳ק משורטט, &quot;לא סחיר&quot;, על שם השוכר
                </label>
                <p id={`${idPrefix}-crossed-help`} className={styles.help}>
                  רק צ׳ק כזה מאפשר לשלוח לשוכר את הקבלה במייל. בלי הסימון — הקבלה נמסרת לו על נייר.
                </p>
              </div>
            </>
          ) : (
            textField('reference', offlineForm.method === 'bank_transfer' ? 'אסמכתה (לא חובה)' : 'מספר בפנקס / אסמכתה (לא חובה)')
          )}
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor={`${idPrefix}-note`} className={styles.label}>
              הערה (לא חובה)
            </label>
            <textarea
              id={`${idPrefix}-note`}
              className={`${styles.input} ${styles.textarea}`}
              value={offlineForm.note}
              onChange={(event) => patchOffline({ note: event.target.value })}
              rows={2}
              disabled={locked}
            />
          </div>
        </div>
        {offlineForm.method === 'cash' && (
          <p className={styles.help}>על תשלום במזומן הקבלה נמסרת לשוכר על נייר, ולא נשלחת במייל.</p>
        )}
        <div className={styles.voidActions}>
          <button type="button" className={styles.secondaryBtn} onClick={stopForm} disabled={locked}>
            חזרה
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={locked}>
            {out && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {out ? 'רושם ומפיק קבלה…' : copy.submit}
          </button>
        </div>
      </form>
    );
  }

  function renderItem(charge: TenantCharge): ReactNode {
    const chip = chargeChip(charge);
    const actions = chargeActions(charge, { billingEnabled, canDecide, order });
    const reviewText = reviewRowText(charge, canDecide);
    const lateText = lateCardChargeText(charge, canDecide);
    const delivery = receiptDeliveryText(charge);
    const formKind = openForm?.chargeId === charge.id ? openForm.kind : null;
    const out = (action: BusyAction) => busy?.chargeId === charge.id && busy.action === action;
    const blockedId = `retry-blocked-${charge.id}`;
    const showError =
      (charge.status === 'failed' || charge.status === 'review' || charge.undecided || charge.late_card_charge === true) &&
      charge.error;

    return (
      <li
        key={charge.id}
        className={[styles.historyItem, charge.id === blockedId ? styles.historyItemCurrent : ''].filter(Boolean).join(' ')}
      >
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
            {actions.recordOffline && !formKind && (
              <button
                type="button"
                className={styles.smallBtn}
                onClick={() => startForm('offline', charge)}
                disabled={busy !== null}
                aria-label={`תשלום במזומן, בצ׳ק או בהעברה על ${monthOf(charge)}`}
              >
                <Banknote size={14} aria-hidden="true" />
                תשלום במזומן / צ׳ק / העברה
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
        {(reviewText || charge.id === blockedId) && (
          <p className={styles.reviewBox} role="note">
            {[charge.id === blockedId ? BLOCKED_ROW_TEXT : '', reviewText].filter(Boolean).join(' ')}
          </p>
        )}
        {lateText && (
          <p className={styles.error} role="alert">
            {lateText}
          </p>
        )}
        {chargeMetaLines(charge).map((line) => (
          <p key={line} className={styles.historyMeta}>
            {line}
          </p>
        ))}
        {charge.receipt && <p className={styles.historyMeta}>{receiptLine(charge.receipt)}</p>}
        {delivery && (
          <p className={`${styles.deliveryLine} ${DELIVERY_CLASS[delivery.tone]}`} title={delivery.detail || undefined}>
            {delivery.text}
          </p>
        )}
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
        {formKind === 'offline' && renderOffline(charge)}

        {done?.chargeId === charge.id && !formKind && (
          <p className={styles.doneNote} role="status">
            {done.text}
          </p>
        )}

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

      {blockedNotice && (
        <p className={styles.reviewBox} role="note">
          {blockedNotice}
        </p>
      )}

      {canDecide && !billingEnabled && (
        <div className={styles.savedNotice} role="note">
          <p className={styles.savedText}>{RETRY_OFF_TEXT}.</p>
        </div>
      )}
      {!canDecide && (
        <p className={styles.help}>
          ניסיון חוזר, סימון כחויב, ביטול, הפקת קבלה ורישום תשלום במשרד — למנהלים בלבד. כאן רואים איפה עומד כל חודש.
        </p>
      )}

      {renderBody()}
    </DialogShell>
  );
}
