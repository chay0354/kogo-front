'use client';

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Bot, CalendarClock, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FUTURE_REASON_MAX,
  LATER_FORM,
  SENDING_OFF_NOTE,
  futureFormProblem,
  futureMinDate,
  futureShortcuts,
  isFutureDate,
  laterAfterFuture,
  laterAfterHandToBot,
  type FutureOutcome,
  type HandToBotOutcome,
  type LaterStep,
} from '@/lib/wahub/futureLeads';
import { plainDayLabel } from '@/lib/wahub/format';
import type { WahubFuture } from '@/types/wahub';
import f from '../future.module.css';
import { Spinner } from '../shared/bits';
import { ThinkingDots } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

/**
 * The clock's bubble — "לטפל בהמשך" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.4,
 * ג.5, ה): two choices, and only two.
 *
 *   "הבוט ימשיך לטפל" — the bot reads the conversation now (up to half a
 *     minute; the three dots say so) and then says, in one sentence, what it
 *     understood. If that is wrong, one quiet link takes the lead instead.
 *     If it found no step, nothing changed, and the other choice is offered.
 *   "ליד עתידי שלי" — a day and a reason, two fields and no more. Saved and
 *     the bot silenced: the bubble simply closes, and the chip at the head of
 *     the conversation says it. Saved but the bot could not be silenced: one
 *     plain line says so, with the server's reason.
 *
 * A bubble under the clock on a desktop; on a phone a sheet at the foot of the
 * conversation, with an X at its head and its buttons pinned to its foot.
 */

export interface LaterPanelViewProps {
  step: LaterStep;
  /** The contact is a future lead already: the form puts it off, and a bot that found no step offers "טופל". */
  future: WahubFuture | null;
  /** Today in Israel, YYYY-MM-DD. */
  today: string;
  due: string;
  reason: string;
  onDue: (value: string) => void;
  onReason: (value: string) => void;
  /** "הבוט ימשיך לטפל" — also "נסו שוב" after a refusal. */
  onBot: () => void;
  /** "ליד עתידי שלי" — the form. */
  onMine: () => void;
  onSave: () => void;
  /** "טופל": the ✓ of the conversation, offered when the bot has nothing to schedule for a future lead. */
  onDone: () => void;
  onClose: () => void;
}

function stepTitle(step: LaterStep, postponing: boolean): string {
  switch (step.step) {
    case 'menu':
      return 'לטפל בהמשך';
    case 'reading':
      return 'הבוט ימשיך לטפל';
    case 'understood':
      return step.understood.ok ? 'הבוט ימשיך לטפל' : 'השיחה נשארה אצלך';
    case 'failed':
      return 'השיחה לא עברה לבוט';
    case 'form':
      return postponing ? 'לדחות את הליד העתידי' : 'ליד עתידי שלי';
    case 'saved':
      return 'ליד עתידי שלי';
  }
}

