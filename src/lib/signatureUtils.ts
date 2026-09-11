/**
 * The signature history's pure side: the labels, the consents a signer gave,
 * the list query, the file names and what an empty list says. No React and no
 * network, so every rule here is covered by signatureUtils.test.ts.
 */
import type {
  SignatureChild,
  SignatureConsents,
  SignatureDetail,
  SignatureKind,
  SignaturesPage,
  SignatureSummary,
} from '@/types/signature';

/** The server's page size for GET /signatures/. */
export const SIGNATURES_PAGE_SIZE = 50;

/**
 * The first day the server keeps signatures. A registration signed before it
 * has no record, so an empty list before this day says why rather than
 * implying the customer never signed.
 */
export const SIGNATURES_KEPT_FROM = '2026-09-11';

/** The empty state of a family with nothing kept — the customer card's "מה חתם". */
export const FAMILY_SIGNATURES_EMPTY = 'לא נשמרה חתימה — חתימות נשמרות מהרשמות מ־11.9.2026 ואילך';

/** How many days back the history page opens on. */
export const SIGNATURES_DEFAULT_RANGE_DAYS = 30;

export const SIGNATURE_KIND_LABELS: Record<SignatureKind, string> = {
  registration_terms: 'תקנון הרשמה',
  rental_contract: 'חוזה שכירות',
};

export const SIGNATURE_KIND_OPTIONS: ReadonlyArray<{ value: SignatureKind; label: string }> = (
  Object.keys(SIGNATURE_KIND_LABELS) as SignatureKind[]
).map((value) => ({ value, label: SIGNATURE_KIND_LABELS[value] }));

/**
 * The kind in Hebrew. The server's label wins, so a kind added on the server
 * reads right here before this build learns it.
 */
export function signatureKindLabel(signature: Pick<SignatureSummary, 'kind' | 'kind_label'>): string {
  const fromServer = String(signature.kind_label ?? '').trim();
  if (fromServer) return fromServer;
  return SIGNATURE_KIND_LABELS[signature.kind as SignatureKind] ?? 'חתימה';
}

/** What a document is called: its own title, else its kind. */
export function signatureTitle(
  signature: Pick<SignatureSummary, 'document_title' | 'kind' | 'kind_label'>,
): string {
  return String(signature.document_title ?? '').trim() || signatureKindLabel(signature);
}

// ---- when ----

const ISRAEL_TZ = 'Asia/Jerusalem';

const ISRAEL_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The moment in Israel's clock, whatever the browser's is: the office reads
 * "14:05" as the time the parent signed at the branch, not the laptop's zone.
 */
