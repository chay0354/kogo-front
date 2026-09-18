/**
 * מספור מסמכים — what the numbering screen decides, kept apart from the screen
 * so it can be tested: each run's status, which of the previous software's
 * runs it may continue, the number the office types, the first number that
 * results, and when the confirmation may be pressed.
 *
 * The server decides again on every opening (kogo-back
 * apps/documents/series_opening.py); this only keeps the office from sending
 * what it would refuse, and shows the result before anything is fixed.
 */
import type { NumberRun, OpenSeriesPayload, SeriesOverview } from '@/lib/numberingApi';

/** The largest number a run may start from — the server's MAX_START. */
export const MAX_START = 999_999_999;

// ---------------------------------------------------------------- numbers

/** 'TI-2026-040414': six digits at least, all of them when there are more. */
export function formatRunNumber(series: string, year: number, number: number): string {
  return `${series}-${year}-${String(number).padStart(6, '0')}`;
}

/**
 * The last number as typed in the previous software: digits, with commas or
 * spaces as the office writes them. null for anything else, for 0, and for a
 * number whose next would be past MAX_START.
 */
export function parseLastNumber(text: string): number | null {
  const compact = String(text ?? '').replace(/[\s,]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  const number = Number(compact);
  if (!Number.isSafeInteger(number) || number < 1 || number + 1 > MAX_START) return null;
  return number;
}

/** The number kogo's next document in this run would take, or '' while the last number is not a number. */
export function firstNumberPreview(series: string, year: number, lastText: string): string {
  const last = parseLastNumber(lastText);
  return last === null ? '' : formatRunNumber(series, year, last + 1);
}

// ---------------------------------------------------------------- status

export type RunTone = 'continued' | 'open' | 'issued' | 'closed';

export interface RunStatus {
  tone: RunTone;
  label: string;
  /** A sentence under the label: what the run continues, or why it cannot be opened and when it can. */
  detail: string;
}

export function runStatus(run: NumberRun): RunStatus {
  if (run.opening) {
    return { tone: 'continued', label: 'ממשיך את התוכנה הקודמת', detail: run.opening.continues };
  }
  if (run.can_open) {
    return {
      tone: 'open',
      label: 'אפשר להמשיך',
      detail: `לא הונפקו מסמכים בסדרה ב-${run.year}.`,
    };
  }
  if (run.issued > 0) {
    return { tone: 'issued', label: 'כבר הנפיקה השנה', detail: run.reason };
  }
  return { tone: 'closed', label: 'לא ניתן להמשיך', detail: run.reason };
}

// ---------------------------------------------------------------- which old run

export interface TypeChoice {
  label: string;
  /** Another kogo run already continues this old run in the run's year. */
  takenBy: string;
  suggested: boolean;
}

/** The previous software's runs this kogo run may continue: the ones of its document type. */
export function typeChoices(overview: SeriesOverview, run: NumberRun): TypeChoice[] {
  const year = String(run.year);
  return overview.previous_types
    .filter((type) => type.series_options.includes(run.series))
    .map((type) => {
      const holder = type.continued_by[year] ?? '';
      return {
        label: type.label,
        takenBy: holder && holder !== run.series ? `${holder}-${run.year}` : '',
        suggested: type.suggested[year] === run.series,
      };
    });
}

/** The old run to start the form with: the one suggested for this kogo run, else the first still free. */
export function defaultTypeFor(overview: SeriesOverview, run: NumberRun): string {
  const choices = typeChoices(overview, run).filter((choice) => !choice.takenBy);
  return (choices.find((choice) => choice.suggested) ?? choices[0])?.label ?? '';
}

export interface MappingRow {
  label: string;
  /** The kogo run suggested for it this year. */
  suggested: string;
  /** The kogo run that already continues it this year, or ''. */
  continuedBy: string;
  /** The suggested run can still be opened this year. */
  available: boolean;
}

/** The suggested continuation of each old run in a year, what already continues it, and whether it still can. */
export function mappingRows(overview: SeriesOverview, year: number): MappingRow[] {
  const key = String(year);
  return overview.previous_types.map((type) => {
    const suggested = type.suggested[key] ?? '';
    const run = overview.runs.find((item) => item.series === suggested && item.year === year);
    return {
      label: type.label,
      suggested,
      continuedBy: type.continued_by[key] ?? '',
      available: Boolean(run?.can_open),
    };
  });
}

// ---------------------------------------------------------------- prefill

/** How the legacy import may spell a type, and the name the server knows it by. */
const TYPE_ALIASES: Record<string, string> = {
  'חשבונית מס': 'חשבונית מס',
  'קבלה': 'קבלה',
  'חשבונית מס זיכוי': 'חשבונית מס זיכוי',
  'חשבונית זיכוי': 'חשבונית מס זיכוי',
  'חשבון עיסקה': 'חשבון עיסקה',
  'חשבון עסקה': 'חשבון עיסקה',
  'חשבונית עסקה': 'חשבון עיסקה',
  'חשבונית עיסקה': 'חשבון עיסקה',
  'חשבונית מס קבלה': 'חשבונית מס קבלה',
  'חשבונית מס/קבלה': 'חשבונית מס קבלה',
  'חשבונית מס / קבלה': 'חשבונית מס קבלה',
};

/** The legacy import's own document types (its `doc_type`), by the name the server knows each by. */
const DOC_TYPE_LABELS: Record<string, string> = {
  tax_invoice: 'חשבונית מס',
  receipt: 'קבלה',
  credit_invoice: 'חשבונית מס זיכוי',
  transaction_invoice: 'חשבון עיסקה',
  combined: 'חשבונית מס קבלה',
};

function knownType(raw: unknown): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return TYPE_ALIASES[text] ?? '';
}

