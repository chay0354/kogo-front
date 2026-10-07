import api from './api';

/**
 * The import from the previous software — or from any other invoicing software —
 * (backend: apps/legacy_import), and the history it leaves on each business customer.
 *
 * Three formats: the previous software's own .xls export ('tazman'), any
 * software's table (CSV / XLSX / XLS) with a column mapping the office confirms
 * ('table'), and any software's מבנה אחיד files ('uniform'). Every document is
 * kept under the software it came from (`source_system`): two softwares'
 * documents with the same type and number are two documents.
 *
 * Everything that is not a request is a pure function below, so what the
 * preview screen computes — the mapping it sends, which selects are open, what
 * the numbering table says — is tested without a browser.
 */

/** Vercel refuses a body over 4.5 MB before the server sees it; the server's own limit is this. */
export const LEGACY_IMPORT_MAX_BYTES = 4_300_000;

/**
 * A file over that limit is sent gzipped (packForUpload): an .xls of repeated
 * names shrinks to a quarter. This is the most the server unpacks.
 */
export const LEGACY_IMPORT_MAX_UNPACKED_BYTES = 40_000_000;

/** Kogo's convention: a branch is what the category סניפים means (NewDocumentDialog/branchFieldApplies). */
export const BRANCHES_CATEGORY = 'סניפים';

export type LegacyDocType = 'combined' | 'tax_invoice' | 'receipt' | 'transaction_invoice' | 'credit_invoice';

export const LEGACY_DOC_TYPE_LABELS: Record<LegacyDocType, string> = {
  combined: 'חשבונית מס/קבלה',
  tax_invoice: 'חשבונית מס',
  receipt: 'קבלה',
  transaction_invoice: 'חשבונית עסקה',
  credit_invoice: 'חשבונית מס זיכוי',
};

export type LegacySourceFormat = 'tazman' | 'table' | 'uniform';

/** The previous software: its export is always imported under this source. */
export const TAZMAN_SOURCE = 'tazman';

export interface LegacyKnownSource {
  id: string;
  label: string;
}

export interface LegacyTableField {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}

export interface LegacyColumn {
  index: number;
  header: string;
  sensitive: boolean;
  samples: string[];
  distinct: { value: string; count: number }[];
}

/** field -> column index, or null for "not in the file". */
export type LegacyColumnMapping = Record<string, number | null>;

export interface LegacyColumnsInfo {
  columns: LegacyColumn[];
  rows: number;
  suggested: LegacyColumnMapping;
  suggested_types: Record<string, LegacyDocType | ''>;
  fields: LegacyTableField[];
  file_kind: 'csv' | 'xlsx' | 'xls';
}

export interface LegacyUniformInfo {
  software: string;
  software_version: string;
  vendor_name: string;
  business_name: string;
  vat_number: string;
  period_start: string | null;
  period_end: string | null;
  files: number;
  records: { C100: number; D110: number; D120: number };
  warnings: string[];
}

export interface LegacySourceInfo {
  format: LegacySourceFormat;
  system: string;
  label: string;
  file_kind: string;
  columns: {
    headers: string[];
    mapping: LegacyColumnMapping;
    type_values: Record<string, LegacyDocType>;
    fixed_doc_type: string;
  } | null;
  uniform: LegacyUniformInfo | null;
}

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
  /** How many of them are invoices still open in the software — counted in the span, not imported. */
  open?: number;
}

/** An invoice the software still shows as unpaid: listed beside the preview, never imported. */
export interface LegacyOpenInvoice {
  doc_type: LegacyDocType;
  type_label: string;
  number: number;
  original_number: string;
  date: string;
  customer_name: string;
  id_number: string;
  invoice_total: string;
  details: string;
  location: string;
}

