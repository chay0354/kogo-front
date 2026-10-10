import type {
  WahubBotSub,
  WahubContact,
  WahubKnowledgeItem,
  WahubKnowledgeKind,
  WahubKnowledgeProposal,
  WahubMessage,
  WahubOfficeDay,
  WahubOfficeSendMode,
  WahubOfficeWeekly,
  WahubReviewSummary,
  WahubScopeLevel,
  WahubShadowReply,
  WahubShadowTool,
  WahubSpecialDayState,
  WahubTopicStepKind,
  WahubWeekday,
  WahubWhenToSay,
} from '@/types/wahub';
import { agoText, dayKey, durationText, formatClock, formatShortDate, israelToday } from './format';

/**
 * The "הבוט" tab's own rules: what the kinds of knowledge are called, where a
 * new piece of knowledge belongs, whether the office is open by the hours on
 * screen, and how the shadow bot's replies sit under the customer's messages.
 * Nothing here talks to the server.
 */

// ---------------------------------------------------------------------------
// The sub-tabs
// ---------------------------------------------------------------------------

export const BOT_SUBS: Array<{ key: WahubBotSub; label: string; hint: string }> = [
  { key: 'knowledge', label: 'ידע', hint: 'מה הבוט יודע, לפי סוג' },
  { key: 'hours', label: 'שעות ומועדים', hint: 'שעות המשרד וימים מיוחדים' },
  { key: 'try', label: 'נסה שאלה', hint: 'מה הבוט החדש היה עונה עכשיו' },
  { key: 'shadow', label: 'תשובות בצל', hint: 'הישן ענה / החדש היה עונה' },
  { key: 'review', label: 'ביקורת', hint: 'הצעות לעדכון הבוט: מה אושר ומה נדחה' },
  { key: 'demo', label: 'דמו', hint: 'לקוחות מומצאים, כדי לראות איך המערכת חיה' },
];

// ---------------------------------------------------------------------------
// Kinds, scopes, labels
// ---------------------------------------------------------------------------

export interface KindDef {
  kind: WahubKnowledgeKind;
  label: string;
  hint: string;
  /** One item only (the profile, the office hours). */
  single?: boolean;
}

export const KNOWLEDGE_KINDS: KindDef[] = [
  { kind: 'profile', label: 'פרופיל הבוט', hint: 'מי הבוט: שם, תפקיד, אישיות ולשון', single: true },
  { kind: 'style_rule', label: 'כללי עיצוב', hint: 'איך ההודעה נראית: עברית בלבד, כוכבית אחת, ₪ לפני המספר' },
  { kind: 'behavior_rule', label: 'כללי התנהגות', hint: 'מה הבוט עושה ומה לא: מתי מפנה, מה לא מציע' },
  { kind: 'phrasing', label: 'נוסחים', hint: 'משפטים שנאמרים מילה במילה, עם משתנים כמו {שם}' },
  { kind: 'topic', label: 'נושאים (תסריטים)', hint: 'שיחה בכמה שלבים: הרשמה, ביטול, יום הולדת' },
  { kind: 'fact', label: 'עובדות', hint: 'מידע על העסק שאין לו בית בכרטיס חוג או סניף' },
  { kind: 'contact', label: 'אנשי קשר והפניות', hint: 'מי מקבל מה, ואיך מפנים אליו' },
  { kind: 'link', label: 'קישורים', hint: 'כתובות שהבוט שולח, ומתי' },
  { kind: 'alias', label: 'כינויים', hint: 'מה הלקוח כותב, ולמה הוא מתכוון' },
  { kind: 'special_day', label: 'ימים מיוחדים', hint: 'חג, ערב חג, יום סגור או שעות שונות' },
  { kind: 'office_hours', label: 'שעות המשרד', hint: 'השבוע הרגיל והודעת "סגור"', single: true },
];

/** The kinds the "שעות ומועדים" sub-tab owns; the knowledge list leaves them out. */
export const HOURS_KINDS: WahubKnowledgeKind[] = ['special_day', 'office_hours'];

export const KNOWLEDGE_TAB_KINDS: KindDef[] = KNOWLEDGE_KINDS.filter((def) => !HOURS_KINDS.includes(def.kind));

export function kindDef(kind: WahubKnowledgeKind): KindDef {
  return KNOWLEDGE_KINDS.find((def) => def.kind === kind) ?? { kind, label: kind, hint: '' };
}

