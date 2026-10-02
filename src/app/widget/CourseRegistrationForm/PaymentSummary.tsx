'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../widgetMotion';
import styles from './newLook.module.css';
import { formatShekelShort, paymentSummaryModel } from './paymentSummaryModel';
import Reveal from './Reveal';
import type { PaymentResponse } from './types';

interface Props {
  /** The server's figures. Null while the price is on its way. */
  payment: PaymentResponse | null;
  title: string;
  /** What the first line prices: "ריקוד ג׳–ד׳ · מאיה", the classes, or a trial lesson. */
  priceLabel: string;
  isTrial: boolean;
  /** Play the discounts in, one by one. False on a second look at the same figures. */
  animate: boolean;
  /** Shown while the price is on its way — never a word about discounts. */
  checkingLabel?: string;
  /** Every figure is at its final value. */
  onSettled?: () => void;
}

/** The owner's words for what the yearly fee covers. */
const FEE_EXPLANATION =
  'דמי הרישום הם תשלום שנתי חד־פעמי, הכולל את שריון המקום בקבוצה, הרישום השנתי והכיסוי הביטוחי במסגרת הפעילות.';

const ALL = Number.MAX_SAFE_INTEGER;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Step = { kind: 'discount'; index: number } | { kind: 'part' } | { kind: 'credit' };

/**
 * The registration's summary: the price, then every thing that lowers it,
 * arriving one by one with a coin that flies to the sum and the sum counting
 * down. Each figure on the way is a sum of the server's own figures, and the
 * last one is the server's: the list price, less each monthly discount, less
 * the lessons of this month already gone (a mid-month signup), less a paid
 * trial. Nothing is said when there is no discount — the price simply stands.
 */
