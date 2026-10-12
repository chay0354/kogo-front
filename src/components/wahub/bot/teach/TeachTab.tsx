'use client';

import { useEffect, useRef } from 'react';
import { pendingCount } from '@/lib/wahub/bot';
import { useProposals, useReviewSummary } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import type { TeachComposerHandle } from './TeachComposer';
import TeachView, { type TeachSlot } from './TeachView';
import { useTeach } from './useTeach';

export interface TeachSeed {
  /** Words to open the box with. */
  text: string;
  /** Goes up with every hand-over, so the same words handed in twice are put in twice. */
  nonce: number;
}

interface TeachTabProps {
  /** Words handed in from a check that did not pass ("ללמד את הבוט"). */
  seed?: TeachSeed | null;
}

/**
 * "ללמד" — the first sub-tab of "הבוט" (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ב).
 * The owner writes freely; the bot says what it understood and what would
 * change; nothing changes until "מאשר". Nothing here sends a message to anyone.
 */
export default function TeachTab({ seed = null }: TeachTabProps) {
  const teach = useTeach();
  const now = useNow(60_000);
  const composer = useRef<TeachComposerHandle | null>(null);
  const slotElement = useRef<HTMLDivElement | null>(null);

  // The floating button of the proposals (a change that waits here is one of them) shares the phone's bottom corner.
  const summary = useReviewSummary(true);
  const pending = useProposals('pending', (summary.data?.pending ?? 0) > 0);
  const fabUp = pendingCount(summary.data, pending.data) > 0;

  // Words handed in: into the box, with the cursor at their end. Each hand-over is taken once.
  const { seed: putSeed } = teach;
  useEffect(() => {
    if (!seed || !putSeed(seed.text, seed.nonce)) return;
    // After the box is drawn with the words in it. Never cancelled: a box that is gone by then is simply not there.
    window.setTimeout(() => composer.current?.focus(), 60);
  }, [putSeed, seed]);

  // A card that was just opened, or that just changed (a new answer, "נשמר") is brought into view — only when
  // its top is not already there, so nothing moves that does not have to.
  const shownFor = useRef<string>('');
  const slotKey = teach.sending ? 'thinking' : teach.openId != null ? `thread-${teach.openId}-${teach.version}` : '';
  useEffect(() => {
    if (slotKey === shownFor.current) return;
    shownFor.current = slotKey;
    const element = slotElement.current;
    if (!slotKey || !element) return;
    const top = element.getBoundingClientRect().top;
    if (top >= 64 && top <= window.innerHeight * 0.45) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  }, [slotKey]);

  let slot: TeachSlot | null = null;
  if (teach.sending) slot = { kind: 'thinking', wrote: teach.sending.wrote, since: teach.sending.since };
  else if (teach.openId != null && teach.thread) {
    slot = {
      kind: 'thread',
      thread: teach.thread,
      busy: teach.busy,
      said: teach.said,
      saidAt: teach.saidAt,
      error: teach.cardError,
      unsent: teach.unsent,
      previewStalled: teach.previewStalled,
      checkStalled: teach.checkStalled,
      version: teach.version,
    };
  } else if (teach.openId != null && teach.openError) slot = { kind: 'openFailed', text: teach.openError };
  else if (teach.openId != null && teach.opening) slot = { kind: 'opening' };

  const openId = teach.openId;

  return (
    <TeachView
      ref={composer}
      slotRef={slotElement}
      availability={teach.availability}
      loadError={teach.loadError}
      onRetry={teach.retryList}
      slot={slot}
      draft={teach.draft}
      sendError={teach.sendError}
      onDraft={teach.setDraft}
      onSend={teach.send}
      onApprove={() => openId != null && teach.approve(openId)}
      onSay={(text) => openId != null && teach.say(openId, text)}
      onUndo={() => openId != null && teach.undo(openId, 'card')}
      onClose={teach.close}
      onRetryOpen={teach.retryOpen}
      fabUp={fabUp}
      history={{
        rows: teach.rows,
        count: teach.count,
        openId,
        askingId: teach.askingId,
        undoingId: teach.undoingId,
        rowError: teach.rowError,
        more: teach.more,
        loadingMore: teach.loadingMore,
        now,
        onOpen: teach.open,
        onAskUndo: teach.askUndo,
        onUndo: (id) => teach.undo(id, 'row'),
        onMore: teach.loadMore,
      }}
    />
  );
}
