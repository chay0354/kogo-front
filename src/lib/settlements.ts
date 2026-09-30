/**
 * Receipts against invoices (backend: apps/documents/settlement.py, WS-3).
 *
 * A receipt (RC) closes tax invoices (TI); an invoice-receipt (IRM) closes
 * transaction invoices (TX). An invoice's balance is its total less what paid
 * it and what credit notes took back — never below zero. This module holds
 * the shapes the server sends, readers that turn a missing field into an
 * empty value (an older server sends none of them), and the rule the receipt
 * form uses to spread a payment over the open invoices: oldest first, up to
 * what the document received.
 *
 * Money is compared in agorot (integers) so a sum of rows never drifts.
 */

export type PayerType = 'receipt' | 'combined';

export type InvoiceBalanceStatus = 'open' | 'partial' | 'paid' | 'credited';

/** An invoice's balance, in shekels. */
export interface InvoiceBalance {
  total: number;
  paid: number;
  credited: number;
  open: number;
  status: InvoiceBalanceStatus | string;
  status_label: string;
}

/** A row of the picker (GET documents/open-invoices/) and of the business card's open list. */
export interface OpenInvoice extends InvoiceBalance {
  id: string;
  document_number: string;
  document_type: string;
  document_type_label: string;
  /** YYYY-MM-DD, or ''. */
  document_date: string;
  due_date: string;
  description: string;
}

export interface OpenInvoicesAnswer {
  payer_type: PayerType;
  open_total: number;
  results: OpenInvoice[];
}

/**
 * Where a settlement line comes from. Only `settlement` is a row the office
 * recorded (its id voids it); the others are what an older record implies —
 * a receipt that named the invoice, a check plan's or an old cash plan's
 * invoice — and carry no id.
 */
export type SettlementSource = 'settlement' | 'linked_receipt' | 'check_plan' | 'cash_plan';

/** One line of "נסגר על ידי" (on an invoice) or "סוגר את" (on a receipt). */
export interface SettlementLine {
  id: string | null;
  /** The document on the other side: the payer on an invoice, the invoice on a receipt. */
  document_id: string | null;
  document_number: string;
  document_type: string;
  document_type_label: string;
  amount: number;
  source: SettlementSource | string;
  created_at: string | null;
  voided_at: string | null;
  voided_by: string;
}