/** The server's label when it gave one, the screen's otherwise. */
export function kindLabel(kind: WahubKnowledgeKind, item?: Pick<WahubKnowledgeItem, 'kind_label'> | null): string {
  return item?.kind_label || kindDef(kind).label;
}

export const SCOPE_LEVELS: Array<{ level: WahubScopeLevel; label: string }> = [
  { level: 'business', label: 'כל העסק' },
  { level: 'city', label: 'עיר' },
  { level: 'branch', label: 'סניף' },
  { level: 'course_type', label: 'תחום' },
  { level: 'course', label: 'חוג' },
];

export function scopeLevelLabel(level: WahubScopeLevel): string {
  return SCOPE_LEVELS.find((def) => def.level === level)?.label ?? level;
}

export const WHEN_TO_SAY: Array<{ value: WahubWhenToSay; label: string; hint: string }> = [
  { value: 'proactive', label: 'מיוזמה כשרלוונטי', hint: 'הבוט מעלה את זה בעצמו כשזה נוגע לשיחה' },
  { value: 'if_asked', label: 'רק אם שואלים', hint: 'נאמר רק כשהלקוח שואל על זה במפורש' },
  { value: 'internal', label: 'הנחיה פנימית', hint: 'מכוון את הבוט; לא נאמר ללקוח לעולם' },
];

export function whenToSayLabel(value: WahubWhenToSay, item?: Pick<WahubKnowledgeItem, 'when_to_say_label'> | null): string {
  return item?.when_to_say_label || WHEN_TO_SAY.find((def) => def.value === value)?.label || value;
}

export const SPECIAL_DAY_STATES: Array<{ value: WahubSpecialDayState; label: string }> = [
  { value: 'closed', label: 'סגור' },
  { value: 'open', label: 'פתוח כרגיל' },
  { value: 'hours', label: 'שעות שונות' },
  { value: 'quiet', label: 'פעילות שקטה' },
];

export function specialDayStateLabel(state: WahubSpecialDayState | undefined, item?: Pick<WahubKnowledgeItem, 'state_label'> | null): string {
  if (item?.state_label) return item.state_label;
  return SPECIAL_DAY_STATES.find((def) => def.value === state)?.label ?? '';
}

export const SEND_MODES: Array<{ value: WahubOfficeSendMode; label: string; hint: string }> = [
  { value: 'on_agent_request', label: 'רק כשמבקשים נציג', hint: 'מחוץ לשעות, בקשה לנציג מקבלת את הודעת "סגור" במקום העברה' },
  { value: 'always', label: 'בכל פנייה מחוץ לשעות', hint: 'כל הודעה מחוץ לשעות נענית בהודעת "סגור" בלבד' },
  { value: 'on_takeover', label: 'כשנציג לוקח שיחה', hint: 'כשנציג לוקח שיחה מחוץ לשעות, הלקוח מקבל "נחזור בשעות הפעילות"' },
];

export function sendModeLabel(value: WahubOfficeSendMode | undefined, item?: Pick<WahubKnowledgeItem, 'send_mode_label'> | null): string {
  if (item?.send_mode_label) return item.send_mode_label;
  return SEND_MODES.find((def) => def.value === value)?.label ?? '';
}

/** The kinds of a topic's steps (the server's STEP_KINDS). */
export const STEP_KINDS: Array<{ value: WahubTopicStepKind; label: string }> = [
  { value: 'ask', label: 'שאלה' },
  { value: 'say', label: 'משפט' },
  { value: 'handoff', label: 'העברה לנציג' },
  { value: 'tool', label: 'קריאה לכלי' },
  { value: 'tag', label: 'תגית על איש הקשר' },
];

export function stepKindLabel(kind: WahubTopicStepKind | string): string {
  return STEP_KINDS.find((def) => def.value === kind)?.label ?? kind;
}

/** How sure a fact is: said as is, or softened to "למיטב ידיעתנו". */
export const CERTAINTY: Array<{ value: string; label: string }> = [
  { value: '', label: 'לא צוין' },
  { value: 'sure', label: 'בטוח' },
  { value: 'unsure', label: 'למיטב ידיעתנו' },
];

export function certaintyLabel(value: string | null | undefined): string {
  return CERTAINTY.find((def) => def.value === (value ?? ''))?.label ?? String(value ?? '');
}

export const WEEKDAYS: Array<{ key: WahubWeekday; label: string }> = [
  { key: 'sun', label: 'ראשון' },
  { key: 'mon', label: 'שני' },
  { key: 'tue', label: 'שלישי' },
  { key: 'wed', label: 'רביעי' },
  { key: 'thu', label: 'חמישי' },
  { key: 'fri', label: 'שישי' },
  { key: 'sat', label: 'שבת' },
];

