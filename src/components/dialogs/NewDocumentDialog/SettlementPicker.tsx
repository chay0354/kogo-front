'use client';

/**
 * Which open invoices this payment closes, and how much of each (WS-3).
 *
 * A receipt closes the customer's tax invoices; an invoice-receipt closes
 * their transaction invoices. By default the amount is spread oldest first
 * and follows the amount as it is typed; ticking, unticking or typing an
 * amount takes over, and "חלוקה אוטומטית" gives the default back. The form
 * checks what the server will — each amount within its invoice's balance,
 * all of them within what the document received — and the server's own
 * refusal, if any, is shown as it comes when the document is issued.
 */
import {
  formatAgorotShekels,
  resolveSettlements,
  setPickAmount,
  togglePick,
  toAgorot,
  AUTO_SETTLEMENT_PICKS,
  type OpenInvoice,
  type PayerType,
  type SettlementPicks,
} from '@/lib/settlements';
import { formatCardDate } from '@/lib/businessCustomerApi';
import styles from './index.module.css';

export type OpenInvoicesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SettlementPickerProps {
  payerType: PayerType;
  status: OpenInvoicesStatus;
  invoices: readonly OpenInvoice[];
  picks: SettlementPicks;
  /** Agorot the document received — what it can close. */
  capacity: number;
  onChange: (picks: SettlementPicks) => void;
  onRetry: () => void;
  /** Set when the document cannot close invoices (a receipt that opens a check plan); says why. */
  disabledReason?: string;
}

const COPY: Record<PayerType, { title: string; hint: string; none: string; amountWord: string }> = {
  receipt: {
    title: 'חשבוניות מס שהקבלה משלמת',
    hint: 'ברירת המחדל: מהחשבונית הישנה לחדשה, עד סכום הקבלה. אפשר לסמן אחרות ולשנות סכומים.',
    none: 'אין ללקוח חשבוניות מס פתוחות — הקבלה לא תסגור חשבונית.',
    amountWord: 'הקבלה',
  },
  combined: {
    title: 'חשבוניות עסקה שהמסמך סוגר',
    hint: 'חשבונית מס/קבלה סוגרת חשבונית עסקה פתוחה של הלקוח. ברירת המחדל: מהישנה לחדשה, עד סכום המסמך.',
    none: 'אין ללקוח חשבוניות עסקה פתוחות.',
    amountWord: 'המסמך',
  },
};

export default function SettlementPicker({
  payerType,
  status,
  invoices,
  picks,
  capacity,
  onChange,
  onRetry,
  disabledReason = '',
}: SettlementPickerProps) {
  const copy = COPY[payerType];
  const plan = resolveSettlements(invoices, picks, capacity, payerType);
  const chosen = new Map(plan.rows.map((row) => [row.invoiceId, row]));

  return (
    <div className={styles.detailsSection}>
      <div className={styles.sectionDivider}>
        <span className={styles.sectionDividerLabel}>סגירת חשבוניות פתוחות</span>
      </div>
      <p className={styles.sectionHeading}>{copy.title}</p>

      {disabledReason ? (
        <p className={styles.checkCrossedHint}>{disabledReason}</p>
      ) : status === 'loading' || status === 'idle' ? (
        <p className={styles.checkCrossedHint}>טוען את החשבוניות הפתוחות…</p>
      ) : status === 'error' ? (
        <p className={styles.fieldError} role="alert">
          לא ניתן היה לטעון את החשבוניות הפתוחות. אפשר להפיק בלי לסגור חשבונית, או{' '}
          <button type="button" className={styles.settleLinkBtn} onClick={onRetry}>לנסות שוב</button>.
        </p>
      ) : invoices.length === 0 ? (
        <p className={styles.checkCrossedHint}>{copy.none}</p>
      ) : (
        <>
          <p className={styles.checkCrossedHint}>{copy.hint}</p>
          <div className={styles.lineItemsTableWrap}>
            <table className={styles.settleTable}>
              <caption className={styles.srOnlyCaption}>{copy.title}, מהישנה לחדשה</caption>
              <thead>
                <tr>
                  <th scope="col"><span className={styles.srOnlyCaption}>סגירה</span></th>
                  <th scope="col">חשבונית</th>
                  <th scope="col">תאריך</th>
                  <th scope="col">סה״כ</th>
                  <th scope="col">פתוח</th>
                  <th scope="col">סוגר עכשיו (₪)</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const row = chosen.get(invoice.id);
                  const checked = row !== undefined;
                  const error = plan.errors[invoice.id];
                  const typed = picks.mode === 'manual'
                    ? picks.amounts[invoice.id] ?? ''
                    : row ? (row.amount / 100).toFixed(2) : '';
                  return (
                    <tr key={invoice.id} className={checked ? styles.settleRowOn : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`סגירת ${invoice.document_number}`}
                          onChange={(e) => onChange(togglePick(invoices, picks, capacity, invoice.id, e.target.checked))}
                        />
                      </td>
                      <td>
                        <span dir="ltr" className={styles.settleNumber}>{invoice.document_number}</span>
                        {invoice.description && <span className={styles.settleSub}>{invoice.description}</span>}
                        {invoice.status === 'partial' && <span className={styles.settleSub}>{invoice.status_label}</span>}
                      </td>
                      <td>{formatCardDate(invoice.document_date) || '—'}</td>
                      <td dir="ltr">{formatAgorotShekels(toAgorot(invoice.total))}</td>
                      <td dir="ltr">{formatAgorotShekels(toAgorot(invoice.open))}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`${styles.lineItemInput} ${error ? styles.settleInputError : ''}`}
                          value={typed}
                          placeholder="0.00"
                          aria-label={`הסכום שנסגר ב־${invoice.document_number}`}
                          aria-invalid={Boolean(error) || undefined}
                          onChange={(e) => onChange(setPickAmount(invoices, picks, capacity, invoice.id, e.target.value))}
                        />
                        {error && <span className={styles.fieldError}>{error}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.checkSummaryBar}>
            <span className={styles.checkSummaryLabel}>
              נסגר {formatAgorotShekels(plan.total)} מתוך {formatAgorotShekels(capacity)} של {copy.amountWord}
            </span>
            <span className={styles.checkSummaryAmount}>
              {plan.unapplied > 0 ? `לא משויך ${formatAgorotShekels(plan.unapplied)}` : 'הכול משויך ✓'}
            </span>
          </div>
          {plan.overCapacity && <p className={styles.fieldError} role="alert">{plan.overCapacity}</p>}
          <div className={styles.settleActions}>
            {picks.mode === 'manual' && (
              <button type="button" className={styles.settleLinkBtn} onClick={() => onChange(AUTO_SETTLEMENT_PICKS)}>
                חלוקה אוטומטית (מהישנה לחדשה)
              </button>
            )}
            {plan.rows.length > 0 && (
              <button
                type="button"
                className={styles.settleLinkBtn}
                onClick={() => onChange({ mode: 'manual', amounts: {} })}
              >
                בלי לסגור חשבונית
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