/** The bubble itself, drawn from what it is given; what is open and what was typed is kept by `useLater`. */
export function LaterPanelView({ step, future, today, due, reason, onDue, onReason, onBot, onMine, onSave, onDone, onClose }: LaterPanelViewProps) {
  const postponing = future !== null;
  const title = stepTitle(step, postponing);
  const saving = step.step === 'form' && step.saving;

  let body: ReactNode;
  let foot: ReactNode = null;

  if (step.step === 'menu') {
    body = (
      <div className={f.step}>
        <button type="button" onClick={onBot} className={f.opt}>
          <span className={f.optIcon} aria-hidden="true">
            <Bot />
          </span>
          <span className="min-w-0">
            <span className={f.optTitle}>הבוט ימשיך לטפל</span>
            <span className={f.optHint}>הבוט קורא את השיחה, מבין מתי לחזור ללקוח, וחוזר אליו לבד.</span>
          </span>
        </button>
        <button type="button" onClick={onMine} className={f.opt}>
          <span className={f.optIcon} aria-hidden="true">
            <CalendarClock />
          </span>
          <span className="min-w-0">
            <span className={f.optTitle}>ליד עתידי שלי</span>
            <span className={f.optHint}>בוחרים תאריך וסיבה. ביום הזה השיחה חוזרת אליך.</span>
          </span>
        </button>
      </div>
    );
  } else if (step.step === 'reading') {
    body = (
      <div className={cx(f.reading, f.step)} role="status" aria-live="polite">
        <span className={f.readingIcon} aria-hidden="true">
          <Bot />
        </span>
        <p className={f.readingText}>
          הבוט קורא את השיחה
          <ThinkingDots />
        </p>
        <p className={cx(f.quiet, '!mt-0')}>זה לוקח עד חצי דקה. אפשר לסגור — התשובה תופיע כשתגיע.</p>
      </div>
    );
  } else if (step.step === 'understood' && step.understood.ok) {
    body = (
      <div className={f.step} role="status">
        <div className={f.got}>
          <CheckCircle2 aria-hidden="true" />
          <p className={f.gotText} dir="auto">
            {step.understood.text}
          </p>
        </div>
        {step.understood.sending_enabled === false && <p className={f.quiet}>{SENDING_OFF_NOTE}</p>}
      </div>
    );
    foot = (
      <>
        <button type="button" onClick={onMine} className={f.quietLink}>
          זה לא נכון — אקח את זה אליי
        </button>
        <button type="button" onClick={onClose} className={cx(f.quietLink, 'ms-auto')}>
          סגור
        </button>
      </>
    );
  } else if (step.step === 'understood') {
    body = (
      <div className={f.step} role="status">
        <p className={f.notGot} dir="auto">
          {step.understood.text}
        </p>
        <p className={f.quiet}>כלום לא השתנה. אפשר גם לכתוב פתק על מה שסוכם, ולנסות שוב.</p>
      </div>
    );
    foot = postponing ? (
      <button type="button" onClick={onDone} className={cx(s.btn, s.btnP)}>
        טופל
      </button>
    ) : (
      <button type="button" onClick={onMine} className={cx(s.btn, s.btnP)}>
        <CalendarClock aria-hidden="true" />
        ליד עתידי שלי
      </button>
    );
  } else if (step.step === 'failed') {
    body = (
      <div className={f.step} role="alert">
        <p className={f.failed} dir="auto">
          {step.text}
        </p>
      </div>
    );
    foot = (
      <button type="button" onClick={onBot} className={s.btn}>
        נסו שוב
      </button>
    );
  } else if (step.step === 'saved') {
    body = (
      <p className={cx(f.warnLine, f.warnLarge, f.step)} role="status">
        <AlertTriangle aria-hidden="true" />
        <span dir="auto">{step.text}</span>
      </p>
    );
    foot = (
      <button type="button" onClick={onClose} className={cx(s.btn, s.btnP)}>
        הבנתי
      </button>
    );
  } else {
    const shortcuts = futureShortcuts(today);
    const problem = futureFormProblem({ due, reason }, today, postponing);
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (!problem && !saving) onSave();
    };
    // The form wraps the body and the foot, so Enter in the reason saves.
    return (
      <form className={f.later} role="dialog" aria-label={title} onSubmit={submit}>
        <LaterHead title={title} onClose={onClose} locked={saving} />
        <div className={f.laterBody}>
          <div className={f.step}>
            <span className={cx(f.formLabel, '!mt-1')} id="later-due">
              מתי לחזור
            </span>
            <div className={f.shortcuts} role="group" aria-labelledby="later-due">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  aria-pressed={due === shortcut.date}
                  disabled={saving}
                  onClick={() => onDue(shortcut.date)}
                  className={cx(f.shortcut, due === shortcut.date && f.shortcutOn)}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
            <div className={f.dateRow}>
              <input
                type="date"
                value={due}
                min={futureMinDate(today)}
                disabled={saving}
                onChange={(event) => onDue(event.target.value)}
                aria-label="תאריך"
                className={cx(f.input, f.inputDate)}
              />
              {isFutureDate(due, today) && <span className={f.dateWords}>{plainDayLabel(due)}</span>}
            </div>

            <label className={f.formLabel} htmlFor="later-reason">
              {postponing ? 'סיבה (אפשר להשאיר)' : 'סיבה'}
            </label>
            <input
              id="later-reason"
              type="text"
              value={reason}
              maxLength={FUTURE_REASON_MAX}
              disabled={saving}
              onChange={(event) => onReason(event.target.value)}
              placeholder="למשל: הילד יהיה בן 3 בדצמבר"
              autoComplete="off"
              dir="auto"
              className={f.input}
            />
            {step.error && (
              <p className={f.formError} role="alert">
                {step.error}
              </p>
            )}
          </div>
        </div>
        <div className={f.laterFoot}>
          {/* What is missing is said by the button's own title; it cannot be pressed until nothing is. */}
          <button type="submit" disabled={Boolean(problem) || saving} title={problem || undefined} className={cx(s.btn, s.btnP)}>
            {saving && <Spinner />}
            {postponing ? 'לדחות' : 'שמור'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={f.later} role="dialog" aria-label={title}>
      <LaterHead title={title} onClose={onClose} />
      <div className={f.laterBody}>{body}</div>
      {foot && <div className={f.laterFoot}>{foot}</div>}
    </div>
  );
}

function LaterHead({ title, onClose, locked = false }: { title: string; onClose: () => void; locked?: boolean }) {
  return (
    <div className={f.laterHead}>
      <h3 className={f.laterTitle}>{title}</h3>
      <button type="button" onClick={onClose} disabled={locked} aria-label="סגור" title="סגור" className={s.ib}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

export interface LaterActions {
  /** POST hand-to-bot/: what the bot understood, or why the conversation was not handed over. */
  onHandToBot: () => Promise<HandToBotOutcome>;
  /** POST future/: saved (and whether the bot is silenced), or why it was not. */
  onFuture: (due: string, reason: string) => Promise<FutureOutcome>;
}

/**
 * What the clock's bubble keeps while it is open: which step it is on, the day
 * chosen and the reason typed. Each conversation has its own — moving to
 * another one closes whatever was open for the one before.
 *
 * An answer that arrives after the bubble was closed (the bot takes up to half
 * a minute, and the person may have moved on) is not lost: it is said in a
 * word over the page instead.
 */
export function useLater(contactId: number | null, future: WahubFuture | null, actions: LaterActions) {
  const [held, setHeld] = useState<{ contactId: number | null; step: LaterStep | null; due: string; reason: string }>({
    contactId,
    step: null,
    due: '',
    reason: '',
  });
  // Another conversation: nothing of the one before is left open, or typed.
  if (held.contactId !== contactId) setHeld({ contactId, step: null, due: '', reason: '' });
  const state = held.contactId === contactId ? held : { contactId, step: null, due: '', reason: '' };

  // What the requests read when they come back — and what "שמור" sends: always the latest, never a copy from the draw that started them.
  const live = useRef({ contactId, step: state.step, due: state.due, reason: state.reason, actions, future });
  live.current = { contactId, step: state.step, due: state.due, reason: state.reason, actions, future };
  /** Goes up with every request, so an answer knows whether it is still the one waited for. */
  const turn = useRef(0);

  const setStep = useCallback((step: LaterStep | null) => setHeld((prev) => ({ ...prev, step })), []);

  /** The same bubble is still waiting for this answer: the same conversation, the same request, still open. */
  const stillWaiting = (id: number | null, mine: number, on: LaterStep['step']) =>
    live.current.contactId === id && turn.current === mine && live.current.step?.step === on;

  const handToBot = useCallback(async () => {
    const id = live.current.contactId;
    const mine = ++turn.current;
    setStep({ step: 'reading' });
    const outcome = await live.current.actions.onHandToBot();
    if (stillWaiting(id, mine, 'reading')) {
      setStep(laterAfterHandToBot(outcome));
      return;
    }
    // The bubble was closed meanwhile: what the bot understood is still worth a word.
    if ('error' in outcome) toast.error(outcome.error);
    else if (outcome.understood.ok) toast.success(outcome.understood.text);
    else toast.message(outcome.understood.text);
  }, [setStep]);

  const openForm = useCallback(() => {
    const now = live.current.future;
    // Putting an existing lead off starts from its own reason; the day is chosen afresh.
    setHeld((prev) => ({ ...prev, step: LATER_FORM, due: '', reason: now?.reason ?? prev.reason }));
  }, []);

  const save = useCallback(async () => {
    const { contactId: id, due, reason } = live.current;
    const mine = ++turn.current;
    setStep({ step: 'form', saving: true, error: '' });
    const outcome = await live.current.actions.onFuture(due, reason.trim());
    const next = laterAfterFuture(outcome);
    if (stillWaiting(id, mine, 'form')) {
      setHeld((prev) => (next ? { ...prev, step: next } : { ...prev, step: null, due: '', reason: '' }));
      return;
    }
    if ('error' in outcome) toast.error(outcome.error);
    else if (next?.step === 'saved') toast.warning(next.text);
  }, [setStep]);

  return {
    step: state.step,
    due: state.due,
    reason: state.reason,
    isOpen: state.step !== null,
    /** A save is on its way: the bubble waits for it rather than closing under it. */
    locked: state.step?.step === 'form' && state.step.saving,
    openMenu: useCallback(() => setStep({ step: 'menu' }), [setStep]),
    openForm,
    close: useCallback(() => setStep(null), [setStep]),
    handToBot,
    save,
    setDue: useCallback((due: string) => setHeld((prev) => ({ ...prev, due })), []),
    setReason: useCallback((reason: string) => setHeld((prev) => ({ ...prev, reason })), []),
  };
}

export type Later = ReturnType<typeof useLater>;
