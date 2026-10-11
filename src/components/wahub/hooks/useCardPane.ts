'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CARD_PANE_DEFAULT,
  CARD_PANE_STORAGE_KEY,
  cardPaneReducer,
  readCardPane,
  writeCardPane,
  type CardPaneAction,
  type CardPaneState,
} from '@/lib/wahub/cardPane';

/** Read before the browser paints, so a card that was put away does not show for a moment; nothing to read on the server. */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function readStored(): CardPaneState {
  try {
    return readCardPane(window.localStorage.getItem(CARD_PANE_STORAGE_KEY));
  } catch {
    // Storage is closed to the page (a private window, a policy): the card works, it is only not remembered.
    return CARD_PANE_DEFAULT;
  }
}

function store(state: CardPaneState) {
  try {
    window.localStorage.setItem(CARD_PANE_STORAGE_KEY, writeCardPane(state));
  } catch {
    /* not remembered — nothing else is lost */
  }
}

/**
 * Whether the contact's card is put away, and how wide it was pulled — kept in
 * the browser, so it stays between conversations and visits
 * (docs/WAHUB-CONTRACT-POLISH-1.md, א). The first draw is the default (open,
 * at the screen's own width), which is also what the server draws.
 */
export function useCardPane() {
  const [state, setState] = useState<CardPaneState>(CARD_PANE_DEFAULT);
  const stateRef = useRef(state);

  useBeforePaint(() => {
    const stored = readStored();
    stateRef.current = stored;
    setState(stored);
  }, []);

  const dispatch = useCallback((action: CardPaneAction) => {
    const next = cardPaneReducer(stateRef.current, action);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    store(next);
  }, []);

  const hide = useCallback(() => dispatch({ type: 'hide' }), [dispatch]);
  const show = useCallback(() => dispatch({ type: 'show' }), [dispatch]);
  const resize = useCallback((width: number) => dispatch({ type: 'resize', width }), [dispatch]);
  const reset = useCallback(() => dispatch({ type: 'reset' }), [dispatch]);

  return { hidden: state.hidden, width: state.width, hide, show, resize, reset };
}
