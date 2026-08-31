'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { completeTour } from '@/lib/api';
import styles from './GuidedTour.module.css';

/**
 * Spotlight tour of the app.
 *
 * Each step points at a real element: everything dims except that element, and
 * "next" moves the light to the next one. A step whose target is not on screen
 * (the sidebar is collapsed on a phone, or a page lacks that control) falls
 * back to a centred card with no cut-out, so the tour never points at nothing.
 *
 * Shown to instructors only, on their own screen — it describes that screen,
 * so a manager on the dashboard never sees it.
 *
 * When it opens:
 *   sign-in 1      → shown, and cannot be skipped
 *   sign-ins 2, 3  → shown, with a large obvious skip
 *   sign-in 4 on   → only from the menu
 *
 * The window is `login_count` on the account, so switching device or clearing
 * site data does not restart the count. The browser holds one thing only:
 * which sign-in already had its run dismissed, so leaving this screen and
 * coming back within the same sign-in does not open it again.
 */

const MANDATORY_UNTIL = 1;
const AUTO_OPEN_UNTIL = 3;
const PADDING = 10; // breathing room around the lit element
const SEEN_KEY = 'kogo:tour-seen';

/**
 * The sign-in whose run this browser has already dismissed. Wrapped, because a
 * browser that refuses storage — private mode, site data blocked — must still
 * get the tour rather than an exception on the way to the screen.
 */
