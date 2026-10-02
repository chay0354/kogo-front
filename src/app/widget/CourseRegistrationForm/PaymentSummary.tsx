'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../widgetMotion';
import styles from './newLook.module.css';
import { formatShekelShort, formatStandingOrderStart, paymentSummaryModel } from './paymentSummaryModel';
import type { PaymentResponse } from './types';

interface Props {
  payment: PaymentResponse;
  title: string;
  /** What the first line prices: the class, the classes, or a trial lesson. */
  priceLabel: string;
  isTrial: boolean;
  /** Play the discounts in, one by one. False on a second look at the same basket. */
  animate: boolean;
  /** Every figure is at its final value. */
  onSettled?: () => void;
}

/** The owner's words for what the yearly fee covers. */
const FEE_EXPLANATION =
  'דמי הרישום הם תשלום שנתי חד־פעמי, הכולל את שריון המקום בקבוצה, הרישום השנתי והכיסוי הביטוחי במסגרת הפעילות.';

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The payment summary, with as few words as the figures allow. Each discount
 * arrives on its own and lowers the figure it really lowers, counting down to
 * the server's own number: a monthly discount lands on the monthly payment
 * (and on this charge too, when this charge holds a whole month), a paid trial
 * on this charge only. A mid-month signup gets its own tile, because the
 * family then pays for the lessons that are left and not for a full month.
 */