function itemType(item: Record<string, unknown>): string {
  const byKind = DOC_TYPE_LABELS[String(item.doc_type ?? item.document_type ?? '')];
  if (byKind) return byKind;
  return knownType(
    item.previous_type_label ?? item.type_label ?? item.label ?? item.document_type_label ?? item.type ?? item.name,
  );
}

function firstNumber(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = parseLastNumber(String(value));
    if (parsed !== null) return parsed;
  }
  return null;
}

/**
 * The previous software's last number per type, read from the legacy import's
 * answer (kogo-back apps/legacy_import: `{series: [{doc_type, label,
 * last_number, last_date, …}]}`), or any close shape: a list, or a list under
 * `series`, `results` or `runs`, each item naming its type — by `doc_type` or
 * by its Hebrew name — and its last number. What
 * cannot be read is left out — the office types it instead. When a type
 * appears twice, the higher number wins: the export is a subset, so every
 * number in it is a floor.
 */
export function legacyLastNumbers(data: unknown): Record<string, number> {
  let items: unknown = data;
  if (items && !Array.isArray(items) && typeof items === 'object') {
    const record = items as Record<string, unknown>;
    items = record.series ?? record.results ?? record.runs ?? record.types ?? [];
  }
  if (!Array.isArray(items)) return {};

  const out: Record<string, number> = {};
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const label = itemType(item);
    if (!label) continue;
    const last = firstNumber(item, ['previous_last_number', 'last_number', 'last', 'max_number', 'max']);
    if (last === null) continue;
    out[label] = Math.max(out[label] ?? 0, last);
  }
  return out;
}

// ---------------------------------------------------------------- confirmation

export interface OpeningDraft {
  typeLabel: string;
  lastText: string;
  /** The office confirmed the last number was checked in the previous software itself. */
  checked: boolean;
  submitting: boolean;
}

/**
 * The draft after the office changes a field. The confirmation was given for
 * one number of one type, so changing either takes it back.
 */
export function editDraft(draft: OpeningDraft, change: Partial<Pick<OpeningDraft, 'typeLabel' | 'lastText' | 'checked'>>): OpeningDraft {
  const next = { ...draft, ...change };
  const moved =
    (change.typeLabel !== undefined && change.typeLabel !== draft.typeLabel)
    || (change.lastText !== undefined && change.lastText !== draft.lastText);
  return moved && change.checked === undefined ? { ...next, checked: false } : next;
}

/** What still stands between the form and the button, in words; empty when it may be pressed. */
export function openingProblems(overview: SeriesOverview, run: NumberRun, draft: OpeningDraft): string[] {
  const problems: string[] = [];
  if (!run.can_open) problems.push(run.reason || 'אי אפשר להמשיך את הסדרה הזאת');
  const choice = typeChoices(overview, run).find((item) => item.label === draft.typeLabel);
  if (!choice) problems.push('יש לבחור את סוג המסמך בתוכנה הקודמת');
  else if (choice.takenBy) problems.push(`${choice.label} של התוכנה הקודמת כבר ממשיכה ב-${choice.takenBy}`);
  if (parseLastNumber(draft.lastText) === null) problems.push('יש להקליד את המספר האחרון שהונפק בתוכנה הקודמת');
  if (!draft.checked) problems.push('יש לאשר שהמספר נבדק בתוכנה הקודמת עצמה');
  return problems;
}

export function canConfirmOpening(overview: SeriesOverview, run: NumberRun, draft: OpeningDraft): boolean {
  return !draft.submitting && openingProblems(overview, run, draft).length === 0;
}

/** What is sent to the server, or null while the form is not complete. */
export function openingPayload(
  overview: SeriesOverview,
  run: NumberRun,
  draft: OpeningDraft,
  note: string,
): OpenSeriesPayload | null {
  if (openingProblems(overview, run, draft).length > 0) return null;
  const last = parseLastNumber(draft.lastText) as number;
  return {
    series: run.series,
    year: run.year,
    start: last + 1,
    previous_last_number: last,
    previous_type_label: draft.typeLabel,
    note: note.trim(),
  };
}

/** The sentence the office confirms, naming the number and the type. */
export function confirmationText(typeLabel: string, lastText: string): string {
  const last = parseLastNumber(lastText);
  const number = last === null ? 'שהמספר שהוקלד' : `ש-${last}`;
  const type = typeLabel || 'הסוג שנבחר';
  return `בדקתי בתוכנה הקודמת עצמה (לא רק בקובץ הייצוא) ${number} הוא המספר האחרון שהונפק ב${type}, ושלא יונפקו שם עוד מסמכים מהסוג הזה.`;
}

/** The runs of one year, in the order the server lists them. */
export function runsOf(overview: SeriesOverview, year: number): NumberRun[] {
  return overview.runs.filter((run) => run.year === year);
}