/** A company number the file has under several customers: each keeps a card of its own. */
export interface LegacySharedId {
  id_number: string;
  customers: { key: string; ext_number: string; name: string; documents: number }[];
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
    /** Open invoices in the file; `total` does not count them. */
    open_invoices?: number;
  };
  /** Missing on a preview made by a server from before open invoices were set aside. */
  open_invoices?: { count: number; total: string; rows: LegacyOpenInvoice[] };
  shared_ids?: LegacySharedId[];
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
  /** Missing on a preview made before any software but the previous one could be imported. */
  source?: LegacySourceInfo;
  unknown_types?: { label: string; count: number }[];
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
    cards_opened_or_updated?: boolean;
    linked_without_changing_cards?: number;
  };
  documents: {
    created: number;
    updated: number;
    unchanged: number;
    linked_to_customers: number;
    total: number;
    /** Open invoices the commit left out. */
    open_skipped?: number;
    /** false for a cards-only commit: no document was kept. Missing on an older server, which always kept them. */
    imported?: boolean;
    /** Cards only: how many documents the file had, all of them left in the software that issued them. */
    left_in_previous_software?: number;
  };
}

/**
 * What a commit writes. 'cards': the customers' cards and not one document —
 * the business numbers its documents afresh in kogo and only wants its
 * customers remembered. 'all': the cards and every document as history.
 * 'history': the documents only, no card opened or changed.
 */
export type LegacyImportScope = 'cards' | 'all' | 'history';

export const LEGACY_IMPORT_SCOPES: { value: LegacyImportScope; label: string; hint: string }[] = [
  {
    value: 'cards',
    label: 'כרטיסי לקוחות בלבד',
    hint: 'נפתחים ומתעדכנים כרטיסי הלקוחות העסקיים, עם כל הפרטים שלהם. אף מסמך לא נשמר, והמספור של קוגו לא מושפע.',
  },
  {
    value: 'all',
    label: 'כרטיסי לקוחות והיסטוריית המסמכים',
    hint: 'בנוסף לכרטיסים, כל מסמך נשמר כהיסטוריה על הלקוח שלו. המסמכים לא מופקים מחדש ולא נכנסים לדוחות.',
  },
  {
    value: 'history',
    label: 'היסטוריית המסמכים בלבד',
    hint: 'שום כרטיס לא נפתח ולא משתנה. מסמך מקושר לכרטיס קיים רק לפי ח"פ/ת"ז או קישור מייבוא קודם.',
  },
];

/** The two switches the server reads for a scope. */
export function scopeFlags(scope: LegacyImportScope): { createCustomers: boolean; importDocuments: boolean } {
  return { createCustomers: scope !== 'history', importDocuments: scope !== 'cards' };
}

