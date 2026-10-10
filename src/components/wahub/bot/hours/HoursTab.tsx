'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Pencil, Plus, Power, Save } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import {
  DEFAULT_CLOSED_MESSAGE,
  DEFAULT_WEEKLY,
  SEND_MODES,
  WEEKDAYS,
  completeWeekly,
  israelWeekday,
  officeOpenNow,
  specialDayLine,
  splitSpecialDays,
} from '@/lib/wahub/bot';
import { israelToday } from '@/lib/wahub/format';
import { createWahubKnowledge, deleteWahubKnowledge, updateWahubKnowledge } from '@/lib/wahubApi';
import type {
  WahubKnowledgeItem,
  WahubKnowledgeWrite,
  WahubOfficeDay,
  WahubOfficeHoursNow,
  WahubOfficeSendMode,
  WahubOfficeWeekly,
  WahubWeekday,
} from '@/types/wahub';
import { useKnowledgeCache, useWahubKnowledge, useWahubOfficeHoursNow } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import { ErrorState, Pill, Skeleton, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import KnowledgeEditor from '../knowledge/KnowledgeEditor';
import { Fold } from '../shared';

const NO_ITEMS: WahubKnowledgeItem[] = [];

/** "עכשיו: פתוח / סגור" — the server's word, and under it what the hours on screen say. */
export function NowBox({
  server,
  local,
  serverFailed,
}: {
  server: WahubOfficeHoursNow | undefined;
  local: ReturnType<typeof officeOpenNow>;
  serverFailed: boolean;
}) {
  const open = server ? server.open : local.open;
  const title = open ? 'פתוח' : 'סגור';
  const special = server?.special ?? local.special;
  const message = (server?.message_if_closed || local.message || '').replace(/\s+/g, ' ').trim();
  const todayLine = server?.today?.day_label
    ? `${server.today.day_label}${server.today.open && server.today.from && server.today.to ? ` ${server.today.from}–${server.today.to}` : ' סגור'}`
    : '';
  return (
    <div className={cx(s.nowBox, open ? s.nowOpen : s.nowClosed)} role="status">
      <Clock className="h-4 w-4" aria-hidden="true" />
      <span>
        עכשיו: <strong>{title}</strong>
      </span>
      <span className="font-semibold opacity-90">· {local.label}</span>
      {todayLine && <span className="font-medium opacity-80">· היום: {todayLine}</span>}
      {special && <Pill tone="gold">{special.title || 'יום מיוחד'}</Pill>}
      {server?.configured === false && <Pill tone="warning">עוד לא נשמרו שעות</Pill>}
      {!open && message && (
        <span className="basis-full text-[12.5px] font-medium opacity-90" dir="auto">
          הלקוח יקבל: “{message}”
        </span>
      )}
      {serverFailed && <span className="basis-full text-[12px] font-medium opacity-80">(לפי הטבלה שעל המסך; השרת לא ענה)</span>}
    </div>
  );
}

interface WeeklyEditorProps {
  item: WahubKnowledgeItem | null;
  specials: WahubKnowledgeItem[];
  now: Date;
  onSaved: (item: WahubKnowledgeItem) => void;
}

/**
 * The regular week: a row per day with open/closed, the hours and a message of
 * its own; the default "סגור" message; and when it is sent. Saved as the one
 * `office_hours` item.
 */
function WeeklyEditor({ item, specials, now, onSaved }: WeeklyEditorProps) {
  const [weekly, setWeekly] = useState<WahubOfficeWeekly>(() => (item?.weekly ? completeWeekly(item.weekly) : DEFAULT_WEEKLY));
  const [closedMessage, setClosedMessage] = useState(item?.default_closed_message ?? DEFAULT_CLOSED_MESSAGE);
  const [sendMode, setSendMode] = useState<WahubOfficeSendMode>(item?.send_mode ?? 'on_agent_request');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // A fresh copy from the server (another device saved) replaces what is shown, unless something is being typed.
  useEffect(() => {
    if (dirty) return;
    setWeekly(item?.weekly ? completeWeekly(item.weekly) : DEFAULT_WEEKLY);
    setClosedMessage(item?.default_closed_message ?? DEFAULT_CLOSED_MESSAGE);
    setSendMode(item?.send_mode ?? 'on_agent_request');
  }, [item, dirty]);

  const todayKey = israelWeekday(now);
  const preview = useMemo(() => officeOpenNow(weekly, specials, now, closedMessage), [weekly, specials, now, closedMessage]);

  function patchDay(key: WahubWeekday, change: Partial<WahubOfficeDay>) {
    setDirty(true);
    setWeekly((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  const problem = WEEKDAYS.map(({ key, label }) => {
    const day = weekly[key];
    if (!day.open) return '';
    if (!day.from || !day.to) return `חסרות שעות ביום ${label}`;
    if (day.to <= day.from) return `ביום ${label} שעת הסיום לפני ההתחלה`;
    return '';
  }).find(Boolean);

  async function save() {
    if (problem || saving) return;
    setSaving(true);
    const body: WahubKnowledgeWrite = {
      kind: 'office_hours',
      title: item?.title || 'שעות המשרד',
      weekly,
      default_closed_message: closedMessage,
      send_mode: sendMode,
    };
    try {
      const saved = item ? await updateWahubKnowledge(item.id, body) : await createWahubKnowledge(body);
      setDirty(false);
      onSaved(saved);
      toast.success('שעות המשרד נשמרו');
    } catch (error) {
      toast.error(readableError(error, 'שעות המשרד לא נשמרו'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={s.card} aria-label="שעות המשרד">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className={s.iconBox}>
          <Clock className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold">שעות המשרד</h3>
          <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>השבוע הרגיל. יום מיוחד (למטה) גובר על השורה של אותו יום.</p>
        </div>
        {dirty && <Pill tone="warning">יש שינויים שלא נשמרו</Pill>}
      </div>

      {dirty && (
        <div className="mb-3">
          <NowBox server={undefined} local={preview} serverFailed={false} />
          <p className={cx(s.t2, 'm-0 mt-1 !text-[12px]')}>כך זה ייראה אחרי השמירה.</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={s.week}>
          <thead>
            <tr>
              <th scope="col">יום</th>
              <th scope="col">פתוח</th>
              <th scope="col">משעה</th>
              <th scope="col">עד שעה</th>
              <th scope="col">הודעת “סגור” לאותו יום (לא חובה)</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map(({ key, label }) => {
              const day = weekly[key];
              return (
                <tr key={key} className={cx(key === todayKey && 'today', !day.open && 'off')}>
                  <th scope="row" className="!text-[13.5px] !font-extrabold !text-[var(--ink)]">
                    {label}
                    {key === todayKey && <span className={cx(s.t2, 'ms-1.5 !text-[11px]')}>היום</span>}
                  </th>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={day.open}
                      aria-label={`${label}: ${day.open ? 'פתוח' : 'סגור'}`}
                      onClick={() => patchDay(key, { open: !day.open, from: day.from || (day.open ? '' : '10:30'), to: day.to || (day.open ? '' : '18:00') })}
                      className={cx(s.switchRow, '!p-0')}
                    >
                      <span className={s.switch} aria-hidden="true" />
                      <span className="w-10 text-start">{day.open ? 'פתוח' : 'סגור'}</span>
                    </button>
                  </td>
                  <td>
                    <input type="time" value={day.from} disabled={!day.open} onChange={(event) => patchDay(key, { from: event.target.value })} aria-label={`${label} משעה`} className={s.field} />
                  </td>
                  <td>
                    <input type="time" value={day.to} disabled={!day.open} onChange={(event) => patchDay(key, { to: event.target.value })} aria-label={`${label} עד שעה`} className={s.field} />
                  </td>
                  <td className="min-w-[200px]">
                    <input
                      type="text"
                      value={day.message}
                      onChange={(event) => patchDay(key, { message: event.target.value })}
                      maxLength={500}
                      placeholder={day.open ? 'מחוץ לשעות: הודעת ברירת המחדל' : 'למשל: נחזור ביום ראשון'}
                      aria-label={`${label} הודעה`}
                      className={cx(s.field, '!h-8 !text-[13px]')}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={cx(s.form, 'mt-4')}>
        <label className={s.full}>
          הודעת “סגור” – ברירת מחדל (כשאין הודעה לאותו יום)
          <textarea
            value={closedMessage}
            onChange={(event) => {
              setDirty(true);
              setClosedMessage(event.target.value);
            }}
            rows={3}
            maxLength={1000}
          />
        </label>
      </div>

      <fieldset className="mt-3 border-0 p-0">
        <legend className={cx(s.fieldLabel, 'mb-1.5')}>מתי הבוט שולח את הודעת “סגור”?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SEND_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={sendMode === mode.value}
              onClick={() => {
                setDirty(true);
                setSendMode(mode.value);
              }}
              className={s.optCard}
            >
              <b>{mode.label}</b>
              <span>{mode.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={Boolean(problem) || saving || (!dirty && Boolean(item))} className={cx(s.btn, s.btnP)}>
          {saving ? <Spinner /> : <Save aria-hidden="true" />}
          {item ? 'שמור שעות' : 'שמור שעות (פעם ראשונה)'}
        </button>
        {problem && <span className={cx(s.warnText, 'text-[12.5px] font-bold')}>{problem}</span>}
        {item && !dirty && <span className={cx(s.t2, '!text-[12px]')}>נשמר · גרסה {item.version}</span>}
      </div>
    </section>
  );
}

function SpecialDayRow({
  item,
  now,
  busy,
  editing,
  onEdit,
  onToggle,
  children,
}: {
  item: WahubKnowledgeItem;
  now: Date;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const tone = item.state === 'closed' ? 'danger' : item.state === 'open' ? 'success' : 'warning';
  return (
    <li className="py-2.5">
      {editing ? (
        children
      ) : (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <p className={cx(s.t1, 'm-0 flex flex-wrap items-center gap-1.5', !item.is_active && 'line-through opacity-60')} dir="auto">
              {item.title || 'יום מיוחד'}
              <Pill tone={tone}>{specialDayLine(item, now)}</Pill>
              {item.scope && item.scope.level !== 'business' && <Pill tone="primary">{item.scope.label}</Pill>}
              {!item.is_active && <Pill tone="muted">לא פעיל</Pill>}
            </p>
            {item.message && (
              <p className={cx(s.t2, 'm-0 mt-0.5 !text-[12.5px]')} dir="auto">
                הודעה: {item.message}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={onEdit} aria-label={`ערוך את ${item.title}`} className={cx(s.ib, s.ibSm)}>
              <Pencil aria-hidden="true" />
            </button>
            <button type="button" onClick={onToggle} disabled={busy} aria-label={item.is_active ? `השבת את ${item.title}` : `הפעל את ${item.title}`} title={item.is_active ? 'השבת' : 'הפעל מחדש'} className={cx(s.ib, s.ibSm, item.is_active && s.ibBad)}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Power aria-hidden="true" />}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * "שעות ומועדים": open or closed right now, the regular week, and the special
 * days with their own state and message.
 */
export default function HoursTab() {
  const now = useNow(30_000);
  const today = israelToday(now);
  const cache = useKnowledgeCache();
  const knowledge = useWahubKnowledge({});
  const serverNow = useWahubOfficeHoursNow(true);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const items = knowledge.data ?? NO_ITEMS;
  const hoursItem = useMemo(() => items.filter((item) => item.kind === 'office_hours' && item.is_active).sort((a, b) => a.id - b.id)[0] ?? null, [items]);
  const specials = useMemo(() => items.filter((item) => item.kind === 'special_day'), [items]);
  const { upcoming, past } = useMemo(() => splitSpecialDays(specials, today), [specials, today]);
  const weekly = useMemo(() => (hoursItem?.weekly ? completeWeekly(hoursItem.weekly) : DEFAULT_WEEKLY), [hoursItem]);
  const local = useMemo(
    () => officeOpenNow(weekly, specials, now, hoursItem?.default_closed_message ?? DEFAULT_CLOSED_MESSAGE),
    [weekly, specials, now, hoursItem],
  );

  function onSaved(item: WahubKnowledgeItem) {
    cache.put(item);
    cache.invalidate();
  }

  async function saveSpecial(body: WahubKnowledgeWrite, id: number | null) {
    setSaving(true);
    try {
      const saved = id == null ? await createWahubKnowledge({ ...body, kind: 'special_day' }) : await updateWahubKnowledge(id, body);
      onSaved(saved);
      setAdding(false);
      setEditingId(null);
      toast.success(id == null ? `נוסף יום מיוחד: ${saved.title}` : 'השינוי נשמר');
    } catch (error) {
      toast.error(readableError(error, 'היום המיוחד לא נשמר'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSpecial(item: WahubKnowledgeItem) {
    setBusyId(item.id);
    cache.put({ ...item, is_active: !item.is_active });
    try {
      if (item.is_active) await deleteWahubKnowledge(item.id);
      else cache.put(await updateWahubKnowledge(item.id, { is_active: true }));
      cache.invalidate();
    } catch (error) {
      cache.put(item);
      toast.error(readableError(error, 'השינוי לא נשמר'));
    } finally {
      setBusyId(null);
    }
  }

  if (knowledge.isLoading) {
    return (
      <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען שעות">
        <Skeleton className="h-12 !rounded-xl" />
        <Skeleton className="h-80 !rounded-2xl" />
      </div>
    );
  }
  if (knowledge.isError) {
    return (
      <div className={s.card}>
        <ErrorState title="לא הצלחנו לטעון את השעות" text={readableError(knowledge.error, '')} onRetry={() => void knowledge.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <NowBox server={serverNow.data} local={local} serverFailed={serverNow.isError} />
      {!hoursItem && (
        <p className={cx(s.strip, 'm-0')} role="status">
          <Clock aria-hidden="true" />
          עוד לא נשמרו שעות משרד. למטה ברירת המחדל שנקבעה (א׳–ה׳ 10:30–18:00); “שמור” יוצר את הרשומה.
        </p>
      )}

      <WeeklyEditor key={hoursItem?.id ?? 'new'} item={hoursItem} specials={specials} now={now} onSaved={onSaved} />

      <section className={s.card} aria-label="ימים מיוחדים">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <span aria-hidden="true" className={s.iconBox}>
            <CalendarDays className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold">ימים מיוחדים</h3>
            <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>חג, ערב חג, יום סגור או שעות שונות – לתאריך או לטווח, עם הודעה משלו. גובר על השבוע הרגיל.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdding((value) => !value);
              setEditingId(null);
            }}
            aria-expanded={adding}
            className={cx(s.btn, s.btnP)}
          >
            <Plus aria-hidden="true" />
            יום מיוחד
          </button>
        </div>

        {adding && (
          <div className="mb-3">
            <KnowledgeEditor kind="special_day" preset={{ scope: { level: 'business', id: null, label: '' } }} saving={saving} onSave={(body) => void saveSpecial(body, null)} onCancel={() => setAdding(false)} />
          </div>
        )}

        {upcoming.length === 0 && !adding ? (
          <p className={cx(s.t2, 'm-0')}>אין ימים מיוחדים קרובים.</p>
        ) : (
          <ul className={cx(s.rows, 'm-0 list-none p-0')}>
            {upcoming.map((item) => (
              <SpecialDayRow key={item.id} item={item} now={now} busy={busyId === item.id} editing={editingId === item.id} onEdit={() => setEditingId(item.id)} onToggle={() => void toggleSpecial(item)}>
                <KnowledgeEditor item={item} kind="special_day" saving={saving} onSave={(body) => void saveSpecial(body, item.id)} onCancel={() => setEditingId(null)} />
              </SpecialDayRow>
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <Fold title="ימים שעברו" count={past.length} className="mt-3">
            <ul className={cx(s.rows, 'm-0 list-none p-0')}>
              {past.map((item) => (
                <SpecialDayRow key={item.id} item={item} now={now} busy={busyId === item.id} editing={editingId === item.id} onEdit={() => setEditingId(item.id)} onToggle={() => void toggleSpecial(item)}>
                  <KnowledgeEditor item={item} kind="special_day" saving={saving} onSave={(body) => void saveSpecial(body, item.id)} onCancel={() => setEditingId(null)} />
                </SpecialDayRow>
              ))}
            </ul>
          </Fold>
        )}
      </section>
    </div>
  );
}
