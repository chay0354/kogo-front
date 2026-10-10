'use client';

import { useState } from 'react';
import { History, Pencil, Power, RotateCcw } from 'lucide-react';
import { certaintyLabel, diffChange, scopeLevelLabel, specialDayLine, stepKindLabel, validityLine, whenToSayLabel } from '@/lib/wahub/bot';
import { agoText, formatDateTime } from '@/lib/wahub/format';
import type { WahubKnowledgeHistoryEntry, WahubKnowledgeItem } from '@/types/wahub';
import { useWahubKnowledgeHistory } from '../../hooks/useBotQueries';
import { InlineConfirm, Pill, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

/** A list the server may give as lines or as one string, shown one per line. */
function listText(value: string[] | string | null | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : String(value);
}

function Field({ label, value, dir }: { label: string; value: string | null | undefined; dir?: 'ltr' | 'auto' }) {
  if (!value) return null;
  return (
    <div className={s.kField}>
      <dt>{label}</dt>
      <dd dir={dir}>{value}</dd>
    </div>
  );
}

/** One version of the history, with the difference it made and a way back to it. */
function HistoryEntry({
  entry,
  current,
  now,
  restoring,
  onRestore,
}: {
  entry: WahubKnowledgeHistoryEntry;
  current: boolean;
  now: Date;
  restoring: boolean;
  onRestore: (version: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const rows = diffChange(entry.before, entry.after);
  return (
    <li className={s.logItem}>
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px]">
        <strong className="font-extrabold">גרסה {entry.version}</strong>
        <span className={s.t2}>
          {entry.changed_by_name || 'אוטומטי'} · {formatDateTime(entry.changed_at, now)}
        </span>
        {current && <Pill tone="success">הנוכחית</Pill>}
      </p>
      {entry.note && (
        <p className="m-0 mt-0.5 text-[13px]" dir="auto">
          {entry.note}
        </p>
      )}
      {rows.length > 0 && (
        <div className={cx(s.diff, 'mt-1.5')}>
          {rows.slice(0, 6).map((row) => (
            <div key={row.key} className={s.diffRow}>
              <span>{row.label}</span>
              <span className={cx(s.diffBefore, !row.changed && s.diffSame)} dir="auto">
                {row.before}
              </span>
              <span className={cx(s.diffAfter, !row.changed && s.diffSame)} dir="auto">
                {row.after}
              </span>
            </div>
          ))}
          {rows.length > 6 && <p className={cx(s.t2, 'm-0')}>ועוד {rows.length - 6} שדות…</p>}
        </div>
      )}
      {!current && (
        <div className="mt-1.5">
          {confirming ? (
            <InlineConfirm
              text={
                <>
                  לחזור ל<strong className="font-extrabold">גרסה {entry.version}</strong>? הגרסה הנוכחית נשמרת בהיסטוריה.
                </>
              }
              confirmLabel="שחזר"
              busy={restoring}
              onConfirm={() => onRestore(entry.version)}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={cx(s.btn, s.btnSm)}>
              <RotateCcw aria-hidden="true" />
              שחזר לגרסה הזו
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function KnowledgeHistory({
  item,
  now,
  restoring,
  onRestore,
}: {
  item: WahubKnowledgeItem;
  now: Date;
  restoring: boolean;
  onRestore: (version: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const history = useWahubKnowledgeHistory(item.id, open);
  const entries = history.data ?? [];
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cx(s.sectTitle, 'flex items-center gap-1.5 border-0 bg-transparent p-0')}
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        היסטוריה
        {item.version > 1 && <span className={s.num}>({item.version} גרסאות)</span>}
      </button>
      {open && (
        <div className="mt-2">
          {history.isLoading ? (
            <p className={cx(s.muted, 'm-0 flex items-center gap-2 text-[13px]')}>
              <Spinner /> טוען…
            </p>
          ) : history.isError ? (
            <p className={cx(s.badText, 'm-0 text-[13px] font-semibold')}>לא הצלחנו לטעון את ההיסטוריה.</p>
          ) : entries.length === 0 ? (
            <p className={cx(s.t2, 'm-0')}>אין עוד שינויים רשומים.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {entries.map((entry) => (
                <HistoryEntry
                  key={entry.version}
                  entry={entry}
                  current={entry.version === item.version}
                  now={now}
                  restoring={restoring}
                  onRestore={onRestore}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

interface KnowledgeCardProps {
  item: WahubKnowledgeItem;
  today: string;
  now: Date;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onRestore: (version: number) => void;
}

/**
 * The open item: everything it holds, in words; then edit, switch off or on,
 * and the folded history with "שחזר".
 */
export default function KnowledgeCard({ item, today, now, busy, onEdit, onToggleActive, onRestore }: KnowledgeCardProps) {
  const validity = validityLine(item, today, now);
  return (
    <div className={cx(s.kBody, 'flex flex-col gap-3')}>
      {item.body && (
        <p className="m-0 whitespace-pre-line text-[14px] leading-relaxed" dir="auto">
          {item.body}
        </p>
      )}

      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {item.kind === 'profile' && <Field label="גיל" value={item.age == null ? '' : String(item.age)} />}
        {item.kind === 'profile' && <Field label="לשון" value={item.voice} />}
        {item.kind === 'profile' && <Field label="פנייה ברירת מחדל" value={item.address_default} />}
        {item.kind === 'profile' && <Field label="אישיות" value={item.personality} />}
        {item.kind === 'profile' && <Field label="ביטויים אסורים" value={listText(item.forbidden_phrases)} />}
        {item.kind === 'phrasing' && <Field label="מפתח" value={item.key} dir="ltr" />}
        {item.kind === 'phrasing' && <Field label="מתי" value={item.when} />}
        {item.kind === 'phrasing' && item.verbatim && <Field label="מילה במילה" value="כן" />}
        {item.kind === 'phrasing' && <Field label="גרסאות חלופיות" value={listText(item.variants)} />}
        {item.kind === 'link' && <Field label="מפתח" value={item.key} dir="ltr" />}
        {item.kind === 'link' && <Field label="כתובת" value={item.url} dir="ltr" />}
        {item.kind === 'link' && <Field label="מתי שולחים" value={item.when} />}
        {item.kind === 'alias' && <Field label="מה הלקוח כותב" value={item.what_customer_writes} dir="auto" />}
        {item.kind === 'alias' && <Field label="הכוונה" value={[item.means, item.means_kind].filter(Boolean).join(' · ')} dir="auto" />}
        {item.kind === 'contact' && <Field label="תפקיד" value={item.role} />}
        {item.kind === 'contact' && <Field label="טלפון" value={item.phone} dir="ltr" />}
        {item.kind === 'contact' && <Field label="מתי מפנים" value={item.when} />}
        {item.kind === 'contact' && <Field label="איך" value={item.how} />}
        {item.kind === 'fact' && <Field label="ודאות" value={certaintyLabel(item.certainty)} />}
        {item.kind === 'topic' && <Field label="משפטי זיהוי" value={listText(item.triggers)} />}
        {item.kind === 'topic' && <Field label="מתי מעבירים לנציג" value={item.handoff_reason} />}
        {item.kind === 'topic' && <Field label="תגית בסוף" value={item.tag} />}
        {item.kind === 'style_rule' && item.enforced_in_code && <Field label="נאכף בקוד" value="כן – הקוד מתקן גם אם הבוט שכח" />}
        {item.kind === 'behavior_rule' && item.priority != null && item.priority !== '' && <Field label="עדיפות" value={String(item.priority)} />}
        {item.kind === 'special_day' && <Field label="מתי" value={specialDayLine(item, now)} />}
        {item.kind === 'special_day' && <Field label="הודעה באותו יום" value={item.message} />}
        <Field label="על מי זה חל" value={item.scope?.label || scopeLevelLabel(item.scope?.level ?? 'business')} />
        {item.kind !== 'special_day' && <Field label="מתי לומר" value={whenToSayLabel(item.when_to_say, item)} />}
        {validity && <Field label="תוקף" value={validity} />}
        <Field label="מקור" value={item.source_note} />
      </dl>

      {item.kind === 'topic' && (item.steps?.length ?? 0) > 0 && (
        <div>
          <p className={cx(s.sectTitle, 'mb-1')}>השלבים</p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {item.steps!.map((step, index) => (
              <li key={index} className="flex items-start gap-2 text-[13.5px] leading-relaxed">
                <Pill tone={step.kind === 'ask' ? 'primary' : step.kind === 'handoff' ? 'warning' : 'neutral'}>{stepKindLabel(step.kind)}</Pill>
                <span className="min-w-0" dir="auto">
                  {step.text}
                  {step.condition && <span className={s.t2}> · אם: {step.condition}</span>}
                  {step.next && <span className={s.t2}> · ואז: {step.next}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(item.example_good || item.example_bad) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {item.example_good && (
            <div className={s.exGood} dir="auto">
              <strong className="font-extrabold">✓ </strong>
              {item.example_good}
            </div>
          )}
          {item.example_bad && (
            <div className={s.exBad} dir="auto">
              <strong className="font-extrabold">✗ </strong>
              {item.example_bad}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} disabled={busy} className={cx(s.btn, s.btnSm, s.btnP)}>
          <Pencil aria-hidden="true" />
          ערוך
        </button>
        <button type="button" onClick={onToggleActive} disabled={busy} className={cx(s.btn, s.btnSm, !item.is_active && s.btnOn)}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Power aria-hidden="true" />}
          {item.is_active ? 'השבת' : 'הפעל מחדש'}
        </button>
        <span className={cx(s.t2, '!text-[11.5px]')}>
          גרסה {item.version} · {item.updated_by_name || 'אוטומטי'} · עודכן {agoText(item.updated_at, now)}
        </span>
      </div>

      <KnowledgeHistory item={item} now={now} restoring={busy} onRestore={onRestore} />
    </div>
  );
}

/** Small, for the row: the pills that say what is special about this item. */
export function ItemPills({ item, today, now }: { item: WahubKnowledgeItem; today: string; now: Date }) {
  const validity = validityLine(item, today, now);
  const expired = validity.startsWith('פג');
  const future = validity.startsWith('יחול');
  return (
    <>
      {!item.is_active && <Pill tone="muted">לא פעיל</Pill>}
      {item.scope && item.scope.level !== 'business' && <Pill tone="primary">{item.scope.label || scopeLevelLabel(item.scope.level)}</Pill>}
      {item.when_to_say === 'internal' && <Pill tone="warning">פנימי</Pill>}
      {item.when_to_say === 'proactive' && <Pill tone="neutral">מיוזמה</Pill>}
      {validity && <Pill tone={expired ? 'danger' : future ? 'warning' : 'success'}>{validity}</Pill>}
    </>
  );
}

