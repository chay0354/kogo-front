'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  Ban,
  CalendarClock,
  Check,
  Contact,
  MessageCircleReply,
  PhoneCall,
  PhoneMissed,
  Plus,
  RefreshCw,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { readableError } from '@/lib/apiError';
import type { Tone } from '@/lib/wahub/boxes';
import { classHasBillingNote, classParts, classesOf, childTone, kogoLines, trialOnText } from '@/lib/wahub/childClasses';
import { CUSTOMER_CARD_HINT, CUSTOMER_CARD_LABEL, childCardHref } from '@/lib/wahub/customerCard';
import {
  FOLLOWUP_MARKS,
  callbackLine,
  followupDueLine,
  setFollowupDue,
  toggleFollowup,
  type FollowupMark,
} from '@/lib/wahub/followup';
import { agoText, formatDateTime } from '@/lib/wahub/format';
import { createWahubTag } from '@/lib/wahubApi';
import type {
  WahubContact,
  WahubEvent,
  WahubFollowupPatch,
  WahubKogoChild,
  WahubOutcome,
  WahubTag,
} from '@/types/wahub';
import { wahubKeys } from '../hooks/useWahubQueries';
import c from '../contactCard.module.css';
import m from '../motion.module.css';
import s from '../wahub.module.css';
import { Pill, Spinner, TagChip } from './bits';
import { cx } from './tones';

// ---------------------------------------------------------------------------
// מה ידוע — what the system worked out by itself
// ---------------------------------------------------------------------------

/**
 * The box that says what the system knows: the summary, the subject, the
 * branch, the age, how interested, and when he asked to be called back.
 *
 * It is a box of its own, apart from the marks, on purpose: what is written
 * here the system wrote; the marks are the office's alone.
 */