function readSeen(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function markSeen(key: string, count: number) {
  try {
    window.localStorage.setItem(key, String(count));
  } catch {
    /* the sign-in count still closes the window after the third run */
  }
}

function sameRect(a: Rect | null, b: Rect | null) {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** Which blank stand-in a step draws in its card while the real thing is
 *  missing: the screen as a whole, a lesson cube, the lesson list, the numbers
 *  panel, or a lesson's name list. */
type MockKind = 'screen' | 'lesson' | 'rows' | 'chart' | 'roster';

interface Step {
  /** CSS selector of the element to light up. Omit for a centred card. */
  selector?: string;
  /** Drawn in the card whenever the real thing is not on screen, so the step
   *  shows the shape it is talking about instead of pointing at nothing. */
  mock?: MockKind;
  /** This step talks about the day's lessons, and the strip and the list both
   *  hold their shape with grey skeletons while a day loads — so a lit element
   *  is not proof there is anything inside it. Wait for a lesson cube. */
  awaitsLessons?: boolean;
  /** Flip the attendance marks green for the length of this step, to show what
   *  filling in attendance looks like. Purely visual — nothing is saved. */
  demoStatus?: boolean;
  /** Open a lesson for this step. The mark and add-student controls only exist
   *  inside one, and a step whose target is absent falls back to a centred card
   *  that points at nothing. */
  needsLesson?: boolean;
  title: string;
  body: string;
  icon: string;
}

/**
 * The tour walks the instructor's own screen in the order they meet it: what
 * the screen already shows, how to change it, the lesson cubes, the list, then
 * their own numbers. The last two steps open a real lesson first, because the
 * controls they describe only exist inside one.
 */
const STEPS: Step[] = [
  {
    icon: '👋',
    mock: 'screen',
    title: '__GREETING__',
    body: 'כמה מסכים קצרים ונתחיל. נעבור יחד על מה שיש כאן ואיך זה עובד — לוחצים "הבא" בכל שלב.',
  },
  {
    selector: '[data-tour="day"]',
    mock: 'screen',
    icon: '📍',
    title: 'מה מוצג לכם עכשיו',
    body: 'המערכת תמיד פותחת על היום הנוכחי, בסניף שאתם נמצאים בו. זה היום שמוצג לכם כרגע.',
  },
  {
    selector: '[data-tour="branch"]',
    mock: 'screen',
    icon: '🏢',
    title: 'להחליף סניף',
    body: 'רוצים סניף אחר? בוחרים כאן. מופיעים כל הסניפים שאתם משויכים אליהם — גם אם אין בהם שיעור היום.',
  },
  {
    selector: '[data-tour="date"]',
    mock: 'screen',
    icon: '📅',
    title: 'להחליף תאריך',
    body: 'ולהחליף יום — מכאן. אפשר גם עם החיצים שליד רשימת השיעורים.',
  },
  {
    selector: '[data-tour="lessons"]',
    awaitsLessons: true,
    mock: 'lesson',
    icon: '🧊',
    title: 'השיעורים שלכם היום',
    body: 'כל קובייה היא שיעור, לפי שעה. השיעור שמתקיים עכשיו מסומן.',
  },
  {
    selector: '[data-tour="lessons"]',
    demoStatus: true,
    awaitsLessons: true,
    mock: 'lesson',
    icon: '✅',
    title: 'הסימן על הקובייה',
    body: 'X אומר שעוד לא נרשמה נוכחות בשיעור. ברגע שתמלאו אותה — הסימן הופך לירוק. ככה רואים במבט אחד מה נשאר.',
  },
  {
    selector: '[data-tour="list"]',
    awaitsLessons: true,
    mock: 'rows',
    icon: '📋',
    title: 'ואותם שיעורים ברשימה',
    body: 'למטה אותם שיעורים בדיוק, רק בתצוגת רשימה — נוח יותר להיכנס מכאן.',
  },
  {
    selector: '[data-tour="dashboard"]',
    mock: 'chart',
    icon: '📊',
    title: 'הנתונים שלכם',
    body: 'כאן יוצגו הנתונים שלכם: כמה תלמידים פעילים יש בכל קבוצה, איך המספר משתנה לאורך החודשים, ובאילו שיעורים עוד לא נרשמה נוכחות. לחיצה על שיעור ברשימה תיקח אתכם ישר אליו.',
  },
  {
    selector: '[data-tour-mark]',
    needsLesson: true,
    mock: 'roster',
    icon: '✔️',
    title: 'סימון נוכחות',
    body: 'בתוך שיעור מסמנים לכל ילד: ✓ הגיע, ✗ לא הגיע. חשוב לסמן גם ✗ — ככה המערכת עוקבת אחרי ילד שמפסיק להגיע.',
  },
  {
    selector: '[data-tour="add-student"]',
    needsLesson: true,
    mock: 'roster',
    icon: '➕',
    title: 'ילד שהגיע ואינו ברשימה',
    body: 'הגיע ילד שאינו רשום? מוסיפים אותו כאן בשם ובטלפון, והוא נכנס לרשימה של השיעור הזה כדי שתוכלו לסמן לו נוכחות. זו אינה הרשמה — המשרד משלים אותה.',
  },
  {
    icon: '🎉',
    title: 'זהו, אתם מוכנים',
    body: 'נכנסים לשיעור, מסמנים נוכחות, וזהו. הסיור תמיד זמין מכפתור "הדרכה" בתפריט.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function GuidedTour({ forceOpen = false, onClose }: Props) {
  const { user, refresh } = useAuth() as any;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [lessonsOnScreen, setLessonsOnScreen] = useState(false);

  const loginCount = Number(user?.login_count ?? 0);
  const tourCompleted = Boolean(user?.tour_completed);
  const canSkip = forceOpen || tourCompleted || loginCount > MANDATORY_UNTIL;
  const seenKey = user?.id ? `${SEEN_KEY}:${user.id}` : null;

  // The tour explains the instructor screen, so it is for instructors only.
  // Managers and partners never get it opened for them.
  const isInstructor = user?.role === 'worker';

  const greeting = useMemo(() => {
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
    return name ? `שלום ${name}` : 'שלום';
  }, [user?.first_name, user?.last_name]);

  // The sign-in count alone decides the window. `tour_completed` cannot take
  // part in it: every run ends by setting it — the first one is mandatory, so
  // it is always set by the end of sign-in 1 — and gating on it would mean the
  // runs owed on sign-ins 2 and 3 never happen. Past the window the count says
  // no on its own, which is what the flag was there to express.
  const shouldAutoOpen = useMemo(() => {
    if (!user || !isInstructor) return false;
    return loginCount >= 1 && loginCount <= AUTO_OPEN_UNTIL;
  }, [user, isInstructor, loginCount]);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    if (!shouldAutoOpen) return;
    // One run per sign-in. The count only moves on the next sign-in, so it
    // doubles as the marker for "this run was already given", and leaving the
    // screen and returning does not start it over.
    if (seenKey && readSeen(seenKey) === loginCount) return;
    setOpen(true);
  }, [forceOpen, shouldAutoOpen, seenKey, loginCount]);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener('kogo:open-tour', reopen);
    return () => window.removeEventListener('kogo:open-tour', reopen);
  }, []);

  // Measure the current target before paint, so the light never shows in the
  // wrong place first. Re-measures on resize, on scroll, and whenever the page
  // changes underneath — a lesson opening, or a day's lessons arriving, both
  // put the target on screen long after the step started.
  useLayoutEffect(() => {
    if (!open) return;

    // The same rect measured again must not be a new object, or the observer
    // below would answer its own re-render and never settle.
    const place = (next: Rect | null) => setRect((prev) => (sameRect(prev, next) ? prev : next));

    const measure = () => {
      // One cube per lesson carries this, so it is the honest test for "the
      // day's lessons are actually on screen" — the skeletons do not.
      setLessonsOnScreen(document.querySelector('[data-tour-status]') !== null);

      const sel = STEPS[step]?.selector;
      if (!sel) {
        place(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) {
        place(null);
        return;
      }
      // offsetParent is null for anything position:fixed as well as for hidden
      // elements, so it cannot be the visibility test — the floating dashboard
      // button is fixed, and using it silently skipped that whole step.
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
        place(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        place(null);
        return;
      }
      place({
        top: r.top - PADDING,
        left: r.left - PADDING,
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      });
    };

    measure();

    const sel = STEPS[step]?.selector;
    if (sel) {
      document.querySelector<HTMLElement>(sel)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // Re-measure once the smooth scroll has settled.
    const settle = setTimeout(measure, 340);

    // A step can start before the thing it describes exists. Coalesce the
    // page's own churn into one measurement a frame, so the light lands on the
    // target the moment it appears instead of at a fixed guess of a delay.
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  const finish = useCallback(async () => {
    // Before the round trip, so that refreshing the account mid-save cannot
    // hand the auto-open effect a run it has already given.
    if (seenKey) markSeen(seenKey, loginCount);
    setSaving(true);
    try {
      await completeTour();
      await refresh?.();
    } catch {
      /* closing regardless — never trap someone inside the tour */
    } finally {
      setSaving(false);
      setOpen(false);
      setStep(0);
      onClose?.();
    }
  }, [refresh, onClose, seenKey, loginCount]);

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

  // Half the tour points at the day's lessons, so it asks the screen for a day
  // that actually has some before the first of those steps — otherwise it
  // narrates cubes and a list that are not there. The day is put back at the
  // end.
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('kogo:tour-start'));
    return () => {
      window.dispatchEvent(new CustomEvent('kogo:tour-close-lesson'));
      window.dispatchEvent(new CustomEvent('kogo:tour-end'));
    };
  }, [open]);

  // The attendance steps additionally need a lesson open. Ask the screen to
  // open one, and to close it again as soon as the tour moves on.
  useEffect(() => {
    if (!open) return;
    const needs = Boolean(STEPS[step]?.needsLesson);
    window.dispatchEvent(
      new CustomEvent(needs ? 'kogo:tour-open-lesson' : 'kogo:tour-close-lesson'),
    );
  }, [open, step]);

  // Flip the cubes' marks green while the demo step is on screen, then put
  // them back. Nothing is written — this only shows what a filled-in lesson
  // looks like.
  useEffect(() => {
    if (!open || !STEPS[step]?.demoStatus) return;
    const marks = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-status]'));
    marks.forEach((m) => m.setAttribute('data-tour-demo', 'on'));
    return () => marks.forEach((m) => m.removeAttribute('data-tour-demo'));
  }, [open, step]);

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
  const raw = STEPS[step];
  const current = { ...raw, title: raw.title === '__GREETING__' ? greeting : raw.title };

  // Nothing to point at, or a lit element that is still only skeletons: draw
  // the shape in the card instead, so the step reads as something from its
  // first frame rather than after the lesson or the day has loaded.
  const waiting = rect === null || (raw.awaitsLessons === true && !lessonsOnScreen);
  const mock = waiting ? raw.mock : undefined;

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-labelledby="tour-title" dir="rtl">
      {rect ? (
        <>
          {/* One element carries the whole dimming: a very large outward shadow
              darkens everything around the cut-out, so there are no four
              overlay panels to keep in sync while it animates between steps. */}
          <div
            className={styles.spotlight}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
          <div
            className={styles.ring}
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className={styles.dim} />
      )}

      <TourCard
        rect={rect}
        step={step}
        total={STEPS.length}
        current={current}
        mock={mock}
        canSkip={canSkip}
        saving={saving}
        isLast={isLast}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        onFinish={finish}
      />
    </div>
  );
}

