'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RefineExcerptLine } from '@/lib/wahub/refine';
import RefineChat from './RefineChat';
import r from './refine.module.css';

/** What the small chat of "דיוק" is opened on: marked messages of a conversation, or a proposal. */
export interface RefineTarget {
  /** The conversation; null for a proposal that came from no conversation. */
  contactId: number | null;
  contactName: string;
  /** The marked messages, in the conversation's order — what the server is sent. */
  messageIds: number[];
  /** The marked piece of the conversation, as it is quoted at the top of the chat. */
  excerpt: RefineExcerptLine[];
  /** What the quoted piece is called when it is not "N הודעות שנבחרו": an answer being fixed, a proposal. */
  heading?: string;
  /** Every message of the conversation that is on screen, so an earlier thread's marks can be quoted too. */
  pool?: RefineExcerptLine[];
  /** "לתקן" was pressed on this shadow reply. */
  shadowId?: number | null;
  /** "דיוק" was pressed on this proposal: the chat asks "מה לשנות בהצעה?" and the server is sent the proposal alone. */
  proposalId?: number | null;
  /** Once, after the server answered the first line typed. */
  onSent?: () => void;
}

export interface RefineValue {
  /** The section's provider is above: "דיוק" can be opened from here. */
  available: boolean;
  target: RefineTarget | null;
  /** Goes up with every opening, so each one starts clean. */
  seq: number;
  open: (target: RefineTarget) => void;
  close: () => void;
  /** Where the small chat is drawn when the screen has a place for it (the contact's card, on a desktop). */
  dock: HTMLElement | null;
  setDock: (element: HTMLElement | null) => void;
}

const NOWHERE: RefineValue = {
  available: false,
  target: null,
  seq: 0,
  open: () => {},
  close: () => {},
  dock: null,
  setDock: () => {},
};

/** Exported so a test can stand in for the provider and see what was opened. */
export const RefineContext = createContext<RefineValue>(NOWHERE);

/**
 * Holds what "דיוק" is open on, for the whole section: the button at the top
 * of a conversation, a bubble's own shortcut and "לתקן" under a shadow reply
 * all open the same small chat. Outside the provider nothing opens, and the
 * screens that would offer "דיוק" do not.
 */
export function RefineProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ target: RefineTarget | null; seq: number }>({ target: null, seq: 0 });
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const openOn = useCallback((target: RefineTarget) => setOpen((prev) => ({ target, seq: prev.seq + 1 })), []);
  const close = useCallback(() => setOpen((prev) => (prev.target ? { target: null, seq: prev.seq } : prev)), []);
  const value = useMemo<RefineValue>(
    () => ({ available: true, target: open.target, seq: open.seq, open: openOn, close, dock, setDock }),
    [close, dock, open.seq, open.target, openOn],
  );
  return <RefineContext.Provider value={value}>{children}</RefineContext.Provider>;
}

export function useRefine(): RefineValue {
  return useContext(RefineContext);
}

/**
 * A place for the small chat inside a screen: on a desktop the conversations
 * screen puts one over the contact's card, so the chat opens there — beside the
 * conversation it is about, which stays in full view — and pushes nothing.
 * It takes no presses of its own while the chat is closed.
 */
export function RefineDock() {
  const { setDock } = useRefine();
  return <div ref={setDock} className={r.dock} />;
}

/**
 * Where the small chat is drawn: in the dock when a screen offers one,
 * otherwise as a drawer at the side of the page (the whole screen of a phone).
 * Either way it sits inside the section's wrapper, where the section's colours
 * are set.
 *
 * The chat lives in one node for as long as the page is open, and the node is
 * moved between the two places — so going to another tab and back does not
 * throw away what was being written.
 */
export function RefineHost() {
  const { target, seq, close, dock } = useRefine();
  const home = useRef<HTMLDivElement | null>(null);
  const [node] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.createElement('div')));

  useEffect(() => {
    if (!node) return;
    node.className = r.node;
    const place = dock ?? home.current;
    if (place && node.parentElement !== place) place.appendChild(node);
  }, [dock, node]);

  return (
    <>
      <div ref={home} className={r.node} />
      {target && node && createPortal(<RefineChat key={seq} target={target} docked={dock !== null} onClose={close} />, node)}
    </>
  );
}
