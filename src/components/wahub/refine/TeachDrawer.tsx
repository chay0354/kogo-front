'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, ChevronDown, Crosshair, History, X } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import { sendOnEnter } from '@/lib/wahub/demo';
import { formatShortDate } from '@/lib/wahub/format';
import type { RefineExcerptLine } from '@/lib/wahub/refine';
import { TEACH_MAX_LENGTH, TEACH_TEXT, teachRowTone } from '@/lib/wahub/teach';
import { startWahubTeachFromChat, teachNotBuilt, teachUnanswered } from '@/lib/wahub/teachApi';
import type { WahubTeachRow } from '@/types/wahubTeach';
import TeachCard, { Thinking } from '../bot/teach/TeachCard';
import t from '../bot/teach/teach.module.css';
import { landTeachThread, useTeachOfContact, useTeachThread } from '../bot/teach/useTeach';
import { useNow } from '../hooks/useNow';
import { ErrorState, Pill, Skeleton } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { Excerpt } from './RefineChat';
import type { RefineTarget } from './RefineContext';
import r from './refine.module.css';

/**
 * Where the small chat stands: she writes first (an answer of the bot in the shadow), the marked piece is with
 * the bot, a thread is open, the opening failed — or the server turned out not to know this door at all.
 */
export type TeachDrawerPhase =
  | { kind: 'writing'; error: string }
  | { kind: 'starting'; wrote: string; since: number }
  | { kind: 'thread'; id: number }
  | { kind: 'failed'; text: string; wrote: string }
  | { kind: 'old' };

export interface TeachDrawerViewProps {
  contactName: string;
  /** The marked piece of the conversation, quoted folded at the head. */
  excerpt: ReadonlyArray<RefineExcerptLine>;
  excerptCount: number;
  heading?: string;
  docked?: boolean;
  phase: Exclude<TeachDrawerPhase, { kind: 'old' }>;
  /** The open thread's card — or what stands in its place while it is read. */
  card: React.ReactNode;
  /** What was taught from this conversation before. */
  earlier: ReadonlyArray<WahubTeachRow>;
  openId: number | null;
  now: Date;
  draft: string;
  onDraft: (text: string) => void;
  onStart: () => void;
  onRetry: () => void;
  onOpenEarlier: (id: number) => void;
  onClose: () => void;
}

/**
 * The small chat of "דיוק" as it is drawn — the same frame it always had (the
 * marked piece folded at its head, a way back on a phone, an X on a desktop) —
 * around the one card of "ללמד". Everything comes in from outside, so it can be
 * drawn, and pressed, without a server.
 */
