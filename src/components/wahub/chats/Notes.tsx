'use client';

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { BellRing, CalendarClock, Hourglass, StickyNote, X } from 'lucide-react';
import {
  NOTE_MAX,
  NOTE_NOT_SENT,
  futureChip,
  noteByLine,
  noteHeading,
  waitingChip,
} from '@/lib/wahub/futureLeads';
import type { WahubFuture, WahubNote, WahubWaitingMark } from '@/types/wahub';
import f from '../future.module.css';
import m from '../motion.module.css';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

/**
 * The small pieces of docs/WAHUB-CONTRACT-FUTURE-LEADS.md that more than one
 * screen draws: a note (ג.6) — inside the conversation, in a list, and where it
 * is written — and the two marks a row and a card carry: a future lead (ג.5)
 * and the waiting list (ד).
 */

// ---------------------------------------------------------------------------
// A note: a line of the log. It is not a message and is sent to nobody — and it looks it.
// ---------------------------------------------------------------------------

/**
 * A note inside the conversation, where it was written: across the middle — on
 * neither side, because nobody sent it — on yellow paper with a dashed edge.
 * "פתק · מי · מתי" stands over it.
 */
export function NoteRow({ note, arrived = false }: { note: WahubNote; arrived?: boolean }) {
  return (
    <div className={cx(f.noteRow, arrived && m.rise)}>
      <div className={f.note} role="note" aria-label={NOTE_NOT_SENT} title={NOTE_NOT_SENT}>
        <p className={f.noteMeta}>
          <StickyNote aria-hidden="true" />
          <span>{noteHeading(note)}</span>
        </p>
        <p className={f.noteText} dir="auto">
          {note.text}
        </p>
      </div>
    </div>
  );
}

/** The notes one under another, newest first — in the contact's card, and in a lead's details. */
export function NoteList({ notes, now, empty }: { notes: ReadonlyArray<WahubNote>; now: Date; empty?: string }) {
  if (!notes.length) return empty ? <p className={s.t2}>{empty}</p> : null;
  return (
    <ul className={f.noteList} aria-label="פתקים">
      {notes.map((note) => (
        <li key={note.id} className={f.note} title={NOTE_NOT_SENT}>
          <p className={f.noteText} dir="auto">
            {note.text}
          </p>
          <p className={cx(f.noteMeta, '!mb-0 mt-1')}>
            <span>{noteByLine(note, now)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export interface NoteBoxProps {
  /** Who the note is about — for a reader that does not see the page. */
  name: string;
  text: string;
  saving: boolean;
  /** Why the last save did not happen, in the server's words. */
  error: string;
  onText: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * Where a note is written: in place of the writing box, on the note's own
 * paper, with its own words on the button — so what is typed here is never
 * taken for a message on its way out. Enter saves, Shift+Enter breaks the
 * line, Escape puts it away.
 */
export function NoteBox({ name, text, saving, error, onText, onSave, onClose }: NoteBoxProps) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  // The box grows with what is typed, up to a few lines.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [text]);

  const ready = Boolean(text.trim()) && !saving;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onSave();
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (ready) onSave();
    }
  };

  return (
    <form className={f.noteBox} onSubmit={submit} aria-label="פתק על הלקוח">
      <p className={f.noteBoxHead}>
        <StickyNote aria-hidden="true" />
        <span>
          <strong>פתק</strong> · רק הצוות רואה, לא נשלח ללקוח
        </span>
        <button type="button" onClick={onClose} disabled={saving} aria-label="סגור את הפתק" title="סגור" className={cx(s.ib, s.ibSm)}>
          <X aria-hidden="true" />
        </button>
      </p>
      <div className={f.noteBoxLine}>
        <textarea
          ref={field}
          value={text}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={onKey}
          rows={1}
          maxLength={NOTE_MAX}
          disabled={saving}
          dir="auto"
          placeholder="למשל: אמא ביקשה שנחזור אחרי החגים"
          aria-label={`פתק על ${name}`}
          autoFocus
        />
        <button type="submit" disabled={!ready} className={cx(s.btn, s.btnP)}>
          {saving && <Spinner />}
          שמור פתק
        </button>
      </div>
      {error && (
        <p className={f.formError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// The marks a row carries
// ---------------------------------------------------------------------------

/**
 * A future lead on a row of the list: "ליד עתידי · 1.12", and beside it — quietly, cut where the row ends —
 * the reason and whose lead it is. Full gold once its day has come or the customer wrote.
 */
export function FutureRowMark({ future, today, now }: { future: WahubFuture; today: string; now: Date }) {
  const chip = futureChip(future, today, now);
  const why = [chip.reason, chip.by].filter(Boolean).join(' · ');
  return (
    <>
      <span className={cx(s.rowTag, f.mark, chip.loud ? f.markLoud : f.markQuiet)} title={chip.line}>
        <CalendarClock aria-hidden="true" />
        {chip.label} · {chip.when}
      </span>
      {why && (
        <span className={cx(s.t2, f.rowWhy)} dir="auto">
          {why}
        </span>
      )}
    </>
  );
}

/** The waiting list on a row: the server's own title, cut with three dots where the row ends. Green once a place was freed. */
export function WaitingRowMark({ mark }: { mark: WahubWaitingMark }) {
  const chip = waitingChip(mark);
  return (
    <span className={cx(s.rowTag, f.mark, f.markClip, chip.loud ? f.markFreed : f.markQuiet)} title={chip.text} dir="auto">
      {chip.text}
      {chip.more ? ` · ${chip.more}` : ''}
    </span>
  );
}

/** The waiting list in the contact's card: the same title, whole — there is room for the lesson's name. */
export function WaitingCardMark({ mark }: { mark: WahubWaitingMark }) {
  const chip = waitingChip(mark);
  return (
    <p className={cx(f.cardMark, chip.loud && f.cardMarkFreed)}>
      {chip.loud ? <BellRing aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
      <span dir="auto">
        {chip.text}
        {chip.more ? ` · ${chip.more}` : ''}
      </span>
    </p>
  );
}
