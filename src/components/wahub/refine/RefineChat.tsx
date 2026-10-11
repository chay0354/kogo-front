'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AlertCircle, ArrowRight, ChevronDown, Clock, Crosshair, History, Send, Sparkles, X } from 'lucide-react';
import { sendOnEnter } from '@/lib/wahub/demo';
import { formatDateTime } from '@/lib/wahub/format';
import {
  REFINE_TEXT,
  SUMMARY_TEXT,
  awaitsFirstWords,
  changeKey,
  excerptPreview,
  excerptTitle,
  refinePlaceholder,
  summaryRows,
  threadTitle,
  type RefineChatState,
  type RefineExcerptLine,
  type RefineWho,
} from '@/lib/wahub/refine';
import type { WahubRefineSummary, WahubRefineThread } from '@/types/wahubRefine';
import { useNow } from '../hooks/useNow';
import { Spinner } from '../shared/bits';
import { RowsSkeleton } from '../shared/loading';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import ChangeCard from './ChangeCard';
import type { RefineTarget } from './RefineContext';
import r from './refine.module.css';
import { useRefineChat } from './useRefineChat';

const MAX_LENGTH = 2000;

const LINE_TONE: Record<RefineWho, string> = {
  customer: r.lineCustomer,
  bot: '',
  new_bot: r.lineNewBot,
  office: r.lineOffice,
  system: r.lineSystem,
  shadow: r.lineShadow,
};

/** The marked piece of the conversation (or the proposal): folded to its title and one line; the rest on a press. */
function Excerpt({ lines, count, title }: { lines: ReadonlyArray<RefineExcerptLine>; count: number; title?: string }) {
  const unseen = Math.max(0, count - lines.filter((line) => line.id !== null).length);
  return (
    <details className={r.fold}>
      <summary>
        <span className={r.foldTitle}>{title ?? excerptTitle(count)}</span>
        <span className={r.foldPreview} dir="auto">
          {excerptPreview(lines)}
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={r.foldBody}>
        {lines.map((line, index) => (
          <div key={`${line.id ?? 'x'}-${index}`} className={cx(r.line, LINE_TONE[line.who])}>
            <span className={r.lineWho}>{line.label}</span>
            <p className={r.lineText} dir="auto">
              {line.text}
            </p>
          </div>
        ))}
        {unseen > 0 && (
          <p className={cx(s.t2, 'm-0')}>
            {unseen === 1 ? 'הודעה אחת מהקטע לא מוצגת כאן.' : `${unseen} הודעות מהקטע לא מוצגות כאן.`}
          </p>
        )}
      </div>
    </details>
  );
}

