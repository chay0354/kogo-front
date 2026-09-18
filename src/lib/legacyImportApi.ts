import api from './api';

/**
 * The import from the previous software (backend: apps/legacy_import), and the
 * history it leaves on each business customer.
 *
 * Everything that is not a request is a pure function below, so what the
 * preview screen computes — the mapping it sends, which selects are open, what
 * the numbering table says — is tested without a browser.
 */

/** Vercel refuses a body over 4.5 MB before the server sees it; the server's own limit is this. */
export const LEGACY_IMPORT_MAX_BYTES = 4_300_000;

/** Kogo's convention: a branch is what the category סניפים means (NewDocumentDialog/branchFieldApplies). */
export const BRANCHES_CATEGORY = 'סניפים';

export type LegacyDocType = 'combined' | 'tax_invoice' | 'receipt' | 'transaction_invoice' | 'credit_invoice';

export interface LegacyTypeRow {
  doc_type: LegacyDocType;
  label: string;
  original_labels: string[];
  count: number;
  first_number: number;
  first_date: string;
  last_number: number;
  last_date: string;
  latest_date: string;
  missing_in_span: number;
}

export interface LegacyLocation {
  location: string;
  documents: number;
  business_customers: number;
  customers: number;
  kind: 'branch' | 'section' | 'expenses' | 'unknown';
  business_id: string | null;
  category_id: string | null;
  branch_id: string | null;
  reason: string;
  flag: boolean;
}

export interface LegacyBusinessCustomerRow {
  key: string;
  name: string;
  company_number: string;
  documents: number;
  types: Partial<Record<LegacyDocType, number>>;
  reasons: string[];
  latest: { doc_type: LegacyDocType; type_label: string; number: number; date: string; location: string };
  deleted: boolean;
  action: 'create' | 'update' | 'skip';
  match: { id: string; name: string; how: string } | null;
}

export interface LegacyNameChange {
  key: string;
  old_names: string[];
  new_name: string;
  documents: number;
}

export interface LegacyOption {
  id: string;
  name: string;
  is_active: boolean;
  business_id?: string;
}

export interface LegacyOptions {
  businesses: LegacyOption[];
  categories: LegacyOption[];
  branches: LegacyOption[];
}

export interface LegacySummary {
  documents: {
    total: number;
    skipped: number;
    skipped_rows: { row: number; reason: string }[];
    without_customer: number;
    already_imported: number;
    first_date: string | null;
    last_date: string | null;
  };
  types: LegacyTypeRow[];
  customers: {
    total: number;
    business: number;
    business_create: number;
    business_update: number;
    business_deleted: number;
    parents: number;
    parents_matching_family: number;
    parents_matching_business_customer: number;
    business_list: LegacyBusinessCustomerRow[];
  };
  name_changes: LegacyNameChange[];
  locations: LegacyLocation[];
  options: LegacyOptions;
}

export interface LegacyCommitResult {
  customers: {
    created: number;
    updated: number;
    unchanged: number;
    skipped_deleted: number;
    deleted_linked_to_existing_cards: number;
    parents_included: boolean;
    parents_linked_to_existing_cards: number;
  };
  documents: { created: number; updated: number; unchanged: number; linked_to_customers: number; total: number };
}

export interface LegacyImport {
  id: string;
  file_name: string;
  row_count: number;
  status: 'preview' | 'committed';
  summary: LegacySummary;
  mapping: LegacyMapping;
  include_subscription_parents: boolean;
  result: LegacyCommitResult | Record<string, never>;
  uploaded_at: string;
  uploaded_by_name: string;
  committed_at: string | null;
}

export interface LegacyDocument {
  id: string;
  source: 'legacy';
  doc_type: LegacyDocType;
  doc_type_label: string;
  original_type: string;
  number: number;
  document_date: string;
  invoice_total: string;
  receipt_total: string;
  credit_total: string;
  withholding_amount: string;
  total_before_withholding: string;
  original_status: string;
  payment_type: string;
  card_last_four: string;
  location: string;
  details: string;
  remark: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  business_customer_id: string | null;
  business_name: string;
  business_category_name: string;
  branch_name: string;
}

export interface LegacyTarget {
  business_id: string | null;
  category_id: string | null;
  branch_id: string | null;
}

export type LegacyMapping = Record<string, LegacyTarget>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// Reading ~8,000 rows and writing them in bulk takes a few seconds; a slow line should not cut it at 30.
const SLOW = { timeout: 120000 };

