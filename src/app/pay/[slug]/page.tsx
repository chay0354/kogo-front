'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';
import pageStyles from '../pay.module.css';
import {
  fetchPublicPaymentLink,
  fetchPublicPaymentStatus,
  formatShekels,
  startPublicPayment,
  type PublicPaymentLink,
  type PublicPaymentStatus,
} from '@/lib/paymentLinksApi';

type Step = 'loading' | 'closed' | 'error' | 'form' | 'paying' | 'verifying' | 'success' | 'failed' | 'review';

const storageKey = (slug: string) => `kogo_pay_${slug}`;

function readPending(slug: string): { paymentId: string; amount: string; iframeUrl: string } | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as { paymentId: string; amount: string; iframeUrl: string }) : null;
  } catch {
    return null;
  }
}

function writePending(slug: string, value: { paymentId: string; amount: string; iframeUrl: string } | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(slug), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(slug));
  } catch {
    /* private mode */
  }
}

const POLL_EVERY_MS = 4000;
const POLL_FOR_MS = 5 * 60 * 1000;

/**
 * The payer's page for a payment link: pick an amount, enter name and
 * phone, pay on Tranzila's hosted page inside an iframe. The result page
 * loaded in the iframe posts a message up; we also poll the status so a
 * blocked postMessage still ends in the right screen.
 */