function israelParts(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts: Record<string, string> = {};
  for (const part of ISRAEL_PARTS.formatToParts(date)) parts[part.type] = part.value;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/** "11.09.2026" — padded, so a column of dates lines up. '' when it cannot be read. */
export function formatSignedDate(iso: string | null | undefined): string {
  const p = israelParts(iso);
  return p ? `${p.day}.${p.month}.${p.year}` : '';
}

/** "14:05". */
export function formatSignedTime(iso: string | null | undefined): string {
  const p = israelParts(iso);
  return p ? `${p.hour}:${p.minute}` : '';
}

/** "11.09.2026 · 14:05" — the one-line stamp. */
export function formatSignedAt(iso: string | null | undefined): string {
  const date = formatSignedDate(iso);
  return date ? `${date} · ${formatSignedTime(iso)}` : '';
}

/** "2026-09-11" in Israel — for a file name, which sorts by it. */
export function signedDayISO(iso: string | null | undefined): string {
  const p = israelParts(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}

/** "11.9.2026" from "2026-09-11": the prose form, as the invoices page writes a range. */
export function formatDay(day: string): string {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}.${Number(match[2])}.${match[1]}` : day || '';
}

/** "12.8.2026 — 11.9.2026", or the open end said in words when a date is cleared. */
export function signatureRangeLabel(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${formatDay(dateFrom)} — ${formatDay(dateTo)}`;
  if (dateFrom) return `מ־${formatDay(dateFrom)}`;
  if (dateTo) return `עד ${formatDay(dateTo)}`;
  return 'כל התאריכים';
}

// ---- the consents ----

export type ConsentState = 'given' | 'refused' | 'absent';

export interface ConsentRow {
  key: keyof SignatureConsents;
  label: string;
  state: ConsentState;
  /** ✓ given, ✗ not given, — the document did not ask. */
  mark: '✓' | '✗' | '—';
  /** Said out loud, for a screen reader and a tooltip. */
  description: string;
}

const CONSENT_LABELS: ReadonlyArray<[keyof SignatureConsents, string]> = [
  ['health', 'הצהרת בריאות'],
  ['terms', 'תקנון'],
  ['computerized_documents', 'מסמכים ממוחשבים'],
];

/**
 * The three consents, always in the same order. Only a real boolean counts: a
 * key the document never asked (a rental contract has no health declaration)
 * is "—", never a ✗ the signer did not give.
 */
export function consentRows(consents: SignatureConsents | null | undefined): ConsentRow[] {
  return CONSENT_LABELS.map(([key, label]) => {
    const value = consents?.[key];
    if (value === true) return { key, label, state: 'given', mark: '✓', description: `${label}: אושר` };
    if (value === false) return { key, label, state: 'refused', mark: '✗', description: `${label}: לא אושר` };
    return { key, label, state: 'absent', mark: '—', description: `${label}: לא נכלל במסמך` };
  });
}

// ---- who ----

/** "נועה כהן, יואב כהן", or '—' for a signature that covered no child (a rental). */
export function signatureChildrenLabel(children: ReadonlyArray<SignatureChild> | null | undefined): string {
  const names = (children ?? []).map((child) => String(child?.full_name ?? '').trim()).filter(Boolean);
  return names.length ? names.join(', ') : '—';
}

// ---- the text and the image ----

/**
 * The signed text as paragraphs of plain text. Rendered as text nodes only —
 * the text came from a form and is never markup. Anything that is not a
 * string is dropped rather than printed as "[object Object]".
 */
export function signatureParagraphs(text: unknown): string[] {
  const list = Array.isArray(text) ? text : typeof text === 'string' ? text.split(/\n\s*\n/) : [];
  return list
    .filter((paragraph): paragraph is string => typeof paragraph === 'string')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * The drawn signature, only as a raster data URL. Anything else — a remote
 * address, an SVG, a script URL — is not shown: the image goes straight into
 * an <img src>, and a data URL of a picture is all the widget ever sends.
 */
export function safeSignatureImage(value: unknown): string | null {
  return typeof value === 'string' && IMAGE_DATA_URL.test(value) ? value : null;
}

// ---- the list query ----

/** What the history page and the customer card can ask the list for. */
export interface SignatureListFilters {
  family?: string;
  child?: string;
  kind?: string;
  branch?: string;
  search?: string;
  /** YYYY-MM-DD, inclusive. */
  dateFrom?: string;
  /** YYYY-MM-DD, inclusive. */
  dateTo?: string;
}

export interface SignatureListParams {
  family?: string;
  child?: string;
  kind?: string;
  branch?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The query string of GET /signatures/. Nothing unset is sent — an empty
 * "branch=" would be read as a branch — the search is trimmed, a malformed
 * date is left out, and a range given the wrong way round is swapped.
 */
export function signatureListParams(filters: SignatureListFilters, page = 1): SignatureListParams {
  const params: SignatureListParams = { page: Math.max(1, Math.floor(Number(page) || 1)) };
  const text = (value: string | undefined) => String(value ?? '').trim();

  for (const key of ['family', 'child', 'kind', 'branch', 'search'] as const) {
    const value = text(filters[key]);
    if (value) params[key] = value;
  }

  let from = text(filters.dateFrom);
  let to = text(filters.dateTo);
  if (!ISO_DAY.test(from)) from = '';
  if (!ISO_DAY.test(to)) to = '';
  if (from && to && from > to) [from, to] = [to, from];
  if (from) params.date_from = from;
  if (to) params.date_to = to;

  return params;
}

// ---- the history page's filters ----

/** The history page's own fields. */
export interface SignatureFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  kind: string;
  branch: string;
}

/** YYYY-MM-DD of a local date. */
export function localDayISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** What the page opens on: the last 30 days, nothing else narrowed. */
export function defaultSignatureFilters(now: Date = new Date()): SignatureFilters {
  const from = new Date(now);
  from.setDate(from.getDate() - SIGNATURES_DEFAULT_RANGE_DAYS);
  return { search: '', dateFrom: localDayISO(from), dateTo: localDayISO(now), kind: '', branch: '' };
}

/**
 * The filters after a change. The range cannot invert: moving one end past
 * the other takes the other along — the date just picked is the one meant.
 */
export function applySignatureFilterChange(
  prev: SignatureFilters,
  patch: Partial<SignatureFilters>,
): SignatureFilters {
  const next = { ...prev, ...patch };
  if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
    if (patch.dateFrom !== undefined && patch.dateTo === undefined) next.dateTo = next.dateFrom;
    else if (patch.dateTo !== undefined && patch.dateFrom === undefined) next.dateFrom = next.dateTo;
    else [next.dateFrom, next.dateTo] = [next.dateTo, next.dateFrom];
  }
  return next;
}

/** How many narrowing fields are in force. The dates are what was asked for, not a filter on it. */
export function countSignatureFilters(filters: Pick<SignatureFilters, 'search' | 'kind' | 'branch'>): number {
  return [filters.search.trim(), filters.kind, filters.branch].filter(Boolean).length;
}

// ---- pages ----

export function signaturePageCount(count: number): number {
  return Math.max(1, Math.ceil((Number(count) || 0) / SIGNATURES_PAGE_SIZE));
}

/** "51–100" — which rows of the whole list this page holds. */
export function signaturePageSpan(page: number, shown: number): string {
  if (shown <= 0) return '0';
  const from = (Math.max(1, page) - 1) * SIGNATURES_PAGE_SIZE + 1;
  const to = from + shown - 1;
  return from === to ? String(from) : `${from}–${to}`;
}

// ---- reading the server ----

function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

/**
 * One list row as the screens use it. The fields a screen iterates over — the
 * children, the consents — are made safe to iterate even when absent.
 */
export function readSignatureSummary(raw: unknown): SignatureSummary {
  const row = (raw ?? {}) as Record<string, unknown>;
  const children = Array.isArray(row.children)
    ? (row.children as unknown[])
        .filter((child): child is Record<string, unknown> => Boolean(child) && typeof child === 'object')
        .map((child) => ({ id: asString(child.id), full_name: asString(child.full_name) }))
    : [];
  const consents =
    row.consents && typeof row.consents === 'object' ? (row.consents as SignatureConsents) : {};
  return {
    id: asString(row.id),
    kind: asString(row.kind),
    kind_label: asString(row.kind_label),
    signed_at: asString(row.signed_at),
    signer_name: asString(row.signer_name),
    signer_id_number: asString(row.signer_id_number),
    family_id: row.family_id == null ? null : asString(row.family_id),
    family_name: asString(row.family_name),
    children,
    branch_name: asString(row.branch_name),
    document_title: asString(row.document_title),
    document_sha256: asString(row.document_sha256),
    consents,
    pdf_url: asString(row.pdf_url),
  };
}

export function readSignatureDetail(raw: unknown): SignatureDetail {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    ...readSignatureSummary(raw),
    document_text: signatureParagraphs(row.document_text),
    signature_image: asString(row.signature_image),
    ip_address: row.ip_address == null ? null : asString(row.ip_address),
    user_agent: asString(row.user_agent),
    refs: row.refs && typeof row.refs === 'object' ? (row.refs as Record<string, unknown>) : null,
  };
}