export async function previewLegacyImport(file: File): Promise<LegacyImport> {
  const body = new FormData();
  body.append('file', file);
  const res = await api.post('/legacy-import/preview/', body, {
    ...SLOW,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function commitLegacyImport(
  id: string,
  mapping: LegacyMapping,
  includeSubscriptionParents: boolean,
): Promise<LegacyCommitResult> {
  const res = await api.post(
    `/legacy-import/${id}/commit/`,
    { mapping: mappingPayload(mapping), include_subscription_parents: includeSubscriptionParents },
    SLOW,
  );
  return res.data;
}

export async function fetchLegacyImports(): Promise<Array<Omit<LegacyImport, 'summary' | 'mapping'>>> {
  const res = await api.get('/legacy-import/');
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchLegacyDocuments(params: {
  business_customer?: string;
  q?: string;
}): Promise<{ count: number; truncated: boolean; results: LegacyDocument[] }> {
  const res = await api.get('/legacy-import/documents/', { params });
  return {
    count: Number(res.data?.count ?? 0),
    truncated: Boolean(res.data?.truncated),
    results: Array.isArray(res.data?.results) ? res.data.results : [],
  };
}

// ---------------------------------------------------------------------------
// What the screens compute
// ---------------------------------------------------------------------------

/** Why a file cannot be sent, in Hebrew — or null. Checked before the upload, like the server does after. */
export function importFileProblem(file: { name: string; size: number } | null): string | null {
  if (!file) return 'לא נבחר קובץ';
  if (!/\.xls$/i.test(file.name.trim())) return 'יש לבחור את קובץ הייצוא ‎.xls מהתוכנה הקודמת';
  if (file.size > LEGACY_IMPORT_MAX_BYTES) {
    return `הקובץ גדול מדי (${(file.size / 1_000_000).toFixed(1)}MB). הגבול הוא 4.3MB — ייצאו טווח תאריכים קצר יותר.`;
  }
  return null;
}

/** The mapping the preview opens with: the server's suggestion for every location. */
export function initialMapping(locations: LegacyLocation[]): LegacyMapping {
  const mapping: LegacyMapping = {};
  for (const loc of locations) {
    mapping[loc.location] = {
      business_id: loc.business_id ?? null,
      category_id: loc.category_id ?? null,
      branch_id: loc.branch_id ?? null,
    };
  }
  return mapping;
}

function categoryName(options: LegacyOptions, categoryId: string | null): string {
  return options.categories.find((c) => c.id === categoryId)?.name ?? '';
}

/**
 * Whether the branch select is open. Under a category it is only for סניפים,
 * like everywhere else in kogo; with no business chosen a branch alone is allowed
 * (a place with no category to go under yet).
 */
export function branchAllowed(target: LegacyTarget, options: LegacyOptions): boolean {
  if (!target.business_id) return true;
  return categoryName(options, target.category_id).trim() === BRANCHES_CATEGORY;
}

/** One select changed: what else has to change with it. */
export function applyMappingChange(
  target: LegacyTarget,
  field: keyof LegacyTarget,
  value: string | null,
  options: LegacyOptions,
): LegacyTarget {
  const next: LegacyTarget = { ...target, [field]: value || null };
  if (field === 'business_id') {
    // A category belongs to one business.
    const category = options.categories.find((c) => c.id === next.category_id);
    if (!category || category.business_id !== next.business_id) next.category_id = null;
    if (next.business_id) {
      // A business with one category leaves nothing to ask.
      const own = options.categories.filter((c) => c.business_id === next.business_id && c.is_active);
      if (!next.category_id && own.length === 1) next.category_id = own[0].id;
    }
  }
  if (!branchAllowed(next, options)) next.branch_id = null;
  return next;
}

/** Categories for a business's select: its own active ones, plus whatever is already chosen. */
export function categoriesFor(options: LegacyOptions, target: LegacyTarget): LegacyOption[] {
  return options.categories.filter(
    (c) => c.business_id === target.business_id && (c.is_active || c.id === target.category_id),
  );
}

/** Only what points somewhere is sent; an unmapped location is simply absent. */
export function mappingPayload(mapping: LegacyMapping): LegacyMapping {
  const out: LegacyMapping = {};
  for (const [location, target] of Object.entries(mapping)) {
    if (target.business_id || target.category_id || target.branch_id) {
      out[location] = {
        business_id: target.business_id || null,
        category_id: target.category_id || null,
        branch_id: target.branch_id || null,
      };
    }
  }
  return out;
}

/** How far the owner is with the mapping: documents and business customers still going nowhere. */
export function mappingProgress(locations: LegacyLocation[], mapping: LegacyMapping) {
  let mapped = 0;
  let unmappedDocuments = 0;
  let unmappedBusinessCustomers = 0;
  let flagged = 0;
  for (const loc of locations) {
    const target = mapping[loc.location];
    const pointsSomewhere = Boolean(target && (target.business_id || target.branch_id));
    if (pointsSomewhere) mapped += 1;
    else {
      unmappedDocuments += loc.documents;
      unmappedBusinessCustomers += loc.business_customers;
    }
    if (loc.flag) flagged += 1;
  }
  return { total: locations.length, mapped, unmappedDocuments, unmappedBusinessCustomers, flagged };
}

/** One line per type for the numbering section, with what the span is missing said in words. */
export function numberingLine(row: LegacyTypeRow): { span: number; coverage: string } {
  const span = row.last_number - row.first_number + 1;
  const coverage =
    row.missing_in_span > 0
      ? `בקובץ ${row.count.toLocaleString('he-IL')} מתוך ${span.toLocaleString('he-IL')} מספרים בטווח — ${row.missing_in_span.toLocaleString('he-IL')} אינם בקובץ`
      : 'הטווח רציף בקובץ';
  return { span, coverage };
}

/** The amount a document is about: what was invoiced, received, or credited (a credit is negative). */
export function documentAmount(doc: Pick<LegacyDocument, 'doc_type' | 'invoice_total' | 'receipt_total' | 'credit_total'>): number {
  if (doc.doc_type === 'credit_invoice') return -Math.abs(Number(doc.credit_total) || 0);
  if (doc.doc_type === 'receipt') return Number(doc.receipt_total) || 0;
  return Number(doc.invoice_total) || Number(doc.receipt_total) || 0;
}

/** Per type, the newest number a customer's history has — "what the last numbers were". */
export function lastNumbersByType(
  docs: Pick<LegacyDocument, 'doc_type' | 'doc_type_label' | 'number' | 'document_date'>[],
): { doc_type: LegacyDocType; label: string; number: number; date: string; count: number }[] {
  const byType = new Map<LegacyDocType, { doc_type: LegacyDocType; label: string; number: number; date: string; count: number }>();
  for (const doc of docs) {
    const seen = byType.get(doc.doc_type);
    if (!seen) {
      byType.set(doc.doc_type, { doc_type: doc.doc_type, label: doc.doc_type_label, number: doc.number, date: doc.document_date, count: 1 });
      continue;
    }
    seen.count += 1;
    if (doc.number > seen.number) {
      seen.number = doc.number;
      seen.date = doc.document_date;
    }
  }
  const order: LegacyDocType[] = ['combined', 'tax_invoice', 'receipt', 'transaction_invoice', 'credit_invoice'];
  return order.filter((t) => byType.has(t)).map((t) => byType.get(t)!);
}

/** '2025-03-01' -> '01/03/2025'. */
export function formatLegacyDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function formatShekel(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** What the confirm dialog says will happen — the same numbers the preview showed. */
export function commitConfirmText(summary: LegacySummary, includeParents: boolean, mapping: LegacyMapping): string {
  const c = summary.customers;
  const progress = mappingProgress(summary.locations, mapping);
  const lines = [
    `${summary.documents.total.toLocaleString('he-IL')} מסמכים יישמרו כהיסטוריה מהתוכנה הקודמת (לא יופקו מחדש ולא ייכנסו לדוחות של קוגו).`,
    `לקוחות עסקיים: ${c.business_create} חדשים, ${c.business_update} קיימים יעודכנו.`,
    includeParents
      ? `הורים משלמי מנוי: ${c.parents.toLocaleString('he-IL')} ייפתחו או יעודכנו כלקוחות עסקיים.`
      : 'הורים משלמי מנוי לא ייפתחו כלקוחות עסקיים.',
  ];
  if (progress.unmappedDocuments > 0) {
    lines.push(`${progress.unmappedDocuments.toLocaleString('he-IL')} מסמכים ממיקומים ללא שיוך יישמרו בלי עסק/סניף.`);
  }
  lines.push('ייבוא חוזר של אותו קובץ לא ישכפל דבר.');
  return lines.join('\n');
}
