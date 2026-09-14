'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useDialogExit } from '@/components/ui/motion';
import { createStandingOrder, updateStandingOrder, type StandingOrder } from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import DialogShell from './DialogShell';
import { ToneChip } from './StatusChips';
import {
  billingApiError,
  billingMoney,
  buildOrderCreatePayload,
  buildOrderUpdatePayload,
  editableOrderFields,
  orderFormErrors,
  orderFormFromOrder,
  orderFormFromTenancy,
  orderStatusLabel,
  orderStatusTone,
  type OrderForm,
} from './billingUtils';
import {
  BILLING_DAYS,
  VAT_RATE,
  formatDay,
  isUnknownOutcome,
  parseAmountInput,
  tenantName,
  toDecimalString,
  withVat,
} from './tenancyUtils';
import styles from './rentalsDialog.module.css';

const VAT_PERCENT = Math.round(VAT_RATE * 100);

interface StandingOrderDialogProps {
  tenancy: Tenancy;
  /** The order to edit; null opens a new one from the tenancy's agreement. */
  order: StandingOrder | null;
  onClose: () => void;
  /** A save may have happened — the list should read the server again. */
  onChanged: () => void;
  /** Saved: the order as the server returned it, and whether it was just opened. */
  onSaved: (order: StandingOrder, created: boolean) => void;
}

/**
 * "פתיחת הוראת קבע", or its edit. A new order starts from the tenancy's
 * agreement — its amount before VAT, billing day and dates — and the office
 * may change any of them first; it opens waiting for the tenant's card. An
 * edit changes only what the server lets the office change: the amount, the
 * billing day, the end date and the notes (only the notes once it has ended).
 * The card and the status never change here.
 */
export default function StandingOrderDialog({ tenancy, order, onClose, onChanged, onSaved }: StandingOrderDialogProps) {
  const { closing, requestClose } = useDialogExit(onClose);
  const creating = order === null;
  const [form, setForm] = useState<OrderForm>(() => (order ? orderFormFromOrder(order) : orderFormFromTenancy(tenancy)));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const name = tenantName(tenancy.tenant);
  const editable = new Set<string>(order ? editableOrderFields(order) : ['amount_before_vat', 'billing_day', 'end_date', 'notes']);
  const net = parseAmountInput(form.amount);
  const ended = order?.status === 'ended';

  function patch(next: Partial<OrderForm>) {
    setForm((prev) => ({ ...prev, ...next }));
    setErrors([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const problems = orderFormErrors(form, { creating });
    if (problems.length) {
      setErrors(problems);
      return;
    }
    const changes = order ? buildOrderUpdatePayload(form, order) : null;
    if (order && changes && Object.keys(changes).length === 0) {
      requestClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setErrors([]);
    try {
      const saved =
        order && changes
          ? await updateStandingOrder(order.id, changes)
          : await createStandingOrder(buildOrderCreatePayload(form, tenancy.id));
      onSaved(saved, creating);
    } catch (err) {
      setErrors([
        isUnknownOutcome(err)
          ? creating
            ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הוראת הקבע נפתחה. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.'
            : 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם השינוי נשמר. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.'
          : billingApiError(err, creating ? 'פתיחת הוראת הקבע נכשלה' : 'שמירת השינויים נכשלה'),
      ]);
      onChanged();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <DialogShell
      id="standing-order"
      title={creating ? `פתיחת הוראת קבע — ${name}` : `עריכת הוראת קבע — ${name}`}
      hint={
        creating
          ? 'הסכום, יום החיוב והתאריכים נלקחו מההסכם, ואפשר לשנות אותם כאן. הוראת הקבע נפתחת במצב "ממתינה לכרטיס", ואחרי השמירה נפתח הקישור לכרטיס — לשליחה לשוכר.'
          : 'אפשר לשנות את הסכום, יום החיוב, תאריך הסיום וההערות. השינוי חל מהחיוב הבא; הכרטיס והסטטוס לא משתנים כאן.'
      }
      closing={closing}
      onRequestClose={requestClose}
      busy={saving}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className={styles.secondaryBtn} onClick={requestClose} disabled={saving}>
            ביטול
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving && <Loader2 size={15} className={styles.spin} aria-hidden="true" />}
            {creating ? 'פתיחת הוראת קבע' : 'שמירה'}
          </button>
        </>
      }
    >
      {order && (
        <div className={styles.signHead}>
          <ToneChip tone={orderStatusTone(order.status)}>{orderStatusLabel(order.status, order.status_label)}</ToneChip>
          {ended && <span className={styles.help}>הוראת קבע שהסתיימה — אפשר לשנות רק את ההערות.</span>}
        </div>
      )}

      <section className={styles.section} aria-labelledby="order-terms-title">
        <div className={styles.sectionHead}>
          <h3 id="order-terms-title" className={styles.sectionTitle}>
            החיוב החודשי
          </h3>
          {creating && <p className={styles.sectionSub}>לפי ההסכם של השוכר — אפשר לשנות</p>}
        </div>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="order-amount" className={styles.label}>
              סכום חודשי לפני מע״מ
              <span className={styles.req} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="order-amount"
              type="text"
              inputMode="decimal"
              className={`${styles.input} ${styles.ltr}`}
              value={form.amount}
              onChange={(event) => patch({ amount: event.target.value })}
              aria-required
              aria-describedby="order-amount-line"
              disabled={saving || !editable.has('amount_before_vat')}
            />
            <div id="order-amount-line" className={styles.moneyLine} aria-live="polite">
              {net !== null && net > 0 && (
                <span>
                  כולל מע״מ ({VAT_PERCENT}%): <b>{billingMoney(toDecimalString(withVat(net)))}</b>
                </span>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="order-billing-day" className={styles.label}>
              יום חיוב בחודש
            </label>
            <select
              id="order-billing-day"
              className={styles.input}
              value={form.billingDay}
              onChange={(event) => patch({ billingDay: event.target.value })}
              disabled={saving || !editable.has('billing_day')}
            >
              {BILLING_DAYS.map((day) => (
                <option key={day} value={String(day)}>
                  ב־{day} לחודש
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="order-start" className={styles.label}>
              תאריך התחלה
              {creating && (
                <span className={styles.req} aria-hidden="true">
                  *
                </span>
              )}
            </label>
            {creating ? (
              <input
                id="order-start"
                type="date"
                className={styles.input}
                value={form.startDate}
                max={form.endDate || undefined}
                onChange={(event) => patch({ startDate: event.target.value })}
                aria-required
                disabled={saving}
              />
            ) : (
              // The start is fixed once the order is open: the schedule and the charges hang on it.
              <input id="order-start" className={styles.input} value={formatDay(form.startDate) || '—'} readOnly disabled />
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="order-end" className={styles.label}>
              תאריך סיום
            </label>
            <input
              id="order-end"
              type="date"
              className={styles.input}
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(event) => patch({ endDate: event.target.value })}
              aria-describedby="order-end-help"
              disabled={saving || !editable.has('end_date')}
            />
            <p id="order-end-help" className={styles.help}>
              ריק — בלי תאריך סיום. אחרי תאריך הסיום לא יירדו חיובים.
            </p>
          </div>

          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="order-notes" className={styles.label}>
              הערות
            </label>
            <textarea
              id="order-notes"
              className={`${styles.input} ${styles.textarea}`}
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              rows={2}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <p className={styles.error} role="alert">
          {errors.join('\n')}
        </p>
      )}
    </DialogShell>
  );
}
