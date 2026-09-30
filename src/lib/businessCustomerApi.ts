import api from './api';
import { readDeliveryStatus, type DocumentDeliveryStatus } from './documentDelivery';
import type { LegacyDocument } from './legacyImportApi';
import type { TenancySlot } from './rentalsApi';
import {
  readComputerizedDocsConsent,
  type ComputerizedDocsConsent,
} from '@/components/dialogs/computerizedDocsConsent';

/**
 * The business customer's card (backend: GET /customers/business-customers/{id}/summary/,
 * apps/customers/business_customer_summary.py) — a merchant's or a studio
 * tenant's documents, how each original reached them, the previous software's
 * history and the tenancies they hold, in one answer.
 *
 * Everything that is not the request is a pure reader below: a field the
 * server left out reads as empty, never as a crash, so the card opens on any
 * server that has the route.
 */

export interface BusinessCustomerIdentity {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  id_number: string;
  company_number: string;
  address: string;
  business_type: string;
  category: string;
  business_name: string;
  business_category_name: string;
  branch_name: string;
  notes: string;
  created_at: string | null;
}

/** One issued document: TI, IRM, RC, TX, CR or RT. */
export interface BusinessCustomerDocument {
  id: string;
  document_number: string;
  /** tax_invoice · receipt · combined · transaction_invoice · credit_invoice */
  document_type: string;
  document_type_label: string;
  /** YYYY-MM-DD, or '' */
  date: string;
  /** As the document says it; a credit note's is positive here and shown with a minus. */
  total: number;
  is_credit: boolean;
  /** A rent receipt (the RT run). */
  is_rental: boolean;
  description: string;
  linked_document_number: string;
  branch_name: string;
  /** Relative to the API base: the office copy. */
  download_url: string;
  delivery_status: DocumentDeliveryStatus | null;
}

export interface BusinessCustomerDraft {
  id: string;
  document_number: string;
  target_type: string;
  target_type_label: string;
  date: string;
  total: number;
  description: string;
  branch_name: string;
  download_url: string;
}

export interface BusinessCustomerTenancy {
  id: string;
  status: string;
  status_label: string;
  branch_name: string;
  /** Before VAT. */
  monthly_amount: number;
  /** With VAT, what the tenant pays each month. */
  monthly_total: number;
  billing_day: number | null;
  start_date: string;
  end_date: string;
  slots: TenancySlot[];
}

export interface BusinessCustomerTotalsLine {
  document_type: string;
  label: string;
  count: number;
  total: number;
}

export interface BusinessCustomerTotals {
  documents_count: number;
  drafts_count: number;
  /** Tax invoices and חשבונית מס/קבלה. */
  invoiced: number;
  /** Receipts and חשבונית מס/קבלה. */
  received: number;
  credited: number;
  net_invoiced: number;
  by_type: BusinessCustomerTotalsLine[];
}

export interface BusinessCustomerLegacy {
  count: number;
  truncated: boolean;
  results: LegacyDocument[];
}