export function TeachDrawerView({
  contactName,
  excerpt,
  excerptCount,
  heading,
  docked = false,
  phase,
  card,
  earlier,
  openId,
  now,
  draft,
  onDraft,
  onStart,
  onRetry,
  onOpenEarlier,
  onClose,
}: TeachDrawerViewProps) {
  const others = earlier.filter((row) => row.thread !== openId);
  return (
    <aside role="dialog" aria-label="דיוק" className={cx(r.drawer, docked && r.drawerDocked)}>
      <header className={r.drawerHead}>
        <button type="button" onClick={onClose} aria-label="חזרה לשיחה" className={cx(s.ib, r.backBtn)}>
          <ArrowRight aria-hidden="true" />
        </button>
        <Crosshair aria-hidden="true" />
        <div className={r.drawerTitle}>
          <h2>דיוק</h2>
          {contactName && <span dir="auto">{contactName}</span>}
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className={cx(s.ib, s.ibSm, r.closeBtn)}>
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={r.drawerBody}>
        <Excerpt lines={excerpt} count={excerptCount} title={heading} />

        {phase.kind === 'writing' && (
          // "לתקן" on an answer of the bot: she says what was wrong with it, and only then is the bot asked.
          <form
            className={cx(t.card, t.inChat)}
            aria-label={TEACH_TEXT.writeFirst}
            onSubmit={(event) => {
              event.preventDefault();
              onStart();
            }}
          >
            <label className={t.field}>
              <span className={t.label}>{TEACH_TEXT.writeFirst}</span>
              <textarea
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={(event) => sendOnEnter(event, onStart)}
                rows={2}
                maxLength={TEACH_MAX_LENGTH}
                className={t.box}
                dir="auto"
                autoFocus
              />
            </label>
            {phase.error && (
              <p className={t.cardError} role="alert">
                <AlertCircle aria-hidden="true" />
                <span>{phase.error}</span>
              </p>
            )}
            <div className={t.actions}>
              <button type="submit" disabled={!draft.trim()} className={cx(s.btn, s.btnP, t.big)}>
                {TEACH_TEXT.send}
              </button>
            </div>
          </form>
        )}

        {phase.kind === 'starting' && (
          <section className={cx(t.card, t.inChat)} aria-label={TEACH_TEXT.thinking}>
            <Thinking since={phase.since} label={phase.wrote ? TEACH_TEXT.thinking : TEACH_TEXT.summarizing} />
          </section>
        )}

        {phase.kind === 'failed' && (
          <section className={cx(t.card, t.inChat)}>
            <ErrorState title={phase.text} onRetry={onRetry} tight />
          </section>
        )}

        {phase.kind === 'thread' && card}

        {others.length > 0 && (
          <details className={r.fold}>
            <summary>
              <History aria-hidden="true" />
              <span className={r.foldTitle}>
                {TEACH_TEXT.earlier} <span className={s.num}>({others.length})</span>
              </span>
              <span className="flex-1" />
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className={r.foldBody}>
              <ul className={t.earlier}>
                {others.map((row) => (
                  <li key={row.thread}>
                    <button type="button" onClick={() => onOpenEarlier(row.thread)} className={t.earlierRow} title={row.understood}>
                      <span className={cx(s.num, s.t2)}>{formatShortDate(row.at, now)}</span>
                      <span className={t.earlierText} dir="auto">
                        {row.understood}
                      </span>
                      <Pill tone={teachRowTone(row.state)}>{row.state_label}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </aside>
  );
}

interface TeachDrawerProps {
  target: RefineTarget;
  docked?: boolean;
  onClose: () => void;
  /** The server turned out to answer in the shape of "דיוק" (built before ח.4): the old small chat is shown instead. */
  onOld: () => void;
}

/**
 * "דיוק" inside a conversation, working together with "ללמד" (owner,
 * 13.10.2026: "הכפתור דיוק… אמור לעבוד ביחד עם הצ'אט שעשינו בבוט, ההנחיות").
 *
 * It is one mechanism (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.4): the marked
 * messages open a thread of "ללמד" — what the bot understood, what would
 * change, an example before and after, "מאשר" / "לא בדיוק", "נשמר — בדקתי N
 * שיחות", and a way to take it back — through the same card and the same code
 * as the sub-tab. Nothing is applied until "מאשר", and what is taught here is
 * listed in "מה לימדת עד היום" as "מתוך שיחה עם …".
 *
 * Marked messages: the system speaks first — it sums the piece up and asks
 * what was wrong. "לתקן" on an answer of the bot: she writes first.
 */
export default function TeachDrawer({ target, docked = false, onClose, onOld }: TeachDrawerProps) {
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const { contactId, messageIds, shadowId, summarize } = target;
  const [phase, setPhase] = useState<TeachDrawerPhase>(() =>
    summarize ? { kind: 'starting', wrote: '', since: Date.now() } : { kind: 'writing', error: '' },
  );
  const [draft, setDraft] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  const onSentRef = useRef(target.onSent);
  onSentRef.current = target.onSent;
  const onOldRef = useRef(onOld);
  onOldRef.current = onOld;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Opens the thread on what was marked — with her words, or without them (the system then speaks first). */
  const start = useCallback(
    async (text: string) => {
      if (contactId == null || inFlight.current) return;
      inFlight.current = true;
      setPhase({ kind: 'starting', wrote: text, since: Date.now() });
      try {
        const thread = await startWahubTeachFromChat({ contactId, messageIds, shadowId, text });
        landTeachThread(queryClient, thread);
        // Once she has said what was wrong with an answer, whoever opened the chat is told (it marks the answer).
        if (text) onSentRef.current?.();
        if (alive.current) setPhase({ kind: 'thread', id: thread.id });
      } catch (error) {
        if (!alive.current) return;
        if (teachNotBuilt(error)) {
          setPhase({ kind: 'old' });
          onOldRef.current();
        } else {
          const words = teachUnanswered(error) ? TEACH_TEXT.startUnknown : readableError(error, TEACH_TEXT.startFailed);
          // Her words are never lost: with something written, the box comes back with it.
          if (text) {
            setDraft((current) => current || text);
            setPhase({ kind: 'writing', error: words });
          } else {
            setPhase({ kind: 'failed', text: words, wrote: text });
          }
        }
      } finally {
        inFlight.current = false;
      }
    },
    [contactId, messageIds, queryClient, shadowId],
  );

  // Marked messages: the piece goes to the bot the moment the chat opens — once for each opening.
  const asked = useRef(false);
  useEffect(() => {
    if (!summarize || asked.current) return;
    asked.current = true;
    void start('');
  }, [start, summarize]);

  const openId = phase.kind === 'thread' ? phase.id : null;
  const teach = useTeachThread(openId);
  const earlier = useTeachOfContact(contactId, true);

  // Escape closes — unless something is typed, or on its way.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const busyRef = useRef(false);
  busyRef.current = phase.kind === 'starting' || teach.busy !== null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !draftRef.current.trim() && !busyRef.current) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (phase.kind === 'old') return null;

  const card =
    openId == null ? null : teach.thread ? (
      <TeachCard
        // A new answer of the bot is a new card: it comes in again, part after part.
        key={`${teach.thread.id}-${teach.version}`}
        version={teach.version}
        thread={teach.thread}
        busy={teach.busy}
        said={teach.said}
        saidAt={teach.saidAt}
        error={teach.error}
        unsent={teach.unsent}
        previewStalled={teach.previewStalled}
        checkStalled={teach.checkStalled}
        onApprove={teach.approve}
        onSay={teach.say}
        onUndo={teach.undo}
        onClose={onClose}
        inChat
      />
    ) : teach.openError ? (
      <section className={cx(t.card, t.inChat)}>
        <ErrorState title={TEACH_TEXT.openFailed} text={teach.openError} onRetry={teach.retry} tight />
      </section>
    ) : (
      <section className={cx(t.card, t.inChat)} aria-busy="true" aria-label="טוען">
        <Skeleton className={cx(t.skLine, 'w-2/3')} />
        <Skeleton className="h-20 !rounded-xl" />
      </section>
    );

  return (
    <TeachDrawerView
      contactName={target.contactName}
      excerpt={target.excerpt}
      excerptCount={target.messageIds.length}
      heading={target.heading}
      docked={docked}
      phase={phase}
      card={card}
      earlier={earlier.data?.results ?? []}
      openId={openId}
      now={now}
      draft={draft}
      onDraft={setDraft}
      onStart={() => {
        if (draft.trim()) {
          const text = draft.trim();
          setDraft('');
          void start(text);
        }
      }}
      onRetry={() => void start(phase.kind === 'failed' ? phase.wrote : '')}
      onOpenEarlier={(id) => setPhase({ kind: 'thread', id })}
      onClose={onClose}
    />
  );
}
