import type {
  WahubAutomationBanner,
  WahubAutomationLine,
  WahubAutomationToday,
  WahubAutomationUpcoming,
  WahubLeadTemplate,
  WahubLeadTemplateOption,
  WahubLeadTemplateOptions,
  WahubLeadsAutomation,
} from '@/types/wahub';
import { formatDateTime } from './format';
import { leadPhoneText, whenWords } from './leadsV2';

/**
 * "הכול אוטומטי" — the bot comes back to the leads by itself
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, י). The words of the card in the settings
 * and of the strip on the leads tab, and their small decisions, kept out of the
 * components so they can be read — and tested — on their own.
 *
 * Nothing here decides whether a message goes out: that is the server's, and
 * the owner's switch. This file reads what the server sent and says it in
 * plain Hebrew.
 */

// ---------------------------------------------------------------------------
// Reading what the server sent
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** A moment or a plain date, kept only when it can be read as one. */
function time(value: unknown): string | null {
  const text = str(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function rows<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  return (Array.isArray(value) ? value : []).map(read).filter((item): item is T => item !== null);
}

function readLine(raw: unknown): WahubAutomationLine | null {
  const data = record(raw);
  if (!data) return null;
  const key = str(data.key);
  const title = str(data.title);
  if (!key && !title) return null;
  const ok = data.ok === true;
  // How to put it right belongs to a line that is not right.
  return { key, ok, title, detail: str(data.detail), how: ok ? '' : str(data.how) };
}

function readUpcoming(raw: unknown): WahubAutomationUpcoming | null {
  const data = record(raw);
  if (!data) return null;
  const id = Number(data.contact_id ?? data.id);
  const item: WahubAutomationUpcoming = {
    contact_id: Number.isSafeInteger(id) && id > 0 ? id : null,
    name: str(data.name) || str(data.phone_display) || leadPhoneText(str(data.phone)),
    kind_label: str(data.kind_label) || str(data.label),
    text: str(data.text),
    when: time(data.when ?? data.due_at),
    state: data.state === 'due' ? 'due' : 'planned',
    needs_template: data.needs_template === true,
    template_mapped: data.template_mapped === true,
    is_demo: data.is_demo === true,
    note: str(data.note),
  };
  // A row that says nothing — nobody, no wording, no kind — is left out rather than drawn empty.
  return item.name || item.text || item.kind_label ? item : null;
}

/** How many comings back the card is given at the most (the contract's own number). */
export const UPCOMING_MAX = 15;

function readBanner(raw: unknown): WahubAutomationBanner | null {
  const data = record(raw);
  const text = data ? str(data.text) : '';
  return data && text ? { count: count(data.count), text } : null;
}

/** GET leads/automation/ as the screen reads it. Null for an answer that is not the automation at all. */
export function readAutomation(raw: unknown): WahubLeadsAutomation | null {
  const data = record(raw);
  if (!data) return null;
  const today = record(data.today) ?? {};
  const automation: WahubLeadsAutomation = {
    ready: data.ready === true,
    lines: rows(data.lines, readLine),
    today: {
      planned: count(today.planned),
      due: count(today.due),
      sent: count(today.sent),
      skipped: count(today.skipped),
      failed: count(today.failed),
    },
    upcoming: rows(data.upcoming, readUpcoming).slice(0, UPCOMING_MAX),
  };
  // A server that words the strip itself says so even when there is nothing to show (`banner: null`).
  if ('banner' in data) automation.banner = readBanner(data.banner);
  return automation;
}

// ---------------------------------------------------------------------------
// The one large sentence
// ---------------------------------------------------------------------------

/** Without these two the bot does not even plan; without the other two it plans and does not send. */
const PLANNING_KEYS = new Set(['classify', 'schedule']);

export interface AutomationHeadline {
  ready: boolean;
  /** How many of the lines are not ok. */
  missing: number;
  text: string;
}

function missingWords(n: number): string {
  return n === 1 ? 'חסר דבר אחד' : `חסרים ${n.toLocaleString('he-IL')} דברים`;
}

/**
 * How the automation stands, in one sentence: "הכול מוכן — הבוט חוזר ללידים
 * לבד", or "הבוט מתכנן, אבל עוד לא שולח: חסרים 2 דברים". The count is of the
 * lines under it, so the sentence can never say something the rows do not show;
 * "ready" is said only when the server says so and no line disagrees.
 */
export function automationHeadline(automation: Pick<WahubLeadsAutomation, 'ready' | 'lines'>): AutomationHeadline {
  const missing = automation.lines.filter((line) => !line.ok);
  if (automation.ready && missing.length === 0) {
    return { ready: true, missing: 0, text: 'הכול מוכן — הבוט חוזר ללידים לבד' };
  }
  const planning = !missing.some((line) => PLANNING_KEYS.has(line.key));
  const opening = planning ? 'הבוט מתכנן, אבל עוד לא שולח' : 'הבוט עוד לא חוזר ללידים לבד';
  return { ready: false, missing: missing.length, text: missing.length ? `${opening}: ${missingWords(missing.length)}` : opening };
}

function counted(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`;
}

/**
 * The day in a line: "חזרות היום: 12 מתוכננות · 3 הגיע זמנן ולא יצאו · 5 נשלחו".
 * Only what there is something of; empty when there is nothing at all.
 */
export function todayWords(today: WahubAutomationToday): string {
  const parts = [
    today.planned > 0 ? counted(today.planned, 'אחת מתוכננת', 'מתוכננות') : '',
    today.due > 0 ? counted(today.due, 'אחת הגיע זמנה ולא יצאה', 'הגיע זמנן ולא יצאו') : '',
    today.sent > 0 ? counted(today.sent, 'אחת נשלחה', 'נשלחו') : '',
    today.skipped > 0 ? counted(today.skipped, 'אחת בוטלה', 'בוטלו') : '',
    today.failed > 0 ? counted(today.failed, 'אחת נכשלה', 'נכשלו') : '',
  ].filter(Boolean);
  return parts.length ? `חזרות היום: ${parts.join(' · ')}` : '';
}

export interface TextPart {
  text: string;
  /** The name of a setting, as the server wrote it: shown small, left to right. */
  code?: boolean;
}

const SETTING_NAME = /\(?\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b\)?/g;

/**
 * "איך מתקנים", cut where it names a setting (WAHUB_SENDING_ENABLED): the
 * sentence stays Hebrew, and the name stands apart from it — small, left to
 * right, out of its brackets — so the line never reads backwards.
 */
export function howParts(how: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  for (const match of how.matchAll(SETTING_NAME)) {
    const before = how.slice(from, match.index).trim();
    if (before) parts.push({ text: before });
    parts.push({ text: match[1], code: true });
    from = (match.index ?? 0) + match[0].length;
  }
  const rest = how.slice(from).trim();
  if (rest) parts.push({ text: rest });
  return parts;
}

// ---------------------------------------------------------------------------
// "מה הבוט מתכנן לשלוח"
// ---------------------------------------------------------------------------

/** How many comings back the card shows before "הצג עוד". */
export const UPCOMING_FIRST = 5;

export interface UpcomingWhen {
  text: string;
  /** Its time has come and it did not go out. */
  held: boolean;
}

/** When a coming back goes out, as a person would say it: "מחר ב-10:30", "היום ב-16:00" — or "היה יוצא עכשיו". */
export function upcomingWhen(item: Pick<WahubAutomationUpcoming, 'when' | 'state'>, now: Date): UpcomingWhen {
  if (item.state === 'due') return { text: 'היה יוצא עכשיו', held: true };
  const words = whenWords(item.when, now);
  if (!words) return { text: '', held: false };
  // Planned, and its hour has passed: the bot's next run takes it, within minutes.
  return { text: words.past ? 'בדקות הקרובות' : words.text, held: false };
}

export interface UpcomingTag {
  text: string;
  tone: 'warn' | 'good';
}

/** The small mark of a coming back that needs a WhatsApp template: missing, or connected. None when it needs none. */
export function upcomingTag(item: Pick<WahubAutomationUpcoming, 'needs_template' | 'template_mapped'>): UpcomingTag | null {
  if (!item.needs_template) return null;
  return item.template_mapped ? { text: 'תבנית מחוברת', tone: 'good' } : { text: 'דורש תבנית', tone: 'warn' };
}

/** A wording in one short line, cut at a word. */
export function shortText(text: string, max = 64): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function upcomingName(item: Pick<WahubAutomationUpcoming, 'name'>): string {
  return item.name || 'ליד בלי שם';
}

// ---------------------------------------------------------------------------
// The strip on the leads tab
// ---------------------------------------------------------------------------

/**
 * "3 הודעות היו יוצאות עכשיו — השליחה כבויה" / "…חסרה תבנית" — the one quiet
 * strip at the head of "הבוט מטפל". The server's own sentence where it sends
 * one (it knows what stops each message); otherwise worked out here from what
 * is due and from the lines: the owner's switch first, then the templates.
 * Empty when nothing is held.
 */
export function heldStripText(automation: Pick<WahubLeadsAutomation, 'today' | 'lines' | 'banner'> | null | undefined): string {
  if (!automation) return '';
  if (automation.banner !== undefined) return automation.banner?.text ?? '';
  const due = automation.today.due;
  if (due <= 0) return '';
  const off = (key: string) => automation.lines.some((line) => line.key === key && !line.ok);
  const reason = off('sending') ? 'השליחה כבויה' : off('templates') ? 'חסרה תבנית' : '';
  if (!reason) return counted(due, 'הודעה אחת הגיע זמנה ועוד לא יצאה', 'הודעות הגיע זמנן ועוד לא יצאו');
  return `${counted(due, 'הודעה אחת הייתה יוצאת עכשיו', 'הודעות היו יוצאות עכשיו')} — ${reason}`;
}

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

/**
 * The five to start with (docs/WAHUB-LEAD-TEMPLATES-FOR-OWNER.md, שלב 1) — for
 * a server that lists the wordings without saying which stage each belongs to.
 */
export const STAGE_ONE_KEYS: ReadonlySet<string> = new Set([
  'link_reminder_1',
  'will_check_1',
  'trial_feedback_1',
  'trial_no_show_1',
  'date_arrived_age_1',
]);

function readTemplate(raw: unknown): WahubLeadTemplate | null {
  const data = record(raw);
  if (!data) return null;
  const key = str(data.template_key) || str(data.key);
  if (!key) return null;
  const sent = record(data.target);
  const target = (sent ? str(sent.id) || str(sent.ns) || str(sent.name) : str(data.target)) || null;
  const stage = Number(data.stage);
  const step = Number(data.step);
  return {
    template_key: key,
    kind_label: str(data.kind_label) || str(data.label),
    when_label: str(data.when_label) || str(data.when),
    text: str(data.text),
    stage: stage === 1 || stage === 2 ? stage : STAGE_ONE_KEYS.has(key) ? 1 : 2,
    step: Number.isInteger(step) && step > 0 ? step : null,
    // Connected is what the server says; where it says nothing, having something connected is the answer.
    mapped: typeof data.mapped === 'boolean' ? data.mapped : target !== null,
    target,
    target_name: (sent ? str(sent.name) || str(sent.title) : '') || str(data.target_name),
    active: data.active !== false,
    // What needs no template is the server's to say; where it says nothing, every wording that is sent needs one.
    required: typeof data.required === 'boolean' ? data.required : data.active !== false,
    suggested_name: str(data.suggested_name),
    connected_by: str(data.connected_by),
    connected_at: time(data.connected_at),
  };
}

/** GET leads/templates/: a list, bare or under a name. Only wordings that can be told apart by their key. */
export function readTemplates(raw: unknown): WahubLeadTemplate[] {
  const data = record(raw);
  return rows(Array.isArray(raw) ? raw : data?.templates ?? data?.results, readTemplate);
}

/**
 * The title of one wording: what kind of coming back it is — and, for the
 * second and third approach of a round, which one, so that three wordings of
 * one kind are not three rows under one name. A server that already says so in
 * its own label is left as it is.
 */
export function templateTitle(template: Pick<WahubLeadTemplate, 'kind_label' | 'when_label' | 'step'>): string {
  const kind = template.kind_label || template.when_label || 'נוסח';
  if (!template.kind_label || !template.step || template.step < 2 || kind.includes('פנייה')) return kind;
  return `${kind} · פנייה ${template.step}`;
}

export interface TemplateStages {
  one: WahubLeadTemplate[];
  two: WahubLeadTemplate[];
}

/**
 * Stage 1 and stage 2, each in the server's own order — except that a wording
 * that is switched off stands after the ones that are sent.
 */
export function templateStages(templates: readonly WahubLeadTemplate[]): TemplateStages {
  const of = (stage: 1 | 2) => {
    const list = templates.filter((template) => template.stage === stage);
    return [...list.filter((template) => template.active), ...list.filter((template) => !template.active)];
  };
  return { one: of(1), two: of(2) };
}

export interface TemplatesCount {
  mapped: number;
  total: number;
}

/**
 * How many wordings have a template connected, out of those that need one — a
 * wording that is switched off, or that goes out without a template, is not
 * counted as missing (the server's own line counts the same way).
 */
export function templatesCount(templates: readonly WahubLeadTemplate[]): TemplatesCount {
  const needed = templates.filter((template) => template.required);
  return { mapped: needed.filter((template) => template.mapped).length, total: needed.length };
}

function ofWords({ mapped, total }: TemplatesCount): string {
  return `${mapped.toLocaleString('he-IL')} מתוך ${total.toLocaleString('he-IL')} מחוברות`;
}

/** "תבניות (2 מתוך 16 מחוברות)" — the number only once the list was read. */
export function templatesTitle(templates: readonly WahubLeadTemplate[] | null | undefined): string {
  if (!templates || templates.length === 0) return 'תבניות';
  return `תבניות (${ofWords(templatesCount(templates))})`;
}

export const STAGE_TITLES: Record<1 | 2, string> = {
  1: 'שלב 1 — מתחילים מכאן',
  2: 'שלב 2 — הפניות הבאות',
};

/** "3 מתוך 5 מחוברות" under a stage's title. */
export function stageCountText(templates: readonly WahubLeadTemplate[]): string {
  return ofWords(templatesCount(templates));
}

function readOption(raw: unknown): WahubLeadTemplateOption | null {
  if (typeof raw === 'string') return raw.trim() ? { id: raw.trim(), name: raw.trim() } : null;
  const data = record(raw);
  if (!data) return null;
  const id = str(data.id) || str(data.ns) || str(data.value) || str(data.key);
  const name = str(data.name) || str(data.label) || str(data.title);
  if (!id && !name) return null;
  return { id: id || name, name: name || id };
}

/**
 * GET leads/templates/options/: the templates that exist in the ManyChat
 * account. Null — `{"options": null}`, or anything that is not a list — means
 * the account cannot be listed, and the screen shows a box to paste a name into.
 */
export function readTemplateOptions(raw: unknown): WahubLeadTemplateOption[] | null {
  const list = Array.isArray(raw) ? raw : record(raw)?.options;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  return rows(list, readOption).filter((option) => (seen.has(option.id) ? false : (seen.add(option.id), true)));
}

/** GET leads/templates/options/ whole: the list (or null), and why there is none when the server says. */
export function readTemplateOptionsAnswer(raw: unknown): WahubLeadTemplateOptions {
  const options = readTemplateOptions(raw);
  return { options, reason: options ? '' : str(record(raw)?.reason) };
}

/** "חובר על ידי דנה · 12.10 09:10" — who connected a template and when, as far as the server recorded it. */
export function connectedByText(template: Pick<WahubLeadTemplate, 'connected_by' | 'connected_at'>, now: Date): string {
  const when = formatDateTime(template.connected_at, now);
  if (template.connected_by) return when ? `חובר על ידי ${template.connected_by} · ${when}` : `חובר על ידי ${template.connected_by}`;
  return when ? `חובר ב-${when}` : '';
}

/** The option that is the one connected: by its identifier, or — for a server that keeps the name — by its name. */
export function connectedOption(
  template: Pick<WahubLeadTemplate, 'target'>,
  options: readonly WahubLeadTemplateOption[] | null | undefined,
): WahubLeadTemplateOption | null {
  if (!template.target || !options) return null;
  return options.find((option) => option.id === template.target) ?? options.find((option) => option.name === template.target) ?? null;
}

/** What is connected, as it is shown: the template's name where it is known, otherwise what the server keeps. */
export function connectedText(
  template: Pick<WahubLeadTemplate, 'target' | 'target_name'>,
  options: readonly WahubLeadTemplateOption[] | null | undefined,
): string {
  return connectedOption(template, options)?.name || template.target_name || template.target || '';
}

/**
 * The choices of one wording's picker: the account's templates — and what is
 * connected now, when the account no longer lists it, so the picker never
 * shows a blank over something that is connected.
 */
export function pickerOptions(
  template: Pick<WahubLeadTemplate, 'target' | 'target_name'>,
  options: readonly WahubLeadTemplateOption[],
): WahubLeadTemplateOption[] {
  if (!template.target || connectedOption(template, options)) return [...options];
  return [{ id: template.target, name: template.target_name || template.target }, ...options];
}

/** The picker's value: the identifier of what is connected, as the options carry it. Empty: nothing chosen. */
export function pickerValue(
  template: Pick<WahubLeadTemplate, 'target'>,
  options: readonly WahubLeadTemplateOption[],
): string {
  return connectedOption(template, options)?.id ?? template.target ?? '';
}

/** A name that was pasted, as it is sent: without the spaces and the line breaks a copy drags along. */
export function pastedTarget(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The list once one wording was connected (or cut off) — shown before the
 * server has answered, and put back if it refuses.
 */
export function withTemplateTarget(
  templates: readonly WahubLeadTemplate[],
  key: string,
  target: string | null,
  options?: readonly WahubLeadTemplateOption[] | null,
): WahubLeadTemplate[] {
  return templates.map((template) => {
    if (template.template_key !== key) return template;
    const name = target ? options?.find((option) => option.id === target)?.name ?? '' : '';
    // Who and when are the server's to record; until it answers they are simply not known.
    return { ...template, target, target_name: name, mapped: target !== null, connected_by: '', connected_at: null };
  });
}

/** The list with one wording as the server now has it (the answer to connecting, or to cutting off). */
export function withTemplateRow(templates: readonly WahubLeadTemplate[], row: WahubLeadTemplate): WahubLeadTemplate[] {
  return templates.map((template) => (template.template_key === row.template_key ? row : template));
}

/** One wording, as the server answers with it. Null for an answer that is not a wording. */
export function readTemplateRow(raw: unknown): WahubLeadTemplate | null {
  return readTemplate(raw);
}

/**
 * What the server said went wrong, when it said it in Hebrew; otherwise the
 * screen's own sentence — an English "Not found." is not something to show.
 */
export function hebrewOr(text: string, fallback: string): string {
  return /[֐-׿]/.test(text) ? text : fallback;
}

export const AUTOMATION_TEXT = {
  title: 'חזרה אוטומטית ללידים',
  loadFailed: 'לא הצלחנו לטעון את מצב החזרה ללידים',
  upcomingTitle: 'מה הבוט מתכנן לשלוח',
  upcomingEmpty: 'אין כרגע חזרות מתוכננות',
  templatesFailed: 'לא הצלחנו לטעון את התבניות',
  templatesEmpty: 'עוד אין נוסחים לחזרה ללידים.',
  templatesHint: 'יוצרים כל תבנית ב-ManyChat עם הנוסח שכאן, ואחרי שמטא מאשרת — מחברים אותה לנוסח שלה.',
  optionsMissing: 'אי אפשר להציג כרגע את רשימת התבניות מ-ManyChat',
  suggestedName: 'שם מוצע ב-ManyChat',
  connectFailed: 'החיבור לא נשמר. נסו שוב.',
  disconnectFailed: 'הניתוק לא נשמר. נסו שוב.',
  copyFailed: 'ההעתקה לא הצליחה. סמנו את הנוסח והעתיקו ביד.',
  pick: 'בחרו תבנית',
  pasteLabel: 'שם התבנית ב-ManyChat',
  inactive: 'הנוסח הזה כבוי ולא נשלח',
} as const;