export interface LegacyImport {
  id: string;
  source_system?: string;
  source_label?: string;
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
  // Optional: a server from before any-software imports does not send them.
  source_system?: string;
  source_label?: string;
  original_number?: string;
  amount_before_vat?: string | null;
  vat_amount?: string | null;
  allocation_number?: string;
  linked_document?: string;
  has_pdf?: boolean;
  pdf_stored?: boolean;
  pdf_sha256?: string;
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

// The whole history is tens of thousands of rows, read and written in bulk. The
// server has five minutes for a request; the screen waits nearly as long.
const SLOW = { timeout: 280000 };

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

export interface LegacyPreviewOptions {
  format?: LegacySourceFormat;
  /** The software's slug or typed name; '' for a מבנה אחיד file lets its INI.TXT say. */
  sourceSystem?: string;
  columnMapping?: LegacyColumnMapping;
  typeValues?: Record<string, LegacyDocType>;
  fixedDocType?: LegacyDocType | '';
}

/** The multipart body of a preview. The previous software's export sends the file alone, as it always did. */
export function previewFormData(file: File, options: LegacyPreviewOptions = {}): FormData {
  const body = new FormData();
  body.append('file', file);
  const format = options.format ?? 'tazman';
  if (format === 'tazman') return body;
  body.append('format', format);
  body.append('source_system', options.sourceSystem ?? '');
  if (format === 'table') {
    if (options.columnMapping) body.append('column_mapping', JSON.stringify(options.columnMapping));
    if (options.typeValues && Object.keys(options.typeValues).length) {
      body.append('type_values', JSON.stringify(options.typeValues));
    }
    if (options.fixedDocType) body.append('fixed_doc_type', options.fixedDocType);
  }
  return body;
}

/** True where the browser can gzip a file itself (every current browser; not an old Safari). */
export function canPackUploads(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/** Why a file that had to be packed still cannot be sent. The message is for the office, in Hebrew. */
export class ImportFileTooBigError extends Error {}

/**
 * The file as it is sent: itself when it fits one request, gzipped (named
 * '<name>.gz') when it does not. The server unpacks it and reads the file the
 * office chose. Throws ImportFileTooBigError when even the packed file is too big.
 */
export async function packForUpload(file: File): Promise<File> {
  if (file.size <= LEGACY_IMPORT_MAX_BYTES) return file;
  if (!canPackUploads()) {
    throw new ImportFileTooBigError(
      `הקובץ גדול מדי (${(file.size / 1_000_000).toFixed(1)}MB). הגבול הוא 4.3MB — ייצאו טווח תאריכים קצר יותר.`,
    );
  }
  const packed = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  if (packed.size > LEGACY_IMPORT_MAX_BYTES) {
    throw new ImportFileTooBigError(
      `הקובץ גדול מדי גם אחרי דחיסה (${(packed.size / 1_000_000).toFixed(1)}MB). ייצאו טווח תאריכים קצר יותר, והעלו כל חלק בנפרד.`,
    );
  }
  return new File([packed], `${file.name}.gz`, { type: 'application/gzip' });
}

export async function previewLegacyImport(file: File, options: LegacyPreviewOptions = {}): Promise<LegacyImport> {
  const sent = await packForUpload(file);
  const res = await api.post('/legacy-import/preview/', previewFormData(sent, options), { ...SLOW, ...MULTIPART });
  return res.data;
}

/** A table file's columns, a few values of each, and the suggested mapping. The server writes nothing. */
export async function describeLegacyColumns(file: File): Promise<LegacyColumnsInfo> {
  const body = new FormData();
  body.append('file', await packForUpload(file));
  const res = await api.post('/legacy-import/columns/', body, { ...SLOW, ...MULTIPART });
  return res.data;
}

export async function fetchLegacySources(): Promise<{
  sources: LegacyKnownSource[];
  fields: LegacyTableField[];
  /**
   * The server keeps no document on a cards-only commit. false for a server
   * from before that existed: it would ignore the flag and import every
   * document, so the screen must not send a cards-only commit to it.
   */
  cardsOnly: boolean;
}> {
  const res = await api.get('/legacy-import/sources/');
  return {
    sources: Array.isArray(res.data?.sources) ? res.data.sources : [],
    fields: Array.isArray(res.data?.fields) ? res.data.fields : [],
    cardsOnly: res.data?.cards_only === true,
  };
}

/**
 * Why a commit of this scope must not be sent, or null. Cards only is sent
 * only to a server that says it honours it — an older one would quietly keep
 * every document the owner asked to leave behind.
 */
export function scopeProblem(scope: LegacyImportScope, serverKeepsCardsAlone: boolean): string | null {
  if (scope === 'cards' && !serverKeepsCardsAlone) {
    return 'השרת עדיין לא מעודכן לייבוא כרטיסים בלבד, ולכן הייבוא לא נשלח — אחרת היו נשמרים גם המסמכים. רעננו את הדף ונסו שוב בעוד כמה דקות.';
  }
  return null;
}

export async function commitLegacyImport(
  id: string,
  mapping: LegacyMapping,
  includeSubscriptionParents: boolean,
  createCustomers = true,
  importDocuments = true,
): Promise<LegacyCommitResult> {
  const res = await api.post(
    `/legacy-import/${id}/commit/`,
    {
      mapping: mappingPayload(mapping),
      include_subscription_parents: includeSubscriptionParents,
      // The server opens and updates cards unless told not to.
      ...(createCustomers ? {} : { create_customers: false }),
      // And keeps every document as history unless told not to.
      ...(importDocuments ? {} : { import_documents: false }),
    },
    SLOW,
  );
  return res.data;
}

export type LegacyPdfStatus =
  | 'stored'
  | 'fingerprinted'
  | 'already'
  | 'unmatched'
  | 'ambiguous'
  | 'duplicate'
  | 'conflict'
  | 'rejected'
  | 'failed';

export interface LegacyPdfDocumentRef {
  id: string;
  doc_type: LegacyDocType;
  type_label: string;
  number: number;
  original_number: string;
  date: string;
}

export interface LegacyPdfFileReport {
  file: string;
  status: LegacyPdfStatus;
  reason?: string;
  document?: LegacyPdfDocumentRef;
  candidates?: LegacyPdfDocumentRef[];
  sha256?: string;
}

export interface LegacyPdfReport {
  bucket_configured: boolean;
  source_system: string;
  counts: Partial<Record<LegacyPdfStatus, number>>;
  files: LegacyPdfFileReport[];
  total: number;
  remaining: number;
  stopped: string;
}

/** One batch of PDFs (or one ZIP) for one software. */
export async function uploadLegacyPdfs(
  files: { pdfs?: File[]; zip?: File },
  sourceSystem: string,
): Promise<LegacyPdfReport> {
  const body = new FormData();
  body.append('source_system', sourceSystem);
  if (files.zip) body.append('file', files.zip);
  for (const pdf of files.pdfs ?? []) body.append('files', pdf, pdf.name);
  const res = await api.post('/legacy-import/pdfs/', body, { ...SLOW, ...MULTIPART });
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

/** What each format's file picker accepts. */
export const FORMAT_ACCEPT: Record<LegacySourceFormat, string> = {
  tazman: '.xls,application/vnd.ms-excel',
  table: '.csv,.xlsx,.xls,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
  uniform: '.zip,.txt,application/zip,text/plain',
};

const FORMAT_EXTENSIONS: Record<LegacySourceFormat, RegExp> = {
  tazman: /\.xls$/i,
  table: /\.(csv|xlsx|xls|txt|tsv)$/i,
  uniform: /\.(zip|txt)$/i,
};

const FORMAT_WRONG_FILE: Record<LegacySourceFormat, string> = {
  tazman: 'יש לבחור את קובץ הייצוא ‎.xls מהתוכנה הקודמת',
  table: 'יש לבחור קובץ ‎.csv, ‏‎.xlsx או ‎.xls',
  uniform: 'יש לבחור את BKMVDATA.TXT או קובץ ZIP של המבנה האחיד',
};

/**
 * Why a file cannot be sent, in Hebrew — or null. Checked before the upload,
 * like the server does after. A file over one request's limit is fine where
 * the browser can pack it (`canPack`), up to what the server unpacks.
 */
export function importFileProblem(
  file: { name: string; size: number } | null,
  format: LegacySourceFormat = 'tazman',
  canPack: boolean = canPackUploads(),
): string | null {
  if (!file) return 'לא נבחר קובץ';
  if (!FORMAT_EXTENSIONS[format].test(file.name.trim())) return FORMAT_WRONG_FILE[format];
  const megabytes = (file.size / 1_000_000).toFixed(1);
  if (file.size > LEGACY_IMPORT_MAX_BYTES && !canPack) {
    return `הקובץ גדול מדי (${megabytes}MB). הגבול הוא 4.3MB — ייצאו טווח תאריכים קצר יותר.`;
  }
  if (file.size > LEGACY_IMPORT_MAX_UNPACKED_BYTES) {
    return `הקובץ גדול מדי (${megabytes}MB). הגבול הוא 40MB — ייצאו טווח תאריכים קצר יותר.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Open invoices: listed, never imported
// ---------------------------------------------------------------------------

/** Excel reads a UTF-8 CSV as Hebrew only with the byte-order mark in front. */
const CSV_BOM = '\uFEFF';

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The open invoices as a CSV the office keeps outside kogo: they are collected
 * and closed in the software that issued them.
 */
export function openInvoicesCsv(rows: LegacyOpenInvoice[]): string {
  const header = ['סוג מסמך', 'מספר', 'תאריך', 'לקוח', 'ת"ז / ח"פ', 'סכום', 'פרטים', 'מיקום'];
  const lines = rows.map((row) => [
    row.type_label,
    row.original_number || row.number,
    formatLegacyDate(row.date),
    row.customer_name,
    row.id_number,
    row.invoice_total,
    row.details,
    row.location,
  ]);
  return CSV_BOM + [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** 'חשבונית מס · 654 (5 פתוחות, לא ייובאו)' — the open ones of a type, in words, or ''. */
export function openCountNote(row: Pick<LegacyTypeRow, 'open'>): string {
  const open = row.open ?? 0;
  if (!open) return '';
  return open === 1 ? 'אחת מהן פתוחה ולא תיובא' : `${open} מהן פתוחות ולא ייובאו`;
}

/** The source a preview is sent with: a known software's slug, or the name the office typed for another. */
export function chosenSourceSystem(choice: string, otherName: string): string {
  if (choice === 'other') return otherName.trim();
  return choice;
}

// ---------------------------------------------------------------------------
// The column mapping (a table from another software)
// ---------------------------------------------------------------------------

/** The mapping the step opens with: the server's suggestion, every field present. */
export function initialColumnMapping(info: LegacyColumnsInfo): LegacyColumnMapping {
  const mapping: LegacyColumnMapping = {};
  for (const field of info.fields) mapping[field.key] = info.suggested[field.key] ?? null;
  return mapping;
}

/** One field pointed at a column: a column holds one field, so it leaves any other field it was on. */
export function setColumn(mapping: LegacyColumnMapping, field: string, index: number | null): LegacyColumnMapping {
  const next: LegacyColumnMapping = { ...mapping };
  if (index !== null) {
    for (const [key, value] of Object.entries(next)) if (value === index) next[key] = null;
  }
  next[field] = index;
  return next;
}

/** What the mapping still lacks for a document to be read — the server's own rule, in Hebrew. */
export function columnMappingProblems(mapping: LegacyColumnMapping, fixedDocType: LegacyDocType | ''): string[] {
  const missing: string[] = [];
  if (mapping.number == null) missing.push('מספר מסמך');
  if (mapping.date == null) missing.push('תאריך');
  if (mapping.doc_type == null && !fixedDocType) missing.push('סוג מסמך (עמודה, או סוג אחד לכל הקובץ)');
  if (mapping.total == null && mapping.amount_before_vat == null) missing.push('סכום (סה"כ, או סכום לפני מע"מ)');
  return missing;
}

/**
 * The values of the chosen type column, each with the type it will be read as:
 * the office's own choice, else the server's suggestion ('' = not recognised, skipped).
 */
export function typeValueRows(
  info: LegacyColumnsInfo,
  mapping: LegacyColumnMapping,
  chosen: Record<string, LegacyDocType>,
): { value: string; count: number; docType: LegacyDocType | ''; recognised: boolean }[] {
  const index = mapping.doc_type;
  if (index == null) return [];
  const column = info.columns.find((c) => c.index === index);
  if (!column) return [];
  const suggested = index === info.suggested.doc_type ? info.suggested_types : {};
  return column.distinct.map((d) => ({
    value: d.value,
    count: d.count,
    docType: chosen[d.value] ?? suggested[d.value] ?? '',
    // Recognised by the server: it is read as that type unless the office picks another.
    recognised: Boolean(suggested[d.value]),
  }));
}

/** A column as the select shows it: its header and a value or two from the file. */
export function columnOptionLabel(column: LegacyColumn): string {
  const header = column.header || `עמודה ${column.index + 1}`;
  const samples = column.samples.slice(0, 2).join(', ');
  return samples ? `${header} — ${samples}` : header;
}

// ---------------------------------------------------------------------------
// The old software's PDFs
// ---------------------------------------------------------------------------

/** Each request stays under Vercel's body limit, with room for the multipart envelope. */
export const PDF_BATCH_BYTES = 4_000_000;

/** PDFs grouped into requests of at most `limit` bytes; a file bigger than that on its own is left out. */
export function pdfBatches<T extends { size: number }>(files: T[], limit = PDF_BATCH_BYTES): { batches: T[][]; tooBig: T[] } {
  const batches: T[][] = [];
  const tooBig: T[] = [];
  let current: T[] = [];
  let size = 0;
  for (const file of files) {
    if (file.size > limit) {
      tooBig.push(file);
      continue;
    }
    if (current.length && size + file.size > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  }
  if (current.length) batches.push(current);
  return { batches, tooBig };
}

/** Several batches' answers as one report. */
export function mergePdfReports(reports: LegacyPdfReport[]): LegacyPdfReport {
  const counts: Partial<Record<LegacyPdfStatus, number>> = {};
  for (const report of reports) {
    for (const [status, count] of Object.entries(report.counts)) {
      counts[status as LegacyPdfStatus] = (counts[status as LegacyPdfStatus] ?? 0) + (count ?? 0);
    }
  }
  const last = reports[reports.length - 1];
  return {
    bucket_configured: reports.every((r) => r.bucket_configured),
    source_system: last?.source_system ?? '',
    counts,
    files: reports.flatMap((r) => r.files),
    total: reports.reduce((sum, r) => sum + r.total, 0),
    remaining: reports.reduce((sum, r) => sum + r.remaining, 0),
    stopped: reports.map((r) => r.stopped).find(Boolean) ?? '',
  };
}

export const PDF_STATUS_LABELS: Record<LegacyPdfStatus, string> = {
  stored: 'נשמר באחסון הנעול',
  fingerprinted: 'נשמרה טביעת אצבע בלבד',
  already: 'כבר צורף קודם',
  unmatched: 'לא נמצא מסמך',
  ambiguous: 'כמה מסמכים מתאימים',
  duplicate: 'כפול',
  conflict: 'למסמך כבר יש PDF אחר',
  rejected: 'לא קובץ PDF',
  failed: 'השמירה נכשלה',
};

/** The statuses that need the office's eye, in the order the report lists them. */
export const PDF_PROBLEM_STATUSES: LegacyPdfStatus[] = ['failed', 'conflict', 'ambiguous', 'unmatched', 'duplicate', 'rejected'];

/** The number a document is known by: as the software printed it, when that is not just the number. */
export function documentNumberLabel(doc: { number: number; original_number?: string }): string {
  return doc.original_number || String(doc.number);
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

/** The softwares a list of documents came from, as their labels — one entry per software. */
export function sourcesOf(docs: Pick<LegacyDocument, 'source_system' | 'source_label'>[]): string[] {
  const labels = new Map<string, string>();
  for (const doc of docs) {
    const key = doc.source_system || TAZMAN_SOURCE;
    if (!labels.has(key)) labels.set(key, doc.source_label || key);
  }
  return Array.from(labels.values());
}

type LastNumber = { doc_type: LegacyDocType; label: string; number: number; date: string; count: number; source_label?: string };

/**
 * Per type, the newest number a customer's history has — "what the last numbers were".
 * Each software numbers its own runs, so with more than one software each has
 * its own line, named after it.
 */
export function lastNumbersByType(
  docs: (Pick<LegacyDocument, 'doc_type' | 'doc_type_label' | 'number' | 'document_date'> &
    Partial<Pick<LegacyDocument, 'source_system' | 'source_label'>>)[],
): LastNumber[] {
  const several = sourcesOf(docs).length > 1;
  const byKey = new Map<string, LastNumber & { source: string }>();
  for (const doc of docs) {
    const source = doc.source_system || TAZMAN_SOURCE;
    const key = `${source}:${doc.doc_type}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, {
        source,
        doc_type: doc.doc_type,
        label: several ? `${doc.doc_type_label} (${doc.source_label || source})` : doc.doc_type_label,
        number: doc.number,
        date: doc.document_date,
        count: 1,
        source_label: doc.source_label,
      });
      continue;
    }
    seen.count += 1;
    if (doc.number > seen.number) {
      seen.number = doc.number;
      seen.date = doc.document_date;
    }
  }
  const order: LegacyDocType[] = ['combined', 'tax_invoice', 'receipt', 'transaction_invoice', 'credit_invoice'];
  const entries = Array.from(byKey.values()).sort(
    (a, b) =>
      Number(a.source !== TAZMAN_SOURCE) - Number(b.source !== TAZMAN_SOURCE) ||
      a.source.localeCompare(b.source) ||
      order.indexOf(a.doc_type) - order.indexOf(b.doc_type),
  );
  return entries.map(({ doc_type, label, number, date, count, source_label }) => ({
    doc_type, label, number, date, count, source_label,
  }));
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

/** Where the documents come from, in words: "מהתוכנה הקודמת" or "מ-iCount". */
export function fromSourceText(summary: Pick<LegacySummary, 'source'>): string {
  const source = summary.source;
  if (!source || source.system === TAZMAN_SOURCE) return 'מהתוכנה הקודמת';
  return `מ-${source.label}`;
}

/** What the confirm dialog says will happen — the same numbers the preview showed. */
export function commitConfirmText(
  summary: LegacySummary,
  includeParents: boolean,
  mapping: LegacyMapping,
  createCustomers = true,
  importDocuments = true,
): string {
  const c = summary.customers;
  const progress = mappingProgress(summary.locations, mapping);
  if (!importDocuments) {
    // Cards only: what is opened, and that nothing else of the file is kept.
    return [
      `ייפתחו כרטיסי לקוחות בלבד ${fromSourceText(summary)}: ${c.business_create} חדשים, ${c.business_update} קיימים יעודכנו.`,
      includeParents
        ? `הורים משלמי מנוי: ${c.parents.toLocaleString('he-IL')} ייפתחו או יעודכנו כלקוחות עסקיים.`
        : 'הורים משלמי מנוי לא ייפתחו כלקוחות עסקיים.',
      'אף מסמך לא יישמר, והמספור של קוגו לא מושפע.',
      'ייבוא חוזר של אותו קובץ לא ישכפל כרטיסים.',
    ].join('\n');
  }
  const lines = [
    `${summary.documents.total.toLocaleString('he-IL')} מסמכים יישמרו כהיסטוריה ${fromSourceText(summary)} (לא יופקו מחדש ולא ייכנסו לדוחות של קוגו).`,
  ];
  const open = summary.open_invoices?.count ?? 0;
  if (open) {
    lines.push(
      open === 1
        ? 'חשבונית פתוחה אחת לא תיובא — היא נשארת בתוכנה שהפיקה אותה.'
        : `${open.toLocaleString('he-IL')} חשבוניות פתוחות לא ייובאו — הן נשארות בתוכנה שהפיקה אותן.`,
    );
  }
  if (!createCustomers) {
    lines.push('לא ייפתחו ולא יעודכנו כרטיסי לקוחות. מסמך יקושר לכרטיס קיים רק לפי ח"פ/ת"ז או קישור קודם.');
  } else {
    lines.push(
      `לקוחות עסקיים: ${c.business_create} חדשים, ${c.business_update} קיימים יעודכנו.`,
      includeParents
        ? `הורים משלמי מנוי: ${c.parents.toLocaleString('he-IL')} ייפתחו או יעודכנו כלקוחות עסקיים.`
        : 'הורים משלמי מנוי לא ייפתחו כלקוחות עסקיים.',
    );
  }
  if (progress.unmappedDocuments > 0) {
    lines.push(`${progress.unmappedDocuments.toLocaleString('he-IL')} מסמכים ממיקומים ללא שיוך יישמרו בלי עסק/סניף.`);
  }
  lines.push('ייבוא חוזר של אותו קובץ לא ישכפל דבר.');
  return lines.join('\n');
}
