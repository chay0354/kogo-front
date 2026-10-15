'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Clock, HelpCircle, X, type LucideIcon } from 'lucide-react';
import type { BoxDef, BoxIcon } from '@/lib/wahub/boxes';
import { helpParts, type StageHelp as HelpWords } from '@/lib/wahub/stageHelp';
import b from '../boxHelp.module.css';
import { HoverHelp } from '../shared/StageHelp';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import f from '../future.module.css';

/**
 * "מה זה אומר?" on the boxes above the conversations (the owner, 15.10.2026, of "לא נקראו / מחכים לתשובה": "מה
 * זה אומר"). The box's name first, the words a press away (his rule: a title first, the details on a click): a
 * mouse resting on a box opens its two lines beside it; on a phone a long press opens them under the boxes, and
 * the "?" of a group opens the lines of all its boxes there. A plain press keeps filtering, as it always did.
 *
 * Under the boxes and not beside the box on a phone: there the boxes are one row that scrolls sideways, and a
 * bubble hung from one of them would be cut by that row.
 */

const ICONS: Record<BoxIcon, LucideIcon> = { clock: Clock };

/** How long a finger rests on a box before its words open. */
export const HOLD_MS = 500;
/** A finger that moved this far is scrolling the row, not holding a box. */
const HOLD_SLOP_PX = 10;

/** What the sheet under the boxes says: one box's lines, or every box of a group. */
export type BoxHelpOpen = { kind: 'box'; def: BoxDef } | { kind: 'group'; label: string; defs: BoxDef[] };

function Line({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {helpParts(text).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))}
    </span>
  );
}

export interface Hold {
  /** A pointer went down on the box. A mouse never holds — it has the bubble on hover. */
  down: (pointerType: string, x: number, y: number) => void;
  /** It moved: past a few pixels it is scrolling the row, not holding the box. */
  move: (x: number, y: number) => void;
  /** It lifted, left or was taken by the browser before the time was up. */
  cancel: () => void;
  /** Whether the press that is ending was a hold — read once, by the click that follows it, so it does not filter. */
  held: () => boolean;
  /** The phone's own long-press menu would cover the words that just opened. */
  blocksMenu: () => boolean;
}

/** A long press by a finger (or a pen): `onHold` after HOLD_MS, unless the finger moved or lifted first. */
export function createHold(onHold: () => void, ms: number = HOLD_MS): Hold {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let fired = false;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    down(pointerType, x, y) {
      if (pointerType === 'mouse') return;
      fired = false;
      start = { x, y };
      clear();
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onHold();
      }, ms);
    },
    move(x, y) {
      if (!start || timer === null) return;
      if (Math.hypot(x - start.x, y - start.y) > HOLD_SLOP_PX) clear();
    },
    cancel: clear,
    held() {
      const was = fired;
      fired = false;
      return was;
    },
    blocksMenu: () => fired || timer !== null,
  };
}

/** `createHold` for one box, as the handlers of its button. */
function useLongPress(onHold: () => void) {
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  const hold = useRef<Hold | null>(null);
  if (hold.current === null) hold.current = createHold(() => holdRef.current());
  const current = hold.current;
  useEffect(() => current.cancel, [current]);
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => current.down(event.pointerType, event.clientX, event.clientY),
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => current.move(event.clientX, event.clientY),
    onPointerUp: current.cancel,
    onPointerCancel: current.cancel,
    onPointerLeave: current.cancel,
    onContextMenu: (event: { preventDefault: () => void }) => {
      if (current.blocksMenu()) event.preventDefault();
    },
  };
  return { handlers, held: current.held };
}

interface BoxChipProps {
  def: BoxDef;
  count: number | null;
  active: boolean;
  /** The count itself is loud (people asking for a person). */
  loud: boolean;
  onPress: () => void;
  /** A long press: the box's words, under the boxes. */
  onHold: (def: BoxDef) => void;
}

/** One box: its picture where it has one, its name and its count — with its words on hover and on a long press. */
export function BoxChip({ def, count, active, loud, onPress, onHold }: BoxChipProps) {
  const Icon = def.icon ? ICONS[def.icon] : null;
  const { handlers, held } = useLongPress(() => onHold(def));
  return (
    <HoverHelp help={def.help ?? null} className={b.chipWrap}>
      <button
        type="button"
        aria-pressed={active}
        onClick={() => {
          if (held()) return;
          onPress();
        }}
        {...(def.help ? handlers : {})}
        // The bubble says it where there is one; the browser's own small note would say it again.
        title={def.help ? undefined : def.hint}
        data-box={def.key}
        className={cx(s.chipbtn, active && s.on, def.quiet && f.boxQuiet, def.help && b.holdable)}
      >
        {Icon && <Icon aria-hidden="true" />}
        {def.label}
        {count !== null && <span className={cx(s.cnt, s.num, loud && s.cntHot)}>{count.toLocaleString('he-IL')}</span>}
      </button>
    </HoverHelp>
  );
}

/** "?" beside a group's name: the words of all its boxes, under the boxes. */
export function GroupHelpButton({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`מה אומרת כל תיבה ב"${label}"?`}
      title="מה זה אומר?"
      data-box-help=""
      className={cx(b.groupHelp, open && b.groupHelpOn)}
    >
      <HelpCircle aria-hidden="true" />
    </button>
  );
}

function BoxWords({ help, quiet = false }: { help: HelpWords; quiet?: boolean }) {
  return (
    <>
      <Line text={help.what} className={b.line} />
      <Line text={help.now} className={cx(b.line, quiet && b.quiet)} />
    </>
  );
}

/**
 * The sheet under the boxes. A press anywhere else, Escape or its ✕ puts it away — a press on a "?" is the "?"'s
 * own (it toggles), and so is a long press on another box (it opens that box's words instead).
 */
export function BoxHelpSheet({ open, onClose }: { open: BoxHelpOpen | null; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (sheet.current?.contains(target as Node)) return;
      if (target?.closest?.('[data-box-help], [data-box]')) return;
      closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (!open) return null;

  let title: string;
  let body: ReactNode;
  if (open.kind === 'box') {
    title = open.def.label;
    body = open.def.help ? <BoxWords help={open.def.help} /> : <span className={b.line}>{open.def.hint}</span>;
  } else {
    title = open.label;
    body = (
      <dl className={b.legend}>
        {open.defs.map((def) => (
          <div key={def.key}>
            <dt>{def.label}</dt>
            <dd>{def.help ? <BoxWords help={def.help} quiet /> : <span className={b.line}>{def.hint}</span>}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div ref={sheet} className={b.sheet} role="dialog" aria-label={`מה זה אומר: ${title}`}>
      <div className={b.sheetHead}>
        <span className={b.title}>{title}</span>
        <button type="button" onClick={onClose} aria-label="סגור" className={b.close}>
          <X aria-hidden="true" />
        </button>
      </div>
      {body}
    </div>
  );
}