const CLOSED_DAY: WahubOfficeDay = { open: false, from: '', to: '', message: '' };

/** The owner's decision of 10.10.2026: Sunday to Thursday, 10:30 to 18:00. */
export const DEFAULT_WEEKLY: WahubOfficeWeekly = {
  sun: { open: true, from: '10:30', to: '18:00', message: '' },
  mon: { open: true, from: '10:30', to: '18:00', message: '' },
  tue: { open: true, from: '10:30', to: '18:00', message: '' },
  wed: { open: true, from: '10:30', to: '18:00', message: '' },
  thu: { open: true, from: '10:30', to: '18:00', message: '' },
  fri: { ...CLOSED_DAY },
  sat: { ...CLOSED_DAY },
};

/** The old panel's default (docs/bot-knowledge/03), kept as the starting text. */
export const DEFAULT_CLOSED_MESSAGE = 'ראינו את הפנייה שלך,\n*המשרד סגור כרגע, נחזור אליך בשעות הפעילות* ✨';

/** A whole week, whatever the server left out: a missing day is a closed day. */
export function completeWeekly(weekly: Partial<Record<WahubWeekday, Partial<WahubOfficeDay>>> | null | undefined): WahubOfficeWeekly {
  const out = {} as WahubOfficeWeekly;
  for (const { key } of WEEKDAYS) {
    const day = weekly?.[key];
    out[key] = day
      ? { open: Boolean(day.open), from: day.from ?? '', to: day.to ?? '', message: day.message ?? '' }
      : { ...CLOSED_DAY };
  }
  return out;
}

// ---------------------------------------------------------------------------
// The knowledge list: groups, search, validity
// ---------------------------------------------------------------------------

export interface KnowledgeGroup {
  kind: WahubKnowledgeKind;
  label: string;
  hint: string;
  items: WahubKnowledgeItem[];
}

function compareItems(a: WahubKnowledgeItem, b: WahubKnowledgeItem): number {
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
  return (a.title || '').localeCompare(b.title || '', 'he') || a.id - b.id;
}

/**
 * The items by kind, in the fixed order of the kinds. Every kind asked for is
 * a group, even an empty one, so the screen can offer "הוסף" under it. A kind
 * the screen does not know is appended under the server's own label.
 */
export function groupKnowledgeByKind(
  items: ReadonlyArray<WahubKnowledgeItem>,
  kinds: ReadonlyArray<KindDef> = KNOWLEDGE_TAB_KINDS,
): KnowledgeGroup[] {
  const groups = kinds.map<KnowledgeGroup>((def) => ({ kind: def.kind, label: def.label, hint: def.hint, items: [] }));
  const byKind = new Map(groups.map((group) => [group.kind, group]));
  for (const item of items) {
    let group = byKind.get(item.kind);
    if (!group) {
      group = { kind: item.kind, label: item.kind_label || item.kind, hint: '', items: [] };
      byKind.set(item.kind, group);
      groups.push(group);
    }
    if (item.kind_label && group.label === kindDef(item.kind).label && !kinds.some((def) => def.kind === item.kind)) {
      group.label = item.kind_label;
    }
    group.items.push(item);
  }
  for (const group of groups) group.items.sort(compareItems);
  return groups;
}

export interface KnowledgeFilter {
  search?: string;
  kind?: WahubKnowledgeKind | '';
  scopeLevel?: WahubScopeLevel | '';
  includeInactive?: boolean;
}

const SEARCH_FIELDS: Array<keyof WahubKnowledgeItem> = [
  'title',
  'body',
  'key',
  'url',
  'what_customer_writes',
  'means',
  'example_good',
  'example_bad',
  'phone',
  'role',
  'message',
  'source_note',
];

function matchesSearch(item: WahubKnowledgeItem, needle: string): boolean {
  if (!needle) return true;
  for (const field of SEARCH_FIELDS) {
    const value = item[field];
    if (typeof value === 'string' && value.toLowerCase().includes(needle)) return true;
  }
  if (item.scope?.label?.toLowerCase().includes(needle)) return true;
  if (item.steps?.some((step) => step.text?.toLowerCase().includes(needle))) return true;
  return false;
}

