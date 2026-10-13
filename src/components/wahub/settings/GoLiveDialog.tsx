'use client';

import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { WHO_ANSWERS_TEXT, canGoLive, type GoLiveStep } from '@/lib/wahub/botMode';
import type { WahubBotModeProblem } from '@/types/wahubBotMode';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import g from './whoAnswers.module.css';

/**
 * The window of "הבוט החדש עונה לכולם" (docs/WAHUB-CONTRACT-GO-LIVE.md, ג.1) —
 * the second of the two steps. It says in plain words what is about to happen,
 * and "להדליק לכולם" cannot be pressed until "ניתקתי את הבוט הישן ב-ManyChat"
 * is ticked. Never the browser's own confirm box.
 *
 * A window in the middle of the page on a desktop; on a phone a sheet at the
 * foot of the screen, with an X at its head and its buttons pinned to its foot.
 */

export interface GoLiveDialogViewProps {
  step: GoLiveStep;
  /** The owner's one switch for anything going out: while it is off, turning "כולם" on sends nothing yet. */
  sendingEnabled: boolean;
  /** The press is on its way to the server. */
  busy: boolean;
  /** Why the server cannot answer customers right now (409 `not_ready`), in its own words. */
  problems: WahubBotModeProblem[];
  /** The server's sentence over the reasons, or anything else that went wrong. */
  error: string;
  onTick: (on: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
  rootRef?: Ref<HTMLDivElement>;
}

/** The window itself, drawn from what it is given. */
export function GoLiveDialogView({ step, sendingEnabled, busy, problems, error, onTick, onConfirm, onClose, rootRef }: GoLiveDialogViewProps) {
  const titleId = useId();
  const ready = canGoLive(step, busy);
  return (
    <div ref={rootRef} className={g.winRoot}>
      <button type="button" onClick={onClose} disabled={busy} aria-label="סגור" tabIndex={-1} className={g.winScrim} />
      <div className={g.win} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-go-live-window="">
        <div className={g.winHead}>
          <h2 id={titleId} className={g.winTitle}>
            {WHO_ANSWERS_TEXT.dialogTitle}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="סגור" title="סגור" className={s.ib}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={g.winBody}>
          <ul className={g.winLines}>
            {WHO_ANSWERS_TEXT.dialogLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {!sendingEnabled && (
            <p className={g.winNote}>
              <AlertTriangle aria-hidden="true" />
              <span>{WHO_ANSWERS_TEXT.dialogSendingOff}</span>
            </p>
          )}
          <label className={g.tick}>
            <input type="checkbox" checked={step.disconnected} disabled={busy} onChange={(event) => onTick(event.target.checked)} />
            <span>{WHO_ANSWERS_TEXT.dialogTick}</span>
          </label>
          {problems.length > 0 ? (
            <div role="alert" className={g.problems}>
              <p className={g.problemsTitle}>{error || WHO_ANSWERS_TEXT.dialogNotReady}</p>
              <ul>
                {problems.map((problem, index) => (
                  <li key={problem.code || index}>{problem.text}</li>
                ))}
              </ul>
            </div>
          ) : (
            error && (
              <div role="alert" className={g.problems}>
                <p className={g.problemsTitle}>{error}</p>
              </div>
            )
          )}
        </div>
        <div className={g.winFoot}>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              // The button is off until the tick is on; this is the same rule once more, for a press that got past it.
              if (ready) onConfirm();
            }}
            className={cx(s.btn, s.btnP, g.winGo)}
          >
            {busy && <Spinner />}
            {WHO_ANSWERS_TEXT.dialogConfirm}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={cx(s.btn, g.winCancel)}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The section's own wrapper above an element: where the section's colours and timing are set. */
function sectionOf(element: HTMLElement | null): HTMLElement | null {
  for (let node = element; node; node = node.parentElement) {
    if (node.classList.contains(s.wahub)) return node;
  }
  return null;
}

export interface GoLiveDialogProps extends Omit<GoLiveDialogViewProps, 'rootRef'> {
  /** Any element of the section the window was opened from. */
  anchor: HTMLElement | null;
}

/**
 * The window while it is open: drawn at the head of the section rather than
 * inside the card (which sits in the settings' columns), closed by Escape — not
 * from under a save — and holding the keyboard inside it until it is closed.
 * Where it started is where the keyboard goes back to.
 */
export default function GoLiveDialog({ anchor, ...view }: GoLiveDialogProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const [host] = useState<HTMLElement | null>(() => sectionOf(anchor));

  const live = useRef({ busy: view.busy, onClose: view.onClose });
  live.current = { busy: view.busy, onClose: view.onClose };

  useEffect(() => {
    // The button that opened it — a press does not always leave the keyboard on the button (Safari), so it is looked for.
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body ? active : anchor?.querySelector<HTMLElement>('[data-who-answers-action]') ?? null;
    const win = root.current?.querySelector<HTMLElement>('[data-go-live-window]') ?? null;
    // Into the window, on nothing that can be pressed: a key that was already on its way presses nothing.
    win?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!live.current.busy) live.current.onClose();
        return;
      }
      if (event.key !== 'Tab' || !win) return;
      const stops = [...win.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (!win.contains(at) || at === win) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && at === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && at === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Closed without turning anything on: back to the button. Once "כולם" is on that button is gone, and the
      // keyboard is left on nothing — never on the button that takes its place.
      if (opener?.isConnected) opener.focus();
    };
    // The window is mounted when it opens and unmounted when it closes: this runs once for each opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet = <GoLiveDialogView {...view} rootRef={root} />;
  return host ? createPortal(sheet, host) : sheet;
}
