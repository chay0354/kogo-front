'use client';

import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Hourglass } from 'lucide-react';
import { cx } from '../../shared/tones';
import t from './teach.module.css';

/**
 * The small pieces "ללמד" and "בדיקות" both draw: the three dots of a bot that
 * is thinking, a WhatsApp-like bubble, a part that comes in after the one above
 * it, and what is said when the server does not have the screen yet.
 */

/**
 * A writing box as tall as its words: it grows as he writes (or dictates), and
 * the stylesheet keeps it between its smallest and its largest.
 */
export function useAutoGrow(box: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [box, value]);
}

/** Three dots that breathe, in the colour of the text around them. */
export function Dots({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cx(t.dots, className)} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** A part of a card that comes in softly, after the parts above it (`order` counts them). */
export function Rise({ order = 0, className, children }: { order?: number; className?: string; children: ReactNode }) {
  return (
    <div className={cx(t.rise, className)} style={{ '--i': order } as CSSProperties}>
      {children}
    </div>
  );
}

export type BubbleTone = 'customer' | 'today' | 'after' | 'system';

const BUBBLE_TONE: Record<BubbleTone, string> = {
  customer: t.bCustomer,
  today: t.bToday,
  after: t.bAfter,
  system: t.bSystem,
};

/**
 * One line of a short conversation, as in WhatsApp: who says it, in small
 * letters, and the bubble. The customer stands at the start and the bot across.
 * `coming`: the answer is still being made — three dots hold its place.
 */
export function Bubble({
  who,
  tone,
  text,
  coming = false,
  marked = false,
  children,
}: {
  who: string;
  tone: BubbleTone;
  text?: string;
  coming?: boolean;
  /** A check that did not pass is about this answer. */
  marked?: boolean;
  /** Under the bubble, on its side: what was expected of this answer. */
  children?: ReactNode;
}) {
  return (
    <div className={cx(t.exRow, tone === 'customer' ? t.exIn : t.exOut)}>
      {/* A second message in a row from the same side needs no name. */}
      {who && <span className={t.exWho}>{who}</span>}
      {coming ? (
        <p className={cx(t.bubble, BUBBLE_TONE[tone], t.bubbleComing)}>
          <Dots label={`${who}: התשובה בדרך`} />
        </p>
      ) : (
        <p className={cx(t.bubble, BUBBLE_TONE[tone], t.bubbleIn, marked && t.bFailed)} dir="auto">
          {text}
        </p>
      )}
      {children}
    </div>
  );
}

/** The server was built before this screen: said kindly, and nothing on the page breaks. */
export function NotYet({ title, text }: { title: string; text: string }) {
  return (
    <div className={t.notYet} role="status">
      <span className={t.notYetIcon} aria-hidden="true">
        <Hourglass />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
