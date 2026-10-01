'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Check, Clock, Lock } from 'lucide-react';
import { formatShekels, type PublicPaymentLink, type PublicPaymentOption } from '@/lib/paymentLinksApi';
import { BUSINESS_LEGAL_NAME, businessPayDetails, businessSuccessLine, type PayStep } from '../businessPay';
import styles from '../pay.module.css';

interface BusinessPayViewProps {
  step: PayStep;
  link: PublicPaymentLink;
  optionId: string;
  chosen: PublicPaymentOption | null;
  /** The sum of the payment that was started, as the server confirmed it. */
  amount: string;
  iframeUrl: string;
  starting: boolean;
  formError: string;
  failureReason: string;
  documentNumber: string;
  onChooseOption: (id: string) => void;
  onStart: () => void;
  onBackToForm: () => void;
}

function Result({ tone, icon, title, children }: {
  tone: 'ok' | 'wait' | 'bad';
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.bizResult} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className={`${styles.bizResultIcon} ${styles[`bizResult_${tone}`]}`} aria-hidden="true">{icon}</span>
      <h1 className={styles.bizResultTitle}>{title}</h1>
      {children}
    </div>
  );
}

/**
 * The payment page as a business customer sees it: one white card with the
 * logo on top, the same frame through every step, so asking, paying and the
 * answer read as one page. Only the look and the words are its own — every
 * step, and what moves between them, is the pay page's: it is handed the state
 * and the same handlers a general link uses.
 */
export default function BusinessPayView({
  step,
  link,
  optionId,
  chosen,
  amount,
  iframeUrl,
  starting,
  formError,
  failureReason,
  documentNumber,
  onChooseOption,
  onStart,
  onBackToForm,
}: BusinessPayViewProps) {
  const details = businessPayDetails(link);

  return (
    <div className={styles.bizShell} dir="rtl">
      <main className={styles.bizCard}>
        <div className={styles.bizBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-cogomelo.webp" alt="קוגומלו" width={600} height={192} className={styles.bizLogo} />
        </div>

        {step === 'form' && (
          <div className={styles.bizBody}>
            <h1 className={styles.bizTitle}>בקשת תשלום</h1>
            {details.description ? <p className={styles.bizDescription}>{details.description}</p> : null}
            {details.customerLine || details.invoiceLine ? (
              <div className={styles.bizMeta}>
                {details.customerLine ? <p>{details.customerLine}</p> : null}
                {details.invoiceLine ? <p>{details.invoiceLine}</p> : null}
              </div>
            ) : null}

            {link.options.length > 1 ? (
              <div className={styles.optionList} role="radiogroup" aria-label="אפשרויות תשלום">
                {link.options.map((option) => (
                  <label
                    key={option.id}
                    className={`${styles.option}${optionId === option.id ? ` ${styles.optionSelected}` : ''}`}
                  >
                    <span className={styles.bizOptionLabel}>
                      <input
                        type="radio"
                        name="option"
                        value={option.id}
                        checked={optionId === option.id}
                        onChange={() => onChooseOption(option.id)}
                      />
                      {option.label}
                    </span>
                    <span className={styles.optionAmount}>{formatShekels(option.amount)}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <div className={styles.bizAmountBox}>
              <span className={styles.bizAmountLabel}>סכום לתשלום</span>
              <span className={styles.bizAmount}>{chosen ? formatShekels(chosen.amount) : '—'}</span>
            </div>

            {formError ? <p className={styles.bizError} role="alert">{formError}</p> : null}

            <button
              type="button"
              className={styles.bizPayButton}
              disabled={starting || !chosen}
              aria-busy={starting}
              onClick={onStart}
            >
              <Lock size={18} strokeWidth={2.5} aria-hidden="true" />
              {starting ? 'רק רגע…' : chosen ? `לתשלום מאובטח ${formatShekels(chosen.amount)}` : 'לתשלום מאובטח'}
            </button>
            <p className={styles.bizTrust}>
              <Lock size={13} aria-hidden="true" />
              תשלום מאובטח ומוצפן · כרטיס אשראי
            </p>
          </div>
        )}

        {step === 'paying' && (
          <div className={styles.bizBody}>
            <div className={styles.bizPayingHead}>
              <h1 className={styles.bizPayingTitle}>
                <Lock size={16} strokeWidth={2.5} aria-hidden="true" />
                תשלום מאובטח
              </h1>
              <span className={styles.bizPayingAmount}>{formatShekels(amount)}</span>
            </div>
            {details.description ? <p className={styles.bizPayingFor}>{details.description}</p> : null}
            <div className={`${styles.frameWrap} ${styles.bizFrameWrap}`}>
              <iframe className={styles.frame} src={iframeUrl} title="תשלום מאובטח" allow="payment" />
            </div>
            <p className={styles.bizTrust}>אל תסגרו את העמוד עד לקבלת אישור</p>
            <button type="button" className={styles.bizTextButton} onClick={onBackToForm}>
              ביטול וחזרה
            </button>
          </div>
        )}

        {step === 'verifying' && (
          <Result tone="wait" icon={<Clock size={30} />} title="התשלום בבדיקה">
            <p className={styles.bizResultText}>
              עדיין לא התקבל אישור על התשלום. אין צורך לשלם שוב: אם חויבתם, מי ששלח לכם את הקישור יאשר את
              התשלום ויעדכן אתכם.
            </p>
          </Result>
        )}

        {step === 'success' && (
          <Result tone="ok" icon={<Check size={32} strokeWidth={3} />} title="התשלום התקבל, תודה!">
            <p className={styles.bizResultText}>{businessSuccessLine(documentNumber)}</p>
          </Result>
        )}

        {step === 'review' && (
          <Result tone="wait" icon={<Clock size={30} />} title="התשלום התקבל ונמצא בבדיקה">
            <p className={styles.bizResultText}>
              אין צורך לשלם שוב. אם יידרש משהו נוסף, מי ששלח לכם את הקישור ייצור איתכם קשר.
            </p>
          </Result>
        )}

        {step === 'failed' && (
          <Result tone="bad" icon={<AlertCircle size={30} />} title="התשלום לא עבר">
            <p className={styles.bizResultText}>
              {failureReason || 'הכרטיס לא אושר. אפשר לנסות שוב, גם עם כרטיס אחר.'}
            </p>
            <button type="button" className={styles.bizPayButton} onClick={onBackToForm}>
              לנסות שוב
            </button>
            <p className={styles.bizResultNote}>אם זה חוזר, פנו למי ששלח לכם את הקישור.</p>
          </Result>
        )}
      </main>

      <footer className={styles.bizFooter}>{BUSINESS_LEGAL_NAME}</footer>
    </div>
  );
}