/** The conversation's earlier threads: a title and a count; the list on a press. */
function EarlierThreads({
  threads,
  openId,
  reading,
  now,
  disabled,
  onOpen,
  onNew,
}: {
  threads: ReadonlyArray<WahubRefineThread>;
  openId: number | null;
  /** One of them is open: the way back to what was just marked is offered too. */
  reading: boolean;
  now: Date;
  disabled: boolean;
  onOpen: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <details className={r.fold}>
      <summary>
        <History aria-hidden="true" />
        <span className={r.foldTitle}>
          דיוקים קודמים בשיחה <span className={s.num}>({threads.length})</span>
        </span>
        <span className="flex-1" />
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={r.foldBody}>
        {threads.map((thread) => {
          const changed = thread.changes.filter((change) => change.applied).length;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onOpen(thread.id)}
              disabled={disabled}
              aria-current={thread.id === openId ? 'true' : undefined}
              className={cx(r.threadRow, thread.id === openId && r.threadRowOn)}
            >
              <strong dir="auto">{threadTitle(thread)}</strong>
              <span>
                {[
                  formatDateTime(thread.created_at, now),
                  thread.created_by_name,
                  changed === 1 ? 'שינוי אחד' : changed > 1 ? `${changed} שינויים` : thread.needs_answer ? 'מחכה לתשובה' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          );
        })}
        {reading && (
          <button type="button" onClick={onNew} disabled={disabled} className={cx(s.link, 'self-start text-[12.5px]')}>
            דיוק חדש על מה שסימנתי
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * "סיכום חכם" — the system's first words on the marked piece: three short
 * lines, each under its own small title (the third only when something looked
 * wrong), and then the question the box under it answers.
 */
function SummaryBubble({ summary, ask }: { summary: WahubRefineSummary; ask: string | null }) {
  return (
    <div className={cx(r.turn, r.turnSys, r.turnSummary)}>
      <p className={r.turnMeta}>
        המערכת
        <span className={r.summaryMark}>
          <Sparkles aria-hidden="true" />
          {SUMMARY_TEXT.mark}
        </span>
      </p>
      <dl className={r.summary}>
        {summaryRows(summary).map((row) => (
          <div key={row.key} className={cx(r.summaryRow, row.key === 'issue' && r.summaryIssue)}>
            <dt>{row.title}</dt>
            <dd dir="auto">{row.text}</dd>
          </div>
        ))}
      </dl>
      {ask && <p className={r.summaryAsk}>{ask}</p>}
    </div>
  );
}

export interface RefineChatViewProps {
  contactName: string;
  /** The marked piece of the conversation, and how many messages it holds. */
  excerpt: ReadonlyArray<RefineExcerptLine>;
  excerptCount: number;
  /** What the quoted piece is called, when it is not marked messages. */
  heading?: string;
  /** The chat is on a proposal, not on messages: it asks "מה לשנות בהצעה?". */
  onProposal?: boolean;
  state: RefineChatState;
  threads: ReadonlyArray<WahubRefineThread>;
  /** "בדקו שוב" is waiting for the server. */
  checking: boolean;
  /** Drawn in a place a screen made for it (over the contact's card), not as a drawer of the page. */
  docked?: boolean;
  draft: string;
  now: Date;
  fieldRef?: RefObject<HTMLTextAreaElement>;
  bodyRef?: RefObject<HTMLDivElement>;
  onDraft: (value: string) => void;
  onSend: () => void;
  onUndo: (index: number) => void;
  onOpenThread: (id: number) => void;
  onNewThread: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * The small chat as it is drawn — everything it shows comes in from outside,
 * so it can be drawn (and pressed) without a server.
 *
 * Top to bottom: the marked piece of the conversation, folded; the earlier
 * threads, folded; what the operator wrote and what the system answered, with
 * a card for each change; and the box to write in.
 */
export function RefineChatView({
  contactName,
  excerpt,
  excerptCount,
  heading,
  onProposal = false,
  state,
  threads,
  checking,
  docked = false,
  draft,
  now,
  fieldRef,
  bodyRef,
  onDraft,
  onSend,
  onUndo,
  onOpenThread,
  onNewThread,
  onRetry,
  onClose,
}: RefineChatViewProps) {
  const unavailable = state.phase === 'unavailable';
  const waiting = state.phase === 'thinking' || state.phase === 'summarizing';
  const busy = waiting || state.phase === 'loading';
  // The system spoke first (the smart summary) and she has not written yet: the question is still the first one.
  const firstWords = awaitsFirstWords(state);
  const firstQuestion = onProposal ? SUMMARY_TEXT.askProposal : SUMMARY_TEXT.ask;
  // An earlier thread was opened from the list. The thread being written now is not "earlier" and is not listed.
  const reading = state.openedMessageIds !== null;
  const earlier = reading ? threads : threads.filter((thread) => thread.id !== state.threadId);
  const lastSystem = state.bubbles.reduce((found, bubble, index) => (bubble.role === 'system' ? index : found), -1);
  const cards = state.changes.length > 0 && (
    <div className={r.changes} role="group" aria-label="השינויים בידע של הבוט">
      {state.changes.map((change, index) => {
        const key = changeKey(change, index);
        return (
          <ChangeCard
            key={key}
            change={change}
            busy={state.undoing === key || state.undoing === 'all'}
            locked={state.undoing !== null || busy}
            waitingNote={state.needsAnswer ? undefined : 'עוד לא נכנס לידע. מחכה לאישור בכפתור "יש הצעות לעדכון הבוט".'}
            onUndo={() => onUndo(index)}
          />
        );
      })}
    </div>
  );

  return (
    <aside role="dialog" aria-label="דיוק" className={cx(r.drawer, docked && r.drawerDocked)}>
      <header className={r.drawerHead}>
        <button type="button" onClick={onClose} aria-label="חזרה לשיחה" className={cx(s.ib, r.backBtn)}>
          <ArrowRight aria-hidden="true" />
        </button>
        <Crosshair aria-hidden="true" />
        <div className={r.drawerTitle}>
          <h2>דיוק</h2>
          {(onProposal || contactName) && <span dir="auto">{onProposal ? 'על הצעה לעדכון הבוט' : contactName}</span>}
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className={cx(s.ib, s.ibSm, r.closeBtn)}>
          <X aria-hidden="true" />
        </button>
      </header>

      <div ref={bodyRef} className={r.drawerBody}>
        <Excerpt lines={excerpt} count={excerptCount} title={heading} />
        {earlier.length > 0 && (
          <EarlierThreads
            threads={earlier}
            openId={state.threadId}
            reading={reading}
            now={now}
            disabled={busy}
            onOpen={onOpenThread}
            onNew={onNewThread}
          />
        )}

        {state.phase === 'loading' ? (
          // An earlier thread on its way: the shape of what is coming, as everywhere in the section.
          <RowsSkeleton rows={3} tall label="טוען את הדיוק" />
        ) : unavailable ? (
          <div className={r.notice} role="status">
            <Clock aria-hidden="true" />
            <h3>{REFINE_TEXT.notBuiltTitle}</h3>
            <p>{REFINE_TEXT.notBuilt}</p>
            <button type="button" onClick={onRetry} disabled={checking} className={cx(s.btn, s.btnSm)}>
              {checking && <Spinner className="h-3.5 w-3.5" />}
              בדקו שוב
            </button>
          </div>
        ) : (
          <div className={r.turns} aria-live="polite" aria-label="הדיוק">
            {state.bubbles.length === 0 && !busy && (
              <p className={cx(s.t2, 'm-0 !text-[13px] leading-relaxed')}>
                כתבו במילים שלכם{' '}
                <strong className="font-extrabold text-[var(--ink)]">{onProposal ? 'מה לשנות בהצעה' : 'מה לא היה טוב ולמה'}</strong>.
                המערכת מבינה ומתקנת {onProposal ? 'אותה' : 'את הבוט'}.
              </p>
            )}
            {state.bubbles.map((bubble, index) => {
              if (bubble.role === 'operator') {
                return (
                  <div key={bubble.key} className={cx(r.turn, r.turnOp, bubble.pending && r.turnPending)}>
                    <p dir="auto">{bubble.text}</p>
                  </div>
                );
              }
              const asking = state.needsAnswer && index === lastSystem;
              return (
                <div key={bubble.key} className="contents">
                  {bubble.summary ? (
                    // The question stands under the summary only while it is the one being asked.
                    <SummaryBubble summary={bubble.summary} ask={index === lastSystem && firstWords ? firstQuestion : null} />
                  ) : (
                    <div className={cx(r.turn, r.turnSys, asking && r.turnAsk)}>
                      <p className={r.turnMeta}>
                        המערכת
                        {asking && <span className={r.askMark}>שאלה</span>}
                      </p>
                      <p dir="auto">{bubble.text}</p>
                    </div>
                  )}
                  {index === lastSystem && cards}
                </div>
              );
            })}
            {/* No answer in words yet, and still there are changes to show (an earlier thread, read back). */}
            {lastSystem === -1 && cards}
            {waiting && (
              <div className={cx(r.turn, r.turnSys)} role="status">
                <p className="flex items-center gap-2">
                  <span className={r.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  {state.phase === 'summarizing' ? REFINE_TEXT.summarizing : REFINE_TEXT.thinking}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className={r.drawerFoot}>
        {state.error && (
          <p className={r.failLine} role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{state.error}</span>
          </p>
        )}
        <div className={r.writeLine}>
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => sendOnEnter(event, onSend)}
            rows={2}
            maxLength={MAX_LENGTH}
            dir="auto"
            enterKeyHint="send"
            disabled={unavailable}
            placeholder={refinePlaceholder(state, onProposal)}
            aria-label={state.needsAnswer && !firstWords ? 'התשובה שלך לשאלת המערכת' : firstQuestion}
            className={r.write}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={unavailable || busy || !draft.trim()}
            aria-label="שלח"
            title="שלח (Enter)"
            className={cx(s.btn, s.btnP, '!h-[40px]')}
          >
            {waiting ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
            <span className="hidden sm:inline">שלח</span>
          </button>
        </div>
      </footer>
    </aside>
  );
}

/**
 * "דיוק": the system sums up the marked messages and asks what was wrong; the
 * operator says it in her own words; the server works out the change to the
 * bot's knowledge, makes it, and says so. A drawer at the side of a desktop;
 * the whole screen of a phone.
 */
export default function RefineChat({ target, docked = false, onClose }: { target: RefineTarget; docked?: boolean; onClose: () => void }) {
  const now = useNow(60_000);
  const chat = useRefineChat(target);
  const { state } = chat;
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLTextAreaElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // The box is ready to write in on a desktop; a phone is not handed its keyboard before it asks.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) field.current?.focus();
  }, []);

  // Escape closes — unless something is typed, or on its way: that is not thrown away by one key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !draftRef.current.trim() && state.phase !== 'thinking') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, state.phase]);

  // Whatever was just said is at the bottom: keep it in view.
  useEffect(() => {
    const element = body.current;
    if (element && state.bubbles.length) element.scrollTop = element.scrollHeight;
  }, [state.bubbles.length, state.phase, state.changes]);

  async function send() {
    const text = draft.trim();
    if (!text || state.phase !== 'idle') return;
    setDraft('');
    const result = await chat.send(text);
    // Not answered: what she wrote goes back into the box (unless she has started on something else).
    if (result !== 'sent') setDraft((current) => current || text);
  }

  // An earlier thread is open: its own marked messages are quoted, as far as they are on screen.
  const opened = state.openedMessageIds;
  const excerpt = useMemo(() => {
    if (!opened) return target.excerpt;
    const wanted = new Set(opened);
    return (target.pool ?? target.excerpt).filter((line) => line.id !== null && wanted.has(line.id));
  }, [opened, target.excerpt, target.pool]);

  return (
    <RefineChatView
      contactName={target.contactName}
      excerpt={excerpt}
      excerptCount={opened ? opened.length : target.messageIds.length}
      heading={opened ? undefined : target.heading}
      onProposal={target.proposalId != null}
      state={state}
      threads={chat.threads}
      checking={chat.checking}
      docked={docked}
      draft={draft}
      now={now}
      fieldRef={field}
      bodyRef={body}
      onDraft={setDraft}
      onSend={() => void send()}
      onUndo={(index) => void chat.undo(index)}
      onOpenThread={(id) => void chat.openThread(id)}
      onNewThread={chat.newThread}
      onRetry={chat.retry}
      onClose={onClose}
    />
  );
}
