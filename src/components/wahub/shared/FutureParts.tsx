'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { BellRing, CalendarClock, Hourglass, MoreHorizontal, Pencil, StickyNote, Trash2, X } from 'lucide-react';
import {
  NOTE_MAX,
  NOTE_NOT_SENT,
  futureChip,
  noteByLine,
  noteHeading,
  waitingChip,
} from '@/lib/wahub/futureLeads';
import { canEditNote, noteEditProblem, noteEditedTitle, noteEditedWord } from '@/lib/wahub/waitingList';
import type { WahubFuture, WahubNote, WahubWaitingMark } from '@/types/wahub';
import f from '../future.module.css';
import m from '../motion.module.css';
import w from '../waiting.module.css';
import s from '../wahub.module.css';
import { InlineConfirm, Spinner, useDismiss } from './bits';
import { cx } from './tones';

/**
 * The small pieces of docs/WAHUB-CONTRACT-FUTURE-LEADS.md that more than one
 * screen draws: a note (ג.6, ז.5) — inside the conversation, in a list, and
 * where it is written — and the two marks a row and a card carry: a future
 * lead (ג.5) and the waiting list (ד).
 */

// ---------------------------------------------------------------------------
// A note: a line of the log. It is not a message and is sent to nobody — and it looks it.
// ---------------------------------------------------------------------------

/** What a note's small menu does: both resolve '' once done, or — in words — why not. */
export interface NoteActions {
  onEdit: (noteId: number, text: string) => Promise<string>;
  onDelete: (noteId: number) => Promise<string>;
}

/** What stands on a note's paper: its words; its small menu, open; its words in a box; or the question before deleting. */
export type NoteMode = 'idle' | 'menu' | 'edit' | 'ask';

export interface NoteEdit {
  mode: NoteMode;
  /** The words being edited. */
  text: string;
  /** A save or a delete is on its way. */
  busy: boolean;
  /** Why the last one did not happen. */
  error: string;
  onMode: (mode: NoteMode) => void;
  onText: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  /** The menu's own ground: a press outside it puts the menu away. */
  toolsRef?: Ref<HTMLDivElement>;
}

export interface NotePaperProps {
  note: WahubNote;
  /** "פתק · מיכל כהן · 09:20" inside a conversation; "מיכל כהן · 13.10 09:20" in a list. */
  meta: string;
  /** Inside a conversation the line of who and when stands over the words, with the note's mark; in a list, under them. */
  inThread: boolean;
  now: Date;
  /** The note can be edited and deleted (ז.5). Absent: it is shown as it always was. */
  edit?: NoteEdit;
}

/**
 * What stands on a note's paper: who wrote it and when — with a quiet "נערך" once it was changed — its words,
 * and, where the server can change a note, a small menu: "עריכה" opens the words in a box, in place;
 * "מחיקה" asks first, because a deleted note is gone for good.
 */