export interface DocumentSettlements {
  /** An invoice's balance (TI/TX); null for anything else. */
  balance: InvoiceBalance | null;
  settledBy: SettlementLine[];
  settles: SettlementLine[];
  /** False when the answer carries none of the fields — a server from before settlements. */
  supported: boolean;
}

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Shekels (a number or the server's '1180.00') as whole agorot. */
export function toAgorot(value: unknown): number {
  return Math.round(num(value) * 100);
}

/** ₪1,180.00 — agorot shown the way the documents print them. */
export function formatAgorotShekels(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Agorot as the plain '1180.00' the server reads. */
export function agorotToAmount(agorot: number): string {
  return (agorot / 100).toFixed(2);
}

/**
 * What the office typed as an amount, in agorot, or null when it is not a
 * number. "1,180", "₪ 1180.5" and "1180.50" all read; anything else is null.
 */
export function parseTypedAmount(typed: string): number | null {
  const cleaned = String(typed ?? '').replace(/[₪,\s]/g, '');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null;
  return Math.round(Number(cleaned) * 100);
}

export const BALANCE_STATUS_LABELS: Readonly<Record<InvoiceBalanceStatus, string>> = {
  open: 'פתוחה',
  partial: 'שולמה חלקית',
  paid: 'שולמה',
  credited: 'זוכתה',
};

export function readInvoiceBalance(raw: unknown): InvoiceBalance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Raw;
  const status = text(row.status);
  return {
    total: num(row.total),
    paid: num(row.paid),
    credited: num(row.credited),
    open: num(row.open),
    status,
    status_label: text(row.status_label) || BALANCE_STATUS_LABELS[status as InvoiceBalanceStatus] || status,
  };
}

export function readOpenInvoice(raw: unknown): OpenInvoice | null {
  const row = obj(raw);
  if (!row.id) return null;
  const balance = readInvoiceBalance(row) as InvoiceBalance;
  return {
    ...balance,
    id: text(row.id),
    document_number: text(row.document_number),
    document_type: text(row.document_type),
    document_type_label: text(row.document_type_label),
    document_date: text(row.document_date),
    due_date: text(row.due_date),
    description: text(row.description),
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

export function readOpenInvoices(data: unknown, payerType: PayerType): OpenInvoicesAnswer {
  const row = obj(data);
  const results = list(row.results).map(readOpenInvoice).filter(isPresent);
  return {
    payer_type: row.payer_type === 'combined' || row.payer_type === 'receipt' ? row.payer_type : payerType,
    open_total: row.open_total !== undefined ? num(row.open_total) : results.reduce((sum, inv) => sum + inv.open, 0),
    results,
  };
}

export function readSettlementLine(raw: unknown): SettlementLine | null {
  const row = obj(raw);
  if (!row.document_number && !row.id && !row.document_id) return null;
  return {
    id: row.id ? text(row.id) : null,
    document_id: row.document_id ? text(row.document_id) : null,
    document_number: text(row.document_number),
    document_type: text(row.document_type),
    document_type_label: text(row.document_type_label),
    amount: num(row.amount),
    source: text(row.source) || 'settlement',
    created_at: row.created_at ? text(row.created_at) : null,
    voided_at: row.voided_at ? text(row.voided_at) : null,
    voided_by: text(row.voided_by),
  };
}

/** A document's detail answer (GET documents/{id}/) read for its balance and settlement lines. */
export function readDocumentSettlements(doc: unknown): DocumentSettlements {
  const row = obj(doc);
  const supported = 'balance' in row || 'settled_by' in row || 'settles' in row;
  return {
    balance: readInvoiceBalance(row.balance),
    settledBy: list(row.settled_by).map(readSettlementLine).filter(isPresent),
    settles: list(row.settles).map(readSettlementLine).filter(isPresent),
    supported,
  };
}

export const SETTLEMENT_SOURCE_LABELS: Readonly<Record<SettlementSource, string>> = {
  settlement: 'סגירה שנרשמה',
  linked_receipt: 'לפי מספר החשבונית שצוין בקבלה',
  check_plan: 'תוכנית צ׳קים',
  cash_plan: 'תוכנית מזומן',
};

export function settlementSourceLabel(source: string): string {
  return SETTLEMENT_SOURCE_LABELS[source as SettlementSource] ?? source;
}

/**
 * Whether a line can be voided from the screen: a recorded settlement (it has
 * an id), not voided already, by a manager — the server refuses anyone else.
 * An older record's line (source other than `settlement`) has no row to void.
 */
export function canVoidSettlement(line: SettlementLine, isManager: boolean): boolean {
  return isManager && line.source === 'settlement' && Boolean(line.id) && !line.voided_at;
}

/** A line that still counts: not voided. */
export function activeSettlementTotal(lines: readonly SettlementLine[]): number {
  return lines.filter((line) => !line.voided_at).reduce((sum, line) => sum + toAgorot(line.amount), 0) / 100;
}

// ---------------------------------------------------------------------------
// The receipt form's picker: which open invoices a payment closes, and how much.
// ---------------------------------------------------------------------------

/**
 * What the office chose. `auto` spreads the document's amount over the open
 * invoices oldest first, and follows the amount as it changes; `manual` keeps
 * what was ticked and typed (invoice id → shekels, as typed).
 */
export interface SettlementPicks {
  mode: 'auto' | 'manual';
  amounts: Record<string, string>;
}

export const AUTO_SETTLEMENT_PICKS: SettlementPicks = { mode: 'auto', amounts: {} };

export interface ResolvedSettlement {
  invoiceId: string;
  documentNumber: string;
  /** Agorot. */
  amount: number;
  /** What the invoice still owes, agorot. */
  open: number;
}

export interface SettlementPlan {
  rows: ResolvedSettlement[];
  /** Agorot closed altogether. */
  total: number;
  /** Agorot the document received (a receipt's amount and withholding; an IRM's total). */
  capacity: number;
  /** Agorot of the document not applied to any invoice. */
  unapplied: number;
  /** Invoice id → why its amount is refused. */
  errors: Record<string, string>;
  /** Set when the rows come to more than the document received. */
  overCapacity: string;
  valid: boolean;
}

/**
 * The default: oldest first — the server lists them that way — each invoice
 * closed as far as what is left of the amount goes.
 */
export function allocateOldestFirst(invoices: readonly OpenInvoice[], capacity: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = Math.max(0, capacity);
  for (const invoice of invoices) {
    if (left <= 0) break;
    const take = Math.min(toAgorot(invoice.open), left);
    if (take > 0) {
      out[invoice.id] = take;
      left -= take;
    }
  }
  return out;
}

const PAYER_LABELS: Readonly<Record<PayerType, string>> = {
  receipt: 'הקבלה',
  combined: 'חשבונית המס/קבלה',
};

/**
 * The settlements the document will carry, checked the way the server checks
 * them — each amount above zero and within the invoice's balance, all of them
 * within what the document received — so the form stops before the server
 * would refuse. The server's own refusal is still shown as it comes.
 */
export function resolveSettlements(
  invoices: readonly OpenInvoice[],
  picks: SettlementPicks,
  capacity: number,
  payerType: PayerType = 'receipt',
): SettlementPlan {
  const rows: ResolvedSettlement[] = [];
  const errors: Record<string, string> = {};
  if (picks.mode === 'auto') {
    const auto = allocateOldestFirst(invoices, capacity);
    for (const invoice of invoices) {
      if (auto[invoice.id]) {
        rows.push({
          invoiceId: invoice.id,
          documentNumber: invoice.document_number,
          amount: auto[invoice.id],
          open: toAgorot(invoice.open),
        });
      }
    }
  } else {
    for (const invoice of invoices) {
      if (!(invoice.id in picks.amounts)) continue;
      const open = toAgorot(invoice.open);
      const amount = parseTypedAmount(picks.amounts[invoice.id]);
      if (amount === null || amount <= 0) {
        errors[invoice.id] = 'הסכום שנסגר בחשבונית חייב להיות גדול מאפס';
      } else if (amount > open) {
        errors[invoice.id] = `נותרו לתשלום ${formatAgorotShekels(open)} — אי אפשר לסגור יותר מזה`;
      }
      rows.push({ invoiceId: invoice.id, documentNumber: invoice.document_number, amount: amount ?? 0, open });
    }
  }
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const overCapacity = total > capacity
    ? `סכום החשבוניות שנסגרות (${formatAgorotShekels(total)}) גדול מסכום ${PAYER_LABELS[payerType]} (${formatAgorotShekels(Math.max(0, capacity))}). מסמך סוגר לכל היותר את מה שהתקבל בו.`
    : '';
  return {
    rows,
    total,
    capacity,
    unapplied: Math.max(0, capacity - total),
    errors,
    overCapacity,
    valid: Object.keys(errors).length === 0 && !overCapacity,
  };
}

/** The `settlements` of the create-document payload. */
export function settlementsPayload(plan: SettlementPlan): Array<{ invoice_id: string; amount: string }> {
  return plan.rows
    .filter((row) => row.amount > 0)
    .map((row) => ({ invoice_id: row.invoiceId, amount: agorotToAmount(row.amount) }));
}

/** The picks as they stand now, written out — what a first manual change starts from. */
export function manualPicksFrom(plan: SettlementPlan): SettlementPicks {
  const amounts: Record<string, string> = {};
  for (const row of plan.rows) amounts[row.invoiceId] = agorotToAmount(row.amount);
  return { mode: 'manual', amounts };
}

/**
 * Tick or untick one invoice. Ticking fills in what is left of the amount (or
 * the invoice's whole balance when nothing is left), capped at the balance.
 */
export function togglePick(
  invoices: readonly OpenInvoice[],
  picks: SettlementPicks,
  capacity: number,
  invoiceId: string,
  checked: boolean,
): SettlementPicks {
  const current = picks.mode === 'manual' ? picks : manualPicksFrom(resolveSettlements(invoices, picks, capacity));
  const amounts = { ...current.amounts };
  if (!checked) {
    delete amounts[invoiceId];
    return { mode: 'manual', amounts };
  }
  const invoice = invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) return { mode: 'manual', amounts };
  const used = resolveSettlements(invoices, { mode: 'manual', amounts }, capacity).total;
  const open = toAgorot(invoice.open);
  const left = capacity - used;
  amounts[invoiceId] = agorotToAmount(left > 0 ? Math.min(open, left) : open);
  return { mode: 'manual', amounts };
}

/** Type an amount for one invoice (ticking it if it was not). */
export function setPickAmount(
  invoices: readonly OpenInvoice[],
  picks: SettlementPicks,
  capacity: number,
  invoiceId: string,
  typed: string,
): SettlementPicks {
  const current = picks.mode === 'manual' ? picks : manualPicksFrom(resolveSettlements(invoices, picks, capacity));
  return { mode: 'manual', amounts: { ...current.amounts, [invoiceId]: typed } };
}