export default function PayPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  const [step, setStep] = useState<Step>('loading');
  const [link, setLink] = useState<PublicPaymentLink | null>(null);
  const [pageError, setPageError] = useState('');
  const [optionId, setOptionId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [starting, setStarting] = useState(false);
  const [iframeUrl, setIframeUrl] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const pollStart = useRef(0);

  useEffect(() => {
    if (!slug) {
      setPageError('קישור לא תקין');
      setStep('error');
      return;
    }
    let cancelled = false;
    fetchPublicPaymentLink(slug)
      .then((data) => {
        if (cancelled) return;
        setLink(data);
        if (data.options.length === 1) setOptionId(data.options[0].id);
        // A reload mid-payment (mobile tab discard) must not offer a second payment.
        const pending = readPending(slug);
        if (pending?.paymentId) {
          setPaymentId(pending.paymentId);
          setAmount(pending.amount);
          setIframeUrl(pending.iframeUrl);
          setStep('paying');
          return;
        }
        setStep('form');
      })
      .catch((err: { response?: { status?: number; data?: { error?: string; closed?: boolean } } }) => {
        if (cancelled) return;
        if (err.response?.data?.closed || err.response?.status === 410) {
          setStep('closed');
          return;
        }
        setPageError(err.response?.data?.error || 'הקישור לא נמצא');
        setStep('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Result page inside the iframe tells us how it went.
  useEffect(() => {
    if (step !== 'paying') return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; result?: string; paymentId?: string } | null;
      if (!data || data.type !== 'kogo-pay-result') return;
      if (paymentId && data.paymentId && data.paymentId !== paymentId) return;
      // The final word is the server's; the message only speeds the poll up —
      // except a decline the gateway never reports back, which would leave the
      // payer staring at the iframe.
      void checkStatus(data.result === 'fail');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentId]);

  const applyStatus = (status: PublicPaymentStatus, reason: string) => {
    if (status === 'completed') {
      writePending(slug, null);
      setStep('success');
    } else if (status === 'failed') {
      writePending(slug, null);
      setFailureReason(reason);
      setStep('failed');
    } else if (status === 'review') {
      writePending(slug, null);
      setStep('review');
    }
  };

  const checkStatus = async (declinedInFrame = false) => {
    if (!paymentId) return;
    try {
      const data = await fetchPublicPaymentStatus(paymentId);
      if (data.status === 'pending' && declinedInFrame) {
        writePending(slug, null);
        setFailureReason('');
        setStep('failed');
        return;
      }
      applyStatus(data.status, data.failure_reason);
    } catch {
      /* keep polling */
    }
  };

  useEffect(() => {
    if (step !== 'paying' || !paymentId) return;
    pollStart.current = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - pollStart.current > POLL_FOR_MS) {
        window.clearInterval(timer);
        // Nothing came back in five minutes: say so instead of "do not close".
        setStep('verifying');
        return;
      }
      void checkStatus();
    }, POLL_EVERY_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentId]);

  const chosen = link?.options.find((o) => o.id === optionId) || null;

  const handleStart = async () => {
    if (!link || starting) return;
    if (!chosen) {
      setFormError('יש לבחור אפשרות תשלום');
      return;
    }
    if (name.trim().length < 2) {
      setFormError('יש להזין שם');
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      setFormError('יש להזין טלפון תקין');
      return;
    }
    setStarting(true);
    setFormError('');
    try {
      const res = await startPublicPayment(link.slug, {
        option_id: chosen.id,
        payer_name: name.trim(),
        payer_phone: phone.replace(/\D/g, ''),
        payer_email: email.trim() || undefined,
      });
      setPaymentId(res.payment_id);
      setAmount(res.amount);
      setIframeUrl(res.iframe_url);
      writePending(slug, { paymentId: res.payment_id, amount: res.amount, iframeUrl: res.iframe_url });
      setStep('paying');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; closed?: boolean } } };
      if (axiosErr.response?.data?.closed) {
        setStep('closed');
        return;
      }
      setFormError(axiosErr.response?.data?.error || 'לא ניתן להתחיל את התשלום כרגע. נסו שוב.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={pageStyles.shell} dir="rtl">
      <div className={pageStyles.brand}>קוגומלו</div>

      {step === 'loading' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.submittingSpinner} />
          <p className={formStyles.resultSubtext}>טוען...</p>
        </div>
      )}

      {step === 'closed' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>הקישור אינו פעיל יותר</p>
          <p className={formStyles.resultSubtext}>לפרטים פנו לצוות קוגומלו.</p>
        </div>
      )}

      {step === 'error' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>לא ניתן לפתוח את הקישור</p>
          <p className={formStyles.resultSubtext}>{pageError}</p>
        </div>
      )}

      {step === 'form' && link && (
        <div className={formStyles.paymentContainer}>
          <div className={formStyles.paymentSummary}>
            <p className={formStyles.summaryTitle}>{link.title}</p>
            {link.description ? <p className={pageStyles.description}>{link.description}</p> : null}
            {link.options.length > 1 ? (
              <div className={pageStyles.optionList} role="radiogroup" aria-label="אפשרויות תשלום">
                {link.options.map((option) => (
                  <label
                    key={option.id}
                    className={`${pageStyles.option}${optionId === option.id ? ` ${pageStyles.optionSelected}` : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="radio"
                        name="option"
                        value={option.id}
                        checked={optionId === option.id}
                        onChange={() => {
                          setOptionId(option.id);
                          setFormError('');
                        }}
                      />
                      {option.label}
                    </span>
                    <span className={pageStyles.optionAmount}>{formatShekels(option.amount)}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <div className={formStyles.totalRow}>
              <span>{chosen ? chosen.label : 'לתשלום'}</span>
              <span className={formStyles.totalAmount}>{chosen ? formatShekels(chosen.amount) : '—'}</span>
            </div>
          </div>

          <div className={formStyles.cardFields}>
            <p className={formStyles.cardSectionTitle}>פרטי המשלם/ת</p>
            <div>
              <label className={formStyles.label} htmlFor="payer-name">שם מלא</label>
              <input
                id="payer-name"
                className={formStyles.input}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={formStyles.label} htmlFor="payer-phone">טלפון נייד</label>
              <input
                id="payer-phone"
                className={formStyles.input}
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-0000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className={formStyles.label} htmlFor="payer-email">דוא&quot;ל (לא חובה)</label>
              <input
                id="payer-email"
                className={formStyles.input}
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {formError ? <p className={formStyles.errorText}>{formError}</p> : null}

          <button
            type="button"
            className={formStyles.submitButton}
            disabled={starting || !chosen || !name || !phone}
            onClick={() => void handleStart()}
          >
            {starting ? 'מעבד...' : chosen ? `לתשלום ${formatShekels(chosen.amount)}` : 'לתשלום'}
          </button>
          <p className={pageStyles.waitNote}>פרטי הכרטיס מוזנים בעמוד מאובטח של חברת הסליקה.</p>
        </div>
      )}

      {step === 'paying' && (
        <div>
          <div className={formStyles.paymentSummary}>
            <div className={formStyles.totalRow}>
              <span>{link?.title}</span>
              <span className={formStyles.totalAmount}>{formatShekels(amount)}</span>
            </div>
          </div>
          <div className={pageStyles.frameWrap}>
            <iframe className={pageStyles.frame} src={iframeUrl} title="תשלום מאובטח" allow="payment" />
          </div>
          <p className={pageStyles.waitNote}>אל תסגרו את החלון עד לקבלת אישור.</p>
          <p className={pageStyles.waitNote}>
            <button
              type="button"
              className={formStyles.termsLink}
              onClick={() => {
                writePending(slug, null);
                setIframeUrl('');
                setPaymentId('');
                setStep('form');
              }}
            >
              ביטול וחזרה לבחירה
            </button>
          </p>
        </div>
      )}

      {step === 'verifying' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.submittingSpinner} />
          <p className={formStyles.resultTitle}>התשלום נשלח לאימות</p>
          <p className={formStyles.resultSubtext}>
            לא התקבל אישור עדיין. אם חויבתם, המשרד יאשר את התשלום ויעדכן אתכם. אל תשלמו שוב.
          </p>
        </div>
      )}

      {step === 'success' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>התשלום התקבל</p>
          <p className={formStyles.resultSubtext}>
            {link?.title} · {formatShekels(amount)}. תודה! קבלה תישלח על ידי המשרד.
          </p>
        </div>
      )}

      {step === 'review' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>התשלום התקבל ונמצא בבדיקה</p>
          <p className={formStyles.resultSubtext}>המשרד יאשר אותו ויחזור אליכם במידת הצורך.</p>
        </div>
      )}

      {step === 'failed' && (
        <div className={formStyles.resultContainer}>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>התשלום לא עבר</p>
          <p className={formStyles.resultSubtext}>{failureReason || 'הכרטיס נדחה. אפשר לנסות שוב עם כרטיס אחר.'}</p>
          <button
            type="button"
            className={formStyles.submitButton}
            onClick={() => {
              writePending(slug, null);
              setIframeUrl('');
              setPaymentId('');
              setStep('form');
            }}
          >
            נסו שוב
          </button>
        </div>
      )}
    </div>
  );
}