/** Search, kind and scope, in the browser: the knowledge is small and the answer should be instant. */
export function filterKnowledge(items: ReadonlyArray<WahubKnowledgeItem>, filter: KnowledgeFilter): WahubKnowledgeItem[] {
  const needle = (filter.search ?? '').trim().toLowerCase();
  return items.filter((item) => {
    if (!filter.includeInactive && !item.is_active) return false;
    if (filter.kind && item.kind !== filter.kind) return false;
    if (filter.scopeLevel && item.scope?.level !== filter.scopeLevel) return false;
    return matchesSearch(item, needle);
  });
}

export type Validity = 'always' | 'current' | 'future' | 'expired';

/** Where an item stands against today: no dates, inside them, not yet, or over. */
export function validityState(item: Pick<WahubKnowledgeItem, 'valid_from' | 'valid_until'>, today: string): Validity {
  const from = item.valid_from?.slice(0, 10) ?? '';
  const until = item.valid_until?.slice(0, 10) ?? '';
  if (!from && !until) return 'always';
  if (from && today < from) return 'future';
  if (until && today > until) return 'expired';
  return 'current';
}

export function validityLine(item: Pick<WahubKnowledgeItem, 'valid_from' | 'valid_until'>, today: string, now: Date): string {
  const state = validityState(item, today);
  const from = item.valid_from ? formatShortDate(item.valid_from, now) : '';
  const until = item.valid_until ? formatShortDate(item.valid_until, now) : '';
  if (state === 'always') return '';
  if (state === 'expired') return `פג תוקף ב-${until}`;
  if (state === 'future') return `יחול מ-${from}`;
  if (from && until) return `בתוקף ${from}–${until}`;
  if (until) return `בתוקף עד ${until}`;
  return `בתוקף מ-${from}`;
}

// ---------------------------------------------------------------------------
// "איפה זה שייך" — the questionnaire of docs/bot-knowledge/00 §3.4
// ---------------------------------------------------------------------------

export type BelongWhat = 'style' | 'behavior' | 'phrasing' | 'topic' | 'info';

export const BELONG_WHAT: Array<{ value: BelongWhat; label: string; hint: string }> = [
  { value: 'behavior', label: 'איך הבוט מתנהג', hint: 'מתי מפנה, מה לא מציע, מה שואל קודם' },
  { value: 'style', label: 'איך הבוט כותב', hint: 'עיצוב ההודעה: אותיות, כוכביות, ₪, קישורים' },
  { value: 'phrasing', label: 'משפט שנאמר מילה במילה', hint: 'ברכה, "אין לי את הפרט הזה", הודעת סגור' },
  { value: 'topic', label: 'שיחה עם כמה שלבים', hint: 'הרשמה, ביטול, יום הולדת, השכרה' },
  { value: 'info', label: 'מידע על העסק', hint: 'עובדה, איש קשר, קישור או כינוי' },
];

export type KogoFact = 'price' | 'hours' | 'address' | 'instructor' | 'course' | 'closing_date' | 'discount' | 'bring';

export interface KogoFactDef {
  value: KogoFact;
  label: string;
  /** Where in Kogo it lives, in words. */
  where: string;
  href: string;
}

/** Facts that already have a home in Kogo. The bot reads them from there; the knowledge never repeats them. */
export const KOGO_FACTS: KogoFactDef[] = [
  { value: 'price', label: 'מחיר', where: 'כרטיס החוג', href: '/courses' },
  { value: 'hours', label: 'שעה או יום של חוג', where: 'מערכת השעות', href: '/schedule' },
  { value: 'address', label: 'כתובת או הוראות הגעה', where: 'כרטיס הסניף', href: '/branches' },
  { value: 'instructor', label: 'מדריך', where: 'כרטיס החוג', href: '/courses' },
  { value: 'course', label: 'חוג או קבוצה', where: 'כרטיס החוג', href: '/courses' },
  { value: 'closing_date', label: 'תאריך סגירה או חסימת ניסיון', where: 'הגדרות › ניסיונות', href: '/settings/trials' },
  { value: 'discount', label: 'הנחה או דמי רישום', where: 'הנחות', href: '/discounts' },
  { value: 'bring', label: 'מה להביא לשיעור', where: 'כרטיס התחום', href: '/courses' },
];

export type InfoKind = 'fact' | 'contact' | 'link' | 'alias';

export const INFO_KINDS: Array<{ value: InfoKind; label: string; hint: string }> = [
  { value: 'fact', label: 'עובדה', hint: 'מדיניות, תשלום, ביגוד, הרשמה' },
  { value: 'contact', label: 'איש קשר או הפניה', hint: 'מי מטפל, הטלפון, מתי מפנים' },
  { value: 'link', label: 'קישור', hint: 'כתובת שהבוט שולח' },
  { value: 'alias', label: 'כינוי', hint: '"מרכז זמיר" = כפר גנים' },
];

