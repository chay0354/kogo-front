/**
 * The business customer's card against the contract of
 * GET /customers/business-customers/{id}/summary/: which URL it asks, and how
 * the answer is read — including a partner's answer (no legacy) and a server
 * that leaves fields out. The axios instance is mocked; nothing reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('./api', () => ({ default: api }));

import {
  apiDownloadPath,
  businessCustomerSummaryUrl,
  countWord,
  currentTenancies,
  fetchBusinessCustomerSummary,
  formatCardAmount,
  formatCardDate,
  readBusinessCustomerSummary,
} from './businessCustomerApi';

const answer = {
  customer: {
    id: 'bc-1',
    first_name: 'סטודיו',
    last_name: 'אור',
    full_name: 'סטודיו אור',
    email: 'or@example.com',
    phone: '050-1234567',
    id_number: '',
    company_number: '512345678',
    address: 'הרצל 1',
    business_type: '',
    category: '',
    business_name: 'קוגומלו',
    business_category_name: 'סטודיו',
    branch_name: 'פלורנטין',
    notes: '',
    created_at: '2026-09-01T10:00:00+03:00',
  },
  consent: {
    computerized_docs_consent_at: '2026-09-02T10:00:00+03:00',
    computerized_docs_consent_source: 'crm',
    computerized_docs_consent_revoked_at: null,
    accepts_computerized_documents: true,
  },
  documents: [
    {
      id: 'doc-cr',
      document_number: 'CR-2026-000001',
      document_type: 'credit_invoice',
      document_type_label: 'חשבונית מס זיכוי',
      date: '2026-09-12',
      total: '100.00',
      is_credit: true,
      is_rental: false,
      description: 'הנחה',
      linked_document_number: 'TI-2026-000001',
      branch_name: 'פלורנטין',
      issued_at: null,
      download_url: '/documents/documents/doc-cr/pdf/',
      delivery_status: null,
    },
    {
      id: 'doc-rt',
      document_number: 'RT-2026-000001',
      document_type: 'combined',
      document_type_label: 'חשבונית מס/קבלה',
      date: '2026-09-10',
      total: '1456.78',
      is_credit: false,
      is_rental: true,
      description: '',
      linked_document_number: '',
      branch_name: 'פלורנטין',
      issued_at: '2026-09-10T06:00:00Z',
      download_url: '/documents/documents/doc-rt/pdf/',
      delivery_status: {
        delivery: 'email',
        delivery_reason: 'נשלח',
        purpose: 'original',
        signed_at: '2026-09-10T06:00:01Z',
        sent_at: '2026-09-10T06:00:05Z',
        paper_original_printed_at: null,
      },
    },
    { document_number: 'no id — dropped' },
  ],
  drafts: [
    {
      id: 'draft-1',
      document_number: 'DRAFT-1',
      document_type: 'draft',
      document_type_label: 'טיוטה',
      target_type: 'tax_invoice',
      target_type_label: 'חשבונית מס',
      date: '2026-09-20',
      total: '50.00',
      description: '',
      branch_name: '',
      created_at: '2026-09-20T09:00:00Z',
      download_url: '/documents/documents/draft-1/pdf/',
    },
  ],
  legacy: { count: 1, truncated: false, results: [{ id: 'legacy-1', number: 4411, doc_type: 'tax_invoice' }] },
  is_tenant: true,
  tenancies: [
    {
      id: 'ten-1', status: 'active', status_label: 'פעיל', branch_name: 'פלורנטין',
      monthly_amount: '1234.56', monthly_total: '1456.78', billing_day: 10,
      start_date: '2026-09-01', end_date: '2027-08-31', slots: [{ id: 'slot-1', name: 'שכירות' }],
    },
    {
      id: 'ten-2', status: 'ended', status_label: 'הסתיים', branch_name: 'פלורנטין',
      monthly_amount: '100.00', monthly_total: '118.00', billing_day: null,
      start_date: '', end_date: '', slots: [],
    },
  ],
  totals: {
    documents_count: 2,
    drafts_count: 1,
    invoiced: '1456.78',
    received: '1456.78',
    credited: '100.00',
    net_invoiced: '1356.78',
    by_type: [
      { document_type: 'combined', label: 'חשבונית מס/קבלה', count: 1, total: '1456.78' },
      { document_type: 'credit_invoice', label: 'חשבונית מס זיכוי', count: 1, total: '100.00' },
    ],
  },
  balance: null,
};

beforeEach(() => {
  api.get.mockReset();
});

describe('fetchBusinessCustomerSummary', () => {
  it('asks the customer\'s own summary route and reads the answer', async () => {
    api.get.mockResolvedValue({ data: answer });
    const summary = await fetchBusinessCustomerSummary('bc-1');
    expect(api.get).toHaveBeenCalledWith('/customers/business-customers/bc-1/summary/');
    expect(summary.customer.full_name).toBe('סטודיו אור');
    expect(summary.documents.map((doc) => doc.id)).toEqual(['doc-cr', 'doc-rt']);
  });

  it('escapes the id in the path', () => {
    expect(businessCustomerSummaryUrl('a/b')).toBe('/customers/business-customers/a%2Fb/summary/');
  });

  it('lets a 404 through for the card to say the customer was not found', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } });
    await expect(fetchBusinessCustomerSummary('other-branch')).rejects.toEqual({ response: { status: 404 } });
  });
});

describe('readBusinessCustomerSummary', () => {
  const summary = readBusinessCustomerSummary(answer);

  it('reads amounts as numbers and keeps a credit note a credit', () => {
    const [credit, rent] = summary.documents;
    expect(credit.total).toBe(100);
    expect(credit.is_credit).toBe(true);
    expect(credit.linked_document_number).toBe('TI-2026-000001');
    expect(rent.total).toBe(1456.78);
    expect(rent.is_rental).toBe(true);
  });

  it('reads each document\'s delivery status, or null where none is stored', () => {
    expect(summary.documents[0].delivery_status).toBeNull();
    expect(summary.documents[1].delivery_status).toMatchObject({
      delivery: 'email',
      sent_at: '2026-09-10T06:00:05Z',
      purpose: 'original',
    });
  });

  it('keeps drafts apart', () => {
    expect(summary.drafts).toHaveLength(1);
    expect(summary.drafts[0]).toMatchObject({ id: 'draft-1', target_type_label: 'חשבונית מס', total: 50 });
  });

  it('reads the consent, the tenancies and the totals', () => {
    expect(summary.consent?.accepts_computerized_documents).toBe(true);
    expect(summary.consent?.computerized_docs_consent_source).toBe('crm');
    expect(summary.is_tenant).toBe(true);
    expect(summary.tenancies[0]).toMatchObject({ monthly_total: 1456.78, billing_day: 10 });
    expect(summary.tenancies[1].billing_day).toBeNull();
    expect(summary.totals).toMatchObject({ documents_count: 2, invoiced: 1456.78, credited: 100, net_invoiced: 1356.78 });
    expect(summary.totals.by_type.map((line) => line.count)).toEqual([1, 1]);
    expect(summary.balance).toBeNull();
  });

  it('reads what the customer still owes (WS-3), and null from an older server', () => {
    const balance = readBusinessCustomerSummary({
      ...answer,
      balance: {
        open_total: '490.00',
        open_count: 1,
        paid_total: '0.00',
        credited_total: '100.00',
        open_invoices: [
          {
            id: 'ti-1', document_number: 'TI-2026-000001', document_type: 'tax_invoice',
            document_type_label: 'חשבונית מס', document_date: '2026-09-01', due_date: '2026-10-31',
            description: 'שכירות', total: '590.00', paid: '0.00', credited: '100.00', open: '490.00',
            status: 'partial', status_label: 'שולמה חלקית',
          },
        ],
      },
    }).balance;
    expect(balance).toMatchObject({ open_total: 490, open_count: 1, paid_total: 0, credited_total: 100 });
    expect(balance?.open_invoices[0]).toMatchObject({ id: 'ti-1', open: 490, credited: 100, status_label: 'שולמה חלקית' });
    expect(readBusinessCustomerSummary({ ...answer, balance: undefined }).balance).toBeNull();
    expect(readBusinessCustomerSummary({ ...answer, balance: { open_total: '0.00' } }).balance)
      .toEqual({ open_total: 0, open_count: 0, paid_total: 0, credited_total: 0, open_invoices: [] });
  });

  it('reads the legacy history for a manager, and null for a partner', () => {
    expect(summary.legacy).toEqual({ count: 1, truncated: false, results: answer.legacy.results });
    expect(readBusinessCustomerSummary({ ...answer, legacy: null }).legacy).toBeNull();
  });

  it('opens on an answer with fields missing, rather than failing', () => {
    const empty = readBusinessCustomerSummary({ customer: { id: 'x', first_name: 'דנה', last_name: 'לוי' } });
    expect(empty.customer.full_name).toBe('דנה לוי');
    expect(empty.documents).toEqual([]);
    expect(empty.drafts).toEqual([]);
    expect(empty.legacy).toBeNull();
    expect(empty.consent).toBeNull();
    expect(empty.tenancies).toEqual([]);
    expect(empty.totals.documents_count).toBe(0);
    expect(readBusinessCustomerSummary(null).customer.id).toBe('');
  });
});

describe('the card\'s helpers', () => {
  it('downloads only from a path under the API base', () => {
    expect(apiDownloadPath('/documents/documents/d-1/pdf/')).toBe('/documents/documents/d-1/pdf/');
    expect(apiDownloadPath('//evil.example/x.pdf')).toBeNull();
    expect(apiDownloadPath('https://evil.example/x.pdf')).toBeNull();
    expect(apiDownloadPath('')).toBeNull();
    expect(apiDownloadPath(undefined)).toBeNull();
  });

  it('writes dates off the text and amounts with agorot, a credit with a minus', () => {
    expect(formatCardDate('2026-09-11')).toBe('11.09.2026');
    expect(formatCardDate('')).toBe('');
    expect(formatCardAmount(1456.78)).toBe('₪1,456.78');
    expect(formatCardAmount(100, true)).toBe('−₪100.00');
  });

  it('counts in Hebrew', () => {
    expect(countWord(1, 'מסמך אחד', 'מסמכים')).toBe('מסמך אחד');
    expect(countWord(3, 'מסמך אחד', 'מסמכים')).toBe('3 מסמכים');
  });

  it('leads with the tenancies that still run', () => {
    const summary = readBusinessCustomerSummary(answer);
    expect(currentTenancies(summary.tenancies).map((tenancy) => tenancy.id)).toEqual(['ten-1']);
  });
});
