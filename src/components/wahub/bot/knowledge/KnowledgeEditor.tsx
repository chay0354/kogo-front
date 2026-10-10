'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { fetchCourseTypesList, fetchCoursesList } from '@/lib/api';
import { unwrapApiList } from '@/lib/scopedFilters';
import { CERTAINTY, KNOWLEDGE_KINDS, SCOPE_LEVELS, SPECIAL_DAY_STATES, STEP_KINDS, WHEN_TO_SAY, kindDef } from '@/lib/wahub/bot';
import type {
  WahubKnowledgeItem,
  WahubKnowledgeKind,
  WahubKnowledgeWrite,
  WahubScopeLevel,
  WahubTopicStep,
} from '@/types/wahub';
import { Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

/** What the form holds: the write shape, every text field present so the inputs are never undefined. */
interface Draft {
  kind: WahubKnowledgeKind;
  title: string;
  body: string;
  scopeLevel: WahubScopeLevel;
  scopeId: string;
  valid_from: string;
  valid_until: string;
  when_to_say: WahubKnowledgeWrite['when_to_say'];
  example_good: string;
  example_bad: string;
  source_note: string;
  key: string;
  url: string;
  what_customer_writes: string;
  means: string;
  role: string;
  phone: string;
  /** phrasing, link, contact: when it is said / sent / referred to */
  when: string;
  how: string;
  verbatim: boolean;
  triggers: string;
  handoff_reason: string;
  tag: string;
  certainty: string;
  age: string;
  personality: string;
  voice: string;
  address_default: string;
  forbidden_phrases: string;
  steps: WahubTopicStep[];
  date_from: string;
  date_to: string;
  state: NonNullable<WahubKnowledgeWrite['state']>;
  hours_from: string;
  hours_to: string;
  message: string;
}

function toDraft(item: Partial<WahubKnowledgeItem> | undefined, kind: WahubKnowledgeKind): Draft {
  return {
    kind,
    title: item?.title ?? '',
    body: item?.body ?? '',
    scopeLevel: item?.scope?.level ?? 'business',
    scopeId: item?.scope?.id != null ? String(item.scope.id) : '',
    valid_from: item?.valid_from?.slice(0, 10) ?? '',
    valid_until: item?.valid_until?.slice(0, 10) ?? '',
    when_to_say: item?.when_to_say ?? 'if_asked',
    example_good: item?.example_good ?? '',
    example_bad: item?.example_bad ?? '',
    source_note: item?.source_note ?? '',
    key: item?.key ?? '',
    url: item?.url ?? '',
    what_customer_writes: item?.what_customer_writes ?? '',
    means: item?.means ?? '',
    role: item?.role ?? '',
    phone: item?.phone ?? '',
    when: item?.when ?? '',
    how: item?.how ?? '',
    verbatim: Boolean(item?.verbatim),
    triggers: Array.isArray(item?.triggers) ? item.triggers.join('\n') : item?.triggers ?? '',
    handoff_reason: item?.handoff_reason ?? '',
    tag: item?.tag ?? '',
    certainty: item?.certainty ?? '',
    age: item?.age == null ? '' : String(item.age),
    personality: item?.personality ?? '',
    voice: item?.voice ?? '',
    address_default: item?.address_default ?? '',
    forbidden_phrases: Array.isArray(item?.forbidden_phrases) ? item.forbidden_phrases.join('\n') : item?.forbidden_phrases ?? '',
    steps: item?.steps?.map((step) => ({ ...step })) ?? [],
    date_from: item?.date_from?.slice(0, 10) ?? '',
    date_to: item?.date_to?.slice(0, 10) ?? '',
    state: item?.state ?? 'closed',
    hours_from: item?.hours_from?.slice(0, 5) ?? '',
    hours_to: item?.hours_to?.slice(0, 5) ?? '',
    message: item?.message ?? '',
  };
}

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * What the server is asked to save: the columns flat (`scope_level`, `scope_id`),
 * and the fields this kind keeps in its `data` (kogo-back knowledge.py DATA_FIELDS).
 */
export function draftToWrite(draft: Draft): WahubKnowledgeWrite {
  const title =
    draft.kind === 'alias' && !draft.title.trim() && draft.what_customer_writes.trim()
      ? `${draft.what_customer_writes.trim()} ← ${draft.means.trim()}`
      : draft.title.trim();
  const body: WahubKnowledgeWrite = {
    kind: draft.kind,
    title,
    body: draft.body.trim(),
    scope_level: draft.scopeLevel,
    scope_id: draft.scopeLevel === 'business' ? null : draft.scopeId || null,
    valid_from: draft.valid_from || null,
    valid_until: draft.valid_until || null,
    when_to_say: draft.when_to_say,
    example_good: draft.example_good.trim(),
    example_bad: draft.example_bad.trim(),
    source_note: draft.source_note.trim(),
  };
  switch (draft.kind) {
    case 'profile':
      body.name = title;
      body.age = draft.age.trim() || null;
      body.personality = draft.personality.trim();
      body.voice = draft.voice.trim();
      body.address_default = draft.address_default.trim();
      body.forbidden_phrases = lines(draft.forbidden_phrases);
      break;
    case 'phrasing':
      body.key = draft.key.trim();
      body.verbatim = draft.verbatim;
      body.when = draft.when.trim();
      break;
    case 'link':
      body.key = draft.key.trim();
      body.url = draft.url.trim();
      body.when = draft.when.trim();
      break;
    case 'alias':
      body.what_customer_writes = draft.what_customer_writes.trim();
      body.means = draft.means.trim();
      break;
    case 'contact':
      body.name = title;
      body.role = draft.role.trim();
      body.phone = draft.phone.trim();
      body.when = draft.when.trim();
      body.how = draft.how.trim();
      break;
    case 'fact':
      body.certainty = draft.certainty;
      break;
    case 'topic':
      body.triggers = lines(draft.triggers);
      body.handoff_reason = draft.handoff_reason.trim();
      body.tag = draft.tag.trim();
      body.steps = draft.steps
        .filter((step) => step.text.trim())
        .map((step) => ({
          kind: step.kind,
          text: step.text.trim(),
          ...(step.condition?.trim() ? { condition: step.condition.trim() } : {}),
          ...(step.next?.trim() ? { next: step.next.trim() } : {}),
        }));
      break;
    case 'special_day':
      body.date_from = draft.date_from || null;
      body.date_to = draft.date_to || null;
      body.state = draft.state;
      body.hours_from = draft.state === 'hours' || draft.state === 'quiet' ? draft.hours_from || null : null;
      body.hours_to = draft.state === 'hours' || draft.state === 'quiet' ? draft.hours_to || null : null;
      body.message = draft.message.trim();
      break;
    default:
      break;
  }
  return body;
}

/** Why the form cannot be saved yet, in one line; empty when it can. */
export function draftProblem(draft: Draft): string {
  if (draft.kind === 'alias') {
    if (!draft.what_customer_writes.trim()) return 'מה הלקוח כותב?';
    if (!draft.means.trim()) return 'למה הוא מתכוון?';
  } else if (!draft.title.trim()) {
    return 'חסרה כותרת';
  }
  if (draft.kind === 'phrasing' && !draft.key.trim()) return 'לנוסח צריך מפתח (שם קצר באנגלית)';
  if (BODY_REQUIRED.includes(draft.kind) && !draft.body.trim()) return draft.kind === 'phrasing' ? 'חסר הטקסט של הנוסח' : 'חסר התוכן';
  if (draft.kind === 'link' && !/^https?:\/\//.test(draft.url.trim())) return 'הקישור צריך להתחיל ב-https://';
  if (draft.kind === 'special_day' && !draft.date_from) return 'חסר תאריך';
  if (draft.kind === 'special_day' && draft.date_to && draft.date_to < draft.date_from) return 'תאריך הסיום לפני ההתחלה';
  if (
    draft.kind === 'special_day' &&
    (draft.state === 'hours' || draft.state === 'quiet') &&
    !(draft.state === 'quiet' ? draft.hours_to : draft.hours_from && draft.hours_to)
  ) {
    return draft.state === 'quiet' ? 'עד איזו שעה?' : 'חסרות השעות';
  }
  if (draft.scopeLevel !== 'business' && !draft.scopeId) return 'בחרו על מי זה חל';
  if (draft.valid_from && draft.valid_until && draft.valid_until < draft.valid_from) return 'תאריך "עד" לפני "מתאריך"';
  return '';
}

/** The kinds the server refuses without a body (knowledge.py _apply). */
const BODY_REQUIRED: WahubKnowledgeKind[] = ['phrasing', 'style_rule', 'behavior_rule', 'fact', 'topic', 'profile'];

const TITLE_LABEL: Partial<Record<WahubKnowledgeKind, string>> = {
  profile: 'שם הבוט',
  fact: 'השאלה הטיפוסית (או כותרת קצרה)',
  phrasing: 'שם הנוסח',
  topic: 'שם הנושא',
  contact: 'שם',
  link: 'שם הקישור',
  alias: 'כותרת (לא חובה)',
  special_day: 'שם (חג, ערב חג, יום מיוחד)',
};

const BODY_LABEL: Partial<Record<WahubKnowledgeKind, string>> = {
  profile: 'מי הבוט: גיל, תפקיד, אישיות, לשון, פנייה',
  style_rule: 'הכלל',
  behavior_rule: 'מה לעשות, ומתי זה חל',
  phrasing: 'הטקסט, מילה במילה. משתנים: {שם} {טלפון_משרד} {קישור_הרשמה}',
  topic: 'משפטי זיהוי לדוגמה, ומה קורה בסוף',
  fact: 'התשובה הקצרה',
  contact: 'הערות (לא חובה)',
  link: 'הערות (לא חובה)',
  alias: 'הערות (לא חובה)',
  special_day: 'הערות (לא חובה)',
};

interface Option {
  value: string;
  label: string;
}

function useScopeOptions(level: WahubScopeLevel): { options: Option[]; loading: boolean } {
  const { branches, cities, isLoading } = useScopedBranches();
  const courseTypes = useQuery({
    queryKey: ['course-types-list'],
    queryFn: fetchCourseTypesList,
    enabled: level === 'course_type',
    staleTime: 5 * 60_000,
  });
  const courses = useQuery({
    queryKey: ['courses-list'],
    queryFn: fetchCoursesList,
    enabled: level === 'course',
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    switch (level) {
      case 'branch':
        return {
          options: branches.map((branch) => ({ value: String(branch.id), label: branch.name })).sort((a, b) => a.label.localeCompare(b.label, 'he')),
          loading: isLoading,
        };
      case 'city':
        return { options: cities.map((city) => ({ value: city.id, label: city.name })), loading: isLoading };
      case 'course_type':
        return {
          options: unwrapApiList<{ id: string; name: string }>(courseTypes.data).map((type) => ({ value: String(type.id), label: type.name })),
          loading: courseTypes.isLoading,
        };
      case 'course':
        return {
          options: unwrapApiList<{ id: string; name: string; branch_name?: string }>(courses.data).map((course) => ({
            value: String(course.id),
            label: course.branch_name ? `${course.name} · ${course.branch_name}` : course.name,
          })),
          loading: courses.isLoading,
        };
      default:
        return { options: [], loading: false };
    }
  }, [branches, cities, courseTypes.data, courseTypes.isLoading, courses.data, courses.isLoading, isLoading, level]);
}

function StepsEditor({ steps, onChange }: { steps: WahubTopicStep[]; onChange: (steps: WahubTopicStep[]) => void }) {
  function patch(index: number, change: Partial<WahubTopicStep>) {
    onChange(steps.map((step, at) => (at === index ? { ...step, ...change } : step)));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <div className={cx(s.full, 'flex flex-col gap-2')}>
      <p className={cx(s.fieldLabel, 'm-0')}>השלבים</p>
      {steps.length === 0 && <p className={cx(s.t2, 'm-0')}>עוד אין שלבים. שלב הוא שאלה שהבוט שואל, או משפט שהוא אומר.</p>}
      {steps.map((step, index) => (
        <div key={index} className={cx(s.inset, 'flex flex-col gap-2')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx(s.t2, '!font-bold')}>שלב {index + 1}</span>
            <select
              value={step.kind}
              onChange={(event) => patch(index, { kind: event.target.value as WahubTopicStep['kind'] })}
              aria-label={`סוג השלב ${index + 1}`}
              className={cx(s.field, s.fieldSm)}
            >
              {STEP_KINDS.map((def) => (
                <option key={def.value} value={def.value}>
                  {def.label}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="הזז למעלה" className={cx(s.ib, s.ibSm)}>
              <ArrowUp aria-hidden="true" />
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label="הזז למטה" className={cx(s.ib, s.ibSm)}>
              <ArrowDown aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, at) => at !== index))}
              aria-label={`מחק את שלב ${index + 1}`}
              className={cx(s.ib, s.ibSm, s.ibBad)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          <textarea
            value={step.text}
            onChange={(event) => patch(index, { text: event.target.value })}
            rows={2}
            maxLength={2000}
            placeholder={step.kind === 'ask' ? 'מה הבוט שואל?' : step.kind === 'say' ? 'מה הבוט אומר?' : 'מה קורה בשלב הזה?'}
            aria-label={`הטקסט של שלב ${index + 1}`}
            className={s.field}
          />
          <div className={s.form}>
            <label>
              תנאי (לא חובה)
              <input
                type="text"
                value={step.condition ?? ''}
                onChange={(event) => patch(index, { condition: event.target.value })}
                maxLength={200}
                placeholder="למשל: הלקוח ענה כן"
              />
            </label>
            <label>
              ואז (לא חובה)
              <input
                type="text"
                value={step.next ?? ''}
                onChange={(event) => patch(index, { next: event.target.value })}
                maxLength={200}
                placeholder="למשל: שלב 3 / העברה לנציג / סיום"
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...steps, { kind: 'ask', text: '' }])} className={cx(s.btn, s.btnSm, 'self-start')}>
        <Plus aria-hidden="true" />
        שלב
      </button>
    </div>
  );
}

interface KnowledgeEditorProps {
  /** The item being changed; absent for a new one. */
  item?: WahubKnowledgeItem;
  /** For a new item: its kind and whatever the questionnaire already decided. */
  kind: WahubKnowledgeKind;
  preset?: Partial<WahubKnowledgeItem>;
  saving: boolean;
  onSave: (body: WahubKnowledgeWrite) => void;
  onCancel: () => void;
}

/**
 * One form for every kind of knowledge, inside the page. The fields a kind
 * does not have are simply not there. Nothing is saved until "שמור".
 */
export default function KnowledgeEditor({ item, kind, preset, saving, onSave, onCancel }: KnowledgeEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item ?? preset, item?.kind ?? kind));
  const scope = useScopeOptions(draft.scopeLevel);
  const problem = draftProblem(draft);
  const def = kindDef(draft.kind);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const withHours = draft.kind === 'special_day' && (draft.state === 'hours' || draft.state === 'quiet');
  const hoursOnly = draft.kind === 'special_day';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !saving) onSave(draftToWrite(draft));
      }}
      className={cx(s.inset, 'flex flex-col gap-3')}
      aria-label={item ? `עריכת ${item.title}` : `רשומה חדשה: ${def.label}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx(s.pill, s.pNav)}>{def.label}</span>
        {!item && (
          <select
            value={draft.kind}
            onChange={(event) => set('kind', event.target.value as WahubKnowledgeKind)}
            aria-label="סוג הרשומה"
            className={cx(s.field, s.fieldSm)}
          >
            {KNOWLEDGE_KINDS.filter((entry) => entry.kind !== 'office_hours').map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        )}
        {def.hint && <span className={cx(s.t2, '!text-[12px]')}>{def.hint}</span>}
      </div>

      <div className={s.form}>
        {draft.kind === 'alias' ? (
          <>
            <label>
              מה הלקוח כותב
              <input type="text" value={draft.what_customer_writes} onChange={(event) => set('what_customer_writes', event.target.value)} maxLength={120} autoFocus placeholder="מרכז זמיר" />
            </label>
            <label>
              למה הוא מתכוון (סניף / תחום / חוג)
              <input type="text" value={draft.means} onChange={(event) => set('means', event.target.value)} maxLength={120} placeholder="כפר גנים" />
            </label>
          </>
        ) : (
          <label className={s.full}>
            {TITLE_LABEL[draft.kind] ?? 'כותרת'}
            <input type="text" value={draft.title} onChange={(event) => set('title', event.target.value)} maxLength={200} autoFocus />
          </label>
        )}

        {draft.kind === 'profile' && (
          <>
            <label>
              גיל
              <input type="text" value={draft.age} onChange={(event) => set('age', event.target.value)} maxLength={10} placeholder="25" />
            </label>
            <label>
              לשון הבוט
              <input type="text" value={draft.voice} onChange={(event) => set('voice', event.target.value)} maxLength={200} placeholder="נקבה; פנייה ללקוח בזכר" />
            </label>
            <label>
              פנייה ברירת מחדל
              <input type="text" value={draft.address_default} onChange={(event) => set('address_default', event.target.value)} maxLength={200} placeholder="היי {שם}" />
            </label>
            <label>
              אישיות (עד 5 שורות)
              <textarea value={draft.personality} onChange={(event) => set('personality', event.target.value)} rows={3} maxLength={2000} />
            </label>
            <label className={s.full}>
              ביטויים אסורים (שורה לכל ביטוי)
              <textarea value={draft.forbidden_phrases} onChange={(event) => set('forbidden_phrases', event.target.value)} rows={2} maxLength={2000} placeholder="אשמח לעזור!" />
            </label>
          </>
        )}
        {draft.kind === 'phrasing' && (
          <>
            <label>
              מפתח (שם קצר באנגלית, ייחודי)
              <input type="text" value={draft.key} onChange={(event) => set('key', event.target.value)} maxLength={80} dir="ltr" placeholder="greeting_morning" className={s.fieldLtr} />
            </label>
            <label>
              מתי אומרים את זה
              <input type="text" value={draft.when} onChange={(event) => set('when', event.target.value)} maxLength={300} placeholder="כשמגיעה הודעה קולית" />
            </label>
            <label className={cx(s.full, '!flex-row items-center gap-2')}>
              <input type="checkbox" checked={draft.verbatim} onChange={(event) => set('verbatim', event.target.checked)} className="!h-4 !w-4" />
              מילה במילה (הבוט לא משנה את הנוסח)
            </label>
          </>
        )}
        {draft.kind === 'link' && (
          <>
            <label>
              מפתח (לא חובה)
              <input type="text" value={draft.key} onChange={(event) => set('key', event.target.value)} maxLength={80} dir="ltr" placeholder="cancel_form" className={s.fieldLtr} />
            </label>
            <label>
              הכתובת
              <input type="url" value={draft.url} onChange={(event) => set('url', event.target.value)} maxLength={1000} dir="ltr" placeholder="https://…" className={s.fieldLtr} />
            </label>
            <label className={s.full}>
              מתי שולחים אותו
              <input type="text" value={draft.when} onChange={(event) => set('when', event.target.value)} maxLength={300} placeholder="כשמבקשים לבטל" />
            </label>
          </>
        )}
        {draft.kind === 'contact' && (
          <>
            <label>
              תפקיד
              <input type="text" value={draft.role} onChange={(event) => set('role', event.target.value)} maxLength={120} placeholder="נציגת שירות / מנהל סניף" />
            </label>
            <label>
              טלפון
              <input type="tel" value={draft.phone} onChange={(event) => set('phone', event.target.value)} maxLength={40} dir="ltr" className={s.fieldLtr} />
            </label>
            <label>
              מתי מפנים אליו
              <input type="text" value={draft.when} onChange={(event) => set('when', event.target.value)} maxLength={300} placeholder="שאלות על אירועים פרטיים" />
            </label>
            <label>
              איך (מסירת מספר / העברה לנציג)
              <input type="text" value={draft.how} onChange={(event) => set('how', event.target.value)} maxLength={300} />
            </label>
          </>
        )}
        {draft.kind === 'fact' && (
          <label>
            ודאות
            <select value={draft.certainty} onChange={(event) => set('certainty', event.target.value)}>
              {CERTAINTY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.kind === 'topic' && (
          <>
            <label className={s.full}>
              משפטי זיהוי (שורה לכל משפט שלקוח עשוי לכתוב)
              <textarea value={draft.triggers} onChange={(event) => set('triggers', event.target.value)} rows={2} maxLength={2000} placeholder={'אני רוצה לבטל\nלהפסיק את החוג'} />
            </label>
            <label>
              מתי מעבירים לנציג (לא חובה)
              <input type="text" value={draft.handoff_reason} onChange={(event) => set('handoff_reason', event.target.value)} maxLength={200} />
            </label>
            <label>
              תגית בסוף (לא חובה)
              <input type="text" value={draft.tag} onChange={(event) => set('tag', event.target.value)} maxLength={60} placeholder="ברכת יום הולדת" />
            </label>
          </>
        )}
        {hoursOnly && (
          <>
            <label>
              מתאריך
              <input type="date" value={draft.date_from} onChange={(event) => set('date_from', event.target.value)} />
            </label>
            <label>
              עד תאריך (לא חובה)
              <input type="date" value={draft.date_to} onChange={(event) => set('date_to', event.target.value)} min={draft.date_from || undefined} />
            </label>
            <label>
              מצב
              <select value={draft.state} onChange={(event) => set('state', event.target.value as Draft['state'])}>
                {SPECIAL_DAY_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </label>
            {withHours && (
              <div className="flex flex-wrap items-end gap-2">
                {draft.state === 'hours' && (
                  <label className="!flex-1">
                    משעה
                    <input type="time" value={draft.hours_from} onChange={(event) => set('hours_from', event.target.value)} dir="ltr" />
                  </label>
                )}
                <label className="!flex-1">
                  עד שעה
                  <input type="time" value={draft.hours_to} onChange={(event) => set('hours_to', event.target.value)} dir="ltr" />
                </label>
              </div>
            )}
            <label className={s.full}>
              הודעה ללקוח באותו יום (לא חובה; בלי זה – הודעת “סגור” הרגילה)
              <textarea value={draft.message} onChange={(event) => set('message', event.target.value)} rows={2} maxLength={1000} />
            </label>
          </>
        )}

        <label className={s.full}>
          {BODY_LABEL[draft.kind] ?? 'התוכן'}
          <textarea value={draft.body} onChange={(event) => set('body', event.target.value)} rows={draft.kind === 'profile' ? 6 : 3} maxLength={6000} />
        </label>

        {draft.kind === 'topic' && <StepsEditor steps={draft.steps} onChange={(steps) => set('steps', steps)} />}

        <label>
          על מי זה חל
          <select
            value={draft.scopeLevel}
            onChange={(event) => {
              set('scopeLevel', event.target.value as WahubScopeLevel);
              set('scopeId', '');
            }}
          >
            {SCOPE_LEVELS.map((level) => (
              <option key={level.level} value={level.level}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
        {draft.scopeLevel !== 'business' && (
          <label>
            {SCOPE_LEVELS.find((level) => level.level === draft.scopeLevel)?.label}
            <select value={draft.scopeId} onChange={(event) => set('scopeId', event.target.value)} disabled={scope.loading}>
              <option value="">{scope.loading ? 'טוען…' : 'בחרו…'}</option>
              {scope.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!hoursOnly && (
          <>
            <label>
              בתוקף מתאריך (לא חובה)
              <input type="date" value={draft.valid_from} onChange={(event) => set('valid_from', event.target.value)} />
            </label>
            <label>
              עד תאריך (לא חובה)
              <input type="date" value={draft.valid_until} onChange={(event) => set('valid_until', event.target.value)} min={draft.valid_from || undefined} />
            </label>
            <label className={s.full}>
              מתי לומר
              <select value={draft.when_to_say} onChange={(event) => set('when_to_say', event.target.value as Draft['when_to_say'])}>
                {WHEN_TO_SAY.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} – {option.hint}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ✓ דוגמה טובה (לא חובה)
              <textarea value={draft.example_good} onChange={(event) => set('example_good', event.target.value)} rows={2} maxLength={2000} />
            </label>
            <label>
              ✗ דוגמה רעה (לא חובה)
              <textarea value={draft.example_bad} onChange={(event) => set('example_bad', event.target.value)} rows={2} maxLength={2000} />
            </label>
          </>
        )}
        <label className={s.full}>
          מקור (לא חובה: שיחה, תאריך, מי החליט)
          <input type="text" value={draft.source_note} onChange={(event) => set('source_note', event.target.value)} maxLength={300} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={Boolean(problem) || saving} className={cx(s.btn, s.btnSm, s.btnP)}>
          {saving && <Spinner className="h-3.5 w-3.5" />}
          {item ? 'שמור' : 'הוסף'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={cx(s.btn, s.btnSm)}>
          ביטול
        </button>
        {problem && <span className={cx(s.t2, s.warnText, '!text-[12.5px] font-bold')}>{problem}</span>}
      </div>
    </form>
  );
}
