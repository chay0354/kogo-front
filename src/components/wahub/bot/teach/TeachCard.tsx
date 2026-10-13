'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, HelpCircle, Info, MessagesSquare, Sparkles, Undo2, X } from 'lucide-react';
import { sendOnEnter } from '@/lib/wahub/demo';
import {
  TEACH_MAX_LENGTH,
  TEACH_TEXT,
  checkLine,
  conflictLine,
  exampleView,
  plainOfTeachChange,
  teachAsk,
  teachStands,
  thinkingNote,
  undoneLine,
  type CheckLine,
  type TeachAsk,
} from '@/lib/wahub/teach';
import { UNKNOWN_TEXT } from '@/lib/wahub/unknowns';
import type { WahubTeachPreview, WahubTeachQuote, WahubTeachSummary, WahubTeachThread } from '@/types/wahubTeach';
import PlainCard from '../../refine/PlainCard';
import { Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { Bubble, Dots, Rise, useAutoGrow } from './parts';
import t from './teach.module.css';

export type TeachBusy = 'approving' | 'saying' | 'undoing' | null;

/** His own words at the top of the card: a line, and all of it on a press. */
export function Wrote({ text, open = false }: { text: string; open?: boolean }) {
  if (!text) return null;
  return (
    <details className={t.wrote} open={open || undefined}>
      <summary>
        <b>{TEACH_TEXT.wrote}</b>
        <span dir="auto">{text}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <p className={t.wroteText} dir="auto">
        {text}
      </p>
    </details>
  );
}

/**
 * Where the thread was born, when it was not written freely — "מתוך שיחה עם דנה לוי" — with the way to that
 * conversation, and the marked messages it was written about, folded (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.4.2).
 */
export function Origin({ thread }: { thread: Pick<WahubTeachThread, 'origin' | 'quotes'> }) {
  const { origin, quotes } = thread;
  if (!origin) return null;
  return (
    <div className={t.origin}>
      <p className={t.originLine}>
        {/* A topic of "מה הבוט לא ידע השבוע" has no conversation behind it — and so no way to one. */}
        {origin.kind === 'unknown' ? <HelpCircle aria-hidden="true" /> : <MessagesSquare aria-hidden="true" />}
        <span dir="auto">{origin.label}</span>
        {origin.link && (
          <Link href={origin.link} className={t.originLink}>
            {TEACH_TEXT.toConversation}
          </Link>
        )}
      </p>
      {quotes && quotes.length > 0 && <Quotes quotes={quotes} />}
    </div>
  );
}

function Quotes({ quotes }: { quotes: ReadonlyArray<WahubTeachQuote> }) {
  return (
    <details className={t.more}>
      <summary>
        {TEACH_TEXT.quotes}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={t.moreBody}>
        {quotes.map((quote, index) => (
          <p key={`${quote.id ?? 'q'}-${index}`} className={t.quote} dir="auto">
            <b>{quote.who_label}</b>
            {quote.text}
          </p>
        ))}
      </div>
    </details>
  );
}

/** The system's first words on the marked piece — three short lines, each under its own small title. */
function OpeningSummary({ summary }: { summary: WahubTeachSummary }) {
  const rows = [
    { title: 'מה קרה', text: summary.what_happened },
    { title: 'מה נענה', text: summary.what_was_answered },
    { title: 'מה נראה לא טוב', text: summary.suspected_issue ?? '' },
  ].filter((row) => row.text);
  if (!rows.length) return null;
  return (
    <div className={t.opening}>
      <p className={t.openingMark}>
        <Sparkles aria-hidden="true" />
        {TEACH_TEXT.summaryMark}
      </p>
      <dl className={t.openingRows}>
        {rows.map((row) => (
          <div key={row.title}>
            <dt>{row.title}</dt>
            <dd dir="auto">{row.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "הבוט חושב", with a second quiet line once the wait grows long. */
export function Thinking({ since, label = TEACH_TEXT.thinking }: { since: number; label?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Date.now() - since);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  const note = thinkingNote(elapsed);
  return (
    <div className={t.thinking} role="status" aria-live="polite">
      <span className={t.thinkingLine}>
        {label}
        <Dots />
      </span>
      {/* The line keeps its height from the start, so nothing under it moves when the words come. */}
      <p className={t.thinkingNote}>{note && <span key={note}>{note}</span>}</p>
    </div>
  );
}

/** The card while a new explanation is with the bot: what he wrote, and the dots. */
export function ThinkingCard({ wrote, since }: { wrote: string; since: number }) {
  return (
    <section className={t.card} aria-label={TEACH_TEXT.thinking}>
      <Wrote text={wrote} />
      <Thinking since={since} />
    </section>
  );
}

/** "דוגמה": a customer asks, what the bot answers today, and what it would answer after the change. */
export function Example({ preview, applied, stalled }: { preview: WahubTeachPreview | null; applied: boolean; stalled: boolean }) {
  const view = exampleView(preview, { applied, stalled });
  if (!view) return null;
  const nothing = view.before.state === 'missing' && view.after.state === 'missing';
  return (
    <section aria-label={TEACH_TEXT.example_title}>
      <h4 className={t.label}>{TEACH_TEXT.example_title}</h4>
      {!nothing && (
        <div className={t.example}>
          <Bubble who={TEACH_TEXT.asks} tone="customer" text={view.question} />
          {view.before.state !== 'missing' && (
            <Bubble
              who={TEACH_TEXT.today}
              tone="today"
              coming={view.before.state === 'coming'}
              text={view.before.state === 'ready' ? view.before.text : undefined}
            />
          )}
          {view.after.state !== 'missing' && (
            <Bubble
              who={view.afterLabel}
              tone="after"
              coming={view.after.state === 'coming'}
              text={view.after.state === 'ready' ? view.after.text : undefined}
            />
          )}
        </div>
      )}
      {view.note && <p className={cx(t.text, t.quiet, !nothing && 'mt-2')}>{view.note}</p>}
    </section>
  );
}

const CHECK_TONE: Record<CheckLine['tone'], string> = { good: t.checkGood, bad: t.checkBad, wait: t.checkWait, quiet: t.checkQuiet };

/** The one line under "נשמר ✓": the bot was really asked again, and this is how it went. */
export function CheckRow({ line }: { line: CheckLine }) {
  return (
    <p className={cx(t.check, CHECK_TONE[line.tone], 'm-0')} role="status">
      {line.tone === 'good' && <CheckCircle2 aria-hidden="true" />}
      {line.tone === 'bad' && <AlertCircle aria-hidden="true" />}
      {line.tone === 'quiet' && <Info aria-hidden="true" />}
      <span>{line.text}</span>
      {line.tone === 'wait' && <Dots className="mt-2" />}
    </p>
  );
}

/** A short field inside the card: "מה לתקן?", or the answer to the bot's question. Enter sends. */
function ShortField({
  label,
  placeholder,
  sendLabel,
  busy,
  autoFocus,
  initial = '',
  onSend,
  onCancel,
}: {
  label: string;
  placeholder: string;
  sendLabel: string;
  busy: boolean;
  autoFocus: boolean;
  /** What he wrote and could not be sent: back in the field, so nothing typed is lost. */
  initial?: string;
  onSend: (text: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const box = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(box, text);
  useEffect(() => {
    if (autoFocus) box.current?.focus({ preventScroll: false });
  }, [autoFocus]);
  const ready = text.trim().length > 0 && !busy;
  const send = () => {
    if (ready) onSend(text.trim());
  };
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label className={t.field}>
        <span className={t.srOnly}>{label}</span>
        <textarea
          ref={box}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => sendOnEnter(event, send)}
          rows={1}
          maxLength={TEACH_MAX_LENGTH}
          placeholder={placeholder}
          className={t.box}
          dir="auto"
        />
      </label>
      <div className={t.actions}>
        <button type="submit" disabled={!ready} className={cx(s.btn, s.btnP, t.big)}>
          {sendLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className={cx(s.btn, t.big)}>
            {TEACH_TEXT.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

export interface TeachCardViewProps {
  thread: WahubTeachThread;
  busy: TeachBusy;
  /** What he just wrote back ("לא בדיוק…", or an answer), while the bot reads it. */
  said: string;
  /** When the bot started reading it. */
  saidAt: number;
  /** Why the last press did not go through. */
  error: string;
  /** What he wrote back and could not be sent: the short field opens with it. */
  unsent: string;
  /** The screen stopped asking for the example / the check: the part will not come by itself. */
  previewStalled: boolean;
  checkStalled: boolean;
  /** "לא בדיוק" was pressed: the short field is open. */
  fixing: boolean;
  /** "בטל את השינוי" was pressed: the question stands before anything is taken back. */
  confirmingUndo: boolean;
  onApprove: () => void;
  onSay: (text: string) => void;
  onUndo: () => void;
  onFixing: (open: boolean) => void;
  onConfirmingUndo: (open: boolean) => void;
  onClose: () => void;
  /**
   * The card stands in the small chat of "דיוק", inside the conversation it was born of: the marked messages
   * are quoted right above it, and it closes with the chat — so neither is said again on the card.
   */
  inChat?: boolean;
}

/** The changes of the thread, each as the section's one readable card. */
function Changes({ thread, label }: { thread: WahubTeachThread; label: string }) {
  if (!thread.changes.length) return null;
  return (
    <section aria-label={label} className={t.changes}>
      {thread.changes.map((change, index) => {
        const stands = teachStands(change);
        return (
          <PlainCard
            key={change.proposal_id ?? index}
            model={plainOfTeachChange(change)}
            stands={stands}
            className={cx(t.change, stands === 'applied' && t.changeKept, (stands === 'undone' || stands === 'rejected') && t.changeGone)}
          />
        );
      })}
    </section>
  );
}

function Notes({ notes }: { notes: ReadonlyArray<string> }) {
  if (!notes.length) return null;
  return (
    <ul className={t.notes}>
      {notes.map((note) => (
        <li key={note}>
          <Info aria-hidden="true" />
          <span dir="auto">{note}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Why nobody understood, when nobody did — with who answered and how it ended.
 * Folded, and there only when something went wrong: each change already has its
 * own folded details, and this is the only place such words are written.
 */
function Technical({ thread }: { thread: WahubTeachThread }) {
  if (!thread.technical.reason) return null;
  const rows = [
    { label: 'סיבה', value: thread.technical.reason },
    { label: 'מי ענה', value: thread.technical.model },
    { label: 'מה קרה', value: thread.technical.outcome },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  return (
    <details className={t.more}>
      <summary>
        {TEACH_TEXT.technical}
        <ChevronDown aria-hidden="true" />
      </summary>
      <dl className={cx(t.tech, 'mt-2')}>
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt>{row.label}</dt>
            <dd>
              <span className={t.code}>{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const CLOSE_HINT: Record<TeachAsk, string> = {
  answer: TEACH_TEXT.closeHint,
  approve: TEACH_TEXT.closeHint,
  stuck: TEACH_TEXT.closeHint,
  saved: TEACH_TEXT.close,
  undone: TEACH_TEXT.close,
  nothing: TEACH_TEXT.close,
};

/**
 * The bot's answer to an explanation, as ONE card and not as chat bubbles
 * (contract, ב.2): what it understood, what would change, an example, a line
 * of warning when this differs from what it knows today — and two buttons.
 * When the bot needs something cleared up, only its one question and a field.
 * After "מאשר": "נשמר ✓" and the line of the check.
 *
 * It keeps nothing itself: where it stands is the thread, and what is open on
 * it (the short field, the question before an undo) is handed in.
 */
export function TeachCardView({
  thread,
  busy,
  said,
  saidAt,
  error,
  unsent,
  previewStalled,
  checkStalled,
  fixing,
  confirmingUndo,
  onApprove,
  onSay,
  onUndo,
  onFixing,
  onConfirmingUndo,
  onClose,
  inChat = false,
}: TeachCardViewProps) {
  const ask = teachAsk(thread);
  const reading = busy === 'saying';
  const check = ask === 'saved' ? checkLine(thread.check, { stalled: checkStalled }) : null;
  // What the bot understood; when nobody understood (no connection, or the change was turned down), what it said.
  const understood = thread.understood || thread.reply;
  let order = 0;
  // The card ends in a foot (buttons, a field, the dots): a phone keeps the foot in reach, above the bottom bar.
  const footed = reading || ask === 'answer' || ask === 'approve' || ask === 'stuck' || (ask === 'saved' && Boolean(check?.failed) && thread.can_undo);

  return (
    <section className={cx(t.card, footed && t.cardFooted, inChat && t.inChat)} aria-label={ask === 'saved' ? TEACH_TEXT.saved : TEACH_TEXT.understood}>
      {(thread.text || !inChat) && (
        <div className={t.cardTop}>
          <div className={t.cardTopMain}>
            <Wrote text={thread.text} />
          </div>
          {!inChat && (
            <button type="button" onClick={onClose} className={t.close} aria-label={CLOSE_HINT[ask]} title={CLOSE_HINT[ask]}>
              <X aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {/* Taught from inside a conversation: said quietly, with the way back to it and what it was written about. */}
      {!inChat && <Origin thread={thread} />}

      <div className={cx('flex flex-col gap-4', reading && t.dim)} aria-busy={reading || undefined}>
        {ask === 'answer' && thread.summary ? (
          // "דיוק" on marked messages: the system speaks first — it sums the piece up, and asks what was wrong.
          <>
            <Rise order={order++}>
              <OpeningSummary summary={thread.summary} />
            </Rise>
            <Rise order={order++}>
              <p className={t.lead} dir="auto">
                {thread.question || TEACH_TEXT.whatWasWrong}
              </p>
            </Rise>
          </>
        ) : (
          ask === 'answer' && (
            <Rise order={order++}>
              <h4 className={t.label}>{TEACH_TEXT.question}</h4>
              <p className={t.lead} dir="auto">
                {thread.question || thread.reply}
              </p>
            </Rise>
          )
        )}

        {(ask === 'approve' || ask === 'stuck') && (
          <>
            {understood && (
              <Rise order={order++}>
                <h4 className={t.label}>{TEACH_TEXT.understood}</h4>
                <p className={t.lead} dir="auto">
                  {understood}
                </p>
              </Rise>
            )}
            {thread.changes.length > 0 && (
              <Rise order={order++}>
                <Changes thread={thread} label={TEACH_TEXT.changes} />
              </Rise>
            )}
            {thread.preview && (
              <Rise order={order++}>
                <Example preview={thread.preview} applied={false} stalled={previewStalled} />
              </Rise>
            )}
            {thread.conflicts.length > 0 && (
              <Rise order={order++} className={t.heed}>
                <p>
                  <AlertTriangle aria-hidden="true" />
                  {TEACH_TEXT.heed}
                </p>
                <ul>
                  {thread.conflicts.map((conflict) => (
                    <li key={conflictLine(conflict)} dir="auto">
                      {conflictLine(conflict)}
                    </li>
                  ))}
                </ul>
              </Rise>
            )}
            {thread.notes.length > 0 && (
              <Rise order={order++}>
                <Notes notes={thread.notes} />
              </Rise>
            )}
          </>
        )}

        {ask === 'saved' && (
          <>
            <div className={t.savedHead}>
              <span className={t.tick} aria-hidden="true">
                <Check />
              </span>
              <div className="min-w-0">
                <p className={cx(t.savedTitle, 'm-0')}>{TEACH_TEXT.saved}</p>
                <p className={cx(t.savedSub, 'm-0')}>{TEACH_TEXT.savedLine}</p>
              </div>
            </div>
            {understood && (
              <p className={t.lead} dir="auto">
                {understood}
              </p>
            )}
            {check && <CheckRow line={check} />}
            {thread.check && thread.check.details.length > 0 && !thread.check.pending && (
              <details className={t.more}>
                <summary>
                  {TEACH_TEXT.checkDetails}
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div className={t.moreBody}>
                  {thread.check.details.map((row, index) => (
                    <div key={`${row.question}-${index}`} className={t.example}>
                      {row.question && <Bubble who={TEACH_TEXT.asked} tone="customer" text={row.question} />}
                      {row.answer && <Bubble who={TEACH_TEXT.botAnswered} tone="after" text={row.answer} marked={!row.passed} />}
                      {row.line && (
                        <p className={cx(t.text, row.passed ? t.quiet : s.badText)} dir="auto">
                          {row.passed ? '✓' : '✗'} {row.line}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {(thread.changes.length > 0 || thread.preview) && (
              <details className={t.more}>
                <summary>
                  מה השתנה
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div className={t.moreBody}>
                  <Changes thread={thread} label="מה השתנה" />
                  <Example preview={thread.preview} applied stalled={previewStalled} />
                </div>
              </details>
            )}
            <Notes notes={thread.notes} />
          </>
        )}

        {ask === 'undone' && (
          <>
            <div className={t.savedHead}>
              <span className={cx(t.tick, t.tickGone)} aria-hidden="true">
                <Undo2 />
              </span>
              <p className={cx(t.savedTitle, 'm-0')}>{TEACH_TEXT.undone}</p>
            </div>
            <p className={t.text} dir="auto">
              {undoneLine(thread)}
            </p>
            {thread.changes.length > 0 && (
              <details className={t.more}>
                <summary>
                  מה בוטל
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div className={t.moreBody}>
                  <Changes thread={thread} label="מה בוטל" />
                </div>
              </details>
            )}
          </>
        )}

        {ask === 'nothing' && (
          <>
            <p className={t.lead} dir="auto">
              {thread.reply || thread.understood || TEACH_TEXT.nothing}
            </p>
            <Notes notes={thread.notes} />
          </>
        )}
      </div>

      <Technical thread={thread} />

      {error && (
        <p className={t.cardError} role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {/* The foot: what is asked of him now. One thing at a time. */}
      {reading ? (
        <div className={t.foot}>
          <Wrote text={said} open />
          <Thinking since={saidAt} />
        </div>
      ) : ask === 'answer' ? (
        <div className={t.foot}>
          <ShortField
            // Opened on a topic the bot did not know: the one thing asked of him is the right answer.
            label={thread.origin?.kind === 'unknown' ? UNKNOWN_TEXT.answerHere : TEACH_TEXT.answerHere}
            placeholder={thread.origin?.kind === 'unknown' ? UNKNOWN_TEXT.answerHere : TEACH_TEXT.answerHere}
            sendLabel={TEACH_TEXT.sendAnswer}
            busy={busy !== null}
            autoFocus
            initial={unsent}
            onSend={onSay}
          />
        </div>
      ) : ask === 'approve' || ask === 'stuck' ? (
        <div className={t.foot}>
          {fixing ? (
            <ShortField
              label={TEACH_TEXT.whatToFix}
              placeholder={TEACH_TEXT.whatToFix}
              sendLabel={TEACH_TEXT.sendFix}
              busy={busy !== null}
              autoFocus
              initial={unsent}
              onSend={onSay}
              onCancel={() => onFixing(false)}
            />
          ) : (
            <>
              <p className={t.footNote}>
                {busy === 'approving' ? 'שומר, ובודק שהבוט באמת עונה כך. זה לוקח עד דקה' : TEACH_TEXT.nothingYet}
              </p>
              <div className={t.actions}>
                {ask === 'approve' && (
                  <button type="button" onClick={onApprove} disabled={busy !== null} className={cx(s.btn, s.btnP, t.big)}>
                    {busy === 'approving' ? <Spinner /> : <Check aria-hidden="true" />}
                    {busy === 'approving' ? TEACH_TEXT.saving : TEACH_TEXT.approve}
                  </button>
                )}
                <button type="button" onClick={() => onFixing(true)} disabled={busy !== null} className={cx(s.btn, t.big)}>
                  {TEACH_TEXT.notQuite}
                </button>
              </div>
            </>
          )}
        </div>
      ) : ask === 'saved' && check?.failed && thread.can_undo ? (
        <div className={t.foot}>
          {confirmingUndo ? (
            <>
              <p className={cx(t.text, 'm-0')}>{TEACH_TEXT.undoAsk}</p>
              <div className={t.actions}>
                <button type="button" onClick={onUndo} disabled={busy !== null} className={cx(s.btn, s.btnP, t.big)}>
                  {busy === 'undoing' && <Spinner />}
                  {TEACH_TEXT.undoChange}
                </button>
                <button type="button" onClick={() => onConfirmingUndo(false)} disabled={busy !== null} className={cx(s.btn, t.big)}>
                  {TEACH_TEXT.keep}
                </button>
              </div>
            </>
          ) : (
            <div className={t.actions}>
              <button type="button" onClick={() => onConfirmingUndo(true)} disabled={busy !== null} className={cx(s.btn, t.big)}>
                <Undo2 aria-hidden="true" />
                {TEACH_TEXT.undoChange}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

type TeachCardProps = Omit<TeachCardViewProps, 'fixing' | 'confirmingUndo' | 'onFixing' | 'onConfirmingUndo'> & {
  /** Changes when a new answer of the bot arrives: what was open on the card closes. */
  version: number;
};

/** The card with what is open on it: the short field of "לא בדיוק", and the question before an undo. */
export default function TeachCard({ version, ...props }: TeachCardProps) {
  const [fixing, setFixing] = useState(Boolean(props.unsent));
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  useEffect(() => {
    setFixing(false);
    setConfirmingUndo(false);
  }, [version, props.thread.id]);
  // A correction that could not be sent: the field is open again, with his words in it.
  useEffect(() => {
    if (props.unsent) setFixing(true);
  }, [props.unsent]);
  return (
    <TeachCardView
      {...props}
      fixing={fixing}
      confirmingUndo={confirmingUndo}
      onFixing={setFixing}
      onConfirmingUndo={setConfirmingUndo}
    />
  );
}