export interface BusinessCustomerSummary {
  customer: BusinessCustomerIdentity;
  /** Null on a server whose answer carries no consent fields. */
  consent: ComputerizedDocsConsent | null;
  documents: BusinessCustomerDocument[];
  drafts: BusinessCustomerDraft[];
  /** Managers only; null for anyone else. */
  legacy: BusinessCustomerLegacy | null;
  is_tenant: boolean;
  tenancies: BusinessCustomerTenancy[];
  totals: BusinessCustomerTotals;
  /** Coming with settlements; until then always null and the card says nothing about it. */
  balance: null;
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

function readIdentity(raw: unknown): BusinessCustomerIdentity {
  const row = obj(raw);
  const first = text(row.first_name);
  const last = text(row.last_name);
  return {
    id: text(row.id),
    full_name: text(row.full_name) || [first, last].filter(Boolean).join(' '),
    first_name: first,
    last_name: last,
    email: text(row.email),
    phone: text(row.phone),
    id_number: text(row.id_number),
    company_number: text(row.company_number),
    address: text(row.address),
    business_type: text(row.business_type),
    category: text(row.category),
    business_name: text(row.business_name),
    business_category_name: text(row.business_category_name),
    branch_name: text(row.branch_name),
    notes: text(row.notes),
    created_at: typeof row.created_at === 'string' && row.created_at ? row.created_at : null,
  };
}

function readDocument(raw: unknown): BusinessCustomerDocument | null {
  const row = obj(raw);
  if (!row.id) return null;
  return {
    id: text(row.id),
    document_number: text(row.document_number),
    document_type: text(row.document_type),
    document_type_label: text(row.document_type_label),
    date: text(row.date),
    total: num(row.total),
    is_credit: row.is_credit === true || row.document_type === 'credit_invoice',
    is_rental: row.is_rental === true,
    description: text(row.description),
    linked_document_number: text(row.linked_document_number),
    branch_name: text(row.branch_name),
    download_url: text(row.download_url),
    delivery_status: readDeliveryStatus(row.delivery_status),
  };
}

function readDraft(raw: unknown): BusinessCustomerDraft | null {
  const row = obj(raw);
  if (!row.id) return null;
  return {
    id: text(row.id),
    document_number: text(row.document_number),
    target_type: text(row.target_type),
    target_type_label: text(row.target_type_label),
    date: text(row.date),
    total: num(row.total),
    description: text(row.description),
    branch_name: text(row.branch_name),
    download_url: text(row.download_url),
  };
}

function readTenancy(raw: unknown): BusinessCustomerTenancy | null {
  const row = obj(raw);
  if (!row.id) return null;
  const day = Number(row.billing_day);
  return {
    id: text(row.id),
    status: text(row.status),
    status_label: text(row.status_label) || text(row.status),
    branch_name: text(row.branch_name),
    monthly_amount: num(row.monthly_amount),
    monthly_total: num(row.monthly_total),
    billing_day: Number.isInteger(day) && day > 0 ? day : null,
    start_date: text(row.start_date),
    end_date: text(row.end_date),
    slots: list(row.slots) as TenancySlot[],
  };
}

function readTotals(raw: unknown): BusinessCustomerTotals {
  const row = obj(raw);
  return {
    documents_count: num(row.documents_count),
    drafts_count: num(row.drafts_count),
    invoiced: num(row.invoiced),
    received: num(row.received),
    credited: num(row.credited),
    net_invoiced: num(row.net_invoiced),
    by_type: list(row.by_type).map((line) => {
      const item = obj(line);
      return {
        document_type: text(item.document_type),
        label: text(item.label),
        count: num(item.count),
        total: num(item.total),
      };
    }),
  };
}

function readLegacy(raw: unknown): BusinessCustomerLegacy | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Raw;
  const results = list(row.results) as LegacyDocument[];
  return { count: num(row.count ?? results.length), truncated: row.truncated === true, results };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** The whole answer off the wire. */
export function readBusinessCustomerSummary(data: unknown): BusinessCustomerSummary {
  const row = obj(data);
  return {
    customer: readIdentity(row.customer),
    consent: readComputerizedDocsConsent(row.consent),
    documents: list(row.documents).map(readDocument).filter(isPresent),
    drafts: list(row.drafts).map(readDraft).filter(isPresent),
    legacy: readLegacy(row.legacy),
    is_tenant: row.is_tenant === true,
    tenancies: list(row.tenancies).map(readTenancy).filter(isPresent),
    totals: readTotals(row.totals),
    balance: null,
  };
}

export function businessCustomerSummaryUrl(id: string): string {
  return `/customers/business-customers/${encodeURIComponent(id)}/summary/`;
}

export async function fetchBusinessCustomerSummary(id: string): Promise<BusinessCustomerSummary> {
  const res = await api.get(businessCustomerSummaryUrl(id));
  return readBusinessCustomerSummary(res.data);
}

/**
 * The route a row downloads from, when it is one the office's token may go to:
 * a path under the API base ("/documents/documents/<id>/pdf/"), never another
 * host. Null otherwise — the row then has no download.
 */
export function apiDownloadPath(url: string | null | undefined): string | null {
  const value = String(url ?? '');
  return /^\/(?!\/)/.test(value) ? value : null;
}

/** "11.09.2026" from "2026-09-11", read off the text so no timezone moves the day. */
export function formatCardDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

/** Agorot always shown; a credit note carries a real minus sign. */
export function formatCardAmount(amount: number, credit = false): string {
  const shekels = `₪${Math.abs(amount).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return credit ? `−${shekels}` : shekels;
}

/** "3 מסמכים", "מסמך אחד" — the counts the card's headings carry. */
export function countWord(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count.toLocaleString('he-IL')} ${many}`;
}

/** The tenancies that still run — the ones the card leads with. */
export function currentTenancies(tenancies: readonly BusinessCustomerTenancy[]): BusinessCustomerTenancy[] {
  return tenancies.filter((tenancy) => tenancy.status !== 'ended' && tenancy.status !== 'cancelled');
}
