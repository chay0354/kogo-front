'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';
import pageStyles from '../update-card.module.css';

type OutstandingMonth = { month: string; label: string };

type Preview = {
  child_name: string;
  course_name: string;
  branch_name: string;
  /** The standing order's monthly figure — not necessarily what is charged now. */
  amount: string;
  amount_label: string;
  /** What this link will actually take: a sum of whole months, or nothing. */
  charge_amount_label?: string;
  /** '' for a link issued before the two modes existed. */
  mode?: '' | 'renew' | 'card_only';
  months?: OutstandingMonth[];
  months_label?: string;
  /** The one line the server wrote: what happens when this card is submitted. */
  headline?: string;
  will_charge: boolean;
  already_done: boolean;
  next_billing_date: string | null;
};

type Step = 'loading' | 'form' | 'success' | 'error';

/** What the card is about to be charged, as the server computed it. */
function chargeLabel(preview: Preview) {
  return preview.charge_amount_label ?? preview.amount_label;
}

export default function UpdateCardPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pageError, setPageError] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [idError, setIdError] = useState('');
  const [charging, setCharging] = useState(false);
  const [formError, setFormError] = useState('');
  const [chargedNow, setChargedNow] = useState(false);
  // What the server said it did, so the page reports the outcome rather than a guess.
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    if (!token) {
      setPageError('קישור לא תקין');
      setStep('error');
      return;
    }
    let cancelled = false;
    api
      .get(`/customers/card-update/${encodeURIComponent(token)}/`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data as Preview;
        setPreview(data);
        if (data.already_done) {
          setChargedNow(false);
          setOutcome('הכרטיס כבר עודכן. לא בוצע חיוב נוסף.');
          setStep('success');
          return;
        }
        setStep('form');
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

  const handleSubmit = async () => {
    if (!preview || charging) return;
    const idErr = israeliIdFieldError(cardHolderId);
    if (idErr) {
      setIdError(idErr);
      return;
    }
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) {
      setFormError('יש למלא את כל פרטי הכרטיס');
      return;
    }
    setCharging(true);
    setFormError('');
    try {
      const res = await api.post(
        `/customers/card-update/${encodeURIComponent(token)}/charge/`,
        {
          card_details: {
            card_number: cardNumber.replace(/\s/g, ''),
            expiry_month: parseInt(expiryMonth, 10),
            expiry_year: parseInt(expiryYear, 10),
            cvv,
            card_holder_id: cardHolderId.replace(/\D/g, ''),
          },
        },
        { timeout: 90_000 },
      );
      if (res.data?.success) {
        setChargedNow(Boolean(res.data.charged));
        setOutcome(String(res.data.message || ''));
        setStep('success');
        return;
      }
      setFormError(res.data?.error || 'התשלום נכשל');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: string; success?: boolean; charged?: boolean; message?: string } };
      };
      if (axiosErr.response?.data?.success) {
        setChargedNow(Boolean(axiosErr.response.data.charged));
        setOutcome(String(axiosErr.response.data.message || ''));
        setStep('success');
        return;
      }
      setFormError(axiosErr.response?.data?.error || 'התשלום נכשל. נסו שוב או פנו למשרד.');
    } finally {
      setCharging(false);
    }
  };

  return (
    <div className={pageStyles.shell} dir="rtl">
      <div className={pageStyles.brand}>קוגומלו</div>

      {step === 'loading' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.submittingSpinner} />
          <p className={formStyles.resultSubtext}>טוען פרטי חיוב...</p>
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
          <p className={formStyles.resultTitle}>הכרטיס עודכן בהצלחה</p>
          {/* The server says what it did — which months it settled, or that it
              charged nothing — so the parent is never told a charge happened
              when it did not, or left guessing when it did. */}
          <p className={formStyles.resultSubtext}>
            {outcome ||
              (chargedNow
                ? 'החיוב עבר, הוראת הקבע תוקנה, והחיוב הבא ירד אוטומטית.'
                : 'הוראת הקבע תוקנה עם הכרטיס החדש. לא בוצע חיוב.')}
          </p>
        </div>
      )}

      {step === 'form' && preview && (
        <div className={formStyles.paymentContainer}>
          <div className={formStyles.paymentSummary}>
            <p className={formStyles.summaryTitle}>
              {preview.will_charge ? 'חידוש הוראת קבע' : 'שינוי פרטי אשראי'}
            </p>
            {/* Before a digit is typed: exactly what this link does, in the server's
                own words, so the amount on screen is the amount that will be taken. */}
            <p className={formStyles.billingNote}>
              {preview.headline ||
                (preview.will_charge
                  ? `יחויב ₪${chargeLabel(preview)}`
                  : 'עדכון פרטי אשראי בלבד — לא יבוצע חיוב')}
            </p>
            <div className={formStyles.summaryRow}>
              <span>ילד/ה</span>
              <span>{preview.child_name}</span>
            </div>
            {preview.course_name ? (
              <div className={formStyles.summaryRow}>
                <span>חוג</span>
                <span>{preview.course_name}</span>
              </div>
            ) : null}
            {preview.branch_name ? (
              <div className={formStyles.summaryRow}>
                <span>סניף</span>
                <span>{preview.branch_name}</span>
              </div>
            ) : null}
            {preview.will_charge && (preview.months?.length ?? 0) > 0 ? (
              <div className={formStyles.summaryRow}>
                <span>{preview.months!.length === 1 ? 'חודש שלא נגבה' : 'חודשים שלא נגבו'}</span>
                <span>{preview.months_label || preview.months!.map((m) => m.label).join(', ')}</span>
              </div>
            ) : null}
            {preview.will_charge ? (
              <div className={formStyles.summaryRow}>
                <span>סכום חודשי</span>
                <span>₪{preview.amount_label}</span>
              </div>
            ) : null}
            <div className={formStyles.totalRow}>
              <span>{preview.will_charge ? 'לחיוב עכשיו' : 'סכום חודשי'}</span>
              <span className={formStyles.totalAmount}>
                ₪{preview.will_charge ? chargeLabel(preview) : preview.amount_label}
              </span>
            </div>
            {preview.will_charge ? (
              <p className={formStyles.billingNote}>
                החיוב שלא עבר ירד עכשיו, והוראת הקבע תמשיך עם הכרטיס החדש.
              </p>
            ) : (
              <p className={formStyles.billingNote}>
                נשמור את הכרטיס החדש להוראת הקבע ולא יבוצע חיוב. החיוב החודשי הבא ירד בתאריך שלו כרגיל.
              </p>
            )}
          </div>

          <div className={formStyles.cardFields}>
            <p className={formStyles.cardSectionTitle}>פרטי כרטיס אשראי</p>
            <div>
              <label className={formStyles.label} htmlFor="card-number">מספר כרטיס</label>
              <input
                id="card-number"
                className={formStyles.input}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4580 4580 4580 4580"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>
            <div className={formStyles.grid3}>
              <div>
                <label className={formStyles.label} htmlFor="exp-month">חודש תפוגה</label>
                <input
                  id="exp-month"
                  className={formStyles.input}
                  inputMode="numeric"
                  placeholder="12"
                  value={expiryMonth}
                  onChange={(e) => setExpiryMonth(e.target.value)}
                />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="exp-year">שנת תפוגה</label>
                <input
                  id="exp-year"
                  className={formStyles.input}
                  inputMode="numeric"
                  placeholder="2028"
                  value={expiryYear}
                  onChange={(e) => setExpiryYear(e.target.value)}
                />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="cvv">CVV</label>
                <input
                  id="cvv"
                  className={formStyles.input}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={formStyles.label} htmlFor="card-id">תעודת זהות בעל הכרטיס</label>
              <input
                id="card-id"
                className={`${formStyles.input} ${idError ? formStyles.inputInvalid : ''}`}
                inputMode="numeric"
                placeholder="012345678"
                value={cardHolderId}
                onChange={(e) => {
                  setCardHolderId(sanitizeIsraeliIdInput(e.target.value));
                  setIdError('');
                }}
              />
              {idError ? <p className={formStyles.fieldError}>{idError}</p> : null}
            </div>
          </div>

          {formError ? <p className={formStyles.errorText}>{formError}</p> : null}

          <button
            type="button"
            className={formStyles.submitButton}
            disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolderId}
            onClick={() => void handleSubmit()}
          >
            {charging
              ? 'מעבד...'
              : preview.will_charge
                ? `עדכן כרטיס וחייב ₪${chargeLabel(preview)}`
                : 'עדכן כרטיס ללא חיוב'}
          </button>
        </div>
      )}
    </div>
  );
}
