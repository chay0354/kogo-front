import { describe, expect, it } from 'vitest';
import {
  ackDateProblem,
  canCreditFromRow,
  canSaveAsDraft,
  creditAckState,
  creditPrefillFromDocument,
  creditPrefillFromRow,
  creditRoomProblem,
  creditRoomSummary,
  draftApprovalMessage,
  draftTargetLabel,
  type CreditRoom,
} from './draftsAndCredits';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  origin: 'manual',
  is_draft: false,
  document_type_code: 'tax_invoice',
  document_number: 'TI-2026-000012',
  issue_date: '2026-09-20',
  child_id: 'child-1',
  business_customer_id: null,
  ...over,
});

const room = (over: Partial<CreditRoom> = {}): CreditRoom => ({
  number: 'TI-2026-000012',
  known: true,
  kind: 'formal',
  document_type: 'tax_invoice',
  document_type_label: 'חשבונית מס',
  document_date: '2026-09-20',
  creditable: true,
  refusal: '',
  net: '200.00',
  credited: '50.00',
  left: '150.00',
  child_id: 'child-1',
  business_customer_id: null,
  ...over,
});

describe('drafts', () => {
  it('offers a draft for the four document types, never for a credit note', () => {
    for (const type of ['חשבונית מס', 'חשבונית עסקה', 'קבלה', 'חשבונית מס/קבלה']) {
      expect(canSaveAsDraft(type)).toBe(true);
    }
    expect(canSaveAsDraft('חשבונית מס זיכוי')).toBe(false);
    expect(canSaveAsDraft(null)).toBe(false);
  });

  it('offers no draft for a receipt that opens a check plan', () => {
    expect(canSaveAsDraft('קבלה', { perCheck: true })).toBe(false);
    expect(canSaveAsDraft('חשבונית מס/קבלה', { perCheck: true })).toBe(true);
  });

  it('names what a draft becomes, a tax invoice when the server does not say', () => {
    expect(draftTargetLabel('receipt')).toBe('קבלה');
    expect(draftTargetLabel('combined')).toBe('חשבונית מס/קבלה');
    expect(draftTargetLabel('')).toBe('חשבונית מס');
    expect(draftTargetLabel(undefined)).toBe('חשבונית מס');
  });

  it('warns that a paying draft is checked again against today\'s balances', () => {
    const receipt = draftApprovalMessage({ document_number: 'D-1A2B', draft_target_type: 'receipt' });
    expect(receipt).toContain('לקבלה');
    expect(receipt).toContain('ייבדקו שוב');
    const invoice = draftApprovalMessage({ document_number: 'D-1A2B', draft_target_type: 'tax_invoice' });
    expect(invoice).toContain('לחשבונית מס');
    expect(invoice).not.toContain('ייבדקו שוב');
  });
});

describe('credit from a row', () => {
  it('opens a credit note on a tax invoice or invoice-receipt issued in kogo', () => {
    expect(creditPrefillFromRow(row())).toEqual({
      documentNumber: 'TI-2026-000012',
      documentDate: '2026-09-20',
      clientType: 'existing',
      childId: 'child-1',
      businessCustomerId: null,
    });
    expect(canCreditFromRow(row({ document_type_code: 'combined' }))).toBe(true);
  });

  it('takes a business customer as the business client', () => {
    expect(creditPrefillFromRow(row({ child_id: null, business_customer_id: 'biz-1' }))).toMatchObject({
      clientType: 'business',
      childId: null,
      businessCustomerId: 'biz-1',
    });
  });

  it('offers nothing on what is not creditable or not kogo\'s', () => {
    for (const over of [
      { document_type_code: 'receipt' },
      { document_type_code: 'transaction_invoice' },
      { document_type_code: 'credit_invoice' },
      { is_draft: true },
      { origin: 'subscription', document_type_code: 'IR' },
      { origin: 'store_counter' },
      { child_id: null, business_customer_id: null },
    ]) {
      expect(canCreditFromRow(row(over))).toBe(false);
    }
  });

  it('reads a document\'s detail the same way', () => {
    expect(creditPrefillFromDocument({
      document_number: 'IRM-2026-000003', document_type: 'combined', document_date: '2026-09-01',
      child: null, business_customer: 'biz-9',
    })).toEqual({
      documentNumber: 'IRM-2026-000003', documentDate: '2026-09-01', clientType: 'business',
      childId: null, businessCustomerId: 'biz-9',
    });
    expect(creditPrefillFromDocument({
      document_number: 'RC-2026-000003', document_type: 'receipt', document_date: '2026-09-01',
      child: 'c', business_customer: null,
    })).toBeNull();
  });
});

describe('the customer\'s confirmation of a credit note', () => {
  const credit = { document_type_code: 'credit_invoice', origin: 'manual' };

  it('is pending until recorded, confirmed after, and unknown on an older server', () => {
    expect(creditAckState({ ...credit, customer_ack_at: null })).toBe('pending');
    expect(creditAckState({ ...credit, customer_ack_at: '2026-09-30T09:00:00Z' })).toBe('confirmed');
    expect(creditAckState({ ...credit })).toBeNull();
    expect(creditAckState({ document_type_code: 'tax_invoice', origin: 'manual', customer_ack_at: null })).toBeNull();
  });

  it('is dated no later than today and no earlier than the credit note', () => {
    expect(ackDateProblem('2026-09-29', '2026-09-20', '2026-09-30')).toBeNull();
    expect(ackDateProblem('2026-09-30', '2026-09-30', '2026-09-30')).toBeNull();
    expect(ackDateProblem('2026-10-01', '2026-09-20', '2026-09-30')).toContain('בעתיד');
    expect(ackDateProblem('2026-09-19', '2026-09-20', '2026-09-30')).toContain('מוקדם');
    expect(ackDateProblem('', '2026-09-20', '2026-09-30')).not.toBeNull();
  });
});

describe('what is left to credit', () => {
  const customer = { childId: 'child-1', businessCustomerId: null };

  it('passes up to what is left, and not an agora more', () => {
    expect(creditRoomProblem(room(), 150, customer)).toBeNull();
    expect(creditRoomProblem(room(), 150.01, customer)).toContain('150.00');
  });

  it('says so when the original is credited in full', () => {
    expect(creditRoomProblem(room({ left: '0.00', credited: '200.00' }), 1, customer)).toContain('במלואו');
  });

  it('carries the server\'s reason for a document that cannot be credited', () => {
    expect(creditRoomProblem(room({ creditable: false, refusal: 'קבלה אינה…', left: null }), 1, customer))
      .toBe('קבלה אינה…');
  });

  it('refuses another customer\'s document', () => {
    expect(creditRoomProblem(room(), 10, { childId: 'child-2', businessCustomerId: null })).toContain('ללקוח אחר');
  });

  it('leaves a number kogo never issued to the server', () => {
    expect(creditRoomProblem(room({ known: false, creditable: false, net: null, left: null }), 999, customer)).toBeNull();
    expect(creditRoomProblem(null, 999, customer)).toBeNull();
  });

  it('prints the figures before VAT', () => {
    const text = creditRoomSummary(room()) ?? '';
    expect(text).toContain('נותר לזכות');
    expect(text).toContain('150.00');
    expect(text).toContain('200.00');
    expect(creditRoomSummary(room({ known: false }))).toBeNull();
  });
});
