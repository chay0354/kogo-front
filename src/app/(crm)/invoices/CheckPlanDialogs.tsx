'use client';

/**
 * The two actions on a check plan that issue documents (WS-3, D2), each a
 * form that says before anything happens what will be issued and sent:
 *
 *   - צ׳ק חזר — a check came back unpaid. If its tax invoice was issued, the
 *     invoice is credited: a credit note is issued, signed and emailed to the
 *     customer. If not, the check is cancelled and no invoice follows. A
 *     replacement check, when one was handed over, becomes a plan of its own
 *     (its own receipt now, its own invoice on its day).
 *   - ביטול תוכנית — the checks still ahead are cancelled; an invoice issued
 *     and not paid is credited (normally none — each is paid by its check).
 *
 * The server's refusal (a check marked already, another plan's check, a
 * replacement without a date) is shown as it comes.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import {
  bounceCheck,
  cancelCheckPlan,
  type BounceCheckAnswer,
  type CheckItemRow,
  type CheckPlanRow,
} from '@/lib/documentsApi';
import { bounceOutcome, cancelPlanPreview, checkLabel } from './checkPlanRules';
import { formatAmount } from './utils';
import styles from './checks.module.css';

interface ReplacementDraft {
  date: string;
  amount: string;
  bank: string;
  branch: string;
  accountNumber: string;
  checkNumber: string;
  crossed: boolean;
}

function emptyReplacement(item: CheckItemRow): ReplacementDraft {
  return {
    date: '',
    amount: String(Number(item.amount) || ''),
    bank: item.bank || '',
    branch: item.bank_branch || '',
    accountNumber: item.account_number || '',
    checkNumber: '',
    crossed: false,
  };
}

export function BounceCheckDialog({
  plan,
  item,
  onClose,
  onDone,
}: {
  plan: CheckPlanRow | null;
  item: CheckItemRow | null;
  onClose: () => void;
  onDone: (answer: BounceCheckAnswer) => void;
}) {
  const [reason, setReason] = useState('');
  const [withReplacement, setWithReplacement] = useState(false);
  const [replacement, setReplacement] = useState<ReplacementDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) return;
    setReason('');
    setWithReplacement(false);
    setReplacement(emptyReplacement(item));
    setError('');
  }, [item]);

  if (!plan || !item || !replacement) return null;

  const outcome = bounceOutcome(item);
  const replacementAmount = Number(replacement.amount);
  const replacementReady = !withReplacement || (Boolean(replacement.date) && replacementAmount > 0);

  function update(field: keyof ReplacementDraft, value: string | boolean) {
    setReplacement((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || !item || !replacement || saving) return;
    if (!replacementReady) {
      setError('יש למלא לצ׳ק החלופי תאריך וסכום');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const answer = await bounceCheck(plan.id, {
        item_id: item.id,
        reason,
        replacement: withReplacement
          ? {
              date: replacement.date,
              amount: replacementAmount,
              bank: replacement.bank,
              branch: replacement.branch,
              account_number: replacement.accountNumber,
              check_number: replacement.checkNumber,
              check_crossed: replacement.crossed,
            }
          : null,
      });
      onDone(answer);
      onClose();
    } catch (err) {
      setError(readableError(err, 'סימון הצ׳ק כחוזר נכשל'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={saving ? undefined : onClose}>
      <form
        className={`${styles.dialog} ${styles.dialogNarrow}`}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bounce-check-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className={styles.dialogHeader}>
          <div>
            <h3 id="bounce-check-title" className={styles.dialogTitle}>צ׳ק חזר — {plan.child_name}</h3>
            <p className={styles.dialogHint}>{checkLabel(item)}</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגור" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className={outcome === 'credit' ? styles.warnBox : styles.infoBox} role="note">
          {outcome === 'credit' ? (
            <>
              <strong>תופק חשבונית מס זיכוי ותישלח במייל ללקוח.</strong>
              <span>
                לצ׳ק הופקה חשבונית מס{item.tax_invoice_number ? ` ${item.tax_invoice_number}` : ''}. היא תזוכה על היתרה
                שלה: חשבונית מס זיכוי תופק, תיחתם ותישלח במייל ללקוח. את זה אי אפשר לבטל.
              </span>
            </>
          ) : (
            <>
              <strong>לא יופק זיכוי.</strong>
              <span>לצ׳ק עוד לא הופקה חשבונית — הוא יבוטל, ולא תופק לו חשבונית.</span>
            </>
          )}
          <span>
            הקבלה של התוכנית{plan.receipt_number ? ` (${plan.receipt_number})` : ''} לא משתנה — יש לדווח לרואה החשבון על
            הצ׳ק שחזר.
          </span>
        </div>

        <label className={styles.fieldLabel} htmlFor="bounce-reason">
          סיבה <span className={styles.muted}>(אופציונלי)</span>
        </label>
        <input
          id="bounce-reason"
          className={styles.textInput}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="למשל: אין כיסוי"
        />

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={withReplacement}
            onChange={(e) => setWithReplacement(e.target.checked)}
          />
          התקבל צ׳ק חלופי
        </label>

        {withReplacement && (
          <>
            <p className={styles.muted}>
              הצ׳ק החלופי נרשם כתוכנית משלו: קבלה משלו מופקת עכשיו, וחשבונית מס ביום שלו.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.checkTable}>
                <thead>
                  <tr>
                    <th>תאריך *</th>
                    <th>סכום (₪) *</th>
                    <th>בנק</th>
                    <th>סניף</th>
                    <th>מס׳ חשבון</th>
                    <th>מס׳ צ׳ק</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <input type="date" className={styles.cellInput} value={replacement.date}
                        aria-label="תאריך הצ׳ק החלופי" onChange={(e) => update('date', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" min="0" step="0.01" className={styles.cellInput} value={replacement.amount}
                        aria-label="סכום הצ׳ק החלופי" onChange={(e) => update('amount', e.target.value)} />
                    </td>
                    <td>
                      <input className={styles.cellInput} value={replacement.bank} placeholder="בנק"
                        aria-label="בנק" onChange={(e) => update('bank', e.target.value)} />
                    </td>
                    <td>
                      <input className={styles.cellInput} value={replacement.branch} placeholder="סניף"
                        aria-label="סניף" onChange={(e) => update('branch', e.target.value)} />
                    </td>
                    <td>
                      <input className={styles.cellInput} value={replacement.accountNumber} placeholder="חשבון"
                        aria-label="מספר חשבון" onChange={(e) => update('accountNumber', e.target.value)} />
                    </td>
                    <td>
                      <input className={styles.cellInput} value={replacement.checkNumber} placeholder="מס׳ צ׳ק"
                        aria-label="מספר צ׳ק" onChange={(e) => update('checkNumber', e.target.value)} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={replacement.crossed} onChange={(e) => update('crossed', e.target.checked)} />
              צ׳ק משורטט, &apos;לא סחיר&apos;, על שם הלקוח
            </label>
          </>
        )}

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            חזרה
          </button>
          <button type="submit" className={styles.primaryBtn} disabled={saving || !replacementReady}>
            {saving
              ? 'שומר…'
              : outcome === 'credit'
                ? 'סימון כחוזר והפקת זיכוי'
                : 'סימון כחוזר וביטול הצ׳ק'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CancelCheckPlanDialog({
  plan,
  onClose,
  onDone,
}: {
  plan: CheckPlanRow | null;
  onClose: () => void;
  onDone: (plan: CheckPlanRow, creditNotes: string[]) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!plan) return;
    setReason('');
    setError('');
  }, [plan]);

  if (!plan) return null;
  const preview = cancelPlanPreview(plan);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!plan || saving) return;
    setSaving(true);
    setError('');
    try {
      const answer = await cancelCheckPlan(plan.id, reason);
      onDone(answer.plan, answer.credit_notes);
      onClose();
    } catch (err) {
      setError(readableError(err, 'ביטול תוכנית הצ׳קים נכשל'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={saving ? undefined : onClose}>
      <form
        className={`${styles.dialog} ${styles.dialogNarrow}`}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-plan-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className={styles.dialogHeader}>
          <div>
            <h3 id="cancel-plan-title" className={styles.dialogTitle}>ביטול תוכנית צ׳קים — {plan.child_name}</h3>
            <p className={styles.dialogHint}>
              {formatAmount(Number(plan.total_amount))}
              {plan.lesson_name || plan.description ? ` · ${plan.lesson_name || plan.description}` : ''}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="סגור" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.warnBox} role="note">
          <span>
            {preview.pending === 0
              ? 'אין צ׳קים שממתינים לחשבונית.'
              : preview.pending === 1
                ? 'הצ׳ק שעוד לא הופקה לו חשבונית יבוטל — לא תופק לו חשבונית.'
                : `${preview.pending} הצ׳קים שעוד לא הופקה להם חשבונית יבוטלו — לא תופק להם חשבונית.`}
          </span>
          <strong>
            חשבונית מס שכבר הופקה ולא שולמה תזוכה: תופק חשבונית מס זיכוי, והיא תיחתם ותישלח במייל ללקוח.
          </strong>
          <span>
            {preview.invoiced > 0
              ? `בדרך כלל אין כזו — כל אחת מ־${preview.invoiced === 1 ? 'החשבונית שהופקה' : `${preview.invoiced} החשבוניות שהופקו`} שולמה בצ׳ק שלה ונשארת כמו שהיא.`
              : 'לתוכנית עוד לא הופקו חשבוניות.'}
          </span>
          <span>הקבלה{plan.receipt_number ? ` ${plan.receipt_number}` : ''} שכבר הופקה לא מבוטלת.</span>
        </div>

        <label className={styles.fieldLabel} htmlFor="cancel-plan-reason">
          סיבה <span className={styles.muted}>(אופציונלי)</span>
        </label>
        <input
          id="cancel-plan-reason"
          className={styles.textInput}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="למשל: הילד עזב את החוג"
        />

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            חזרה
          </button>
          <button type="submit" className={`${styles.primaryBtn} ${styles.dangerBtn}`} disabled={saving}>
            {saving ? 'מבטל…' : 'ביטול התוכנית'}
          </button>
        </div>
      </form>
    </div>
  );
}

