'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { completeTour } from '@/lib/api';
import styles from './GuidedTour.module.css';

/**
 * The guided tour shown after signing in.
 *
 * Behaviour the owner asked for:
 *   sign-in 1      → shown, and cannot be skipped
 *   sign-ins 2, 3  → shown, with a large obvious skip
 *   sign-in 4 on   → does not open on its own
 *
 * Whether it opens is decided by `login_count` on the account, not by anything
 * in the browser: clearing site data, using a different device or a private
 * window must not restart the tour. Finishing or skipping calls the server so
 * it stops opening from then on.
 */

const MANDATORY_UNTIL = 1; // sign-in 1 has no skip
const AUTO_OPEN_UNTIL = 3; // sign-ins 1..3 open it automatically

interface Step {
  title: string;
  body: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    icon: '👋',
    title: 'ברוכים הבאים לקוגומלו',
    body: 'סיור קצר על המסכים המרכזיים. אפשר לחזור אליו בכל שלב מהתפריט.',
  },
  {
    icon: '📊',
    title: 'לוח בקרה',
    body: 'התמונה העסקית במקום אחד — הכנסות, רווח, תלמידים, סניפים וחוגים. בוחרים תקופה למעלה והכל מתעדכן יחד.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'לקוחות',
    body: 'כל המשפחות והילדים, הסטטוס שלהם, ההרשמות והתשלומים. משם מטפלים בבעיות אשראי ובזיכויים.',
  },
  {
    icon: '📅',
    title: 'לוח זמנים',
    body: 'השיעורים לפי יום וסניף, נוכחות, ביטולים והשלמות. המדריכים מסמנים נוכחות מהמסך הזה.',
  },
  {
    icon: '🧾',
    title: 'חשבוניות וגבייה',
    body: 'הפקת מסמכים, מעקב אחרי מה שנגבה ומה שעדיין פתוח.',
  },
  {
    icon: '✅',
    title: 'זהו, אפשר להתחיל',
    body: 'הסיור לא ייפתח שוב מעצמו. הוא זמין תמיד מהתפריט.',
  },
];

interface Props {
  /** Force the tour open regardless of the sign-in count (menu entry point). */
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function GuidedTour({ forceOpen = false, onClose }: Props) {
  const { user, refresh } = useAuth() as any;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const loginCount = Number(user?.login_count ?? 0);
  const tourCompleted = Boolean(user?.tour_completed);

  // Sign-in 1 only: no way out except finishing.
  // Skippable unless this is the very first sign-in and it opened by itself.
  const canSkip = forceOpen || tourCompleted || loginCount > MANDATORY_UNTIL;

  const shouldAutoOpen = useMemo(() => {
    if (!user) return false;
    if (tourCompleted) return false;
    return loginCount >= 1 && loginCount <= AUTO_OPEN_UNTIL;
  }, [user, tourCompleted, loginCount]);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    if (shouldAutoOpen) setOpen(true);
  }, [forceOpen, shouldAutoOpen]);

  // Reopened from the menu. A window event rather than shared state keeps the
  // sidebar from having to know anything about the tour.
  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('kogo:open-tour', reopen);
    return () => window.removeEventListener('kogo:open-tour', reopen);
  }, []);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      // Server-side so it holds across devices. A failure here must not trap
      // the user in the tour, so the dialog closes either way.
      await completeTour();
      await refresh?.();
    } catch {
      /* closing regardless — see above */
    } finally {
      setSaving(false);
      setOpen(false);
      onClose?.();
    }
  }, [refresh, onClose]);

  // Escape closes only when skipping is allowed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canSkip) finish();
      if (e.key === 'ArrowLeft') setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === 'ArrowRight') setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canSkip, finish]);

  // The tour covers the screen; stop the page behind it scrolling.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="tour-title" dir="rtl">
      <div className={styles.card}>
        {canSkip ? (
          <button type="button" className={styles.skip} onClick={finish} disabled={saving}>
            דלג על ההדרכה
          </button>
        ) : (
          <div className={styles.mandatory}>הדרכה ראשונה — כמה מסכים ומתחילים</div>
        )}

        <div className={styles.icon} aria-hidden>{current.icon}</div>
        <h2 id="tour-title" className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>

        <div className={styles.dots} aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === step ? styles.dotOn : ''}`} />
          ))}
        </div>

        <div className={styles.actions}>
          {step > 0 ? (
            <button type="button" className={styles.back} onClick={() => setStep((s) => s - 1)}>
              חזרה
            </button>
          ) : (
            <span />
          )}

          {isLast ? (
            <button type="button" className={styles.next} onClick={finish} disabled={saving}>
              {saving ? 'שומר…' : 'סיימתי'}
            </button>
          ) : (
            <button type="button" className={styles.next} onClick={() => setStep((s) => s + 1)}>
              הבא
            </button>
          )}
        </div>

        <div className={styles.counter}>
          {step + 1} מתוך {STEPS.length}
        </div>
      </div>
    </div>
  );
}