export interface BelongAnswers {
  what?: BelongWhat;
  /** The answer to "is it a price, an hour, …?": one of them, or `none`. */
  kogo?: KogoFact | 'none';
  info?: InfoKind;
}

export type BelongResult =
  | { target: 'ask'; question: 'what' | 'kogo' | 'info' }
  | { target: 'kogo'; fact: KogoFactDef }
  | { target: 'kind'; kind: WahubKnowledgeKind };

/**
 * Where a new piece of knowledge belongs, from the answers so far. A fact
 * Kogo already holds is sent to its card, never written twice.
 */
export function belongsTo(answers: BelongAnswers): BelongResult {
  switch (answers.what) {
    case undefined:
      return { target: 'ask', question: 'what' };
    case 'style':
      return { target: 'kind', kind: 'style_rule' };
    case 'behavior':
      return { target: 'kind', kind: 'behavior_rule' };
    case 'phrasing':
      return { target: 'kind', kind: 'phrasing' };
    case 'topic':
      return { target: 'kind', kind: 'topic' };
    case 'info': {
      if (!answers.kogo) return { target: 'ask', question: 'kogo' };
      if (answers.kogo !== 'none') {
        const fact = KOGO_FACTS.find((def) => def.value === answers.kogo);
        if (fact) return { target: 'kogo', fact };
      }
      if (!answers.info) return { target: 'ask', question: 'info' };
      return { target: 'kind', kind: answers.info };
    }
  }
}

// ---------------------------------------------------------------------------
// Office hours: open right now, by the data on screen
// ---------------------------------------------------------------------------

const WEEKDAY_KEYS: WahubWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The weekday in Israel of a moment. */
export function israelWeekday(now: Date): WahubWeekday {
  const key = dayKey(now);
  const [year, month, day] = key.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay()];
}

