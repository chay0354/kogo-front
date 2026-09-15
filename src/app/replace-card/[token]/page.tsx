'use client';

/**
 * The parent's side of a card replacement.
 *
 * One card, every standing order the family holds. The single-order page at
 * /update-card asks a family with three children to type the same card three
 * times, and only once each order has already failed.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';
import pageStyles from '../replace-card.module.css';

type MonthDue = { month: string; label: string; amount: string };
type Item = {
  child_name: string;
  course_name: string;
  branch_name: string;
  monthly_amount: string;
  months_due: MonthDue[];
};
type Preview = {
  family_name: string;
  total_due: string;
  will_charge: boolean;
  already_done: boolean;
  items: Item[];
};

type Step = 'loading' | 'form' | 'success' | 'error';

const money = (raw: string) => `₪${Number(raw || 0).toLocaleString('he-IL')}`;

export default function ReplaceCardPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pageError, setPageError] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [holderId, setHolderId] = useState('');
  const [idError, setIdError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [charged, setCharged] = useState('0');
  const [declined, setDeclined] = useState(0);

  useEffect(() => {
    if (!token) {
      setPageError('קישור לא תקין');
      setStep('error');
      return;
    }
    let cancelled = false;
    api
      .get(`/customers/replace-card/${encodeURIComponent(token)}/`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data as Preview;
        setPreview(data);
        setStep(data.already_done ? 'success' : 'form');
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        if (cancelled) return;
        setPageError(err.response?.data?.error || 'קישור לא תקין או שפג תוקפו');
        setStep('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    if (!preview || busy) return;
    const idErr = israeliIdFieldError(holderId);
    if (idErr) {
      setIdError(idErr);
      return;
    }
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) {
      setFormError('יש למלא את כל פרטי הכרטיס');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const res = await api.post(
        `/customers/replace-card/${encodeURIComponent(token)}/apply/`,
        {
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth, 10),
            expiry_year: parseInt(expiryYear, 10),
            cvv,
            card_holder_id: holderId.replace(/\D/g, ''),
          },
        },
        { timeout: 120_000 },
      );
      if (res.data?.success) {
        setCharged(String(res.data.charged_total ?? '0'));
        setDeclined(Number(res.data.declined ?? 0));
        setStep('success');
        return;
      }
      setFormError(res.data?.error || 'העדכון נכשל');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg || 'העדכון נכשל. נסו כרטיס אחר או פנו למשרד.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={pageStyles.shell} dir="rtl">
      <div className={pageStyles.brand}>קוגומלו</div>

      {step === 'loading' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.submittingSpinner} />
          <p className={formStyles.resultSubtext}>טוען פרטים...</p>
        </div>
      )}

      {step === 'error' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>לא ניתן לעדכן כרטיס</p>
          <p className={formStyles.resultSubtext}>{pageError}</p>
        </div>
      )}

      {step === 'success' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>הכרטיס עודכן</p>
          <p className={formStyles.resultSubtext}>
            {Number(charged) > 0
              ? `נגבה ${money(charged)}, וההוראות ימשיכו אוטומטית עם הכרטיס החדש.`
              : 'הוראות הקבע ימשיכו אוטומטית עם הכרטיס החדש.'}
          </p>
          {declined > 0 && (
            <p className={formStyles.resultSubtext}>
              חלק מהחיובים לא עברו. נציג מהמשרד יחזור אליכם.
            </p>
          )}
        </div>
      )}

      {step === 'form' && preview && (
        <div className={formStyles.paymentContainer}>
          <div className={formStyles.paymentSummary}>
            <p className={formStyles.summaryTitle}>עדכון כרטיס אשראי</p>
            {preview.items.map((item, i) => (
              <div key={`${item.child_name}-${i}`} className={formStyles.summaryRow}>
                <span>{item.child_name} · {item.course_name}</span>
                <span>
                  {item.months_due.length > 0
                    ? item.months_due.map((m) => m.label).join(', ')
                    : `${money(item.monthly_amount)} לחודש`}
                </span>
              </div>
            ))}
            <div className={formStyles.totalRow}>
              <span>{preview.will_charge ? 'לחיוב עכשיו' : 'אין חוב פתוח'}</span>
              <span className={formStyles.totalAmount}>{money(preview.total_due)}</span>
            </div>
            <p className={formStyles.billingNote}>
              {preview.will_charge
                ? 'החיובים שלא עברו ירדו עכשיו, וההוראות ימשיכו עם הכרטיס החדש.'
                : 'נשמור את הכרטיס החדש. החיוב החודשי הבא ירד אוטומטית.'}
            </p>
          </div>

          <div className={formStyles.cardFields}>
            <p className={formStyles.cardSectionTitle}>פרטי כרטיס אשראי</p>
            <div>
              <label className={formStyles.label} htmlFor="rc-number">מספר כרטיס</label>
              <input id="rc-number" className={formStyles.input} inputMode="numeric" autoComplete="cc-number"
                placeholder="4580 4580 4580 4580" value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)} />
            </div>
            <div className={formStyles.grid3}>
              <div>
                <label className={formStyles.label} htmlFor="rc-month">חודש תפוגה</label>
                <input id="rc-month" className={formStyles.input} inputMode="numeric" placeholder="12"
                  value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="rc-year">שנת תפוגה</label>
                <input id="rc-year" className={formStyles.input} inputMode="numeric" placeholder="2030"
                  value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="rc-cvv">CVV</label>
                <input id="rc-cvv" className={formStyles.input} inputMode="numeric" autoComplete="cc-csc"
                  placeholder="123" value={cvv} onChange={(e) => setCvv(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={formStyles.label} htmlFor="rc-id">תעודת זהות בעל הכרטיס</label>
              <input id="rc-id" className={`${formStyles.input} ${idError ? formStyles.inputInvalid : ''}`}
                inputMode="numeric" placeholder="012345678" value={holderId}
                onChange={(e) => { setHolderId(sanitizeIsraeliIdInput(e.target.value)); setIdError(''); }} />
              {idError ? <p className={formStyles.fieldError}>{idError}</p> : null}
            </div>
          </div>

          {formError ? <p className={formStyles.errorText}>{formError}</p> : null}

          <button type="button" className={formStyles.submitButton}
            disabled={busy || !cardNumber || !expiryMonth || !expiryYear || !cvv || !holderId}
            onClick={() => void submit()}>
            {busy
              ? 'מעבד...'
              : preview.will_charge
                ? `עדכן כרטיס וחייב ${money(preview.total_due)}`
                : 'עדכן כרטיס'}
          </button>
        </div>
      )}
    </div>
  );
}
