'use client';

/**
 * The brief, still running, in the corner.
 *
 * A ring that fills as checks answer, the name of the one being run, and how
 * long is left — so the office can walk away and still know the screen is
 * thinking. A click goes back to the brief.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { useBroadcastRun } from '@/components/broadcast/BroadcastRunProvider';
import { briefEtaText, briefPercent } from '@/lib/briefEta';
import styles from './BriefRunDock.module.css';

const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const BRIEF_PATH = '/settings/daily-brief';

interface Props {
  done: number;
  total: number;
  current: string;
  startedAt: number;
}

export default function BriefRunDock({ done, total, current, startedAt }: Props) {
  const router = useRouter();
  const pathname = usePathname() || '';
  // A broadcast can be minimised to the same corner; this sits above it.
  const { dockVisible: broadcastDocked } = useBroadcastRun();

  // Only to keep the remaining time honest between checks.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (pathname.startsWith(BRIEF_PATH)) return null;

  const percent = briefPercent({ done, total });
  const eta = briefEtaText({ done, total, elapsedMs: Date.now() - startedAt });

  return (
    <div className={`${styles.dock} ${broadcastDocked ? styles.raised : ''}`} dir="rtl">
      <button
        type="button"
        className={styles.pill}
        onClick={() => router.push(BRIEF_PATH)}
        aria-label={`הבריף היומי רץ · ${percent}% · ${eta}`}
      >
        <span className={styles.ringBox} aria-hidden>
          <span className={styles.halo} />
          <svg className={styles.ring} viewBox="0 0 40 40">
            <circle className={styles.track} cx="20" cy="20" r={RADIUS} />
            <circle
              className={styles.bar}
              cx="20"
              cy="20"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
            />
          </svg>
          <span className={styles.center}>
            <ClipboardCheck size={14} aria-hidden />
          </span>
        </span>
        <span className={styles.text}>
          <span className={styles.label}>
            בריף יומי · {total > 0 ? `${Math.min(done + 1, total)} מתוך ${total}` : 'מתחיל'}
          </span>
          <span className={styles.detail} aria-live="polite">
            {current ? `${current}${eta ? ` · ${eta}` : ''}` : eta || 'בודק…'}
          </span>
        </span>
      </button>
    </div>
  );
}
