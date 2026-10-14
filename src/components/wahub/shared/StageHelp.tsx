'use client';

import { HelpCircle } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { helpParts, stageHelp, stageHelpText, STAGE_HELP } from '@/lib/wahub/stageHelp';
import h from '../stageHelp.module.css';

/**
 * A lead's state with "מה זה אומר?" behind it (the owner, 14.10.2026): with a
 * mouse the bubble opens while the pointer is on the state, on a phone a tap
 * opens it and a second tap — or one anywhere else, or Escape — closes it. Two
 * short lines: what the state means, and what happens next and who does it.
 * A state with no words of its own is shown as it was, with nothing to open.
 */

function Line({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {helpParts(text).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))}
    </span>
  );
}

// A layout effect in the browser (the bubble is put in place before it is painted), a plain one on the server.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
// The least room kept between a bubble and the edge of the screen.
const EDGE = 12;

/**
 * How far to move an open bubble sideways so that the whole of it is on the screen — 0 when it already is.
 * On a phone the state may stand near an edge, and a bubble opened from it would be cut (seen in production,
 * 14.10.2026: 41 pixels of it outside the screen).
 */
export function onScreenShift(left: number, right: number, screen: number, edge: number = EDGE): number {
  if (right - left > screen - 2 * edge) return edge - left;
  if (left < edge) return edge - left;
  if (right > screen - edge) return screen - edge - right;
  return 0;
}

/** Open while it is wanted, closed by a press outside it or by Escape. */
function useBubble(defaultOpen: boolean) {
  const [open, setOpen] = useState(defaultOpen);
  // Opened by a mouse resting on it, and so closed when the mouse leaves; a press keeps it open.
  const byHover = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return { open, setOpen, byHover, wrap };
}

export interface StageHelpProps {
  stage: string | null | undefined;
  /** The state's name, as the place it stands in writes it. */
  children: ReactNode;
  /**
   * Inside a row that opens something when pressed (a conversation in the list): the state is not a button of
   * its own there — a button in a button is not allowed — and a press on it opens the bubble, not the row.
   */
  inRow?: boolean;
  /** Its name for the bubble's head. Absent: the bubble opens on the meaning itself. */
  title?: string;
  /** Open from the start — for a test, or a picture of the open state. */
  defaultOpen?: boolean;
}

export function StageHelp({ stage, children, inRow = false, title, defaultOpen = false }: StageHelpProps) {
  const help = stageHelp(stage);
  const { open, setOpen, byHover, wrap } = useBubble(defaultOpen);
  const id = useId();
  const bubble = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useBrowserLayoutEffect(() => {
    if (!open || !bubble.current) {
      setShift(0);
      return;
    }
    const box = bubble.current.getBoundingClientRect();
    setShift(onScreenShift(box.left - shift, box.right - shift, document.documentElement.clientWidth));
    // Measured once, as it opens; `shift` is read only to measure the place it would have had without it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!help) return <>{children}</>;

  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    if (inRow) event.preventDefault();
    byHover.current = false;
    setOpen((was) => !was);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    byHover.current = false;
    setOpen((was) => !was);
  };
  const shared = {
    className: h.trigger,
    // Not one of the round 44-pixel buttons of the details' head on a phone (leads.module.css).
    'data-stage-help': '',
    'aria-describedby': open ? id : undefined,
    title: 'מה זה אומר?',
    onClick: toggle,
  };

  return (
    <span
      ref={wrap}
      className={h.wrap}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse' && !open) {
          byHover.current = true;
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && byHover.current) {
          byHover.current = false;
          setOpen(false);
        }
      }}
    >
      {inRow ? (
        <span role="button" tabIndex={0} onKeyDown={onKey} {...shared}>
          {children}
        </span>
      ) : (
        <button type="button" {...shared}>
          {children}
        </button>
      )}
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          className={h.bubble}
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          {title && <span className={h.title}>{title}</span>}
          <Line text={help.what} className={h.line} />
          <Line text={help.now} className={h.line} />
        </span>
      )}
    </span>
  );
}

/**
 * "?" beside the filter of states: every state of the list on one sheet, each with its two lines — the filter
 * itself is the browser's own list and cannot open a bubble.
 */
export function StagesLegend({ stages, defaultOpen = false }: { stages: Array<{ key: string; label: string }>; defaultOpen?: boolean }) {
  const { open, setOpen, wrap } = useBubble(defaultOpen);
  const id = useId();
  const known = stages.filter((stage) => STAGE_HELP[stage.key]);
  if (!known.length) return null;
  return (
    <span ref={wrap} className={h.wrap}>
      <button
        type="button"
        className={h.legendButton}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="מה אומר כל מצב?"
        title="מה אומר כל מצב?"
      >
        <HelpCircle aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className={h.legend} role="dialog" aria-label="מה אומר כל מצב">
          <dl>
            {known.map((stage) => {
              const help = STAGE_HELP[stage.key];
              return (
                <div key={stage.key}>
                  <dt>{stage.label}</dt>
                  <dd>
                    <Line text={help.what} className={h.line} />
                    <Line text={help.now} className={`${h.line} ${h.quiet}`} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </span>
  );
}

export { stageHelpText };
