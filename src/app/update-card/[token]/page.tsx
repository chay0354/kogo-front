'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';
import pageStyles from '../update-card.module.css';

type Preview = {
  child_name: string;
  course_name: string;
  branch_name: string;
  amount: string;
  amount_label: string;
  will_charge: boolean;
  already_done: boolean;
  next_billing_date: string | null;
};

type Step = 'loading' | 'form' | 'success' | 'error';

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
        setStep('success');
        return;
      }
      setFormError(res.data?.error || 'התשלום נכשל');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; success?: boolean } } };
      if (axiosErr.response?.data?.success) {
        setChargedNow(Boolean(axiosErr.response.data.charged));
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
          <p className={formStyles.resultSubtext}>
            {chargedNow
              ? 'החיוב החודשי עבר, הוראת הקבע תוקנה, והחיוב הבא ירד אוטומטית.'
              : 'הוראת הקבע תוקנה עם הכרטיס החדש.'}
          </p>
        </div>
      )}

      {step === 'form' && preview && (
        <div className={formStyles.paymentContainer}>
          <div className={formStyles.paymentSummary}>
            <p className={formStyles.summaryTitle}>עדכון כרטיס אשראי</p>
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
            <div className={formStyles.totalRow}>
              <span>{preview.will_charge ? 'לחיוב עכשיו' : 'סכום חודשי'}</span>
              <span className={formStyles.totalAmount}>₪{preview.amount_label}</span>
            </div>
            {preview.will_charge ? (
              <p className={formStyles.billingNote}>
                החיוב שלא עבר ירד עכשיו, והוראת הקבע תמשיך עם הכרטיס החדש.
              </p>
            ) : (
              <p className={formStyles.billingNote}>
                נשמור את הכרטיס החדש להוראת הקבע. החיוב החודשי הבא ירד אוטומטית.
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
                ? `עדכן כרטיס וחייב ₪${preview.amount_label}`
                : 'עדכן כרטיס'}
          </button>
        </div>
      )}
    </div>
  );
}
