'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NO_SELECTION,
  pressMessage,
  selectableIds,
  selectedInOrder,
  startSelection,
  type RefineSelection,
} from '@/lib/wahub/refine';
import type { WahubMessage } from '@/types/wahub';

/**
 * Marking messages in the open conversation. "דיוק" starts it; a press on a
 * bubble marks it (with Shift, the whole stretch up to it); Escape, "ביטול" or
 * another conversation ends it.
 */
export function useRefineSelection(contactId: number | null, messages: ReadonlyArray<Pick<WahubMessage, 'id'>>) {
  const [selection, setSelection] = useState<RefineSelection>(NO_SELECTION);
  const order = useMemo(() => selectableIds(messages), [messages]);
  const orderRef = useRef(order);
  orderRef.current = order;

  // The marks belonged to the conversation that was open.
  useEffect(() => {
    setSelection(NO_SELECTION);
  }, [contactId]);

  const { active } = selection;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(NO_SELECTION);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  const start = useCallback(() => setSelection(startSelection()), []);
  const cancel = useCallback(() => setSelection(NO_SELECTION), []);
  const press = useCallback(
    (id: number, shift: boolean) => setSelection((prev) => pressMessage(prev, id, orderRef.current, shift)),
    [],
  );
  const picked = useMemo(() => selectedInOrder(selection, order), [selection, order]);

  return { active, ids: selection.ids, picked, start, cancel, press };
}