function clockOf(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

/** The special day that covers a date, if any (active ones only; a range includes both ends). */
export function specialDayFor(specials: ReadonlyArray<WahubKnowledgeItem>, today: string): WahubKnowledgeItem | null {
  for (const item of specials) {
    if (item.kind !== 'special_day' || !item.is_active) continue;
    const from = item.date_from?.slice(0, 10) ?? '';
    if (!from) continue;
    const to = item.date_to?.slice(0, 10) || from;
    if (from <= today && today <= to) return item;
  }
  return null;
}

export interface OpenNow {
  open: boolean;
  /** What decided it. */
  by: 'special' | 'weekly';
  /** "פתוח עד 18:00", "סגור · נפתח ב-10:30", "סגור · פסח". */
  label: string;
  special: WahubKnowledgeItem | null;
  /** What the customer would be told, when closed. */
  message: string;
}

/**
 * Open or closed right now, from the week and the special days as they are on
 * screen — so an edit can be seen before it is saved. The server's own answer
 * (knowledge/office-hours/now/) is the one the bot uses.
 */
export function officeOpenNow(
  weekly: WahubOfficeWeekly,
  specials: ReadonlyArray<WahubKnowledgeItem>,
  now: Date,
  defaultClosedMessage = '',
): OpenNow {
  const today = israelToday(now);
  const clock = formatClock(now);
  const special = specialDayFor(specials, today);
  const dayKeyNow = israelWeekday(now);
  const day = weekly[dayKeyNow] ?? CLOSED_DAY;

  if (special && special.state && special.state !== 'open') {
    const title = special.title || specialDayStateLabel(special.state, special);
    const message = special.message || defaultClosedMessage;
    if (special.state === 'closed') {
      return { open: false, by: 'special', label: `סגור · ${title}`, special, message };
    }
    const from = clockOf(special.hours_from);
    const to = clockOf(special.hours_to);
    if (special.state === 'hours') {
      const open = Boolean(from && to && from <= clock && clock < to);
      return {
        open,
        by: 'special',
        label: open ? `פתוח עד ${to} · ${title}` : clock < from ? `סגור · נפתח ב-${from} · ${title}` : `סגור · ${title}`,
        special,
        message,
      };
    }
    // quiet: quiet activity until `hours_to`; the regular day after that.
    if (to && clock < to) {
      return { open: false, by: 'special', label: `פעילות שקטה עד ${to} · ${title}`, special, message };
    }
  }

  const message = day.message || defaultClosedMessage;
  if (!day.open || !day.from || !day.to) {
    return { open: false, by: 'weekly', label: 'סגור היום', special, message };
  }
  const from = clockOf(day.from);
  const to = clockOf(day.to);
  if (clock < from) return { open: false, by: 'weekly', label: `סגור · נפתח ב-${from}`, special, message };
  if (clock >= to) return { open: false, by: 'weekly', label: `סגור · נסגר ב-${to}`, special, message };
  return { open: true, by: 'weekly', label: `פתוח עד ${to}`, special, message };
}

/** "21.4–28.4 · סגור" / "11.5 · פעילות שקטה עד 13:00" */
export function specialDayLine(item: WahubKnowledgeItem, now: Date): string {
  const from = item.date_from ? formatShortDate(item.date_from, now) : '';
  const to = item.date_to && item.date_to !== item.date_from ? formatShortDate(item.date_to, now) : '';
  const dates = to ? `${from}–${to}` : from;
  const state = specialDayStateLabel(item.state, item);
  const hours =
    item.state === 'hours' && item.hours_from && item.hours_to
      ? ` ${clockOf(item.hours_from)}–${clockOf(item.hours_to)}`
      : item.state === 'quiet' && item.hours_to
        ? ` עד ${clockOf(item.hours_to)}`
        : '';
  return [dates, `${state}${hours}`].filter(Boolean).join(' · ');
}

/** Special days in date order, cut into the ones still ahead (or on) and the ones over. */
export function splitSpecialDays(
  items: ReadonlyArray<WahubKnowledgeItem>,
  today: string,
): { upcoming: WahubKnowledgeItem[]; past: WahubKnowledgeItem[] } {
  const sorted = items
    .filter((item) => item.kind === 'special_day')
    .slice()
    .sort((a, b) => (a.date_from ?? '').localeCompare(b.date_from ?? '') || a.id - b.id);
  const upcoming: WahubKnowledgeItem[] = [];
  const past: WahubKnowledgeItem[] = [];
  for (const item of sorted) {
    const end = (item.date_to || item.date_from || '').slice(0, 10);
    (end && end < today ? past : upcoming).push(item);
  }
  return { upcoming, past };
}

// ---------------------------------------------------------------------------
// Shadow replies
// ---------------------------------------------------------------------------

/**
 * The shadow reply under each customer message, by the message it answers.
 * Several messages in a row get one reply (the server joins them); it hangs
 * under the one it names. When two replies name the same message, the newer wins.
 */
export function attachShadowReplies(
  messages: ReadonlyArray<Pick<WahubMessage, 'id'>>,
  replies: ReadonlyArray<WahubShadowReply>,
): Map<number, WahubShadowReply> {
  const ids = new Set(messages.map((message) => message.id));
  const sorted = replies.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const map = new Map<number, WahubShadowReply>();
  for (const reply of sorted) {
    if (reply.after_message_id != null && ids.has(reply.after_message_id)) map.set(reply.after_message_id, reply);
  }
  return map;
}

export type ShadowFilter = 'all' | 'awaiting' | 'good' | 'bad';

export const SHADOW_FILTERS: Array<{ key: ShadowFilter; label: string }> = [
  { key: 'all', label: 'הכול' },
  { key: 'awaiting', label: 'ממתינות לסימון' },
  { key: 'good', label: 'סומנו טוב' },
  { key: 'bad', label: 'לתקן' },
];

export function filterShadowReplies(replies: ReadonlyArray<WahubShadowReply>, filter: ShadowFilter): WahubShadowReply[] {
  switch (filter) {
    case 'awaiting':
      return replies.filter((reply) => !reply.verdict);
    case 'good':
      return replies.filter((reply) => reply.verdict === 'good');
    case 'bad':
      return replies.filter((reply) => reply.verdict === 'bad');
    default:
      return replies.slice();
  }
}

/** Newest first, one per id. */
export function mergeShadowReplies(lists: ReadonlyArray<ReadonlyArray<WahubShadowReply>>): WahubShadowReply[] {
  const byId = new Map<number, WahubShadowReply>();
  for (const list of lists) for (const reply of list) byId.set(reply.id, reply);
  return Array.from(byId.values()).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
}

export function toolName(tool: string | WahubShadowTool): string {
  return typeof tool === 'string' ? tool : tool.name || '';
}

const TOOL_LABELS: Record<string, string> = {
  find_courses: 'חיפוש חוגים',
  branch_info: 'פרטי סניף',
  office_hours_now: 'שעות המשרד עכשיו',
  customer_card: 'כרטיס הלקוח',
  request_human: 'סימון "דורש נציג"',
  Course_Manager: 'חיפוש חוגים (הבוט הישן)',
  Knowledge_Base: 'בסיס הידע (הבוט הישן)',
  Request_Human_Agent: 'העברה לנציג (הבוט הישן)',
};

/** The tool in words. An unknown tool keeps its code name. */
export function toolLabel(tool: string | WahubShadowTool): string {
  const name = toolName(tool);
  return TOOL_LABELS[name] ?? name;
}

/** The shadow bot answered without a model: there is no key, and the answer is a stand-in. */
export function isStubModel(model: string | null | undefined): boolean {
  return (model ?? '').toLowerCase() === 'stub';
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export function pendingProposals(proposals: ReadonlyArray<WahubKnowledgeProposal>): WahubKnowledgeProposal[] {
  return proposals.filter((proposal) => proposal.status === 'pending');
}

/**
 * The number on the floating button. The list of pending proposals, when it
 * has been read, is the truth; until then the summary's count; and nothing at all
 * before either answered.
 */
export function pendingCount(
  summary: Pick<WahubReviewSummary, 'pending'> | null | undefined,
  proposals: ReadonlyArray<WahubKnowledgeProposal> | null | undefined,
): number {
  if (proposals) return pendingProposals(proposals).length;
  return Math.max(0, Number(summary?.pending ?? 0) || 0);
}

const FIELD_LABELS: Record<string, string> = {
  kind: 'סוג',
  title: 'כותרת',
  body: 'תוכן',
  key: 'מפתח',
  url: 'כתובת',
  what_customer_writes: 'מה הלקוח כותב',
  means: 'הכוונה',
  scope: 'היקף',
  scope_level: 'היקף',
  valid_from: 'מתאריך',
  valid_until: 'עד תאריך',
  is_active: 'פעיל',
  when_to_say: 'מתי לומר',
  example_good: 'דוגמה טובה',
  example_bad: 'דוגמה רעה',
  source_note: 'מקור',
  steps: 'שלבים',
  role: 'תפקיד',
  phone: 'טלפון',
  when_to_refer: 'מתי מפנים',
  how_to_refer: 'איך מפנים',
  date_from: 'מתאריך',
  date_to: 'עד תאריך',
  state: 'מצב',
  hours_from: 'משעה',
  hours_to: 'עד שעה',
  message: 'הודעה',
  weekly: 'שעות שבועיות',
  default_closed_message: 'הודעת "סגור"',
  send_mode: 'מצב שליחה',
  name: 'שם',
  when: 'מתי',
  how: 'איך',
  question: 'שאלה טיפוסית',
  certainty: 'ודאות',
  priority: 'עדיפות',
  variants: 'גרסאות',
  verbatim: 'מילה במילה',
  triggers: 'משפטי זיהוי',
  handoff_reason: 'סיבת העברה לנציג',
  tag: 'תגית',
  means_kind: 'סוג הכוונה',
  enforced_in_code: 'נאכף בקוד',
  age: 'גיל',
  personality: 'אישיות',
  voice: 'לשון',
  address_default: 'פנייה ברירת מחדל',
  forbidden_phrases: 'ביטויים אסורים',
  data: 'שדות נוספים',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const VALUE_WORDS: Record<string, string> = {
  proactive: 'מיוזמה כשרלוונטי',
  if_asked: 'רק אם שואלים',
  internal: 'הנחיה פנימית',
  closed: 'סגור',
  open: 'פתוח כרגיל',
  hours: 'שעות שונות',
  quiet: 'פעילות שקטה',
  on_agent_request: 'רק כשמבקשים נציג',
  always: 'בכל פנייה מחוץ לשעות',
  on_takeover: 'כשנציג לוקח שיחה',
};

/** A value of a change, in words a person reads: yes/no, a label, or the text itself. */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return VALUE_WORDS[value] ?? value;
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === 'object' && entry !== null
          ? Object.values(entry as Record<string, unknown>)
              .filter((part) => typeof part === 'string' && part)
              .join(' – ')
          : formatChangeValue(entry),
      )
      .filter(Boolean)
      .join('\n');
  }
  const record = value as Record<string, unknown>;
  if (typeof record.label === 'string' && record.label) return record.label;
  return Object.entries(record)
    .map(([key, entry]) => `${fieldLabel(key)}: ${formatChangeValue(entry)}`)
    .join('\n');
}

