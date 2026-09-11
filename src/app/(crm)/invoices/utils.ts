import type { StoreInvoice } from '@/types/store';
import type {
  AgingBucket,
  ChargeKind,
  CollectionRow,
  DocType,
  DocumentRow,
  LedgerDimensions,
  LedgerFilters,
  PaymentLedgerItem,
  PaymentRecord,
} from './types';
import {
  DEFAULT_RANGE_DAYS,
  DELIVERY_FILTER,
  LEDGER_BUSINESS_BRANCHES,
  LEDGER_BUSINESS_STORE,
} from './constants';
import styles from './invoices.module.css';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  standing_order: 'הוראת קבע',
  registration: 'הרשמה / דמי רישום',
  trial: 'שיעור ניסיון',
  store: 'חנות',
  one_time: 'חד-פעמי',
};

const AGING_BUCKET_DEFS: Array<{ key: AgingBucket['key']; label: string; min: number; max: number }> = [
  { key: 'current', label: 'שוטף (0-30)', min: 0, max: 30 },
  { key: 'd31_60', label: '31-60 יום', min: 31, max: 60 },
  { key: 'd61_90', label: '61-90 יום', min: 61, max: 90 },
  { key: 'd90_plus', label: '90+ יום', min: 91, max: Infinity },
];

export function getDocType(inv: StoreInvoice): DocType {
  if (inv.invoice_number.startsWith('DRAFT')) return 'טיוטה';
  if (inv.payment_method === 'monthly_billing') return 'חשבונית עסקה';
  return 'חשבונית מס/קבלה';
}

export function getLedgerDocType(row: DocumentRow): string {
  return row.document_type || 'חשבונית מס/קבלה';
}

/**
 * מסנן סניף אחד לכל הדף.
 *
 * '' = כל הסניפים. 'delivery' = הזמנות מהאתר, שאין להן סניף כלל — בלעדיו הן
 * נעלמו בשקט ברגע שנבחר סניף כלשהו, ואי אפשר היה להגיע אליהן.
 */
export function matchesBranchFilter(
  row: { branch_id?: string | null; website_order_number?: string | null },
  branchFilter: string,
): boolean {
  if (!branchFilter) return true;
  if (branchFilter === DELIVERY_FILTER) return Boolean(row.website_order_number);
  return row.branch_id === branchFilter;
}

const ORIGIN_FALLBACK_LABELS: Record<string, string> = {
  store: 'חנות',
  crm: 'מנוי',
  local: 'מסמך ידני',
  tranzila: 'טרנזילה',
};

/** מאיזו מערכת הגיע המסמך. נופל חזרה ל-source עבור שורות שנשמרו לפני שהשדה נוסף. */
export function getOriginLabel(row: DocumentRow): string {
  return row.origin_label || ORIGIN_FALLBACK_LABELS[row.source ?? ''] || '—';
}

export function getOriginClass(row: DocumentRow): string {
  const key = row.origin ?? '';
  const map: Record<string, string> = {
    store_website: styles.originStore_website,
    store_counter: styles.originStore_counter,
    subscription: styles.originSubscription,
    manual: styles.originManual,
    tranzila: styles.originTranzila,
  };
  return map[key] ?? '';
}

/**
 * השורה השנייה תחת המקור: מה שמזהה מאיפה בדיוק הגיע המסמך — מספר הזמנה
 * באתר, שם הסניף שבו נמכר, או אמצעי התשלום כשאין אף אחד מהם.
 */
export function getOriginDetail(row: DocumentRow): string {
  if (row.website_order_number) return `הזמנה ${row.website_order_number}`;
  if (row.branch) return row.branch;
  return row.payment_method_label || '';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'שולם',
    pending: 'פתוח',
    partially_paid: 'שולם חלקית',
    failed: 'נכשל',
    refunded: 'זוכה',
    draft: 'טיוטה',
  };
  return labels[status] ?? status;
}

