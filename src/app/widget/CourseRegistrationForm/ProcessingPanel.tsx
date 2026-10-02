'use client';

import { useEffect, useState } from 'react';
import styles from './ProcessingPanel.module.css';
import { processingCopy, type ProcessingPhase } from './processingCopy';

interface Props {
  phase: ProcessingPhase;
  /** Shown under the title on the charge phases, e.g. "₪235.00". */
  amountLabel?: string;
  /**
   * Registrations the server has confirmed so far, when there are several —
   * two children, or one child in two classes. Real progress, counted from
   * answers that came back, not from a clock.
   */
  progress?: { done: number; total: number };
}

const TICK_MS = 500;

const icon = (children: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const PERSON = icon(<><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.6 4.4-5.400 8-5.400s6.500 1.800 8 5.400" /></>);
const PERCENT = icon(<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.500" /><circle cx="17" cy="17" r="2.500" /></>);
const CARD = icon(<><rect x="2.500" y="5.500" width="19" height="13" rx="2.500" /><path d="M2.500 10h19M6.500 14.500h4" /></>);
const SHIELD = icon(<>
  <path d="M12 2.500 4.500 5.300v5.900c0 4.800 3.200 8.800 7.500 10.300 4.300-1.500 7.500-5.500 7.500-10.300V5.300z" />
  <rect x="9" y="11" width="6" height="4.500" rx="1" />
  <path d="M10.200 11V9.600a1.800 1.800 0 0 1 3.600 0V11" />
</>);
const TICK = icon(<path d="M5 12.500 10 17.500 19 7" strokeWidth="2.800" />);

/** The three stations of each wait: saving a registration, or sending a card. */
const STATIONS: Record<ProcessingPhase, React.ReactNode[]> = {
  register: [PERSON, PERCENT, CARD],
  charge: [CARD, SHIELD, TICK],
  verify: [CARD, SHIELD, TICK],
  trial_charge: [CARD, SHIELD, TICK],
};

/**
 * Replaces the form while a request is in flight. The server is silent until
 * it finishes, so the panel keeps time on its own: a dot travels a line of
 * three stations as the step list advances on elapsed time, and after ten
 * seconds a line says this is taking longer than usual and asks the parent to
 * stay. There is nothing to click — once a card is on its way, the only safe
 * action is to wait.
 */
export default function ProcessingPanel({ phase, amountLabel, progress }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    // A new phase starts its own clock (charge → verify), otherwise the verify
    // steps would open already flagged as slow.
    setElapsedMs(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  const copy = processingCopy(phase, elapsedMs);
  // A paid trial has one unchanging state: the dot waits at the middle station.
  const at = copy.steps.length > 0 ? copy.activeStep : 1;

  return (
    <div className={styles.panel} dir="rtl" role="status" aria-live="polite" aria-busy="true">
      <div className={styles.trip} aria-hidden="true">
        <span className={styles.tripLine}>
          <span className={styles.tripFill} style={{ width: `${at * 50}%` }} />
        </span>
        <span className={styles.tripDot} style={{ right: `calc(24px + (100% - 48px) * ${at / 2})` }} />
        {STATIONS[phase].map((station, index) => (
          <span
            key={index}
            className={`${styles.tripNode}${
              index < at ? ` ${styles.tripNodePassed}` : index === at ? ` ${styles.tripNodeOn}` : ''
            }`}
          >
            {station}
          </span>
        ))}
      </div>

      <p className={styles.title}>{copy.title}</p>
      {amountLabel && phase !== 'register' && (
        <p className={styles.amount}>{amountLabel}</p>
      )}
      <p className={styles.subtitle}>{copy.subtitle}</p>
      {progress && progress.total > 1 && (
        <p className={styles.progress}>
          נרשמו {progress.done} מתוך {progress.total}
        </p>
      )}

      {copy.steps.length > 0 && (
      <ol className={styles.steps}>
        {copy.steps.map((label, index) => {
          const state = index < copy.activeStep ? 'done' : index === copy.activeStep ? 'active' : 'todo';
          return (
            <li key={label} className={`${styles.step} ${styles[state]}`}>
              <span className={styles.stepMark} aria-hidden="true">
                {state === 'done' ? '✓' : ''}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          );
        })}
      </ol>
      )}

      {phase !== 'register' && (
        <p className={styles.safe}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.400" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="10.500" width="14" height="10" rx="2.200" />
            <path d="M8 10.500V7.800a4 4 0 0 1 8 0v2.700" />
          </svg>
          תשלום מאובטח
        </p>
      )}

      {copy.slowNote && <p className={styles.slowNote}>{copy.slowNote}</p>}
    </div>
  );
}
