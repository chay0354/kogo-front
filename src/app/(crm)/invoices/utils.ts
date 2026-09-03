import type { StoreInvoice } from '@/types/store';
import type { AgingBucket, ChargeKind, CollectionRow, DocType, DocumentRow, PaymentLedgerItem, PaymentRecord } from './types';
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
  };
}