export function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    completed: styles.statusCompleted,
    pending: styles.statusPending,
    partially_paid: styles.statusFailed,
    failed: styles.statusFailed,
    refunded: styles.statusRefunded,
    draft: styles.statusPending,
  };
  return classes[status] ?? '';
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: 'אושר',
    completed: 'אושר',
    pending: 'ממתין',
    processing: 'בעיבוד',
    failed: 'נכשל',
    refunded: 'זוכה',
    cancelled: 'בוטל',
  };
  return labels[status] ?? status;
}

export function getPaymentStatusClass(status: string): string {
  const classes: Record<string, string> = {
    approved: styles.statusCompleted,
    completed: styles.statusCompleted,
    pending: styles.statusPending,
    processing: styles.statusPending,
    failed: styles.statusFailed,
    refunded: styles.statusRefunded,
    cancelled: styles.statusRefunded,
  };
  return classes[status] ?? '';
}

export function getRecurringStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'פעיל',
    paused: 'מושהה',
    cancelled: 'מבוטל',
    expired: 'פג תוקף',
    failed: 'נכשל',
  };
  return labels[status] ?? status;
}

export function getRecurringStatusClass(status: string): string {
  const classes: Record<string, string> = {
    active: styles.statusCompleted,
    paused: styles.statusPending,
    cancelled: styles.statusRefunded,
    expired: styles.statusFailed,
    failed: styles.statusFailed,
  };
  return classes[status] ?? '';
}

export function formatAmount(n: number | undefined | null): string {
  return `₪${(n ?? 0).toLocaleString('he-IL')}`;
}

