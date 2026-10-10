'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import {
  Ban,
  CalendarClock,
  Check,
  ChevronDown,
  ExternalLink,
  History,
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
  WahubOutcome,
  WahubTag,
} from '@/types/wahub';
import { wahubKeys } from '../hooks/useWahubQueries';
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
}: {
  contact: WahubContact;
  today: string;
  now: Date;
  /** Offered where there is room for it (the contact panel); a lead card leaves it out. */
  onAnalyze?: () => void;
  analyzing?: boolean;
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

  return (
    <div className={s.known}>
      <div className="flex items-center justify-between gap-2">
        <p className={s.knownTitle}>מה ידוע</p>
        {onAnalyze && (
          <button type="button" onClick={onAnalyze} disabled={analyzing} className={cx(s.btn, s.btnSm)}>
            {analyzing ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles aria-hidden="true" />}
            סכם מחדש
          </button>
        )}
      </div>

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

export function KogoBox({
  contact,
  now,
  onRecheck,
  rechecking = false,
}: {
  contact: WahubContact;
  now: Date;
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const { kogo } = contact;
  const children = kogo.children ?? [];
  // The lists carry the ids alone; the names come with the single contact.
  const bareIds = children.length ? [] : kogo.child_ids ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <OutcomeChip contact={contact} />
        {kogo.is_customer && <Pill tone="success">לקוח</Pill>}
      </div>
      {kogo.detail && <p className="mt-1.5 text-[13.5px] leading-relaxed">{kogo.detail}</p>}

      {children.length > 0 && (
        <ul className={cx(s.list, '!px-0')}>
          {children.map((child) => (
            <li key={String(child.id)}>
              <Link href={`/customers?child=${encodeURIComponent(String(child.id))}`} className={s.listRow}>
                <span className={cx(s.t1, 'min-w-0 flex-1 truncate')}>{child.name}</span>
                <span className={cx(s.t2, 'flex shrink-0 items-center gap-1.5')}>
                  {child.status_label}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {bareIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {bareIds.map((id, index) => (
            <Link
              key={String(id)}
              href={`/customers?child=${encodeURIComponent(String(id))}`}
              className={cx(s.btn, s.btnSm)}
            >
              <ExternalLink aria-hidden="true" />
              {bareIds.length > 1 ? `כרטיס הילד ${index + 1}` : 'כרטיס הילד'}
            </Link>
          ))}
        </div>
      )}

      {onRecheck && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
}: {
  contact: WahubContact;
  today: string;
  now: Date;
  onChange: (patch: WahubFollowupPatch) => void;
  /** Who set the mark and when — shown where there is room. */
  showBy?: boolean;
}) {
  const { followup } = contact;
  const dateId = useId();
  const dueLine = followupDueLine(followup, today, now);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="סימון מעקב">
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

/** Folded by default: a title, and the log under it on a press. Newest first. */
export function EventsLog({ events, now }: { events: WahubEvent[]; now: Date }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cx(s.sectTitle, 'flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-start')}
      >
        <span className="inline-flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          היסטוריה
          {events.length > 0 && <span className={s.num}>({events.length})</span>}
        </span>
        <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="mt-2.5">
          {events.length === 0 ? (
            <p className={s.t2}>עוד לא נרשם כלום.</p>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
