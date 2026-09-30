import type { InvoicePaymentInput, ReceiptDetailsInput } from '@/types/document';
import { ALL_WIZARD_STEPS, ALLOCATION_THRESHOLD_ILS, BRANCHES_CATEGORY } from './constants';
import type {
  BusinessCustomerFormData,
  CheckRow,
  ClientType,
  InvoiceDetailsData,
  ReceiptDetailsData,
  StepDefinition,
  WizardStepId,
} from './types';

/** Restore form state when picking an existing business customer. */
export function businessFormFromCustomer(customer: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  company_number: string;
  address?: string;
  business_type: string;
  category: string;
  branch_id?: string | null;
  notes: string;
  business_id?: string | null;
  business_category_id?: string | null;
}): BusinessCustomerFormData {
  return {
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    id_number: customer.id_number || customer.company_number,
    company_number: customer.company_number,
    address: customer.address ?? '',
    business_type: customer.business_type,
    business_id: customer.business_id ?? null,
    business_category_id: customer.business_category_id ?? null,
    category: customer.category,
    branch_id: customer.branch_id ?? null,
    notes: customer.notes,
  };
}

/** A blank check line, dated today. Not crossed until the office says so. */
export function emptyCheckRow(id: string, date: string): CheckRow {
  return {
    id,
    date,
    bank: '',
    branch: '',
    accountNumber: '',
    checkNumber: '',
    amount: 0,
    confirmed: false,
    crossed: false,
  };
}

/**
 * The receipt section of the create payload, under the names the server reads
 * (ReceiptDetailsInputSerializer). Each check carries `check_crossed`: only a
 * check crossed "לא סחיר" in the customer's name lets the signed original go
 * by email (הוראה 18ב(ד)); any other is handed over on paper.
 */
export function receiptDetailsPayload(
  data: ReceiptDetailsData,
  options: { invoicePerCheck?: boolean; linkedInvoiceId?: string } = {},
): ReceiptDetailsInput {
  return {
    payment_method: data.paymentMethod,
    linked_invoice_id: options.linkedInvoiceId ?? data.linkedInvoiceId,
    // Sent only when it applies: an older server would refuse no unknown key, but says nothing either.
    ...(options.invoicePerCheck ? { invoice_per_check: true } : {}),
    cash_amount: data.cashAmount,
    cash_notes: data.cashNotes,
    checks: data.checks.map((check) => ({
      date: check.date,
      bank: check.bank,
      branch: check.branch,
      account_number: check.accountNumber,
      check_number: check.checkNumber,
      amount: check.amount,
      confirmed: check.confirmed,
      check_crossed: check.crossed === true,
    })),
    withholding: data.withholding,
    check_notes: data.checkNotes,
    card_last_four: data.cardLastFour,
    card_brand: data.cardBrand,
    card_expiry: data.cardExpiry,
    card_amount: data.cardAmount,
    card_installments: data.cardInstallments,
    card_notes: data.cardNotes,
    // The server takes a date or null — an empty field is null, not ''.
    bank_date: data.bankDate || null,
    bank_reference: data.bankReference,
    bank_amount: data.bankAmount,
    bank_notes: data.bankNotes,
  };
}

/**
 * What a receipt received, in agorot — the server's own reading
 * (service._receipt_amount): the chosen method's amount, or the confirmed
 * checks with an amount.
 */
export function receiptAmountAgorot(data: ReceiptDetailsData): number {
  const agorot = (value: number) => Math.round((Number(value) || 0) * 100);
  if (data.paymentMethod === 'מזומן') return agorot(data.cashAmount);
  if (data.paymentMethod === "צ'ק") {
    return data.checks.filter((c) => c.confirmed && c.amount > 0).reduce((sum, c) => sum + agorot(c.amount), 0);
  }
  if (data.paymentMethod === 'אשראי') return agorot(data.cardAmount);
  if (data.paymentMethod === 'העברה בנקאית') return agorot(data.bankAmount);
  return 0;
}

/**
 * How much a receipt can close (settlement.payer_capacity): what it received
 * and the ניכוי במקור the customer withheld — the certificate pays that part.
 */
export function receiptCapacityAgorot(data: ReceiptDetailsData): number {
  return receiptAmountAgorot(data) + Math.max(0, Math.round((Number(data.withholding) || 0) * 100));
}

/**
 * Whether "חשבונית מס לכל צ'ק" is on and may be sent: a check receipt of a
 * private customer (a child) — the server refuses it for anyone else.
 */
export function invoicePerCheckApplies(clientType: ClientType | null, data: ReceiptDetailsData): boolean {
  return clientType === 'existing' && data.paymentMethod === "צ'ק" && data.invoicePerCheck === true;
}