export function formatDate(iso: string): string {
  const datePart = (iso || '').slice(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (year && month && day) {
    return `${day}.${month}.${year}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function getOpenInvoices(invoices: StoreInvoice[]): StoreInvoice[] {
  return invoices.filter(inv => inv.payment_status !== 'completed' && inv.payment_status !== 'refunded');
}

export function getOpenBalance(inv: StoreInvoice): number {
  return Math.max((inv.total_amount ?? 0) - (inv.amount_paid ?? 0), 0);
}

export function getDaysOverdue(issueDate: string): number {
  const issued = new Date(issueDate);
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate())) /
      msPerDay,
  );
  return Math.max(diff, 0);
}

// Days since issue, not days past a due date: the store invoice carries no
// due date, so "not yet due" would be a claim the data cannot back.
export function getOverdueLabel(daysOverdue: number): string {
  return daysOverdue > 0 ? `${daysOverdue} ימים` : 'הונפק היום';
}

/**
 * שורות הגבייה: כל מה שהונפק ועדיין לא נגבה, משני המקורות.
 *
 * מסמך שהופק מהמערכת (חשבונית מס ללקוח עסקי) הוא בדיוק החוב שצריך לעקוב
 * אחריו, ועד עכשיו הדף הראה רק חשבוניות חנות. טיוטות אינן חוב, וזיכוי אינו
 * כסף שממתין לגבייה.
 */
export function buildCollectionRows(
  documents: DocumentRow[],
  storeInvoices: StoreInvoice[],
): CollectionRow[] {
  const fromDocuments: CollectionRow[] = documents
    .filter(doc => !doc.is_draft && doc.document_type_code !== 'credit_invoice' && doc.open_balance > 0)
    .map(doc => ({
      id: doc.id,
      kind: 'document' as const,
      customer: doc.customer_name || '—',
      number: doc.document_number,
      docType: doc.document_type,
      issueDate: doc.issue_date,
      dueDate: doc.due_date || '',
      paymentTerms: doc.payment_terms || '',
      total: doc.total_amount ?? 0,
      paid: doc.amount_paid ?? 0,
      open: doc.open_balance ?? 0,
      status: doc.status,
    }));

  const fromStore: CollectionRow[] = getOpenInvoices(storeInvoices).map(inv => ({
    id: inv.id,
    kind: 'store' as const,
    customer: inv.child_name ?? inv.customer_name ?? '—',
    number: inv.invoice_number,
    docType: getDocType(inv),
    issueDate: inv.issue_date,
    dueDate: '',
    paymentTerms: '',
    total: inv.total_amount ?? 0,
    paid: inv.amount_paid ?? 0,
    open: getOpenBalance(inv),
    status: inv.payment_status,
  }));

  return [...fromDocuments, ...fromStore];
}

/**
 * מועד התשלום לפי תנאי התשלום שנרשמו, כשלא הוזן תאריך יעד מפורש.
 *
 * "שוטף + 30" בעברית חשבונאית הוא סוף החודש שבו הונפק המסמך ועוד 30 יום —
 * לא 30 יום מההנפקה. בלי החישוב הזה מסמך בשוטף+30 שהונפק ב-2 בחודש נראה
 * כאילו הוא באיחור שבועיים לפני שבכלל הגיע מועד התשלום.
 */
export function dueDateFromTerms(issueDate: string, terms: string): string {
  const match = /שוטף\s*\+?\s*(\d{1,3})/.exec(terms || '');
  if (!match) return '';
  const [year, month, day] = (issueDate || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  const endOfMonth = new Date(Date.UTC(year, month, 0));
  endOfMonth.setUTCDate(endOfMonth.getUTCDate() + Number(match[1]));
  return endOfMonth.toISOString().slice(0, 10);
}

export function collectionDueDate(row: CollectionRow): string {
  return row.dueDate || dueDateFromTerms(row.issueDate, row.paymentTerms);
}

/**
 * כמה ימים החוב פתוח — מיום היעד כשיש אחד, ואחרת מיום ההנפקה.
 *
 * מסמך בשוטף+30 שהונפק לפני 20 יום אינו באיחור, ולכן אסור לספור אותו כאילו
 * הוא כן; בלי מועד יעד אין על מה להתבסס מלבד ההנפקה.
 */
export function getCollectionAge(row: CollectionRow): { days: number; overdue: boolean } {
  const due = collectionDueDate(row);
  if (due) {
    const days = getDaysOverdue(due);
    return { days, overdue: days > 0 };
  }
  return { days: getDaysOverdue(row.issueDate), overdue: false };
}

function daysPhrase(days: number): string {
  return days === 1 ? 'יום אחד' : `${days} ימים`;
}

export function getCollectionAgeLabel(row: CollectionRow): string {
  const { days } = getCollectionAge(row);
  if (collectionDueDate(row)) {
    return days <= 0 ? 'טרם הגיע מועד התשלום' : `${daysPhrase(days)} באיחור`;
  }
  return days > 0 ? `${daysPhrase(days)} מההנפקה` : 'הונפק היום';
}

export function getAgingBuckets(rows: CollectionRow[]): AgingBucket[] {
  return AGING_BUCKET_DEFS.map(def => {
    const matching = rows.filter(row => {
      const { days } = getCollectionAge(row);
      return days >= def.min && days <= def.max;
    });
    return {
      key: def.key,
      label: def.label,
      total: matching.reduce((sum, row) => sum + row.open, 0),
      count: matching.length,
    };
  });
}

export function getCurrentMonthTotal(payments: PaymentRecord[]): number {
  const now = new Date();
  return payments
    .filter(p => {
      if (p.status !== 'completed' && p.status !== 'approved') return false;
      const d = new Date(p.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
}

export function localISODate(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysAgoLocalISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISODate(d);
}

export function formatHebrewMonth(iso: string): string {
  const datePart = (iso || '').slice(0, 10);
  const [year, month] = datePart.split('-').map(Number);
  if (!year || !month) return '';
  return `${HEBREW_MONTHS[month - 1]} ${year}`;
}

export function getChargeKindLabel(kind: ChargeKind): string {
  return CHARGE_KIND_LABELS[kind];
}

export function getPaymentChargeKind(payment: PaymentLedgerItem): ChargeKind {
  if (payment.trial_lesson_date) return 'trial';
  if (Number(payment.registration_fee || 0) > 0) return 'registration';
  if (payment.payment_type === 'recurring_subscription') return 'standing_order';
  return 'one_time';
}

export function getPaymentChargeDescription(payment: PaymentLedgerItem): string {
  const course = payment.lesson_name || '';
  const child = payment.child_name || '';
  const fee = Number(payment.registration_fee || 0);
  const month = formatHebrewMonth(payment.payment_date || payment.created_at);

  if (payment.trial_lesson_date) {
    return ['שיעור ניסיון', course, child].filter(Boolean).join(' · ');
  }
  if (fee > 0) {
    const monthly = Number(payment.final_amount || 0) - fee;
    const head = monthly > 0
      ? `הרשמה: דמי רישום ₪${fee} + מנוי חודשי ₪${monthly}`
      : `הרשמה: דמי רישום ₪${fee}`;
    return [head, course, child].filter(Boolean).join(' · ');
  }
  if (payment.payment_type === 'recurring_subscription') {
    return [`חיוב הוראת קבע${month ? ` · ${month}` : ''}`, course, child].filter(Boolean).join(' · ');
  }
  if (payment.description) return payment.description;
  return ['תשלום חד-פעמי', course, child].filter(Boolean).join(' · ');
}

export function paymentToLedgerRow(payment: PaymentLedgerItem): PaymentRecord {
  const amount = Number(payment.final_amount || 0);
  const kind = getPaymentChargeKind(payment);
  return {
    id: payment.id,
    source: 'payment',
    created_at: payment.payment_date || payment.created_at,
    customer_name: payment.child_name || payment.family_name || '',
    description: getPaymentChargeDescription(payment),
    kind,
    kind_label: getChargeKindLabel(kind),
    invoice_number: '',
    amount,
    payment_method: 'אשראי',
    transaction_reference: payment.tranzila_transaction_id || '',
    status: payment.status,
    branch_id: payment.branch,
    branch_name: payment.branch_name,
    canRefund: payment.status === 'completed'
      && amount > 0
      && Boolean(payment.tranzila_transaction_id && payment.tranzila_confirmation_code),
  };
}

export function storeInvoiceToLedgerRow(invoice: StoreInvoice): PaymentRecord {
  const amount = Number(invoice.total_amount || 0);
  const items = (invoice.line_items || [])
    .map((item) => item.product_name)
    .filter(Boolean);
  const itemText = items.length ? items.join(', ') : 'רכישה בחנות';
  const method = invoice.payment_method === 'cash'
    ? 'מזומן'
    : invoice.payment_method === 'monthly_billing'
      ? 'חיוב חודשי'
      : 'אשראי';
  return {
    id: invoice.id,
    source: 'store',
    created_at: invoice.issue_date || invoice.created_at,
    customer_name: invoice.child_name || invoice.customer_name || '',
    description: `${itemText}${invoice.invoice_number ? ` · ${invoice.invoice_number}` : ''}`,
    kind: 'store',
    kind_label: getChargeKindLabel('store'),
    invoice_number: invoice.invoice_number || '',
    amount,
    payment_method: method,
    transaction_reference: invoice.tranzila_transaction_id || '',
    status: invoice.payment_status,
    branch_id: invoice.branch,
    branch_name: invoice.branch_name,
    canRefund: invoice.payment_status === 'completed'
      && amount > 0
      && invoice.payment_method === 'credit_card'
      && Boolean(invoice.tranzila_transaction_id),
    customer_phone: invoice.customer_phone || undefined,
    customer_email: invoice.customer_email || undefined,
    shipping_address: invoice.shipping_address || undefined,
    customer_notes: invoice.customer_notes || undefined,
    website_order_number: invoice.website_order_number || undefined,
    store_invoice_id: invoice.id,
  };
}

/** The buyer's contact line under a store row: phone · email · address. */
export function storeContactLine(row: PaymentRecord): string {
  return [row.customer_phone, row.customer_email, row.shipping_address]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Whether a payments-tab row answers a free-text search.
 *
 * A store row matches on anything the buyer typed at checkout too — phone,
 * email, address, notes, website order number — because "who is this
 * number" is the question the owner brings to this tab.
 */
export function matchesPaymentSearch(row: PaymentRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const haystack = [
    row.customer_name,
    row.description,
    row.transaction_reference,
    row.invoice_number,
    row.customer_email,
    row.shipping_address,
    row.customer_notes,
    row.website_order_number,
  ].filter(Boolean).join(' ').toLowerCase();
  if (haystack.includes(q)) return true;
  // A phone typed with dashes or spaces still has to find a number stored
  // without them, and the other way round.
  if (digits.length >= 4 && row.customer_phone) {
    return row.customer_phone.replace(/\D/g, '').includes(digits);
  }
  return false;
}

// ---------------------------------------------------------------------------
// The shared ledger filters — the one filter model every tab narrows its rows
// by. The page holds the values (useLedgerFilters); these are the rules.
// ---------------------------------------------------------------------------

/** What the page opens on: the last DEFAULT_RANGE_DAYS days, nothing else narrowed. */
export function defaultLedgerFilters(): LedgerFilters {
  return {
    dateFrom: daysAgoLocalISO(DEFAULT_RANGE_DAYS),
    dateTo: localISODate(),
    business: '',
    cityId: '',
    branchId: '',
    courseTypeId: '',
    ageKey: '',
    instructorId: '',
    search: '',
  };
}

/**
 * The filter state after a change, kept coherent however the change arrived —
 * from the bar, from a tab's own control, or from code.
 *
 * - עיר and סניף exist only under סניפים. Choosing either one therefore means
 *   סניפים, and moving עסק anywhere else clears them: a place the bar no longer
 *   shows would otherwise go on hiding rows unseen.
 * - The range cannot invert. Moving one end past the other takes the other
 *   along — the date just picked is the one that was meant — and a change that
 *   sets both ends the wrong way round is swapped.
 */
export function applyLedgerFilterChange(
  prev: LedgerFilters,
  patch: Partial<LedgerFilters>,
): LedgerFilters {
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => typeof value === 'string'),
  ) as Partial<LedgerFilters>;
  const next: LedgerFilters = { ...prev, ...changes };

  if (changes.cityId || changes.branchId) {
    next.business = LEDGER_BUSINESS_BRANCHES;
  } else if (next.business !== LEDGER_BUSINESS_BRANCHES) {
    next.cityId = '';
    next.branchId = '';
  }

  if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
    if ('dateFrom' in changes && 'dateTo' in changes) {
      [next.dateFrom, next.dateTo] = [next.dateTo, next.dateFrom];
    } else if ('dateFrom' in changes) {
      next.dateTo = next.dateFrom;
    } else {
      next.dateFrom = next.dateTo;
    }
  }

  return next;
}

/**
 * How many filters are narrowing the rows. The dates are not among them: they
 * choose which rows are fetched at all, and the bar always shows them.
 */
export function countActiveLedgerFilters(filters: LedgerFilters): number {
  return [
    filters.business,
    filters.cityId,
    filters.branchId,
    filters.courseTypeId,
    filters.ageKey,
    filters.instructorId,
    filters.search.trim(),
  ].filter(Boolean).length;
}

/** The range as the server takes it. An end left empty falls back to the default window. */
export function ledgerRangeParams(filters: Pick<LedgerFilters, 'dateFrom' | 'dateTo'>) {
  return {
    start_date: filters.dateFrom || daysAgoLocalISO(DEFAULT_RANGE_DAYS),
    end_date: filters.dateTo || localISODate(),
  };
}

/**
 * Whether a day falls inside the range. A row without a date stays: the server
 * returned it for this range, and hiding it would leave it nowhere to be found.
 */
export function isWithinRange(
  day: string | null | undefined,
  filters: Pick<LedgerFilters, 'dateFrom' | 'dateTo'>,
): boolean {
  const date = String(day ?? '').slice(0, 10);
  if (!date) return true;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

/** A store sale — on the website or at a branch counter. */
export function isStoreOrigin(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && origin.startsWith('store_');
}

/**
 * One id-valued filter. Unset, it passes everything; set, it passes only a row
 * carrying that exact value. A row without the dimension does not pass — the
 * fields arrive row by row, and "unknown" is not "yes". Ids are compared as
 * text, so a number from the server still matches the select's string.
 */
function matchesId(value: unknown, wanted: string): boolean {
  if (!wanted) return true;
  if (value === undefined || value === null || value === '') return false;
  return String(value) === wanted;
}

/**
 * Whether a row passes the shared dimension filters.
 *
 * עסק — '' is every income. 'branches' is what the branches earned themselves:
 * not a store sale, and not tagged to a business. 'store' is every store sale,
 * website and counter alike. Anything else is a business id, and only that
 * business's rows pass.
 * עיר, סניף, סוג חוג, גיל, מדריך — an exact match when set.
 *
 * The dates and the search are not decided here: the range is what the tab
 * asked the server for, and which fields a search should read is each tab's
 * own question.
 */
export function matchesLedgerFilters(
  row: LedgerDimensions,
  filters: Pick<LedgerFilters, 'business' | 'cityId' | 'branchId' | 'courseTypeId' | 'ageKey' | 'instructorId'>,
): boolean {
  const { business } = filters;
  if (business === LEDGER_BUSINESS_BRANCHES) {
    if (isStoreOrigin(row.origin) || row.business_id) return false;
  } else if (business === LEDGER_BUSINESS_STORE) {
    if (!isStoreOrigin(row.origin)) return false;
  } else if (!matchesId(row.business_id, business)) {
    return false;
  }

  return matchesId(row.city_id, filters.cityId)
    && matchesId(row.branch_id, filters.branchId)
    && matchesId(row.course_type_id, filters.courseTypeId)
    && matchesId(row.age_key, filters.ageKey)
    && matchesId(row.instructor_id, filters.instructorId);
}

/**
 * A row that names its branch is in that branch's city. The backend is adding
 * city_id to every row; until a row has one, the branch list answers for it,
 * so choosing a city already finds the rows of its branches. A row that sent
 * its own city_id — even null — keeps it.
 */
export function withBranchCity<T extends LedgerDimensions>(
  row: T,
  cityByBranch: ReadonlyMap<string, string>,
): T {
  if (row.city_id !== undefined || !row.branch_id) return row;
  const cityId = cityByBranch.get(String(row.branch_id));
  return cityId ? { ...row, city_id: cityId } : row;
}

export interface LedgerOption {
  value: string;
  label: string;
}

/** The filters whose options are read off the rows a tab loaded rather than asked of an endpoint. */
export type LedgerRowDimension = 'courseTypeId' | 'ageKey' | 'instructorId';

const ROW_DIMENSION_FIELDS = {
  courseTypeId: { value: 'course_type_id', label: 'course_type_name' },
  ageKey: { value: 'age_key', label: 'age_label' },
  instructorId: { value: 'instructor_id', label: 'instructor_name' },
} as const;

/**
 * The distinct values one dimension takes across the rows a tab loaded, as the
 * options of its select: only what can match is offered, and no endpoint is
 * needed for it.
 *
 * A value without a name is left out rather than shown as a bare id — except an
 * age group, whose key reads on its own. Ages are ordered as ages, by key with
 * digits compared as numbers (so 10 follows 9); the rest by name.
 */
export function ledgerRowOptions(
  rows: readonly LedgerDimensions[],
  dimension: LedgerRowDimension,
): LedgerOption[] {
  const fields = ROW_DIMENSION_FIELDS[dimension];
  const byValue = new Map<string, string>();
  rows.forEach((row) => {
    const raw: unknown = row[fields.value];
    if (raw === undefined || raw === null || raw === '') return;
    const value = String(raw);
    if (byValue.has(value)) return;
    const name = row[fields.label];
    const label = (typeof name === 'string' && name.trim()) || (dimension === 'ageKey' ? value : '');
    if (label) byValue.set(value, label);
  });
  const options = Array.from(byValue, ([value, label]) => ({ value, label }));
  return dimension === 'ageKey'
    ? options.sort((a, b) => a.value.localeCompare(b.value, 'he', { numeric: true }))
    : options.sort((a, b) => a.label.localeCompare(b.label, 'he'));
}

/**
 * A select has to be able to show what is chosen. When the chosen value is not
 * among the options — the rows reloaded for another range, the list has not
 * arrived yet — it is kept as an option of its own under the given label, so a
 * filter never goes on working unseen.
 */
export function withSelectedOption(
  options: readonly LedgerOption[],
  selected: string,
  label: string,
): LedgerOption[] {
  if (!selected || options.some((option) => option.value === selected)) return [...options];
  return [...options, { value: selected, label }];
}

/**
 * Whether a document answers a free-text search. A store purchase is looked up
 * by whatever the owner has in hand — our document number, the order number
 * the buyer was mailed, the branch — and a class by its course or instructor.
 */
export function matchesDocumentSearch(doc: DocumentRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    doc.document_number,
    doc.customer_name,
    doc.website_order_number,
    doc.branch,
    doc.business_name,
    doc.course_name,
    doc.instructor_name,
  ].some((field) => String(field ?? '').toLowerCase().includes(q));
}

/**
 * Newest first. issue_date is a day, so same-day documents fall back to the
 * document number, highest first — digits compared as numbers, so 1000 sits
 * above 999 — which keeps the order from shifting between renders. A document
 * without a date goes last.
 */
export function compareDocumentsNewestFirst(a: DocumentRow, b: DocumentRow): number {
  const dayA = String(a.issue_date ?? '').slice(0, 10);
  const dayB = String(b.issue_date ?? '').slice(0, 10);
  if (dayA !== dayB) return dayA < dayB ? 1 : -1;
  return String(b.document_number ?? '').localeCompare(String(a.document_number ?? ''), 'he', {
    numeric: true,
  });
}

/** The totals of the documents shown — what the KPI row reports. */
export function sumDocuments(rows: readonly DocumentRow[]): { total: number; paid: number; open: number } {
  return rows.reduce(
    (acc, doc) => ({
      // A credit note is money going back: it comes off the total and is never
      // an open debt, whatever an older ledger row says about its balance.
      total: acc.total + (isCreditRow(doc) ? -1 : 1) * (Number(doc.total_amount) || 0),
      paid: acc.paid + (isCreditRow(doc) ? 0 : Number(doc.amount_paid) || 0),
      open: acc.open + (isCreditRow(doc) ? 0 : Number(doc.open_balance) || 0),
    }),
    { total: 0, paid: 0, open: 0 },
  );
}

/**
 * Whether a payment reminder can go out for a document from the list. The
 * reminder endpoint knows only documents issued in the CRM (origin manual) — a
 * subscription invoice or a store sale carries another model's id — and a
 * draft, a credit note or a settled document has nothing to remind about.
 */
export function canSendDocumentReminder(doc: DocumentRow): boolean {
  return doc.origin === 'manual'
    && !doc.is_draft
    && doc.document_type_code !== 'credit_invoice'
    && (Number(doc.open_balance) || 0) > 0;
}

function dayNumber(iso: string): number | null {
  const [year, month, day] = (iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day) / 86400000;
}

/** A day moved by whole days, in the same YYYY-MM-DD form. */
export function shiftISODate(iso: string, days: number): string {
  const [year, month, day] = (iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return localISODate(new Date(year, month - 1, day + days));
}

const WIDER_RANGES = [
  { days: 90, label: 'הרחב לשלושה חודשים' },
  { days: 365, label: 'הרחב לשנה' },
] as const;

/**
 * A wider window to offer when a range turned up nothing: three months, then a
 * year, both ending where the range ends. Null once the range already spans a
 * year — past that the answer is another range, not a longer one.
 */
export function widerRange(
  filters: Pick<LedgerFilters, 'dateFrom' | 'dateTo'>,
): { dateFrom: string; label: string } | null {
  const { start_date: start, end_date: end } = ledgerRangeParams(filters);
  const startDay = dayNumber(start);
  const endDay = dayNumber(end);
  if (startDay === null || endDay === null) return null;
  const span = endDay - startDay;
  const step = WIDER_RANGES.find((option) => span < option.days);
  return step ? { dateFrom: shiftISODate(end, -step.days), label: step.label } : null;
}

/** A credit note (חשבונית מס זיכוי), whichever system issued it. */
export function isCreditRow(
  doc: Pick<DocumentRow, 'is_credit' | 'document_type_code'>,
): boolean {
  return Boolean(doc.is_credit) || doc.document_type_code === 'credit_invoice' || doc.document_type_code === 'CN';
}
