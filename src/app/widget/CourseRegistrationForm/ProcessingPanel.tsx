'use client';

import { useEffect, useState } from 'react';
import styles from './ProcessingPanel.module.css';
import { processingCopy, type ProcessingPhase } from './processingCopy';

interface Props {
  phase: ProcessingPhase;
  /** Shown under the title on the charge phases, e.g. "₪235.00". */
  amountLabel?: string;
}

const TICK_MS = 500;

/**
 * Replaces the form while a request is in flight. The server is silent until
 * it finishes, so the panel keeps time on its own: the step list advances on
 * elapsed time, a bar keeps moving, and after ten seconds a line says this is
 * taking longer than usual and asks the parent to stay. There is nothing to
 * click — once a card is on its way, the only safe action is to wait.
 */
export default function ProcessingPanel({ phase, amountLabel }: Props) {
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
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div className={styles.panel} dir="rtl" role="status" aria-live="polite" aria-busy="true">
      <div className={styles.ring} aria-hidden="true">
        <span className={styles.ringSpinner} />
        <span className={styles.ringCore}>{seconds > 0 ? seconds : ''}</span>
      </div>

      <p className={styles.title}>{copy.title}</p>
      {amountLabel && phase !== 'register' && (
        <p className={styles.amount}>{amountLabel}</p>
      )}
      <p className={styles.subtitle}>{copy.subtitle}</p>

      <div className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} />
      </div>

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

      {copy.slowNote && <p className={styles.slowNote}>{copy.slowNote}</p>}
    </div>
  );
}