/** The confirmed checks that have no date — a check plan needs each one's day. */
export function undatedConfirmedChecks(data: ReceiptDetailsData): CheckRow[] {
  return data.checks.filter((check) => check.confirmed && check.amount > 0 && !check.date);
}

const ISRAEL_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today on Israel's calendar as 'YYYY-MM-DD', whatever the browser's clock.
 * `toISOString()` is UTC: between midnight and 02:00/03:00 in Israel it gave
 * yesterday, and the document was dated a day early.
 */
export function israelToday(now: Date = new Date()): string {
  const parts: Record<string, string> = {};
  for (const part of ISRAEL_DAY.formatToParts(now)) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The dates a document issued today may carry (the server's rule, owner
 * decision D3): not after today, and inside this tax year. The server also
 * refuses a date before the latest one already issued in the document's run.
 */
export function documentDateBounds(now: Date = new Date()): { min: string; max: string } {
  const today = israelToday(now);
  return { min: `${today.slice(0, 4)}-01-01`, max: today };
}

/** round-half-up of n / d for non-negative integers — Decimal's ROUND_HALF_UP, without floats. */
function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

const toAgorot = (shekels: number): number => Math.round((Number(shekels) || 0) * 100);

export interface InvoiceTotals {
  /** All in agorot (integers), so they compare exactly. */
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
}

/**
 * The totals the server will store (apps/documents/service.py _compute_totals),
 * worked out the same way — to the agora, half up — so the payment rows an
 * invoice-receipt is issued with can be matched to its total exactly.
 */
export function computeInvoiceTotals(data: InvoiceDetailsData): InvoiceTotals {
  const subtotal = data.lineItems.reduce(
    (sum, item) => sum + divRoundHalfUp(Math.max(0, Math.round(item.quantity * 100)) * Math.max(0, toAgorot(item.price)), 100),
    0,
  );
  const discount =
    data.discountAmount > 0
      ? toAgorot(data.discountAmount)
      : divRoundHalfUp(subtotal * Math.max(0, Math.round(data.discountPercent * 100)), 10000);
  const base = Math.max(0, subtotal - discount);
  if (data.vatExempt) return { subtotal, discount, vat: 0, total: base };
  if (data.pricesIncludeVat) {
    const net = divRoundHalfUp(base * 100, 118);
    return { subtotal: subtotal - (base - net), discount, vat: base - net, total: base };
  }
  const vat = divRoundHalfUp(base * 18, 100);
  return { subtotal, discount, vat, total: base + vat };
}

/** Agorot as shekels with two decimals, the way the documents print them. */
export function formatAgorot(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

/**
 * An invoice-receipt's payment rows (G): one per way it was paid, from the
 * receipt panels of the methods chosen — the cash sum, each confirmed check,
 * the card, the transfer — each for its own amount. A method chosen with no
 * amount yet gives no row.
 */
export function invoicePaymentRows(methods: string[], payments: ReceiptDetailsData): InvoicePaymentInput[] {
  const rows: InvoicePaymentInput[] = [];
  if (methods.includes('מזומן') && payments.cashAmount > 0) {
    rows.push({ method: 'cash', amount: payments.cashAmount, notes: payments.cashNotes });
  }
  if (methods.includes("צ'ק")) {
    for (const check of payments.checks) {
      if (!check.confirmed || !(check.amount > 0)) continue;
      rows.push({
        method: 'check',
        amount: check.amount,
        check_number: check.checkNumber,
        check_bank: check.bank,
        check_branch: check.branch,
        check_account: check.accountNumber,
        check_date: check.date || null,
        check_crossed: check.crossed === true,
      });
    }
  }
  if (methods.includes('אשראי') && payments.cardAmount > 0) {
    rows.push({
      method: 'credit_card',
      amount: payments.cardAmount,
      card_last_four: payments.cardLastFour,
      card_brand: payments.cardBrand,
      installments: Math.max(1, payments.cardInstallments || 1),
      notes: payments.cardNotes,
    });
  }
  if (methods.includes('העברה בנקאית') && payments.bankAmount > 0) {
    rows.push({
      method: 'bank_transfer',
      amount: payments.bankAmount,
      reference: payments.bankReference,
      paid_on: payments.bankDate || null,
      notes: payments.bankNotes,
    });
  }
  return rows;
}

/**
 * Where an invoice-receipt's payments stand against its total, in agorot:
 * `remaining` is what is still to be accounted for (negative when the rows
 * come to more than the total). It can be issued only at exactly zero.
 */
export function invoicePaymentBalance(data: InvoiceDetailsData): {
  total: number;
  paid: number;
  withholding: number;
  remaining: number;
  rows: InvoicePaymentInput[];
} {
  const { total } = computeInvoiceTotals(data);
  const rows = invoicePaymentRows(data.paymentMethods, data.payments);
  const paid = rows.reduce((sum, row) => sum + toAgorot(row.amount), 0);
  const withholding = Math.max(0, toAgorot(data.withholdingAmount));
  return { total, paid, withholding, remaining: total - paid - withholding, rows };
}

/** Whether the document asks for a מספר הקצאה at all: a tax invoice or invoice-receipt to a business customer. */
export function allocationApplies(docType: string | null, clientType: ClientType | null): boolean {
  return clientType === 'business' && (docType === 'חשבונית מס' || docType === 'חשבונית מס/קבלה');
}

/** Whether its amount before VAT is above the threshold — "עולה על", so exactly ₪5,000 needs none. */
export function allocationRequired(data: InvoiceDetailsData): boolean {
  const { subtotal, discount } = computeInvoiceTotals(data);
  return subtotal - discount > ALLOCATION_THRESHOLD_ILS * 100;
}

/** '' for a valid number (nine digits, dashes and spaces allowed) or none; otherwise why not. */
export function allocationNumberError(value: string): string {
  const digits = value.replace(/\D/g, '');
  return value.trim() && digits.length !== 9 ? 'מספר הקצאה הוא 9 ספרות' : '';
}

/** What a credit note may credit (the server's rule): a tax invoice or a tax invoice-receipt. */
export const CREDITABLE_DOCUMENT_TYPES = ['tax_invoice', 'combined'];

/**
 * The customer's documents a credit note can be issued against, and the one
 * the typed number names (if kogo issued it): its date is then the document's
 * own, not typed. Any other number — a lesson receipt (IR), a store sale (ST),
 * the previous software's — is typed with its date.
 */
export function creditableMatch<T extends { document_number: string; document_type: string }>(
  documents: T[],
  typed: string,
): { options: T[]; match: T | null } {
  const options = documents.filter((doc) => CREDITABLE_DOCUMENT_TYPES.includes(doc.document_type));
  const number = typed.trim();
  return { options, match: options.find((doc) => doc.document_number === number) ?? null };
}

// The number is the server's to give, at issuance; nothing is promised before that.
export function generateDocumentNumber(): string {
  return 'יוקצה בהפקה';
}

/**
 * What the server said went wrong, or `fallback` when it said nothing useful.
 * Reads `error`, then `detail`, then the first field error — one level of
 * nesting deep, so a document section's own field error (the original number a
 * credit note must name) reaches the office too.
 */
export function serverErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  const firstString = (value: unknown, depth: number): string | null => {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.trim()) return first;
    if (depth > 0 && first && typeof first === 'object') {
      for (const inner of Object.values(first as Record<string, unknown>)) {
        const found = firstString(inner, depth - 1);
        if (found) return found;
      }
    }
    return null;
  };
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const value of [record.error, record.detail, ...Object.values(record)]) {
      const found = firstString(value, 1);
      if (found) return found;
    }
  }
  return fallback;
}

