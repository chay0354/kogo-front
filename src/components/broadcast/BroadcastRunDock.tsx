'use client';

/**
 * The broadcast, minimised: a button in the bottom-left corner, where the
 * selection bar sits, that keeps counting while the office works elsewhere and
 * opens the full screen on a click.
 */
import { AlertTriangle, Check, MessageCircle, Search, Send, X } from 'lucide-react';
import { progressFigures } from './BroadcastProgress';
import { dockSummary, type DockTone, type RunSnapshot } from '@/lib/broadcastRun';
import styles from './BroadcastRunDock.module.css';

const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONE_CLASS: Record<DockTone, string> = {
  check: styles.toneCheck,
  send: styles.toneSend,
  ready: styles.toneReady,
  warn: styles.toneWarn,
  done: styles.toneDone,
  error: styles.toneError,
};

const TONE_ICON: Record<DockTone, typeof Search> = {
  check: Search,
  send: Send,
  ready: MessageCircle,
  warn: AlertTriangle,
  done: Check,
  error: X,
};

interface Props {
  snapshot: RunSnapshot;
  onOpen: () => void;
  /** Offered once the run has ended, so the button can be cleared without opening it. */
  onDismiss?: () => void;
}

export default function BroadcastRunDock({ snapshot, onOpen, onDismiss }: Props) {
  const summary = dockSummary(snapshot);
  const { percent, ratio } = progressFigures(summary.done, snapshot.total, summary.finished);
  const busy = summary.tone === 'check' || summary.tone === 'send';
  // Paused and failed runs keep the ring where it stopped; the rest fill it.
  const fill = summary.finished || summary.tone === 'ready' ? 1 : ratio;
  const Icon = TONE_ICON[summary.tone];

  return (
    <div className={styles.dock} dir="rtl">
      <div className={`${styles.pill} ${TONE_CLASS[summary.tone]} ${busy ? '' : styles.attention}`}>
        <button
          type="button"
          className={styles.open}
          onClick={onOpen}
          aria-label={`תפוצת WhatsApp · ${summary.label}${summary.showPercent ? ` ${percent}%` : ''} · ${summary.detail}`}
        >
          <span className={styles.ringBox} aria-hidden>
            {busy && <span className={styles.halo} />}
            <svg className={styles.ring} viewBox="0 0 40 40">
              <circle className={styles.track} cx="20" cy="20" r={RADIUS} />
              <circle
                className={styles.bar}
                cx="20"
                cy="20"
                r={RADIUS}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
              />
            </svg>
            <span className={styles.center}>
              {summary.showPercent ? (
                <span className={styles.percent}>{percent}</span>
              ) : (
                <Icon className={styles.icon} size={15} strokeWidth={2.5} />
              )}
            </span>
          </span>
          <span className={styles.text}>
            <span className={styles.label}>
              {summary.label}
              {summary.showPercent && <span className={styles.percentInline}> · {percent}%</span>}
            </span>
            <span className={styles.detail} aria-live="polite">{summary.detail}</span>
          </span>
        </button>
        {onDismiss && (
          <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="סגירת התפוצה">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