/** A DRF page, or a bare list from a server that does not paginate. */
export function readSignaturesPage(data: unknown): SignaturesPage {
  if (Array.isArray(data)) {
    return { count: data.length, next: null, previous: null, results: data.map(readSignatureSummary) };
  }
  const page = (data ?? {}) as Record<string, unknown>;
  const results = Array.isArray(page.results) ? page.results.map(readSignatureSummary) : [];
  const count = Number(page.count);
  return {
    count: Number.isFinite(count) ? count : results.length,
    next: typeof page.next === 'string' ? page.next : null,
    previous: typeof page.previous === 'string' ? page.previous : null,
    results,
  };
}

// ---- files ----

// What Windows and macOS refuse in a file name, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_FILENAME = /[\\/:*?"<>|\x00-\x1f]+/g;

function filenamePart(value: string): string {
  return value.replace(UNSAFE_IN_FILENAME, '-').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '');
}

/**
 * "תקנון הרשמה - רותי ניסן - 2026-09-11.pdf": what was signed, who signed and
 * the day, so a folder of them reads without opening one. Characters a file
 * system refuses become "-"; a part that is missing is left out.
 */
export function signaturePdfFilename(
  signature: Pick<SignatureSummary, 'id' | 'kind' | 'kind_label' | 'signer_name' | 'signed_at'>,
): string {
  const parts = [signatureKindLabel(signature), signature.signer_name, signedDayISO(signature.signed_at)]
    .map((part) => filenamePart(String(part ?? '')))
    .filter(Boolean);
  const idPart = filenamePart(String(signature.id ?? '')).slice(0, 8);
  const hasWho = Boolean(filenamePart(String(signature.signer_name ?? '')));
  // Without a name, two signatures of one day would share a file name; the id tells them apart.
  if (!hasWho && idPart) parts.push(idPart);
  return `${parts.join(' - ') || 'חתימה'}.pdf`;
}

