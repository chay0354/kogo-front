'use client';

import Confetti from './Confetti';
import type { ConfettiLayer, ConfettiLevel } from './confettiPieces';
import look from './newLook.module.css';

interface Props {
  /** `done`: it went through. `wait`: no answer yet. `stop`: it did not go through. */
  tone: 'done' | 'wait' | 'stop';
  title: string;
  /** Something is being checked right now: a turning ring stands in for the sign. */
  busy?: boolean;
  /** The lines under the title, and anything else the screen shows. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** A registration that went through: confetti falls behind the screen. */
  confetti?: ConfettiLevel;
  /** `front` for a screen with no gaps for it to show through. */
  confettiLayer?: ConfettiLayer;
}

/**
 * A screen the form ends on — or stops at: one sign, a title, a few short
 * lines, and the buttons. The same frame as the last screen of a paid
 * registration, so every ending looks like it belongs to the same form.
 */
export default function ResultScreen({ tone, title, busy = false, children, actions, confetti, confettiLayer }: Props) {
  return (
    <div className={look.done} dir="rtl">
      {confetti && tone === 'done' ? <Confetti level={confetti} layer={confettiLayer} /> : null}
      {busy ? (
        <div className={look.resultBusy} aria-hidden="true"><span /></div>
      ) : (
        <div className={`${look.doneTick} ${tone === 'wait' ? look.resultWait : tone === 'stop' ? look.resultStop : ''}`} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {tone === 'done' ? <path d="M5 12.5 10 17.5 19 7" /> : null}
            {tone === 'wait' ? <path d="M12 6.5v6.2M12 17.4v.1" /> : null}
            {tone === 'stop' ? <path d="M7 7l10 10M17 7 7 17" /> : null}
          </svg>
        </div>
      )}
      <p className={look.doneTitle}>{title}</p>
      {children}
      {actions ? <div className={look.doneActions}>{actions}</div> : null}
    </div>
  );
}