/**
 * Why saving a merchant failed, in the server's words when it gave any — a
 * partner with several branches, say, has to choose the merchant's branch.
 */
export function businessCustomerErrorMessage(error: unknown): string {
  return serverErrorMessage(error, 'שמירת הלקוח העסקי נכשלה');
}

export function getDocumentDetailsLabel(docType: string | null): string {
  if (docType === 'חשבונית מס') return 'פרטי חשבונית מס';
  if (docType === 'חשבונית מס/קבלה') return 'פרטי חשבונית מס/קבלה';
  if (docType === 'קבלה') return 'פרטי קבלה';
  if (docType === 'חשבונית עסקה') return 'פרטי חשבונית עסקה';
  if (docType === 'טיוטה') return 'פרטי טיוטה';
  return 'פרטי מסמך';
}

/**
 * A branch is what the category סניפים means. Ask for one only once that
 * category is the one chosen — asking earlier is asking a question the
 * category is about to answer, and a branch picked under any other category
 * would ride along on a document that never asked for it.
 */
export function branchFieldApplies(category: string | null | undefined): boolean {
  return (category ?? '').trim() === BRANCHES_CATEGORY;
}


export function getWizardSteps(
  clientType: ClientType | null,
  docType: string | null,
  category?: string | null
): StepDefinition[] {
  return ALL_WIZARD_STEPS.filter((step) => {
    if (step.id === 'businessClientDetails') return clientType === 'business';
    if (step.id === 'selectCustomer') return clientType === 'existing';
    if (step.id === 'selectBranch') return branchFieldApplies(category);
    return true;
  }).map((step) =>
    step.id === 'documentDetails'
      ? { ...step, label: getDocumentDetailsLabel(docType) }
      : step
  );
}