export function NotePaper({ note, meta, inThread, now, edit }: NotePaperProps) {
  const edited = noteEditedWord(note);
  const mode = edit?.mode ?? 'idle';
  const line = (
    <div className={cx(f.noteMeta, !inThread && '!mb-0 mt-1')}>
      {inThread && <StickyNote aria-hidden="true" />}
      <span>
        {meta}
        {edited && (
          <span className={w.noteEdited} title={noteEditedTitle(note, now)}>
            {' · '}
            {edited}
          </span>
        )}
      </span>
      {edit && mode !== 'edit' && mode !== 'ask' && (
        <div ref={edit.toolsRef} className={w.noteTools}>
          <button
            type="button"
            onClick={() => edit.onMode(mode === 'menu' ? 'idle' : 'menu')}
            aria-label="עוד על הפתק"
            title="עריכה או מחיקה"
            aria-haspopup="menu"
            aria-expanded={mode === 'menu'}
            className={w.noteMore}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
          {mode === 'menu' && (
            <div role="menu" aria-label="פתק" className={w.noteMenu}>
              <button type="button" role="menuitem" onClick={() => edit.onMode('edit')}>
                <Pencil aria-hidden="true" />
                עריכה
              </button>
              <button type="button" role="menuitem" onClick={() => edit.onMode('ask')}>
                <Trash2 aria-hidden="true" />
                מחיקה
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  let body;
  if (edit && mode === 'edit') {
    const problem = noteEditProblem(edit.text, note.text, NOTE_MAX);
    const ready = !problem && !edit.busy;
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (ready) edit.onSave();
    };
    const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape' && !edit.busy) {
        // Only the edit lets go: whatever lies behind it — a card, a lead's details — stays.
        event.preventDefault();
        event.stopPropagation();
        edit.onMode('idle');
      } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (ready) edit.onSave();
      }
    };
    body = (
      <form className={w.noteEdit} onSubmit={submit} aria-label="עריכת הפתק">
        <textarea
          value={edit.text}
          onChange={(event) => edit.onText(event.target.value)}
          onKeyDown={onKey}
          rows={3}
          maxLength={NOTE_MAX}
          disabled={edit.busy}
          dir="auto"
          aria-label="הפתק"
          autoFocus
        />
        {edit.error && (
          <p className={cx(f.formError, '!mt-0')} role="alert">
            {edit.error}
          </p>
        )}
        <div className={w.noteEditActs}>
          {/* What is missing is said by the button's own title; it cannot be pressed until nothing is. */}
          <button type="submit" disabled={!ready} title={problem || undefined} className={cx(s.btn, s.btnSm, s.btnP)}>
            {edit.busy && <Spinner className="h-3.5 w-3.5" />}
            שמור
          </button>
          <button type="button" disabled={edit.busy} onClick={() => edit.onMode('idle')} className={cx(s.btn, s.btnSm)}>
            ביטול
          </button>
        </div>
      </form>
    );
  } else {
    body = (
      <p className={f.noteText} dir="auto">
        {note.text}
      </p>
    );
  }

  return (
    <>
      {inThread && line}
      {body}
      {!inThread && line}
      {edit && mode === 'ask' && (
        <div className={w.noteAsk}>
          <InlineConfirm
            danger
            busy={edit.busy}
            text={
              <>
                למחוק את הפתק? <strong>אי אפשר להחזיר.</strong>
                {edit.error && (
                  <span className={cx(f.formError, 'block')} role="alert">
                    {edit.error}
                  </span>
                )}
              </>
            }
            confirmLabel="כן, למחוק"
            onConfirm={edit.onDelete}
            onCancel={() => edit.onMode('idle')}
          />
        </div>
      )}
    </>
  );
}

/** One note with what its menu keeps while it is open: which step, the words being edited, and whether a save is on its way. */
function EditableNote({ note, meta, inThread, now, actions }: Omit<NotePaperProps, 'edit'> & { actions: NoteActions }) {
  const [state, setState] = useState<{ mode: NoteMode; text: string; busy: boolean; error: string }>({
    mode: 'idle',
    text: note.text,
    busy: false,
    error: '',
  });
  const menuOpen = state.mode === 'menu';
  const tools = useDismiss(menuOpen, () => setState((prev) => (prev.mode === 'menu' ? { ...prev, mode: 'idle' } : prev)));
  // What the requests read when they come back: the note may be gone by then, and nothing is set on it.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const finish = (reason: string) => {
    if (!alive.current) return;
    setState((prev) => (reason ? { ...prev, busy: false, error: reason } : { ...prev, busy: false, error: '', mode: 'idle' }));
  };

  return (
    <NotePaper
      note={note}
      meta={meta}
      inThread={inThread}
      now={now}
      edit={{
        ...state,
        toolsRef: tools,
        // Editing starts from the note's own words, whatever was typed the time before.
        onMode: (mode) => setState((prev) => (prev.busy ? prev : { ...prev, mode, error: '', text: mode === 'edit' ? note.text : prev.text })),
        onText: (text) => setState((prev) => ({ ...prev, text })),
        onSave: () => {
          if (state.busy) return;
          setState((prev) => ({ ...prev, busy: true, error: '' }));
          void actions.onEdit(note.id, state.text.trim()).then(finish);
        },
        onDelete: () => {
          if (state.busy) return;
          setState((prev) => ({ ...prev, busy: true, error: '' }));
          void actions.onDelete(note.id).then(finish);
        },
      }}
    />
  );
}

/**
 * A note inside the conversation, where it was written: across the middle — on
 * neither side, because nobody sent it — on yellow paper with a dashed edge.
 * "פתק · מי · מתי" stands over it; where the server can change a note, a small
 * menu stands at the end of that line.
 */
export function NoteRow({ note, arrived = false, now, actions }: { note: WahubNote; arrived?: boolean; now?: Date; actions?: NoteActions }) {
  const at = now ?? new Date();
  const meta = noteHeading(note);
  return (
    <div className={cx(f.noteRow, arrived && m.rise)}>
      <div className={f.note} role="note" aria-label={NOTE_NOT_SENT} title={NOTE_NOT_SENT}>
        {actions && canEditNote(note) ? (
          <EditableNote note={note} meta={meta} inThread now={at} actions={actions} />
        ) : (
          <NotePaper note={note} meta={meta} inThread now={at} />
        )}
      </div>
    </div>
  );
}

/** The notes one under another, newest first — in the contact's card, and in a lead's details. */
export function NoteList({
  notes,
  now,
  empty,
  actions,
}: {
  notes: ReadonlyArray<WahubNote>;
  now: Date;
  empty?: string;
  /** Present: each note the server can change carries its small menu. */
  actions?: NoteActions;
}) {
  if (!notes.length) return empty ? <p className={s.t2}>{empty}</p> : null;
  return (
    <ul className={f.noteList} aria-label="פתקים">
      {notes.map((note) => {
        const meta = noteByLine(note, now);
        return (
          <li key={note.id} className={f.note} title={NOTE_NOT_SENT}>
            {actions && canEditNote(note) ? (
              <EditableNote note={note} meta={meta} inThread={false} now={now} actions={actions} />
            ) : (
              <NotePaper note={note} meta={meta} inThread={false} now={now} />
            )}
          </li>
        );
      })}
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
        {chip.label} · {chip.short}
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