function TourCard({
  rect,
  step,
  total,
  current,
  mock,
  canSkip,
  saving,
  isLast,
  onBack,
  onNext,
  onFinish,
}: {
  rect: Rect | null;
  step: number;
  total: number;
  current: Step;
  mock?: MockKind;
  canSkip: boolean;
  saving: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  // Sit below the lit element, or above it. When the lit element is tall enough
  // that neither side has room — a full lesson list on a phone — the card
  // centres itself over the dimming instead. It previously anchored below
  // regardless, which pushed "next" off the bottom of the screen with no way
  // back: the tour is mandatory on the first sign-in, so that was a dead end.
  const GAP = 14;
  // What the card needs, which the illustration roughly doubles.
  const CARD_H = mock ? 430 : 260;

  const placement = useMemo(() => {
    if (!rect || typeof window === 'undefined') return 'centre' as const;
    const roomBelow = window.innerHeight - (rect.top + rect.height) - GAP;
    if (roomBelow >= CARD_H) return 'below' as const;
    if (rect.top - GAP >= CARD_H) return 'above' as const;
    return 'centre' as const;
  }, [rect, CARD_H]);

  const style = useMemo<React.CSSProperties>(() => {
    if (!rect || placement === 'centre') return {};
    return placement === 'below'
      ? { top: rect.top + rect.height + GAP }
      : { bottom: window.innerHeight - rect.top + GAP };
  }, [rect, placement]);

  return (
    <div
      className={`${styles.card} ${placement === 'centre' ? styles.cardCentred : styles.cardAnchored}`}
      style={style}
    >
      {canSkip ? (
        <button type="button" className={styles.skip} onClick={onFinish} disabled={saving}>
          דלג על ההדרכה
        </button>
      ) : (
        <div className={styles.mandatory}>הדרכה ראשונה — כמה מסכים ומתחילים</div>
      )}

      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>{current.icon}</span>
        <h2 id="tour-title" className={styles.title}>{current.title}</h2>
      </div>
      <p className={styles.body}>{current.body}</p>

      {mock ? <TourMock kind={mock} /> : null}

      <div className={styles.dots} aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === step ? styles.dotOn : ''}`} />
        ))}
      </div>

      <div className={styles.actions}>
        {step > 0 ? (
          <button type="button" className={styles.back} onClick={onBack}>חזרה</button>
        ) : (
          <span />
        )}
        {isLast ? (
          <button type="button" className={styles.next} onClick={onFinish} disabled={saving}>
            {saving ? 'שומר…' : 'סיימתי'}
          </button>
        ) : (
          <button type="button" className={styles.next} onClick={onNext}>הבא</button>
        )}
      </div>

      <div className={styles.counter}>{step + 1} מתוך {total}</div>
    </div>
  );
}

/**
 * A blank stand-in for the part of the screen a step is describing, drawn while
 * the real thing is not there yet.
 *
 * Bars and shapes only — never a time, a name or a count. An instructor reading
 * a number here would have no way to tell it apart from their own lessons, so
 * there are none to read, and the tag says so outright.
 */
function TourMock({ kind }: { kind: MockKind }) {
  return (
    <div className={styles.mock} aria-hidden>
      <span className={styles.mockTag}>לדוגמה בלבד</span>

      {kind === 'screen' && (
        <div className={styles.mockCol}>
          <span className={styles.mockHeadBar} />
          <div className={styles.mockRowFlow}>
            <span className={styles.mockChip} />
            <span className={styles.mockChip} />
            <span className={styles.mockChip} />
          </div>
          <span className={styles.mockBar} />
          <span className={styles.mockBarShort} />
        </div>
      )}

      {kind === 'lesson' && (
        <div className={styles.mockRowFlow}>
          {['miss', 'ok', 'miss'].map((state, i) => (
            <div className={styles.mockCube} key={i}>
              <span className={styles.mockBarShort} />
              <span className={styles.mockBar} />
              <span className={state === 'ok' ? styles.mockOk : styles.mockMiss}>
                {state === 'ok' ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
      )}

      {kind === 'rows' && (
        <div className={styles.mockCol}>
          {[0, 1, 2].map((i) => (
            <div className={styles.mockRow} key={i}>
              <span className={styles.mockTime} />
              <span className={styles.mockBar} />
              <span className={styles.mockPill} />
            </div>
          ))}
        </div>
      )}

      {kind === 'chart' && (
        <div className={styles.mockChart}>
          {[38, 62, 46, 78, 56].map((h, i) => (
            <span className={styles.mockColumn} style={{ height: `${h}%` }} key={i} />
          ))}
        </div>
      )}

      {kind === 'roster' && (
        <div className={styles.mockCol}>
          {[0, 1, 2].map((i) => (
            <div className={styles.mockRow} key={i}>
              <span className={styles.mockAvatar} />
              <span className={styles.mockBar} />
              <span className={styles.mockOk}>✓</span>
              <span className={styles.mockMiss}>✗</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
