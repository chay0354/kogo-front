'use client';

/**
 * The broadcast's progress screen, shared by both phases.
 *
 * Checking (a dry run over every chunk, nothing sent) and sending both run a
 * chunk at a time, so `done` and `total` are real counts of children handled —
 * never a timer. The ring glides between two true values; it does not invent
 * the ones in between.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Search, Send } from 'lucide-react';
import styles from './BroadcastProgress.module.css';

type Phase = 'check' | 'send';

export interface BroadcastCount {
  label: string;
  value: number;
  tone: 'sent' | 'will' | 'skip' | 'fail';
}

interface Props {
  phase: Phase;
  /** Children handled so far. */
  done: number;
  /** Children in the whole run. */
  total: number;
  counts?: BroadcastCount[];
  /** Set when the phase has finished, so the screen can say so. */
  finished?: boolean;
}

const RADIUS = 72;
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONE_CLASS: Record<BroadcastCount['tone'], string> = {
  sent: styles.chipSent,
  will: styles.chipWill,
  skip: styles.chipSkip,
  fail: styles.chipFail,
};

function Chip({ count }: { count: BroadcastCount }) {
  // A count that just changed nudges once, so the eye notices it moved.
  const [bump, setBump] = useState(false);
  const previous = useRef(count.value);
  useEffect(() => {
    if (count.value === previous.current) return;
    previous.current = count.value;
    setBump(true);
    const t = setTimeout(() => setBump(false), 180);
    return () => clearTimeout(t);
  }, [count.value]);

  return (
    <span className={`${styles.chip} ${TONE_CLASS[count.tone]} ${bump ? styles.chipBump : ''}`}>
      {count.label} {count.value}
    </span>
  );
}

/**
 * The numbers the ring draws, kept apart from the drawing so they can be tested.
 *
 * Floored rather than rounded: 99.6% of the way is not done, and a ring that
 * says 100% while the last chunk is still out would be telling the office it
 * can close the window.
 */
export function progressFigures(done: number, total: number, finished: boolean) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(Math.max(done / safeTotal, 0), 1);
  const percent = finished ? 100 : Math.min(Math.floor(ratio * 100), 99);
  const offset = CIRCUMFERENCE * (1 - (finished ? 1 : ratio));
  return { percent, offset, ratio };
}

export default function BroadcastProgress({ phase, done, total, counts = [], finished = false }: Props) {
  const { percent, offset } = progressFigures(done, total, finished);

  const isCheck = phase === 'check';
  const Icon = finished ? Check : isCheck ? Search : Send;

  const title = finished
    ? (isCheck ? 'הבדיקה הסתיימה' : 'השליחה הסתיימה')
    : (isCheck ? 'בודק את הנמענים' : 'שולח הודעות');

  const sub = isCheck
    ? `נבדקו ${Math.min(done, total)} מתוך ${total}`
    : `טופלו ${Math.min(done, total)} מתוך ${total}`;

  return (
    <div
      className={`${styles.wrap} ${finished ? styles.done : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}% — ${sub}`}
    >
      <div className={styles.ringBox}>
        {!finished && (
          <div className={`${styles.glow} ${isCheck ? styles.glowCheck : styles.glowSend}`} aria-hidden />
        )}
        <svg className={styles.ring} viewBox="0 0 168 168" aria-hidden>
          <circle className={styles.track} cx="84" cy="84" r={RADIUS} />
          <circle
            className={`${styles.bar} ${isCheck && !finished ? styles.barCheck : styles.barSend}`}
            cx="84"
            cy="84"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className={styles.center}>
          <Icon className={styles.icon} size={20} aria-hidden />
          <span className={styles.percent}>
            {percent}
            <span className={styles.percentSign}>%</span>
          </span>
        </div>
      </div>

      <div>
        <div className={`${styles.title} ${finished ? '' : styles.dots}`}>{title}</div>
        <div className={styles.sub} aria-live="polite">{sub}</div>
        {/* Said on its own line: it is the reassurance, not a statistic. */}
        {isCheck && !finished && (
          <div className={styles.reassure}>שום הודעה לא נשלחת בשלב הזה</div>
        )}
      </div>

      {counts.length > 0 && (
        <div className={styles.counts} aria-live="polite">
          {counts.map((c) => (
            <Chip key={c.label} count={c} />
          ))}
        </div>
      )}
    </div>
  );
}
