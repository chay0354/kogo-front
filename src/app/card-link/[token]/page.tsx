'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import styles from '../card-link.module.css';
import { fetchCardLinkPreview, formatShekels, submitCardLink, type CardLinkPreview } from '@/lib/paymentLinksApi';

type Step = 'loading' | 'form' | 'processing' | 'success' | 'review' | 'error';

function formatDay(iso?: string | null): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('he-IL');
}

/**
 * The parent's page for a card link the office sent: what will be charged
 * (a standing order's first charge + monthly amount, or a one-time sum),
 * then the card form.
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

  const headerTitle =
    step === 'form' && preview
      ? isSto ? 'הסדרת הוראת קבע' : 'תשלום'
      : 'הזנת פרטי אשראי';

  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <div className={styles.brand}>קוגומלו</div>
        <h1 className={styles.title}>{headerTitle}</h1>
        {step === 'form' && preview?.child_name ? (
          <p className={styles.headerNote}>{preview.child_name}</p>
        ) : null}
      </header>

      <main className={styles.body}>
        {step === 'loading' && (
          <div className={styles.card}>
            <div className={styles.result}>
              <div className={styles.spinner} />
              <p className={styles.resultText}>טוען פרטי חיוב…</p>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className={styles.card}>
            <div className={styles.result}>
              <div className={`${styles.resultIcon} ${styles.iconFail}`}>!</div>
              <p className={styles.resultTitle}>לא ניתן לפתוח את הקישור</p>
              <p className={styles.resultText}>{pageError}</p>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className={styles.card}>
            <div className={styles.result}>
              <div className={styles.spinner} />
              <p className={styles.resultTitle}>החיוב בעיבוד</p>
              <p className={styles.resultText}>המתינו רגע ורעננו את העמוד. אל תשלחו שוב.</p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className={styles.card}>
            <div className={styles.result}>
              <div className={`${styles.resultIcon} ${styles.iconOk}`}>✓</div>
              <p className={styles.resultTitle}>החיוב עבר ונמצא בבדיקה</p>
              <p className={styles.resultText}>{result?.message || 'המשרד יסיים את ההסדרה ויחזור אליכם.'}</p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className={styles.card}>
            <div className={styles.result}>
              <div className={`${styles.resultIcon} ${styles.iconOk}`}>✓</div>
              <p className={styles.resultTitle}>{isSto ? 'הוראת הקבע הוסדרה' : 'התשלום התקבל'}</p>
              <p className={styles.resultText}>
                {isSto
                  ? result?.monthly_amount
                    ? `הכרטיס נשמר. ${Number(result.charged) > 0 ? `חויב עכשיו ${formatShekels(result.charged || 0)}. ` : ''}החיוב החודשי ${formatShekels(result.monthly_amount)} ירד אוטומטית${result.next_billing_date ? ` החל מ-${formatDay(result.next_billing_date)}` : ''}.`
                    : 'הכרטיס נשמר והחיוב החודשי ירד אוטומטית.'
                  : `תודה! ${result?.charged ? `חויב ${formatShekels(result.charged)}.` : ''} קבלה תישלח למייל.`}
              </p>
            </div>
          </div>
        )}

        {step === 'form' && preview && (
          <>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{isSto ? 'פרטי ההרשמה' : 'פרטי התשלום'}</h2>

              {isSto ? (
                <>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>חוג</span>
                    <span className={styles.rowValue}>{preview.course_name}</span>
                  </div>
                  {preview.sessions && preview.sessions.length > 1 ? (
                    // A twice/thrice-a-week track: every day it covers, one per line,
                    // so the parent sees exactly what the monthly charge buys.
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>{preview.frequency_label || 'מועדים'}</span>
                      <span className={styles.rowValue}>
                        {preview.sessions.map((session) => (
                          <span key={session.lesson_id} className={styles.session}>
                            {session.day_name} {session.start_time}{session.end_time ? `–${session.end_time}` : ''}
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : preview.day_name ? (
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>מועד</span>
                      <span className={styles.rowValue}>
                        {preview.day_name} {preview.start_time}{preview.end_time ? `–${preview.end_time}` : ''}
                      </span>
                    </div>
                  ) : null}
                  {preview.branch_name ? (
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>סניף</span>
                      <span className={styles.rowValue}>{preview.branch_name}</span>
                    </div>
                  ) : null}

                  {preview.quote_error ? (
                    <p className={styles.errorBox} style={{ marginTop: 12 }}>{preview.quote_error}</p>
                  ) : (
                    <>
                      <div className={styles.total}>
                        <span className={styles.totalLabel}>לחיוב עכשיו</span>
                        <span className={styles.totalAmount}>{formatShekels(preview.first_charge || 0)}</span>
                      </div>
                      <div className={styles.row}>
                        <span className={styles.rowLabel}>סכום חודשי</span>
                        <span className={styles.rowValue}>{formatShekels(preview.monthly_amount || 0)}</span>
                      </div>
                      {Number(preview.registration_fee) > 0 ? (
                        <div className={styles.row}>
                          <span className={styles.rowLabel}>כולל דמי רישום</span>
                          <span className={styles.rowValue}>{formatShekels(preview.registration_fee || 0)}</span>
                        </div>
                      ) : null}
                      {Number(preview.trial_credit) > 0 ? (
                        <div className={styles.row}>
                          <span className={styles.rowLabel}>קיזוז שיעור ניסיון ששולם</span>
                          <span className={styles.rowValue}>-{formatShekels(preview.trial_credit || 0)}</span>
                        </div>
                      ) : null}
                      {Number(preview.trial_credit) > 0 && preview.trial_credit_reason ? (
                        <p className={styles.note}>{preview.trial_credit_reason}</p>
                      ) : null}
                      <p className={styles.note}>
                        {firstCharge > 0
                          ? 'החיוב הראשון ירד עכשיו (יחסי לחודש הנוכחי), והכרטיס יישמר להוראת הקבע החודשית.'
                          : 'הכרטיס יאומת ויישמר להוראת הקבע; החיוב החודשי ירד אוטומטית.'}
                        {preview.next_billing_date ? ` החיוב הבא: ${formatDay(preview.next_billing_date)}.` : ''}
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>עבור</span>
                    <span className={styles.rowValue}>{preview.description}</span>
                  </div>
                  <div className={styles.total}>
                    <span className={styles.totalLabel}>לתשלום</span>
                    <span className={styles.totalAmount}>{formatShekels(preview.amount || 0)}</span>
                  </div>
                  <p className={styles.note}>חיוב חד-פעמי. הכרטיס לא יישמר.</p>
                </>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>פרטי כרטיס אשראי</h2>
              <div className={styles.fields}>
                <div>
                  <label className={styles.label} htmlFor="card-number">מספר כרטיס</label>
                  <input
                    id="card-number"
                    className={styles.input}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4580 4580 4580 4580"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                  />
                </div>

                <div className={styles.grid3}>
                  <div>
                    <label className={styles.label} htmlFor="exp-month">חודש</label>
                    <input
                      id="exp-month"
                      className={styles.input}
                      inputMode="numeric"
                      autoComplete="cc-exp-month"
                      placeholder="12"
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="exp-year">שנה</label>
                    <input
                      id="exp-year"
                      className={styles.input}
                      inputMode="numeric"
                      autoComplete="cc-exp-year"
                      placeholder="2028"
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="cvv">CVV</label>
                    <input
                      id="cvv"
                      className={styles.input}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className={styles.label} htmlFor="card-id">תעודת זהות בעל הכרטיס</label>
                  <input
                    id="card-id"
                    className={`${styles.input} ${idError ? styles.inputInvalid : ''}`}
                    inputMode="numeric"
                    placeholder="012345678"
                    value={cardHolderId}
                    onChange={(e) => {
                      setCardHolderId(sanitizeIsraeliIdInput(e.target.value));
                      setIdError('');
                    }}
                  />
                  {idError ? <p className={styles.fieldError}>{idError}</p> : null}
                </div>
              </div>
            </section>

            {formError ? <p className={styles.errorBox}>{formError}</p> : null}

            <button
              type="button"
              className={styles.submit}
              disabled={charging || !cardNumber || !expiryMonth || !expiryYear || !cvv || !cardHolderId || Boolean(preview.quote_error)}
              onClick={() => void handleSubmit()}
            >
              {charging
                ? 'מעבד…'
                : isSto
                  ? firstCharge > 0
                    ? `שמור כרטיס וחייב ${formatShekels(preview.first_charge || 0)}`
                    : 'שמור כרטיס להוראת קבע'
                  : `לתשלום ${formatShekels(preview.amount || 0)}`}
            </button>

            <p className={styles.secure}>התשלום מאובטח ומעובד בטרנזילה</p>
          </>
        )}
      </main>
    </div>
  );
}