export default function PaymentSummary({
  payment, title, priceLabel, isTrial, animate, checkingLabel = 'בודקים את נתוני הילד/ה…', onSettled,
}: Props) {
  const model = useMemo(() => (payment ? paymentSummaryModel(payment) : null), [payment]);
  const steps = useMemo<Step[]>(() => {
    if (!model) return [];
    return [
      ...model.discountLines.map((_, index): Step => ({ kind: 'discount', index })),
      ...(model.prorateExplained ? [{ kind: 'part' } as Step] : []),
      ...(model.trialCredit > 0 ? [{ kind: 'credit' } as Step] : []),
    ];
  }, [model]);
  const counts = Boolean(model?.countsFromListPrice);
  // Where the sum starts: the list price when the figures add up to it,
  // otherwise this charge as it stands before a paid trial comes off.
  const startAt = model ? (counts ? model.listPayNow : model.payNowBeforeCredit) : 0;

  const still = !animate || isTrial || prefersReducedMotion();
  const [phase, setPhase] = useState<'checking' | 'playing' | 'settled'>(payment && still ? 'settled' : 'checking');
  const [shown, setShown] = useState(payment && still ? ALL : 0);
  const [payNow, setPayNow] = useState(payment && still ? Number(payment.final_amount) : 0);
  const [bump, setBump] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);

  const amountRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const payNowRef = useRef<HTMLSpanElement | null>(null);
  const feeRef = useRef<HTMLDivElement | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const openedAt = useRef(Date.now());

  useEffect(() => {
    if (!model) return undefined;
    let cancelled = false;
    // The look-up line stays a moment, however fast the answer came.
    const lookUp = () => sleep(Math.max(0, 1000 - (Date.now() - openedAt.current)));

    if (still || steps.length === 0) {
      // Nothing to play: with no discount the price simply stands.
      const settle = async () => {
        if (!still) await lookUp();
        if (cancelled) return;
        setShown(ALL);
        setPayNow(model.payNow);
        setPhase('settled');
        onSettledRef.current?.();
      };
      void settle();
      return () => {
        cancelled = true;
      };
    }

    const countDown = async (from: number, to: number) => {
      const started = Date.now();
      for (;;) {
        const k = Math.min(1, (Date.now() - started) / 520);
        if (k >= 1 || cancelled) {
          setPayNow(to);
          return;
        }
        setPayNow(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
        await sleep(16);
      }
    };

    /** A gold coin leaves what lowers the price and lands on the sum. */
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
      setPayNow(startAt);
      await lookUp();
      if (cancelled) return;
      setPhase('playing');
      let now = startAt;
      for (let index = 0; index < steps.length && !cancelled; index += 1) {
        const step = steps[index];
        setShown(index + 1);
        // The page moves a little ahead of what is arriving.
        payNowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        await sleep(520);
        if (cancelled) return;
        await flyCoin(amountRefs.current[index], payNowRef.current);
        if (cancelled) return;
        const off = step.kind === 'credit'
          ? model.trialCredit
          : !counts
            ? 0
            : step.kind === 'part'
              ? model.monthly - model.prorated
              : model.discountLines[step.index].amount;
        setBump(true);
        if (off > 0) await countDown(now, now - off);
        else await sleep(260);
        now -= off;
        setBump(false);
        await sleep(260);
      }
      if (cancelled) return;
      // The server's own figure, whatever the counting showed on the way.
      setPayNow(model.payNow);
      setPhase('settled');
      onSettledRef.current?.();
    };
    void run();
    return () => {
      cancelled = true;
    };
    // One run per set of figures: the parent keys this component on them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // The fee explanation closes on a press anywhere else.
  useEffect(() => {
    if (!feeOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (!feeRef.current?.contains(event.target as Node)) setFeeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [feeOpen]);

  const settled = phase === 'settled';
  const saved = model ? model.discountLines.reduce((sum, line) => sum + line.amount, 0) : 0;
  const lessonsKnown = Boolean(model && model.prorateLessonsRemaining > 0 && model.totalLessonsThisMonth > 0);
  const partAt = steps.findIndex((step) => step.kind === 'part');
  const creditAt = steps.findIndex((step) => step.kind === 'credit');

  return (
    <>
      <div className={styles.sumBox}>
        <p className={styles.sumTitle}>{title}</p>

        {model ? (
          <>
            <div className={styles.sumRow}>
              <span>{priceLabel}</span>
              <span className={styles.sumRowValue}>
                <span dir="ltr">{formatShekelShort(model.base)}</span>
                {!isTrial && model.monthly > 0 ? ' לחודש' : ''}
              </span>
            </div>

            {model.registrationFee > 0 || model.feePaidBefore ? (
              <div className={styles.sumRow} style={{ marginTop: 6 }} ref={feeRef}>
                <button
                  type="button"
                  className={styles.infoLink}
                  aria-expanded={feeOpen}
                  onClick={() => setFeeOpen((open) => !open)}
                >
                  הצטרפות וביטוח שנתי
                </button>
                {model.feePaidBefore ? (
                  <span className={`${styles.sumRowValue} ${styles.sumRowFree}`}>כבר שולמו</span>
                ) : (
                  <span className={styles.sumRowValue} dir="ltr">{formatShekelShort(model.registrationFee)}</span>
                )}
                {feeOpen && <div className={styles.infoPop} role="note">{FEE_EXPLANATION}</div>}
              </div>
            ) : null}
          </>
        ) : null}

        {phase === 'checking' && !isTrial ? (
          <div className={styles.sumCheck}><span className={styles.dotSpin} />{checkingLabel}</div>
        ) : null}

        {model ? (
          <>
            {model.discountLines.map((line, index) => (index < shown ? (
              <div key={line.label} className={styles.disc}>
                <span className={styles.discIcon} aria-hidden="true">%</span>
                <span className={styles.discText}>
                  <span className={styles.discName}>{line.label}</span>
                </span>
                <span className={styles.discAmount}>
                  <span dir="ltr" ref={(el) => { amountRefs.current[index] = el; }}>−{formatShekelShort(line.amount)}</span>
                  <span className={styles.discWhen}>בכל חודש</span>
                </span>
              </div>
            ) : null))}

            {partAt >= 0 && partAt < shown ? (
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
                  {lessonsKnown && model.totalLessonsThisMonth <= 10 ? (
                    <span className={styles.partDots} aria-hidden="true">
                      {Array.from({ length: model.totalLessonsThisMonth }, (_, index) => (
                        <i
                          key={index}
                          className={index >= model.totalLessonsThisMonth - model.prorateLessonsRemaining ? styles.partDotOn : ''}
                        />
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className={styles.discAmount}>
                  <span dir="ltr" ref={(el) => { amountRefs.current[partAt] = el; }}>
                    −{formatShekelShort(Math.round((model.monthly - model.prorated) * 100) / 100)}
                  </span>
                  <span className={styles.discWhen}>בחודש הזה בלבד</span>
                </span>
              </div>
            ) : null}

            {creditAt >= 0 && creditAt < shown ? (
              <div className={`${styles.disc} ${styles.discCredit}`}>
                <span className={styles.discIcon} aria-hidden="true">₪</span>
                <span className={styles.discText}>
                  <span className={styles.discName}>קיזוז שיעור הניסיון</span>
                  <span className={styles.discWhy}>
                    כבר שילמתם <span dir="ltr">{formatShekelShort(model.trialPaid)}</span> על שיעור הניסיון
                  </span>
                </span>
                <span className={styles.discAmount}>
                  <span dir="ltr" ref={(el) => { amountRefs.current[creditAt] = el; }}>
                    −{formatShekelShort(model.trialCredit)}
                  </span>
                  <span className={styles.discWhen}>בתשלום הזה בלבד</span>
                </span>
              </div>
            ) : null}

            <div className={styles.sumTotal}>
              <span>תשלום כעת</span>
              <span>
                {settled && startAt > model.payNow + 0.005 ? (
                  <span className={styles.sumTotalStruck} dir="ltr">{formatShekelShort(startAt)}</span>
                ) : null}
                <span
                  ref={payNowRef}
                  className={`${styles.sumTotalValue}${bump ? ` ${styles.sumBump}` : ''}`}
                  dir="ltr"
                >
                  {formatShekelShort(phase === 'checking' ? startAt : payNow)}
                </span>
              </span>
            </div>
            {settled && !isTrial && model.monthly > 0 ? (
              <p className={styles.sumNext}>
                {model.monthlyFrom ? `תשלום חודשי, ${model.monthlyFrom}: ` : 'תשלום חודשי: '}
                <span dir="ltr">{formatShekelShort(model.monthly)}</span>
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {/* What was saved opens under the box once the sum has come to rest. */}
      {saved > 0 ? (
        <Reveal open={settled} gap={16}>
          <div className={styles.saved}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#F5C518" aria-hidden="true">
              <path d="M12 2l2.4 6.2L21 9.3l-5 4.3L17.5 20 12 16.6 6.5 20 8 13.6 3 9.3l6.6-1.1z" />
            </svg>
            <span>
              חסכתם <span className={styles.savedAmount} dir="ltr">{formatShekelShort(saved)}</span> בכל חודש
            </span>
            {[[-46, -26], [44, -28], [-70, 6], [70, 4], [-30, 28], [34, 30]].map(([x, y]) => (
              <i key={`${x}:${y}`} className={styles.spark} style={{ '--x': `${x}px`, '--y': `${y}px` } as React.CSSProperties} />
            ))}
          </div>
        </Reveal>
      ) : null}
    </>
  );
}
