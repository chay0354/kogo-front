'use client';

import { forwardRef, useEffect, useRef } from 'react';
import { TEACH_TEXT, teachWaitsForHim } from '@/lib/wahub/teach';
import type { WahubTeachThread } from '@/types/wahubTeach';
import { ErrorState, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { NotYet } from './parts';
import TeachCard, { ThinkingCard, type TeachBusy } from './TeachCard';
import TeachComposer, { type TeachComposerHandle } from './TeachComposer';
import TeachHistory, { type TeachHistoryProps } from './TeachHistory';
import t from './teach.module.css';
import type { TeachAvailability } from './useTeach';

/** What stands in the card's place. */
export type TeachSlot =
  /** A new explanation is with the bot. */
  | { kind: 'thinking'; wrote: string; since: number }
  /** An earlier explanation, opened from the list, is being read. */
  | { kind: 'opening' }
  | { kind: 'openFailed'; text: string }
  | {
      kind: 'thread';
      thread: WahubTeachThread;
      busy: TeachBusy;
      said: string;
      saidAt: number;
      error: string;
      unsent: string;
      previewStalled: boolean;
      checkStalled: boolean;
      version: number;
    };

export interface TeachViewProps {
  availability: TeachAvailability;
  loadError: string;
  onRetry: () => void;
  slot: TeachSlot | null;
  draft: string;
  sendError: string;
  onDraft: (text: string) => void;
  onSend: () => void;
  onApprove: () => void;
  onSay: (text: string) => void;
  onUndo: () => void;
  onClose: () => void;
  onRetryOpen: () => void;
  history: TeachHistoryProps;
  /** The floating "יש הצעות" button is up: on a phone the box keeps clear of it. */
  fabUp?: boolean;
  /** Where the card stands, so a row opened from the list can be brought into view. */
  slotRef?: React.Ref<HTMLDivElement>;
}

/** The big box steps aside while the card waits for him, or while the bot is reading: one place to write at a time. */
export function composerShown(slot: TeachSlot | null): boolean {
  if (!slot || slot.kind === 'openFailed') return true;
  if (slot.kind !== 'thread') return false;
  return slot.busy !== 'saying' && !teachWaitsForHim(slot.thread);
}

/**
 * "ללמד": one big box for free writing; above it the bot's answer as one card;
 * under it the quiet list of what was taught so far. On a phone the box stands
 * on the bottom bar and the card above it (the stylesheet moves them).
 */
const TeachView = forwardRef<TeachComposerHandle, TeachViewProps>(function TeachView(
  { availability, loadError, onRetry, slot, draft, sendError, onDraft, onSend, onApprove, onSay, onUndo, onClose, onRetryOpen, history, fabUp = false, slotRef },
  composerRef,
) {
  const root = useRef<HTMLDivElement | null>(null);

  // A phone: how far down the page the screen starts, so it can be exactly as tall as the room that is left.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => element.style.setProperty('--teachTop', `${Math.round(element.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [availability]);

  if (availability === 'unavailable') {
    return (
      <div className={t.teach}>
        <NotYet title={TEACH_TEXT.notBuiltTitle} text={TEACH_TEXT.notBuiltText} />
      </div>
    );
  }

  if (availability === 'loading') {
    return (
      <div className={t.teach} aria-busy="true" aria-label="טוען">
        <div className={t.intro}>
          <h2>{TEACH_TEXT.title}</h2>
        </div>
        <Skeleton className={t.skBox} />
        <Skeleton className={cx(t.skLine, 'mt-3 w-32')} />
        <Skeleton className={t.skRows} />
      </div>
    );
  }

  if (availability === 'failed') {
    return (
      <div className={t.teach}>
        <div className={s.card}>
          <ErrorState title={TEACH_TEXT.listFailed} text={loadError} onRetry={onRetry} tight />
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className={t.teach} data-fab={fabUp ? '' : undefined}>
      {!slot && (
        <header className={t.intro}>
          <h2>{TEACH_TEXT.title}</h2>
          <p>{TEACH_TEXT.lead}</p>
        </header>
      )}

      <div ref={slotRef} className="scroll-mt-20 empty:hidden">
        {slot?.kind === 'thinking' && <ThinkingCard wrote={slot.wrote} since={slot.since} />}
        {slot?.kind === 'opening' && (
          <section className={t.card} aria-busy="true" aria-label="טוען">
            <Skeleton className={cx(t.skLine, 'w-2/3')} />
            <Skeleton className={cx(t.skLine, 'w-1/3')} />
            <Skeleton className="h-20 !rounded-xl" />
          </section>
        )}
        {slot?.kind === 'openFailed' && (
          <section className={t.card}>
            <ErrorState title={TEACH_TEXT.openFailed} text={slot.text} onRetry={onRetryOpen} tight />
          </section>
        )}
        {slot?.kind === 'thread' && (
          <TeachCard
            // A new answer of the bot is a new card: it comes in again, part after part.
            key={`${slot.thread.id}-${slot.version}`}
            version={slot.version}
            thread={slot.thread}
            busy={slot.busy}
            said={slot.said}
            saidAt={slot.saidAt}
            error={slot.error}
            unsent={slot.unsent}
            previewStalled={slot.previewStalled}
            checkStalled={slot.checkStalled}
            onApprove={onApprove}
            onSay={onSay}
            onUndo={onUndo}
            onClose={onClose}
          />
        )}
      </div>

      {composerShown(slot) && <TeachComposer ref={composerRef} value={draft} error={sendError} onChange={onDraft} onSend={onSend} />}

      <TeachHistory {...history} />
    </div>
  );
});

export default TeachView;
