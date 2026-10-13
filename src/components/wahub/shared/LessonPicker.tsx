'use client';

import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { Check, ChevronDown, ChevronLeft, Search, X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { readableError } from '@/lib/apiError';
import { PHONE_MEDIA_QUERY } from '@/lib/wahub/screens';
import {
  ROOM_LESSONS_NOTE,
  WAITING_CHILD_MAX,
  lessonOptionNote,
  lessonOptionWhen,
  splitLessonOptions,
} from '@/lib/wahub/waitingList';
import type { WahubLessonOption, WahubLessonOptions } from '@/types/wahub';
import { useLessonOptions } from '../hooks/useWaitingList';
import w from '../waiting.module.css';
import s from '../wahub.module.css';
import { Skeleton, Spinner } from './bits';
import { Fold, useKeyboardRoom } from './motion';
import { cx } from './tones';

/**
 * "להוסיף לרשימת המתנה" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז.2): the window
 * where the office puts somebody on a lesson's waiting list, in two short steps.
 *
 *   Which lesson — a search, a branch, and the lessons that can be waited for:
 *     the full ones (the office adds to the same lessons the bot does). A
 *     lesson this person already waits for is there, marked. The ones that
 *     have room wait behind their title: nobody waits for a lesson with room.
 *   Who it is about — the lesson that was chosen, large; one short field, not
 *     required; one button.
 *
 * A window in the middle of the page on a desktop; on a phone a sheet at the
 * foot of the screen, with an X at its head and its buttons pinned to its foot.
 */

const TITLE = 'להוסיף לרשימת המתנה';

export interface LessonPickerViewProps {
  /** Who is being added. */
  name: string;
  /** `missing`: the server cannot list the lessons. */
  status: 'loading' | 'ready' | 'error' | 'missing';
  error: string;
  options: WahubLessonOptions | null;
  /** The rows on screen answer what was asked a moment ago. */
  stale: boolean;
  search: string;
  /** The branch the list is narrowed to; '' is all of them. */
  branch: string;
  /** "שיעורים שיש בהם מקום" is open. */
  roomOpen: boolean;
  /** The lesson that was chosen: the second step. */
  chosen: WahubLessonOption | null;
  child: string;
  saving: boolean;
  /** Why they were not added, in words. */
  saveError: string;
  onSearch: (value: string) => void;
  onBranch: (value: string) => void;
  onRoom: (open: boolean) => void;
  onChoose: (option: WahubLessonOption | null) => void;
  onChild: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onRetry: () => void;
  rootRef?: Ref<HTMLDivElement>;
}

function Head({ name, locked, onClose }: { name: string; locked: boolean; onClose: () => void }) {
  return (
    <div className={w.winHead}>
      <div className={w.winWho}>
        <h2 className={w.winTitle}>{TITLE}</h2>
        {name && (
          <p className={w.winSub} dir="auto">
            {name}
          </p>
        )}
      </div>
      <button type="button" onClick={onClose} disabled={locked} aria-label="סגור" title="סגור" className={s.ib}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/** One lesson of the list: the class first; when and where under it; how full it is, quietly, at the end. */
function OptionWords({ option }: { option: WahubLessonOption }) {
  return (
    <>
      <span className={w.optWhat}>
        <span className={w.optTitle} dir="auto">
          {option.course || option.label}
        </span>
        {option.course && <span className={w.optWhen}>{lessonOptionWhen(option)}</span>}
      </span>
      <span className={w.optNote}>{lessonOptionNote(option)}</span>
    </>
  );
}

/** The window itself, drawn from what it is given; what was typed and chosen is kept by LessonPicker. */
export function LessonPickerView({
  name,
  status,
  error,
  options,
  stale,
  search,
  branch,
  roomOpen,
  chosen,
  child,
  saving,
  saveError,
  onSearch,
  onBranch,
  onRoom,
  onChoose,
  onChild,
  onSave,
  onClose,
  onRetry,
  rootRef,
}: LessonPickerViewProps) {
  // The second step: the form wraps the body and the foot, so Enter in the field adds.
  if (chosen) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (!saving) onSave();
    };
    return (
      <div ref={rootRef} className={w.winRoot}>
        <button type="button" onClick={onClose} disabled={saving} aria-label="סגור" tabIndex={-1} className={w.winScrim} />
        <form className={w.win} role="dialog" aria-modal="true" aria-label={TITLE} onSubmit={submit}>
          <Head name={name} locked={saving} onClose={onClose} />
          <div className={w.winBody}>
            <div className={w.winStep}>
              <div className={w.chosen}>
                <p className={w.chosenTitle} dir="auto">
                  {chosen.course || chosen.label}
                </p>
                {chosen.course && <p className={w.chosenWhen}>{lessonOptionWhen(chosen)}</p>}
                {lessonOptionNote(chosen) && <p className={w.chosenNote}>{lessonOptionNote(chosen)}</p>}
              </div>
              <label className={w.fieldLabel} htmlFor="waiting-child">
                על מי מדובר <span>· גיל או כיתה, לא חובה</span>
              </label>
              <input
                id="waiting-child"
                type="text"
                value={child}
                maxLength={WAITING_CHILD_MAX}
                disabled={saving}
                onChange={(event) => onChild(event.target.value)}
                placeholder="למשל: בן 5, גן חובה"
                autoComplete="off"
                enterKeyHint="done"
                dir="auto"
                className={w.input}
              />
              {saveError && (
                <p className={w.formError} role="alert">
                  {saveError}
                </p>
              )}
            </div>
          </div>
          <div className={w.winFoot}>
            <button type="submit" disabled={saving} className={cx(s.btn, s.btnP)}>
              {saving && <Spinner />}
              להוסיף לרשימה
            </button>
            <button type="button" disabled={saving} onClick={() => onChoose(null)} className={s.btn}>
              שיעור אחר
            </button>
          </div>
        </form>
      </div>
    );
  }

  const { joinable, withRoom } = splitLessonOptions(options?.results ?? []);
  const branches = options?.branches ?? [];
  const narrowed = Boolean(search.trim()) || Boolean(branch);

  let body;
  if (status === 'missing') {
    body = (
      <p className={w.winEmpty}>
        <strong>אי אפשר להוסיף מכאן כרגע</strong>
        נסו שוב מאוחר יותר.
      </p>
    );
  } else if (status === 'error') {
    body = (
      <div className={w.winEmpty} role="alert">
        <strong>לא הצלחנו לטעון את השיעורים</strong>
        {error || 'בדקו את החיבור ונסו שוב.'}
        <div className="mt-3">
          <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP)}>
            נסו שוב
          </button>
        </div>
      </div>
    );
  } else if (status === 'loading') {
    body = (
      <ul className={w.opts} aria-busy="true" aria-label="טוען את השיעורים">
        {[62, 48, 70, 54].map((width, index) => (
          <li key={index} className={w.opt}>
            <span className={w.optWhat}>
              <Skeleton className="block h-4" style={{ width: `${width}%` }} />
              <Skeleton className="mt-2 block h-3" style={{ width: `${width - 20}%` }} />
            </span>
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className={cx(w.winStep, stale && w.stale)}>
        {joinable.length === 0 ? (
          <p className={w.winEmpty}>
            <strong>{narrowed ? 'אין שיעור מלא שמתאים לחיפוש' : 'אין כרגע שיעור מלא'}</strong>
            ממתינים רק לשיעור מלא. לשיעור שיש בו מקום רושמים ישר.
          </p>
        ) : (
          <ul className={w.opts} aria-label="שיעורים מלאים">
            {joinable.map((option) => (
              <li key={option.id}>
                {option.on_list ? (
                  // Already waiting for it: there, marked, and not to be chosen again.
                  <div className={cx(w.opt, w.optOff, w.optOn)}>
                    <OptionWords option={option} />
                    <Check aria-hidden="true" />
                  </div>
                ) : (
                  <button type="button" onClick={() => onChoose(option)} className={w.opt}>
                    <OptionWords option={option} />
                    <ChevronLeft aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {withRoom.length > 0 && (
          <>
            <button type="button" aria-expanded={roomOpen} aria-controls="waiting-room-lessons" onClick={() => onRoom(!roomOpen)} className={w.roomHead}>
              <span>
                שיעורים שיש בהם מקום <span className={s.num}>({withRoom.length.toLocaleString('he-IL')})</span>
              </span>
              <ChevronDown className={w.chevron} aria-hidden="true" />
            </button>
            <Fold open={roomOpen} id="waiting-room-lessons">
              <p className={w.roomNote}>{ROOM_LESSONS_NOTE}</p>
              <ul className={w.opts} aria-label="שיעורים שיש בהם מקום">
                {withRoom.map((option) => (
                  <li key={option.id} className={cx(w.opt, w.optOff)}>
                    <OptionWords option={option} />
                  </li>
                ))}
              </ul>
            </Fold>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={w.winRoot}>
      <button type="button" onClick={onClose} aria-label="סגור" tabIndex={-1} className={w.winScrim} />
      <div className={w.win} role="dialog" aria-modal="true" aria-label={TITLE}>
        <Head name={name} locked={false} onClose={onClose} />
        {status !== 'missing' && (
          <div className={w.winTools}>
            <label className={cx(s.search, w.winSearch)}>
              <Search aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="חוג, סניף או יום"
                aria-label="חיפוש שיעור"
                enterKeyHint="search"
              />
              {search && (
                <button type="button" onClick={() => onSearch('')} aria-label="נקה חיפוש">
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
            {/* With one branch there is nothing to choose between, and the filter is not drawn. */}
            {(branches.length > 1 || branch) && (
              <label className={w.winBranch}>
                <select value={branch} onChange={(event) => onBranch(event.target.value)} aria-label="סינון לפי סניף">
                  <option value="">כל הסניפים</option>
                  {branches.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            )}
          </div>
        )}
        <div className={w.winBody}>{body}</div>
      </div>
    </div>
  );
}

const SEARCH_DELAY_MS = 300;

export interface LessonPickerProps {
  /** Whose list is being added to. */
  contactId: number;
  name: string;
  /** Adds them: resolves '' once they are on the lesson's list, or — in words — why they are not. */
  onJoin: (lessonId: string, child: string) => Promise<string>;
  onClose: () => void;
  /**
   * On a phone, draw the sheet into the room above an open keyboard. False where the screen around it already
   * does (an open conversation is drawn into that room as a whole).
   */
  keyboardRoom?: boolean;
}

/**
 * The window with what it keeps while it is open: what was typed, the branch, the lesson that was chosen and
 * what is known of the child. A refusal leaves the window open on what was chosen, with the reason; the list of
 * lessons is then read again — the one that was refused may have changed.
 */
export default function LessonPicker({ contactId, name, onJoin, onClose, keyboardRoom = true }: LessonPickerProps) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [roomOpen, setRoomOpen] = useState(false);
  const [chosen, setChosen] = useState<WahubLessonOption | null>(null);
  const [child, setChild] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const lessons = useLessonOptions(contactId, q, branch, true);

  const root = useRef<HTMLDivElement | null>(null);
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  useKeyboardRoom(root, phone && keyboardRoom);

  // Escape puts the window away — and only the window: whatever lies behind it stays. Not from under a save.
  const live = useRef({ saving, chosen, onClose });
  live.current = { saving, chosen, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (live.current.saving) return;
      // From the second step, Escape goes back to the lessons; from the first, it closes.
      if (live.current.chosen) {
        setChosen(null);
        setSaveError('');
      } else live.current.onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function save() {
    if (!chosen || saving) return;
    setSaving(true);
    setSaveError('');
    const reason = await onJoin(chosen.id, child.trim());
    if (!alive.current) return;
    setSaving(false);
    if (!reason) {
      onClose();
      return;
    }
    setSaveError(reason);
    void lessons.refetch();
  }

  const status = lessons.data === null ? 'missing' : lessons.data ? 'ready' : lessons.isError ? 'error' : 'loading';

  return (
    <LessonPickerView
      name={name}
      status={status}
      error={lessons.isError ? readableError(lessons.error, '') : ''}
      options={lessons.data ?? null}
      stale={Boolean(lessons.data) && lessons.isPlaceholderData}
      search={search}
      branch={branch}
      roomOpen={roomOpen}
      chosen={chosen}
      child={child}
      saving={saving}
      saveError={saveError}
      onSearch={setSearch}
      onBranch={setBranch}
      onRoom={setRoomOpen}
      onChoose={(option) => {
        setChosen(option);
        setSaveError('');
      }}
      onChild={setChild}
      onSave={() => void save()}
      onClose={() => {
        if (!saving) onClose();
      }}
      onRetry={() => void lessons.refetch()}
      rootRef={root}
    />
  );
}