export function getStepStatus(
  stepId: WizardStepId,
  currentStepId: WizardStepId,
  steps: StepDefinition[]
): 'active' | 'completed' | 'pending' {
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  if (stepIndex === currentIndex) return 'active';
  if (stepIndex < currentIndex) return 'completed';
  return 'pending';
}

export function canAdvanceFromStep(
  stepId: WizardStepId,
  clientType: ClientType | null,
  selectedCustomerId: string | null,
  businessCustomerId: string | null,
  businessFormData: BusinessCustomerFormData | null,
  docType: string | null,
  invoiceDetails: InvoiceDetailsData | null,
  creditInvoiceDetails?: {
    linkedInvoiceId: string;
    linkedDocumentDate?: string;
    creditReason: string;
    creditAmountBeforeVat: number;
  } | null,
  receiptDetails?: ReceiptDetailsData | null,
  selectedBranchId?: string | null,
  /** Whether the invoices chosen for a receipt / invoice-receipt to close pass the server's rules. */
  settlementsValid = true,
): boolean {
  if (stepId === 'clientType') return clientType !== null;
  // The branch is optional on the server (null=True on FormalDocument, and no
  // permission filter reads it), and the document's attribution is already
  // answered by the business and category. Requiring it here only blocked a
  // document that had nowhere sensible to point.
  if (stepId === 'selectBranch') return true;
  if (stepId === 'selectCustomer') return selectedCustomerId !== null;
  if (stepId === 'businessClientDetails') {
    const hasId =
      businessCustomerId !== null ||
      (businessFormData !== null &&
        businessFormData.first_name.trim() !== '' &&
        businessFormData.last_name.trim() !== '');
    const hasType = businessFormData?.business_type?.trim() !== '';
    const hasCategory = businessFormData?.category?.trim() !== '';
    return hasId && hasType && hasCategory;
  }
  if (stepId === 'docType') return docType !== null;
  if (stepId === 'documentDetails') {
    if (docType === 'קבלה') {
      if (!receiptDetails || !settlementsValid) return false;
      const { paymentMethod } = receiptDetails;
      if (paymentMethod === 'מזומן') return receiptDetails.cashAmount > 0;
      if (paymentMethod === "צ'ק") {
        // A check plan needs every check's date (the server refuses the receipt otherwise).
        if (invoicePerCheckApplies(clientType, receiptDetails) && undatedConfirmedChecks(receiptDetails).length > 0) {
          return false;
        }
        return receiptDetails.checks.some((c) => c.confirmed && c.amount > 0);
      }
      if (paymentMethod === 'אשראי') return receiptDetails.cardAmount > 0;
      if (paymentMethod === 'העברה בנקאית') return receiptDetails.bankAmount > 0;
      return false;
    }
    if (docType === 'חשבונית מס' || docType === 'חשבונית מס/קבלה' || docType === 'חשבונית עסקה') {
      if (!invoiceDetails) return false;
      const baseValid =
        invoiceDetails.description.trim() !== '' &&
        invoiceDetails.lineItems.some((item) => item.price > 0) &&
        // The server's rules (M): no negative price or quantity, a discount of 0–100%.
        invoiceDetails.lineItems.every((item) => item.price >= 0 && item.quantity > 0) &&
        invoiceDetails.discountAmount >= 0 &&
        invoiceDetails.discountPercent >= 0 &&
        invoiceDetails.discountPercent <= 100;
      if (!baseValid) return false;
      if (invoiceDetails.dueDate && invoiceDetails.documentDate) {
        if (invoiceDetails.dueDate < invoiceDetails.documentDate) return false;
      }
      if (docType === 'חשבונית מס/קבלה') {
        // Paid, and every shekel of it once: the rows and the withholding come to the total.
        const balance = invoicePaymentBalance(invoiceDetails);
        return balance.rows.length > 0 && balance.remaining === 0 && settlementsValid;
      }
      return true;
    }
    if (docType === 'חשבונית מס זיכוי') {
      if (!creditInvoiceDetails) return false;
      // The original's number and its date (סעיף 9(ה)(4)) — a document kogo
      // issued fills its own date in.
      return (
        creditInvoiceDetails.linkedInvoiceId.trim() !== '' &&
        (creditInvoiceDetails.linkedDocumentDate ?? '') !== '' &&
        creditInvoiceDetails.creditReason.trim() !== '' &&
        creditInvoiceDetails.creditAmountBeforeVat > 0
      );
    }
    return true;
  }
  return true;
}

export function getNextButtonLabel(stepId: WizardStepId, steps: StepDefinition[]): string {
  const isLastStep = steps[steps.length - 1]?.id === stepId;
  return isLastStep ? 'הפק' : 'הבא';
}