/** What a failed PDF download says. */
export function signaturePdfError(error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 404) return 'קובץ ה־PDF של החתימה לא נמצא';
  if (status === 403) return 'אין הרשאה להוריד את החתימה';
  return 'הורדת ה־PDF נכשלה';
}

// ---- empty states ----

export interface EmptyStateCopy {
  title: string;
  text: string;
  /** The way out is clearing the narrowing fields. */
  offerClear: boolean;
}

/**
 * What an empty history says. A narrowed list says the narrowing hid it; a
 * range that ends before signatures were kept says that is why; otherwise the
 * range simply had none.
 */
export function signaturesEmptyState({
  dateFrom,
  dateTo,
  narrowed,
}: {
  dateFrom: string;
  dateTo: string;
  narrowed: boolean;
}): EmptyStateCopy {
  const between = dateFrom && dateTo ? `בין ${formatDay(dateFrom)} ל־${formatDay(dateTo)}` : 'בטווח שנבחר';
  if (narrowed) {
    return {
      title: 'אף חתימה לא מתאימה לסינון',
      text: `${between} אין חתימה שמתאימה לחיפוש ולסינון שנבחרו. נקו את הסינון כדי לראות את כל החתימות בטווח.`,
      offerClear: true,
    };
  }
  if (dateTo && dateTo < SIGNATURES_KEPT_FROM) {
    return {
      title: 'אין חתימות בטווח הזה',
      text: 'חתימות נשמרות מהרשמות מ־11.9.2026 ואילך, והטווח שנבחר מסתיים לפני כן. בחרו תאריכים מאוחרים יותר.',
      offerClear: false,
    };
  }
  return {
    title: 'אין חתימות בטווח הזה',
    text: `${between} לא נשמרה אף חתימה. חתימות נשמרות מהרשמות מ־11.9.2026 ואילך.`,
    offerClear: false,
  };
}