export function KnownBox({
  contact,
  today,
  now,
  onAnalyze,
  analyzing = false,
  bare = false,
}: {
  contact: WahubContact;
  today: string;
  now: Date;
  /** Offered where there is room for it (the contact panel); a lead card leaves it out. */
  onAnalyze?: () => void;
  analyzing?: boolean;
  /** Under a title that already says "מה ידוע" (the card's folded section): no title and no box of its own. */
  bare?: boolean;
}) {
  const { known } = contact;
  const callback = callbackLine(known.callback_on, today, now);
  const branch = [known.branch_name, known.city]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' · ');
  const rows: Array<[string, string]> = [];
  if (known.topic_label) rows.push(['נושא', known.topic_label]);
  if (known.course_type) rows.push(['חוג', known.course_type]);
  if (branch) rows.push(['סניף', branch]);
  if (known.child_age) rows.push(['גיל', known.child_age]);
  if (known.interest_label) rows.push(['רמת עניין', known.interest_label]);

  const flagLabels = known.flag_labels ?? [];
  const empty = !known.summary && rows.length === 0 && flagLabels.length === 0 && !callback;

  const analyzeButton = onAnalyze && (
    <button type="button" onClick={onAnalyze} disabled={analyzing} className={cx(s.btn, s.btnSm)}>
      {analyzing ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles aria-hidden="true" />}
      סכם מחדש
    </button>
  );

  return (
    <div className={bare ? s.knownBare : s.known}>
      {!bare && (
        <div className="flex items-center justify-between gap-2">
          <p className={s.knownTitle}>מה ידוע</p>
          {analyzeButton}
        </div>
      )}

      {empty ? (
        <p className={cx(s.knownText, s.muted)}>עוד אין מידע על הפנייה הזו.</p>
      ) : (
        <>
          {known.summary && <p className={s.knownText}>{known.summary}</p>}
          {rows.length > 0 && (
            <dl className={s.kv}>
              {rows.map(([term, value]) => (
                <div key={term}>
                  <dt>{term}:</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {flagLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {flagLabels.map((label) => (
                <Pill key={label} tone="warning">
                  {label}
                </Pill>
              ))}
            </div>
          )}
          {callback && (
            <p className="mt-2">
              <Pill tone={callback.due ? 'danger' : 'primary'}>
                <CalendarClock aria-hidden="true" />
                {callback.text}
              </Pill>
            </p>
          )}
        </>
      )}

      {known.analyzed_at && (
        <p className={cx(s.t2, 'mt-2 !text-[11px]')}>
          {known.analysis_source === 'ai' ? 'סיכום אוטומטי' : 'לפי מילים בשיחה'} · {agoText(known.analyzed_at, now)}
        </p>
      )}
      {bare && analyzeButton && <div className="mt-2.5">{analyzeButton}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// במערכת — the cross-check against the registrations
// ---------------------------------------------------------------------------

const OUTCOME_TONE: Record<WahubOutcome, Tone | 'gold'> = {
  '': 'muted',
  not_found: 'muted',
  in_system: 'primary',
  pending: 'warning',
  signup_declined: 'danger',
  trial_upcoming: 'gold',
  trial_only: 'warning',
  registered_after: 'success',
  customer_before: 'success',
};

export function outcomeTone(outcome: WahubOutcome): Tone | 'gold' {
  return OUTCOME_TONE[outcome] ?? 'muted';
}

export function OutcomeChip({ contact }: { contact: WahubContact }) {
  const { kogo } = contact;
  if (!kogo.outcome) return <Pill tone="muted">עוד לא נבדק במערכת</Pill>;
  return (
    <Pill tone={outcomeTone(kogo.outcome)} wrap>
      {kogo.outcome_label || kogo.outcome}
    </Pill>
  );
}

/**
 * One child Kogo found: the name and its status, the way to the child's own card, and under it each class the
 * child is in now — one line each, the class in bold; a trial ahead says its day first.
 */
function ChildRow({ child, now }: { child: WahubKogoChild; now: Date }) {
  const href = childCardHref(child.id);
  const classes = classesOf(child);
  const name = child.name || 'ללא שם';
  return (
    <li>
      <div className={c.kidHead}>
        <span className={c.kidName} dir="auto">
          {name}
        </span>
        {child.status_label && <Pill tone={childTone(child.status)}>{child.status_label}</Pill>}
        {href && (
          <Link href={href} title={CUSTOMER_CARD_HINT} aria-label={`${CUSTOMER_CARD_LABEL} של ${name}`} className={c.kidLink}>
            <Contact aria-hidden="true" />
            {CUSTOMER_CARD_LABEL}
          </Link>
        )}
      </div>
      {classes.length > 0 && (
        <ul className={c.classes} aria-label={`החוגים של ${name}`}>
          {classes.map((row, index) => {
            const { title, when, rest } = classParts(row);
            const trial = trialOnText(row, now);
            return (
              <li key={`${row.lesson_id ?? index}-${row.trial_on ?? ''}`} className={c.classLine} dir="auto">
                {/* The space after a mark keeps the words apart for a screen reader too, not only to the eye. */}
                {trial && (
                  <>
                    <Pill tone="gold" className={c.classNote}>
                      {trial}
                    </Pill>{' '}
                  </>
                )}
                {classHasBillingNote(row, child) && (
                  <>
                    <Pill tone="danger" className={c.classNote}>
                      בעיית תשלום
                    </Pill>{' '}
                  </>
                )}
                {[
                  title && <b key="title">{title}</b>,
                  // The day and its hours stay on one line: "17:00–" is never left at the end of one.
                  when && (
                    <span key="when" className={c.when}>
                      {when}
                    </span>
                  ),
                  rest,
                ]
                  .filter(Boolean)
                  .flatMap((part, at) => (at ? [' · ', part] : [part]))}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * "ילדים וחוגים" (docs/WAHUB-CONTRACT-LAYOUT.md, ב.3): what the registrations say of the phone — each child once,
 * with its classes — and "בדוק שוב". The matching's answer and its sentence stand above the children only where
 * the card's "מה עכשיו" does not already say them (`lines`, lib/wahub/childClasses.ts `kogoLines`).
 */
export function KogoBox({
  contact,
  now,
  onRecheck,
  rechecking = false,
  lines,
}: {
  contact: WahubContact;
  now: Date;
  onRecheck?: () => void;
  rechecking?: boolean;
  /** What to say above the children. Absent: as nothing above it said a word of Kogo. */
  lines?: { outcome: boolean; detail: string };
}) {
  const { kogo } = contact;
  // The lists carry the ids alone; the names and the classes come with the single contact.
  const children = kogo.children ?? [];
  const said = lines ?? kogoLines(contact, null);

  return (
    <div>
      {(said.outcome || said.detail) && (
        <p className={c.said}>
          {said.outcome && <OutcomeChip contact={contact} />}
          {said.detail && <span dir="auto">{said.detail}</span>}
        </p>
      )}

      {children.length > 0 && (
        <ul className={cx(c.kids, m.stagger)}>
          {children.map((child) => (
            <ChildRow key={String(child.id)} child={child} now={now} />
          ))}
        </ul>
      )}

      {onRecheck && (
        <div className={c.recheck}>
          <button type="button" onClick={onRecheck} disabled={rechecking} className={cx(s.btn, s.btnSm)}>
            {rechecking ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden="true" />}
            בדוק שוב
          </button>
          {kogo.checked_at && <span className={cx(s.t2, '!text-[11px]')}>נבדק {agoText(kogo.checked_at, now)}</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// סימון מעקב — the six marks only a person presses
// ---------------------------------------------------------------------------

const MARK_ICON: Record<FollowupMark, typeof Check> = {
  waiting_us: MessageCircleReply,
  no_answer: PhoneMissed,
  answered: PhoneCall,
  later: CalendarClock,
  registered: UserCheck,
  not_relevant: Ban,
};

const DUE_TONE = { danger: 'danger', warning: 'warning', info: 'primary' } as const;

/**
 * The six marks. Pressing the one that is set takes it off. Choosing "בזמן
 * אחר" opens a date for the day to come back.
 */
export function FollowupMarks({
  contact,
  today,
  now,
  onChange,
  showBy = false,
  compact = false,
}: {
  contact: WahubContact;
  today: string;
  now: Date;
  onChange: (patch: WahubFollowupPatch) => void;
  /** Who set the mark and when — shown where there is room. */
  showBy?: boolean;
  /** The six in one row where the column allows it (the contact's card on a desktop): words only, the tick on the one that is set. */
  compact?: boolean;
}) {
  const { followup } = contact;
  const dateId = useId();
  const dueLine = followupDueLine(followup, today, now);

  return (
    <div>
      <div className={cx('flex flex-wrap gap-1.5', compact && s.marksRow)} role="group" aria-label="סימון מעקב">
        {FOLLOWUP_MARKS.map((mark) => {
          const active = followup.status === mark.status;
          const Icon = active ? Check : MARK_ICON[mark.status];
          return (
            <button
              key={mark.status}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(toggleFollowup(followup.status, mark.status))}
              className={cx(s.btn, s.btnSm, active && s.btnOn)}
            >
              <Icon aria-hidden="true" strokeWidth={active ? 3 : 2} />
              {mark.label}
            </button>
          );
        })}
      </div>

      {followup.status === 'later' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={dateId} className={cx(s.t2, '!font-bold')}>
            מתי לחזור
          </label>
          <input
            id={dateId}
            type="date"
            value={followup.due ?? ''}
            onChange={(event) => onChange(setFollowupDue(event.target.value))}
            className={cx(s.field, s.fieldSm)}
          />
          {dueLine && <Pill tone={DUE_TONE[dueLine.tone]}>{dueLine.text}</Pill>}
        </div>
      )}

      {showBy && followup.status && followup.at && (
        <p className={cx(s.t2, 'mt-1.5 !text-[11px]')}>
          {followup.by_name ? `${followup.by_name} · ` : ''}
          {formatDateTime(followup.at, now)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// מידע חדש — the office's own note
// ---------------------------------------------------------------------------

/** Free text, several lines, saved on leaving the field. Nothing but a person writes here. */
export function NoteField({
  contact,
  onSave,
  rows = 2,
}: {
  contact: WahubContact;
  onSave: (note: string) => void;
  rows?: number;
}) {
  const saved = contact.followup.note ?? '';
  return (
    // Keyed by the saved note: when a save fails, the saved text comes back into the field.
    <textarea
      key={saved}
      defaultValue={saved}
      onBlur={(event) => {
        if (event.target.value !== saved) onSave(event.target.value);
      }}
      placeholder="מידע חדש – מה עלה בשיחה, מה סוכם"
      aria-label={`מידע חדש על ${contact.name || contact.phone_display || contact.phone}`}
      maxLength={2000}
      rows={rows}
      className={s.field}
      style={{ minHeight: rows > 1 ? undefined : 38 }}
    />
  );
}

// ---------------------------------------------------------------------------
// תגיות
// ---------------------------------------------------------------------------

/** The colours a tag may take: the sketch's own, and a few beside them so tags can be told apart. */
export const TAG_COLORS = ['#2B3090', '#5a56e3', '#16a34a', '#b45309', '#F5C518', '#c81e1e', '#db2777', '#0891b2', '#6b7090'];

export function ColorDots({
  value,
  onChange,
  label = 'צבע התגית',
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {TAG_COLORS.map((color, index) => {
        const chosen = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={chosen}
            aria-label={`צבע ${index + 1}`}
            onClick={() => onChange(color)}
            className="h-6 w-6 rounded-[7px]"
            style={{
              backgroundColor: color,
              border: '2px solid var(--surface)',
              boxShadow: chosen ? '0 0 0 2px var(--navy)' : '0 0 0 1px var(--line)',
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * The contact's tags: take one off, add one from the list, or make a new one
 * on the spot (it is added to the list and to this contact).
 */
export function TagPicker({
  contact,
  allTags,
  onChange,
}: {
  contact: WahubContact;
  allTags: WahubTag[];
  onChange: (tags: WahubTag[]) => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const selectId = useId();
  const mine = contact.tags ?? [];
  const available = allTags.filter((tag) => !mine.some((own) => own.id === tag.id));

  async function createAndAdd() {
    const clean = name.trim();
    if (!clean || creating) return;
    const existing = allTags.find((tag) => tag.name.trim() === clean);
    if (existing) {
      if (!mine.some((own) => own.id === existing.id)) onChange([...mine, existing]);
      setName('');
      setAdding(false);
      return;
    }
    setCreating(true);
    try {
      const tag = await createWahubTag({ name: clean, color });
      queryClient.setQueryData<WahubTag[]>(wahubKeys.tags, (prev) => [...(prev ?? []), tag]);
      onChange([...mine, tag]);
      setName('');
      setAdding(false);
    } catch (error) {
      toast.error(readableError(error, 'התגית לא נוצרה'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {mine.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => onChange(mine.filter((own) => own.id !== tag.id))} />
        ))}
        {mine.length === 0 && !adding && <span className={s.t2}>אין תגיות</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {available.length > 0 && (
          <>
            <label htmlFor={selectId} className="sr-only">
              הוסף תגית
            </label>
            <select
              id={selectId}
              value=""
              onChange={(event) => {
                const tag = allTags.find((item) => String(item.id) === event.target.value);
                if (tag) onChange([...mine, tag]);
              }}
              className={cx(s.field, s.fieldSm)}
            >
              <option value="">הוסף תגית…</option>
              {available.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </>
        )}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={cx(s.btn, s.btnSm)}>
            <Plus aria-hidden="true" />
            תגית חדשה
          </button>
        )}
      </div>

      {adding && (
        <div className={cx(s.inset, 'mt-2 flex flex-col gap-2')}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void createAndAdd();
              }
            }}
            placeholder="שם התגית"
            aria-label="שם התגית החדשה"
            maxLength={40}
            autoFocus
            className={s.field}
          />
          <ColorDots value={color} onChange={setColor} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void createAndAdd()}
              disabled={!name.trim() || creating}
              className={cx(s.btn, s.btnSm, s.btnP)}
            >
              {creating && <Spinner className="h-3.5 w-3.5" />}
              הוסף
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName('');
              }}
              className={cx(s.btn, s.btnSm)}
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// היסטוריה — who did what, and when
// ---------------------------------------------------------------------------

/** The log itself, newest first: what happened, who did it, and when. */
export function EventsList({ events, now }: { events: WahubEvent[]; now: Date }) {
  if (events.length === 0) return <p className={s.t2}>עוד לא נרשם כלום.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {events.map((event) => (
        <li key={event.id} className={s.logItem}>
          <p className="m-0 text-[13px] leading-snug">
            <Pill tone="neutral" className="me-1.5">
              {event.kind_label}
            </Pill>
            {event.text}
          </p>
          <p className={cx(s.t2, 'm-0 mt-0.5 !text-[11px]')}>
            {event.actor_name || 'אוטומטי'} · {formatDateTime(event.created_at, now)}
          </p>
        </li>
      ))}
    </ol>
  );
}
