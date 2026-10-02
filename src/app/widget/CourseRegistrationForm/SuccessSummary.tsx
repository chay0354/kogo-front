'use client';

import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion } from '../widgetMotion';
import styles from './newLook.module.css';
import { formatShekelShort, paymentSummaryModel } from './paymentSummaryModel';
import type { PaymentResponse } from './types';

interface Props {
  payment: PaymentResponse;
  /** Who was registered and to what — the sentence the old screen showed. */
  text: string;
  children?: React.ReactNode;
}

/**
 * The last screen of a paid registration. Each figure stands on its own: what
 * was charged now, what the standing order charges each month, and what the
 * family was given. All of them are the figures the charge was made with.
 */
export default function SuccessSummary({ payment, text, children }: Props) {
  const model = useMemo(() => paymentSummaryModel(payment), [payment]);
  const still = prefersReducedMotion();
  const [paid, setPaid] = useState(still ? model.payNow : 0);

  useEffect(() => {
    if (still) return undefined;
    let timer = 0;
    const started = Date.now() + 350;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (Date.now() - started) / 800));
      if (k < 1) {
        setPaid(Math.round(model.payNow * (1 - (1 - k) ** 3)));
        timer = window.setTimeout(tick, 16);
      } else {
        setPaid(model.payNow);
      }
    };
    timer = window.setTimeout(tick, 16);
    return () => window.clearTimeout(timer);
  }, [model.payNow, still]);

  return (
    <div className={styles.done} dir="rtl">
      <div className={styles.doneTick} aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </div>
      <p className={styles.doneTitle}>ההרשמה הושלמה</p>
      <p className={styles.doneText}>{text}</p>

      <div className={styles.paid}>
        <span className={styles.paidLabel}>שולם עכשיו</span>
        <span className={styles.paidValue} dir="ltr">{formatShekelShort(paid)}</span>
      </div>

      {model.monthly > 0 && (
        <div className={styles.next}>
          <span className={styles.nextIcon} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
          </span>
          <span>
            <span className={styles.nextLabel}>
              {model.monthlyFrom ? `${model.monthlyFrom}, בהוראת קבע` : 'בהוראת קבע'}
            </span>
            <span className={styles.nextValue}><span dir="ltr">{formatShekelShort(model.monthly)}</span> לחודש</span>
          </span>
        </div>
      )}

      {(model.discountLines.length > 0 || model.trialCredit > 0) && (
        <>
          <p className={styles.gotTitle}>מה קיבלתם</p>
          <div className={styles.gots}>
            {model.discountLines.map((line) => (
              <div key={line.label} className={styles.got}>
                <span className={styles.gotIcon} aria-hidden="true">%</span>
                <span className={styles.gotName}>{line.label}</span>
                <span className={styles.gotLine}>
                  <strong dir="ltr">{formatShekelShort(line.amount)}</strong> פחות בכל חודש
                </span>
              </div>
            ))}
            {model.trialCredit > 0 && (
              <div className={`${styles.got} ${styles.gotCredit}`}>
                <span className={styles.gotIcon} aria-hidden="true">₪</span>
                <span className={styles.gotName}>קיזוז שיעור הניסיון</span>
                <span className={styles.gotLine}>
                  <strong dir="ltr">{formatShekelShort(model.trialCredit)}</strong> קוזזו מהתשלום הזה
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.doneActions}>{children}</div>
    </div>
  );
}