export default function PaymentSummary({ payment, title, priceLabel, isTrial, animate, onSettled }: Props) {
  const model = useMemo(() => paymentSummaryModel(payment), [payment]);
  const creditIndex = model.trialCredit > 0 ? model.discountLines.length : -1;
  const stepCount = model.discountLines.length + (model.trialCredit > 0 ? 1 : 0);
  const play = animate && !isTrial && stepCount > 0 && !prefersReducedMotion();
  const discountTotal = model.discountLines.reduce((sum, line) => sum + line.amount, 0);
  // Where this charge starts counting from: the list price when a whole month
  // is in it, otherwise the charge as it stands before the trial comes off.
  const payNowStart = model.chargesFullMonthNow
    ? model.payNowBeforeCredit + discountTotal
    : model.payNowBeforeCredit;

  const [shown, setShown] = useState(play ? 0 : stepCount);
  const [monthly, setMonthly] = useState(play ? model.base : model.monthly);
  const [payNow, setPayNow] = useState(play ? payNowStart : model.payNow);
  const [settled, setSettled] = useState(!play);
  const [bump, setBump] = useState<'monthly' | 'now' | 'both' | null>(null);
  const [feeOpen, setFeeOpen] = useState(false);

  const amountRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const monthlyRef = useRef<HTMLSpanElement | null>(null);
  const payNowRef = useRef<HTMLSpanElement | null>(null);
  const feeRef = useRef<HTMLDivElement | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!play) {
      onSettledRef.current?.();
      return undefined;
    }
    let cancelled = false;

    const countDown = async (from: number, to: number, set: (value: number) => void) => {
      const started = Date.now();
      const duration = 520;
      for (;;) {
        const k = Math.min(1, (Date.now() - started) / duration);
        if (k >= 1 || cancelled) {
          set(to);
          return;
        }
        set(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
        await sleep(16);
      }
    };

    /** A gold coin leaves the discount and lands on the figure it lowers. */
    const flyCoin = async (from: HTMLElement | null, to: HTMLElement | null) => {
      if (!from || !to || typeof from.animate !== 'function') return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const coin = document.createElement('span');
      coin.className = styles.coin;
      coin.style.left = `${a.left + a.width / 2}px`;
      coin.style.top = `${a.top + a.height / 2}px`;
      document.body.appendChild(coin);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      coin.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 26}px) scale(1.15)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.2 },
        ],
        { duration: 560, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' },
      );
      await sleep(560);
      coin.remove();
    };

    const run = async () => {
      await sleep(700);
      let monthlyNow = model.base;
      let chargeNow = payNowStart;
      for (let index = 0; index < stepCount && !cancelled; index += 1) {
        setShown(index + 1);
        await sleep(520);
        if (cancelled) return;
        if (index === creditIndex) {
          await flyCoin(amountRefs.current[index], payNowRef.current);
          if (cancelled) return;
          setBump('now');
          await countDown(chargeNow, chargeNow - model.trialCredit, setPayNow);
          chargeNow -= model.trialCredit;
        } else {
          const { amount } = model.discountLines[index];
          const onCharge = model.chargesFullMonthNow;
          await flyCoin(amountRefs.current[index], onCharge ? payNowRef.current : monthlyRef.current);
          if (cancelled) return;
          setBump(onCharge ? 'both' : 'monthly');
          await Promise.all([
            countDown(monthlyNow, monthlyNow - amount, setMonthly),
            onCharge ? countDown(chargeNow, chargeNow - amount, setPayNow) : null,
          ]);
          monthlyNow -= amount;
          if (onCharge) chargeNow -= amount;
        }
        setBump(null);
        await sleep(260);
      }
      if (cancelled) return;
      // The server's own figures, whatever the counting showed on the way.
      setMonthly(model.monthly);
      setPayNow(model.payNow);
      setSettled(true);
      onSettledRef.current?.();
    };
    void run();
    return () => {
      cancelled = true;
    };
    // One run per basket: the parent keys this component on the payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The fee explanation closes on a press anywhere else.
  useEffect(() => {
    if (!feeOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!feeRef.current?.contains(event.target as Node)) setFeeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [feeOpen]);

  const lessonsKnown = model.prorateLessonsRemaining > 0 && model.totalLessonsThisMonth > 0;
  const bumped = (which: 'monthly' | 'now') => (bump === which || bump === 'both' ? ` ${styles.sumBump}` : '');
  const struckPayNow = settled && payNowStart > model.payNow ? payNowStart : 0;

  return (
    <div className={styles.sumBox}>
      <p className={styles.sumTitle}>{title}</p>

      <div className={styles.sumRow}>
        <span>{priceLabel}</span>
        <span className={styles.sumRowValue}>
          <span dir="ltr">{formatShekelShort(model.base)}</span>
          {!isTrial && model.monthly > 0 ? ' לחודש' : ''}
        </span>
      </div>

      {model.registrationFee > 0 && (
        <div className={styles.sumRow} style={{ marginTop: 6 }} ref={feeRef}>
          <button
            type="button"
            className={styles.infoLink}
            aria-expanded={feeOpen}
            onClick={() => setFeeOpen((open) => !open)}
          >
            הצטרפות וביטוח שנתי
          </button>
          <span className={styles.sumRowValue} dir="ltr">{formatShekelShort(model.registrationFee)}</span>
          {feeOpen && <div className={styles.infoPop} role="note">{FEE_EXPLANATION}</div>}
        </div>
      )}

      {model.discountLines.slice(0, Math.min(shown, model.discountLines.length)).map((line, index) => (
        <div key={line.label} className={styles.disc}>
          <span className={styles.discIcon} aria-hidden="true">%</span>
          <span className={styles.discText}>
            <span className={styles.discName}>{line.label}</span>
          </span>
          <span className={styles.discAmount}>
            <span dir="ltr" ref={(el) => { amountRefs.current[index] = el; }}>-{formatShekelShort(line.amount)}</span>
            <span className={styles.discWhen}>בכל חודש</span>
          </span>
        </div>
      ))}

      {model.prorateExplained && (
        <div className={`${styles.disc} ${styles.discPart}`}>
          <span className={styles.discIcon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
          </span>
          <span className={styles.discText}>
            <span className={styles.discName}>הצטרפתם באמצע החודש</span>
            <span className={styles.discWhy}>
              {lessonsKnown
                ? `החודש משלמים על ${model.prorateLessonsRemaining} מתוך ${model.totalLessonsThisMonth} שיעורים`
                : 'החודש משלמים רק על השיעורים שנשארו'}
            </span>
            {lessonsKnown && model.totalLessonsThisMonth <= 10 && (
              <span className={styles.partDots} aria-hidden="true">
                {Array.from({ length: model.totalLessonsThisMonth }, (_, index) => (
                  <i
                    key={index}
                    className={index >= model.totalLessonsThisMonth - model.prorateLessonsRemaining ? styles.partDotOn : ''}
                  />
                ))}
              </span>
            )}
          </span>
          <span className={styles.discAmount}>
            <span dir="ltr">{formatShekelShort(model.prorated)}</span>
            <span className={styles.discWhen}>
              במקום <span dir="ltr">{formatShekelShort(model.monthly)}</span>
            </span>
          </span>
        </div>
      )}

      {creditIndex >= 0 && shown > creditIndex && (
        <div className={`${styles.disc} ${styles.discCredit}`}>
          <span className={styles.discIcon} aria-hidden="true">₪</span>
          <span className={styles.discText}>
            <span className={styles.discName}>קיזוז שיעור הניסיון</span>
            <span className={styles.discWhy}>
              כבר שילמתם <span dir="ltr">{formatShekelShort(model.trialPaid)}</span> על שיעור הניסיון
            </span>
          </span>
          <span className={styles.discAmount}>
            <span dir="ltr" ref={(el) => { amountRefs.current[creditIndex] = el; }}>-{formatShekelShort(model.trialCredit)}</span>
            <span className={styles.discWhen}>בתשלום הזה בלבד</span>
          </span>
        </div>
      )}

      <div className={styles.sumTotal}>
        <span>תשלום כעת</span>
        <span>
          {struckPayNow > 0 ? (
            <span className={styles.sumTotalStruck} dir="ltr">{formatShekelShort(struckPayNow)}</span>
          ) : null}
          <span ref={payNowRef} className={`${styles.sumTotalValue}${bumped('now')}`} dir="ltr">
            {formatShekelShort(payNow)}
          </span>
        </span>
      </div>
      {!isTrial && model.monthly > 0 && (
        <div className={`${styles.sumRow} ${styles.sumRowStrong}`}>
          <span>
            {model.standingOrderStart
              ? `תשלום חודשי, מ-${formatStandingOrderStart(model.standingOrderStart)}`
              : 'תשלום חודשי'}
          </span>
          <span ref={monthlyRef} className={`${styles.sumRowValue}${bumped('monthly')}`} dir="ltr">
            {formatShekelShort(monthly)}
          </span>
        </div>
      )}

      {settled && discountTotal > 0 && (
        <div className={styles.saved}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#F5C518" aria-hidden="true">
            <path d="M12 2l2.4 6.2L21 9.3l-5 4.3L17.5 20 12 16.6 6.500 20 8 13.600 3 9.300l6.600-1.100z" />
          </svg>
          <span>
            חסכתם <span className={styles.savedAmount} dir="ltr">{formatShekelShort(discountTotal)}</span> בכל חודש
          </span>
          {[[-46, -26], [44, -28], [-70, 6], [70, 4], [-30, 28], [34, 30]].map(([x, y]) => (
            <i key={`${x}:${y}`} className={styles.spark} style={{ '--x': `${x}px`, '--y': `${y}px` } as React.CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
