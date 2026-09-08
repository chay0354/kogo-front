'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';
import pageStyles from '@/app/update-card/update-card.module.css';
import { fetchCardLinkPreview, formatShekels, submitCardLink, type CardLinkPreview } from '@/lib/paymentLinksApi';

type Step = 'loading' | 'form' | 'processing' | 'success' | 'review' | 'error';

/**
 * The parent's page for a card link the office sent: what will be charged
 * (a standing order's first charge + monthly amount, or a one-time sum),
 * then the card form. Same shell as the card-update page.
 */
export default function CardLinkPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<CardLinkPreview | null>(null);
  const [pageError, setPageError] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardHolderId, setCardHolderId] = useState('');
  const [idError, setIdError] = useState('');
  const [charging, setCharging] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<{ charged?: string; monthly_amount?: string; next_billing_date?: string; message?: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setPageError('קישור לא תקין');
      setStep('error');
      return;
    }
    let cancelled = false;
    fetchCardLinkPreview(token)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        if (data.already_done) {
          setStep('success');
          return;
        }
        if (data.status === 'review') {
          setStep('review');
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
      const res = await submitCardLink(token, {
        card_number: cardNumber.replace(/\s/g, ''),
        expiry_month: parseInt(expiryMonth, 10),
        expiry_year: parseInt(expiryYear, 10),
        cvv,
        card_holder_id: cardHolderId.replace(/\D/g, ''),
      });
      if (res.success) {
        setResult(res);
        setStep(res.review ? 'review' : 'success');
        return;
      }
      setFormError(res.error || 'התשלום נכשל');
    } catch (err: unknown) {
      const axiosErr = err as { code?: string; response?: { status?: number; data?: { error?: string; success?: boolean; processing?: boolean } } };
      if (axiosErr.response?.data?.success) {
        setStep('success');
        return;
      }
      if (axiosErr.response?.data?.processing) {
        setStep('processing');
        return;
      }
      if (!axiosErr.response) {
        // No answer at all (timeout): the charge may have gone through. Ask the
        // server what it knows instead of inviting a second try.
        try {
          const fresh = await fetchCardLinkPreview(token);
          if (fresh.already_done) setStep('success');
          else if (fresh.status === 'review' || fresh.status === 'processing') setStep('processing');
          else setFormError('לא התקבלה תשובה. אם חויבתם — אל תנסו שוב; פנו למשרד.');
        } catch {
          setStep('processing');
        }
        return;
      }
      setFormError(axiosErr.response?.data?.error || 'התשלום נכשל. נסו שוב או פנו למשרד.');
    } finally {
      setCharging(false);
    }
  };

  const isSto = preview?.kind === 'standing_order';
  const firstCharge = preview?.first_charge ? Number(preview.first_charge) : 0;

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
          <p className={formStyles.resultTitle}>לא ניתן לפתוח את הקישור</p>
          <p className={formStyles.resultSubtext}>{pageError}</p>
        </div>
      )}

      {step === 'processing' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.submittingSpinner} />
          <p className={formStyles.resultTitle}>החיוב בעיבוד</p>
          <p className={formStyles.resultSubtext}>המתינו רגע ורעננו את העמוד. אל תשלחו שוב.</p>
        </div>
      )}

      {step === 'review' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>החיוב עבר ונמצא בבדיקה</p>
          <p className={formStyles.resultSubtext}>{result?.message || 'המשרד יסיים את ההסדרה ויחזור אליכם.'}</p>
        </div>
      )}

      {step === 'success' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>{isSto ? 'הוראת הקבע הוסדרה' : 'התשלום התקבל'}</p>
          <p className={formStyles.resultSubtext}>
            {isSto
              ? result?.monthly_amount
                ? `הכרטיס נשמר. ${Number(result.charged) > 0 ? `חויב עכשיו ${formatShekels(result.charged || 0)}. ` : ''}החיוב החודשי ${formatShekels(result.monthly_amount)} ירד אוטומטית${result.next_billing_date ? ` החל מ-${new Date(`${result.next_billing_date}T00:00:00`).toLocaleDateString('he-IL')}` : ''}.`
                : 'הכרטיס נשמר והחיוב החודשי ירד אוטומטית.'
              : `תודה! ${result?.charged ? `חויב ${formatShekels(result.charged)}.` : ''} קבלה תישלח למייל.`}
          </p>
        </div>
      )}

      {step === 'form' && preview && (
        <div className={formStyles.paymentContainer}>
          <div className={formStyles.paymentSummary}>
            <p className={formStyles.summaryTitle}>{isSto ? 'הסדרת הוראת קבע' : 'תשלום חד-פעמי'}</p>
            <div className={formStyles.summaryRow}>
              <span>ילד/ה</span>
              <span>{preview.child_name}</span>
            </div>
            {isSto ? (
              <>
                <div className={formStyles.summaryRow}>
                  <span>חוג</span>
                  <span>{preview.course_name}</span>
                </div>
                {preview.day_name ? (
                  <div className={formStyles.summaryRow}>
                    <span>מועד</span>
                    <span>{preview.day_name} {preview.start_time}{preview.end_time ? `–${preview.end_time}` : ''}</span>
                  </div>
                ) : null}
                {preview.branch_name ? (
                  <div className={formStyles.summaryRow}>
                    <span>סניף</span>
                    <span>{preview.branch_name}</span>
                  </div>
                ) : null}
                {preview.quote_error ? (
                  <p className={formStyles.errorText}>{preview.quote_error}</p>
                ) : (
                  <>
                    <div className={formStyles.totalRow}>
                      <span>לחיוב עכשיו</span>
                      <span className={formStyles.totalAmount}>{formatShekels(preview.first_charge || 0)}</span>
                    </div>
                    <div className={formStyles.summaryRow}>
                      <span>סכום חודשי</span>
                      <span>{formatShekels(preview.monthly_amount || 0)}</span>
                    </div>
                    {Number(preview.registration_fee) > 0 ? (
                      <div className={formStyles.summaryRow}>
                        <span>כולל דמי רישום</span>
                        <span>{formatShekels(preview.registration_fee || 0)}</span>
                      </div>
                    ) : null}
                    <p className={formStyles.billingNote}>
                      {firstCharge > 0
                        ? 'החיוב הראשון ירד עכשיו (יחסי לחודש הנוכחי), והכרטיס יישמר להוראת הקבע החודשית.'
                        : 'הכרטיס יאומת ויישמר להוראת הקבע; החיוב החודשי ירד אוטומטית.'}
                      {preview.next_billing_date ? ` החיוב הבא: ${new Date(`${preview.next_billing_date}T00:00:00`).toLocaleDateString('he-IL')}.` : ''}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <div className={formStyles.summaryRow}>
                  <span>עבור</span>
                  <span>{preview.description}</span>
                </div>
                <div className={formStyles.totalRow}>
                  <span>לתשלום</span>
                  <span className={formStyles.totalAmount}>{formatShekels(preview.amount || 0)}</span>
                </div>
                <p className={formStyles.billingNote}>חיוב חד-פעמי. הכרטיס לא יישמר.</p>
              </>
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
                <input id="exp-month" className={formStyles.input} inputMode="numeric" placeholder="12" value={expiryMonth} onChange={(e) => setExpiryMonth(e.target.value)} />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="exp-year">שנת תפוגה</label>
                <input id="exp-year" className={formStyles.input} inputMode="numeric" placeholder="2028" value={expiryYear} onChange={(e) => setExpiryYear(e.target.value)} />
              </div>
              <div>
                <label className={formStyles.label} htmlFor="cvv">CVV</label>
                <input id="cvv" className={formStyles.input} inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={cvv} onChange={(e) => setCvv(e.target.value)} />
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
            disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolderId || Boolean(preview.quote_error)}
            onClick={() => void handleSubmit()}
          >
            {charging
              ? 'מעבד...'
              : isSto
                ? firstCharge > 0
                  ? `שמור כרטיס וחייב ${formatShekels(preview.first_charge || 0)}`
                  : 'שמור כרטיס להוראת קבע'
                : `לתשלום ${formatShekels(preview.amount || 0)}`}
          </button>
        </div>
      )}
    </div>
  );
}