export interface ChangeRow {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

/**
 * The difference a proposal makes, row by row. For a new item every field is a
 * change; for an update only the fields that differ are rows.
 */
export function diffChange(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ChangeRow[] {
  const keys: string[] = [];
  for (const key of Object.keys(after ?? {})) if (!keys.includes(key)) keys.push(key);
  for (const key of Object.keys(before ?? {})) if (!keys.includes(key)) keys.push(key);
  const rows: ChangeRow[] = [];
  for (const key of keys) {
    if (key === 'id' || key === 'version' || key === 'updated_at' || key === 'updated_by_name') continue;
    const was = formatChangeValue(before?.[key]);
    const now = formatChangeValue(after?.[key]);
    const changed = was !== now;
    if (!before || changed) rows.push({ key, label: fieldLabel(key), before: was, after: now, changed });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The statuses of one conversation, grouped (owner, 10.10: not a flat list)
// ---------------------------------------------------------------------------

export type StatusTone = 'neutral' | 'danger' | 'warning' | 'success' | 'muted';

export interface StatusRow {
  label: string;
  value: string;
  tone: StatusTone;
}

export interface StatusGroup {
  title: string;
  rows: StatusRow[];
}

export interface ContactStatuses {
  primary: { label: string; value: string; tone: StatusTone };
  groups: StatusGroup[];
}

/**
 * Who answers, and under it the small states of the bot, the person and the
 * conversation — every one from a field the contact already carries.
 */
export function contactStatuses(
  contact: WahubContact,
  now: Date,
  shadow?: { count: number; lastAt: string | null } | null,
): ContactStatuses {
  const { chat, followup, kogo } = contact;
  const human = chat.handled_by === 'human';

  const bot: StatusRow[] = [
    human
      ? { label: 'מצב', value: 'שותק – נציג לקח את השיחה', tone: 'muted' }
      : { label: 'מצב', value: chat.handled_by_label || 'עונה', tone: 'neutral' },
    chat.waiting_since
      ? { label: 'תשובה ללקוח', value: `הלקוח מחכה ${durationText(now.getTime() - new Date(chat.waiting_since).getTime())}`, tone: 'warning' }
      : { label: 'תשובה ללקוח', value: 'נענה', tone: 'success' },
  ];
  if (shadow) {
    bot.push(
      shadow.count > 0
        ? {
            label: 'הבוט החדש (צל)',
            value: `${shadow.count} הצעות${shadow.lastAt ? ` · האחרונה ${agoText(shadow.lastAt, now)}` : ''}`,
            tone: 'neutral',
          }
        : { label: 'הבוט החדש (צל)', value: 'עוד אין הצעה', tone: 'muted' },
    );
  }

  const person: StatusRow[] = [
    chat.needs_human
      ? {
          label: 'בקשת נציג',
          value: [chat.needs_human_reason, chat.needs_human_at ? agoText(chat.needs_human_at, now) : ''].filter(Boolean).join(' · ') || 'מבקש נציג',
          tone: 'danger',
        }
      : { label: 'בקשת נציג', value: 'אין', tone: 'muted' },
    human ? { label: 'בטיפול', value: 'נציג לקח את השיחה', tone: 'success' } : { label: 'בטיפול', value: 'לא', tone: 'muted' },
  ];

  const conversation: StatusRow[] = [
    chat.unread_count > 0
      ? { label: 'לא נקראו', value: `${chat.unread_count} הודעות`, tone: 'warning' }
      : { label: 'לא נקראו', value: 'הכול נקרא', tone: 'muted' },
    chat.can_free_text
      ? { label: 'חלון 24 שעות', value: chat.window_closes_at ? `פתוח עד ${formatClock(chat.window_closes_at)}` : 'פתוח', tone: 'success' }
      : contact.last_inbound_at
        ? { label: 'חלון 24 שעות', value: 'נסגר – רק תבנית', tone: 'warning' }
        : { label: 'חלון 24 שעות', value: 'הלקוח עוד לא כתב', tone: 'muted' },
    { label: 'סימון מעקב', value: followup.status_label || 'אין', tone: followup.is_due ? 'danger' : 'neutral' },
    { label: 'במערכת', value: kogo.outcome_label || 'עוד לא נבדק', tone: 'neutral' },
  ];

  return {
    primary: { label: 'מי עונה', value: human ? 'נציג' : 'בוט', tone: human ? 'success' : 'neutral' },
    groups: [
      { title: 'הבוט', rows: bot },
      { title: 'הנציג', rows: person },
      { title: 'השיחה', rows: conversation },
    ],
  };
}
