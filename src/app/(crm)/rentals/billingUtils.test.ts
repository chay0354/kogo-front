/**
 * A tenancy's standing order and its charges on the tenants screen: the chips,
 * what each status allows, how the money and the months read, what the office
 * is asked before a decision, and what is sent.
 */
import { describe, expect, it } from 'vitest';
import type { BillingStatus, CardLinkInfo, StandingOrder, TenantCharge } from '@/lib/rentalBillingApi';
import {
  BILLING_OFF_TEXT,
  BLOCKED_ROW_TEXT,
  BLOCKED_TITLE_TEXT,
  EMPTY_MARK_CHARGED_FORM,
  MARK_CHARGED_WARNING,
  RETRY_OFF_TEXT,
  VOID_FAILED_WARNING,
  VOID_UNDECIDED_WARNING,
  billingApiError,
  billingMoney,
  billingMonthLabel,
  billingNotices,
  blockedChargeChip,
  blockedChargeNotice,
  buildOrderCreatePayload,
  buildOrderUpdatePayload,
  canOpenOrder,
  cardLinkAttemptsText,
  cardLinkStateText,
  cardLinkWhatsAppMessage,
  chargeActions,
  chargeAmountsLine,
  chargeChip,
  chargeMetaLines,
  chargeStatusLabel,
  chargeStatusTone,
  editableOrderFields,
  lifecycleConfirmCopy,
  liveCardLink,
  markChargedCopy,
  markChargedErrors,
  markChargedPayload,
  monthsNeverCharged,
  orderActions,
  orderCell,
  orderFormErrors,
  orderFormFromOrder,
  orderFormFromTenancy,
  orderStatusLabel,
  orderStatusTone,
  ordersByTenancy,
  receiptLine,
  retryConfirmText,
  retryOutcomeText,
  reviewRowText,
  terminalSetNote,
  voidCopy,
  voidErrors,
} from './billingUtils';

function order(overrides: Partial<StandingOrder> = {}): StandingOrder {
  return {
    id: 'o-1',
    tenancy_id: 't-1',
    tenant: { id: 'c-1', full_name: 'דנה לוי', company_number: '', id_number: '123456782', phone: '050-1234567', email: '' },
    branch_id: 'b-1',
    branch_name: 'רמת גן',
    business_name: 'סוחרים',
    business_category_name: '',
    amount_before_vat: '480.00',
    vat_amount: '86.40',
    monthly_total: '566.40',
    billing_day: 1,
    start_date: '2026-09-01',
    end_date: null,
    next_charge_date: '2026-10-01',
    status: 'active',
    status_label: 'פעילה',
    source: 'office',
    source_label: 'המשרד',
    last_error: '',
    failed_at: null,
    notes: '',
    has_card: true,
    card_last4: '4242',
    card_expiry: '12/28',
    card_link: null,
    created_by_name: 'נועה',
    created_at: '2026-09-11T10:00:00+03:00',
    updated_at: '2026-09-11T10:00:00+03:00',
    ...overrides,
  };
}

function charge(overrides: Partial<TenantCharge> = {}): TenantCharge {
  return {
    id: 'ch-1',
    standing_order_id: 'o-1',
    tenancy_id: 't-1',
    tenant_name: 'דנה לוי',
    branch_name: 'רמת גן',
    period: '2026-09-01',
    status: 'charged',
    status_label: 'חויב',
    trigger: 'card',
    trigger_label: 'הזנת כרטיס',
    attempts: 1,
    undecided: false,
    amount_before_vat: '480.00',
    vat_amount: '86.40',
    total: '566.40',
    amount_before_vat_agorot: 48000,
    vat_amount_agorot: 8640,
    total_agorot: 56640,
    card_last4: '4242',
    transaction_id: '',
    confirmation_code: '',
    error: '',
    charged_at: null,
    receipt: null,
    receipt_error: '',
    needs_receipt: false,
    resolved_by_name: '',
    resolved_at: null,
    resolution_note: '',
    ...overrides,
  };
}

function link(overrides: Partial<CardLinkInfo> = {}): CardLinkInfo {
  return {
    id: 'l-1',
    status: 'pending',
    status_label: 'ממתין',
    url: 'https://kogo.example/rc/abc',
    // What the server sends now: a card link does not run out of time.
    expired: false,
    expires_at: null,
    attempts: 0,
    last_error: '',
    review_reason: '',
    used_at: null,
    created_at: '2026-09-11T15:05:00Z',
    ...overrides,
  };
}

function status(overrides: Partial<BillingStatus> = {}): BillingStatus {
  return {
    enabled: true,
    message: '',
    business_name: 'סוחרים',
    business_found: true,
    tranzila: { terminal_set: 'production', terminal: 'kogo', token_terminal: 'kogotok', overridden: [] },
    ...overrides,
  };
}

const NOW = new Date('2026-09-11T12:00:00Z');

describe('the switch', () => {
  it('says charging is off, and that charges cannot be tagged without the business', () => {
    expect(billingNotices(null)).toEqual([]);
    expect(billingNotices(status())).toEqual([]);
    expect(billingNotices(status({ enabled: false }))).toEqual([BILLING_OFF_TEXT]);
    expect(BILLING_OFF_TEXT).toBe('חיוב שוכרים כבוי — אפשר לפתוח הוראות קבע ולשלוח קישורים, אבל שום כרטיס לא יחויב עד ההפעלה');
    expect(billingNotices(status({ business_name: '', business_found: false }))[0]).toContain('"סוחרים" לא נמצא במערכת');
  });

  it('notes terminals other than production’s, by name, and nothing for production or none', () => {
    expect(terminalSetNote(status())).toBe('');
    expect(terminalSetNote(null)).toBe('');
    expect(terminalSetNote(status({ tranzila: { terminal_set: '', terminal: '', token_terminal: '', overridden: [] } }))).toBe('');
    expect(
      terminalSetNote(
        status({ tranzila: { terminal_set: 'rental', terminal: 'kogorent', token_terminal: 'kogorenttok', overridden: ['TRANZILA_RENTAL_TERMINAL'] } }),
      ),
    ).toBe('חיוב השוכרים מכוון למסוף טרנזילה ייעודי לשכירויות, ולא למסופי הייצור הרגילים (kogorent · kogorenttok).');
    expect(
      terminalSetNote(status({ tranzila: { terminal_set: 'mixed', terminal: 'kogo', token_terminal: 'kogo', overridden: [] } })),
    ).toBe('חלק מחיובי השוכרים מכוונים למסוף טרנזילה אחר, ולא למסופי הייצור הרגילים (kogo).');
    expect(
      terminalSetNote(status({ tranzila: { terminal_set: 'sandbox', terminal: '', token_terminal: '', overridden: [] } })),
    ).toBe('חיוב השוכרים מכוון למסופי טרנזילה מסוג sandbox.');
  });
});

describe('money and months', () => {
  it('reads shekel strings as money, agorot with two digits, and a dash for none', () => {
    expect(billingMoney('566.40')).toBe('₪566.40');
    expect(billingMoney('480.00')).toBe('₪480');
    expect(billingMoney('1234.5')).toBe('₪1,234.50');
    expect(billingMoney('')).toBe('—');
    expect(billingMoney(null)).toBe('—');
    expect(billingMoney('abc')).toBe('—');
  });

  it('names a month', () => {
    expect(billingMonthLabel('2026-10-01')).toBe('אוקטובר 2026');
  });
});

describe('status chips and labels', () => {
  it('prefers the server’s label, and colours an order by where it stands', () => {
    expect(orderStatusLabel('active', 'פעילה (שרת)')).toBe('פעילה (שרת)');
    expect(orderStatusLabel('pending_card')).toBe('ממתינה לכרטיס');
    expect(orderStatusLabel('paused')).toBe('מושהית');
    expect(orderStatusLabel('failed')).toBe('החיוב נכשל');
    expect(orderStatusLabel('ended')).toBe('הסתיימה');
    expect(orderStatusLabel('archived')).toBe('archived');
    expect(orderStatusTone('active')).toBe('ok');
    expect(orderStatusTone('pending_card')).toBe('progress');
    expect(orderStatusTone('failed')).toBe('bad');
    expect(orderStatusTone('paused')).toBe('off');
    expect(orderStatusTone('ended')).toBe('off');
  });

  it('labels and colours a charge, a missed month among them', () => {
    expect(chargeStatusLabel('reserved')).toBe('שמור לחיוב');
    expect(chargeStatusLabel('charged')).toBe('חויב');
    expect(chargeStatusLabel('failed')).toBe('נדחה');
    expect(chargeStatusLabel('review')).toBe('בבדיקה');
    expect(chargeStatusLabel('voided')).toBe('בוטל');
    expect(chargeStatusLabel('missed')).toBe('לא חויב');
    expect(chargeStatusTone('charged')).toBe('ok');
    expect(chargeStatusTone('failed')).toBe('bad');
    expect(chargeStatusTone('review')).toBe('progress');
    expect(chargeStatusTone('voided')).toBe('off');
    expect(chargeStatusTone('missed')).toBe('off');
  });

  it('shows a reservation that never heard back as waiting for a decision', () => {
    expect(chargeChip(charge({ status: 'reserved', status_label: 'שמור לחיוב', undecided: true }))).toEqual({
      label: 'ללא תשובה — לבדיקה',
      tone: 'progress',
    });
    expect(chargeChip(charge({ status: 'reserved', status_label: 'שמור לחיוב', undecided: false }))).toEqual({
      label: 'שמור לחיוב',
      tone: 'progress',
    });
  });
});

describe('each tenancy’s order', () => {
  it('shows the open order, else the newest ended one', () => {
    const ended = order({ id: 'old', status: 'ended', created_at: '2026-10-01T00:00:00Z' });
    const open = order({ id: 'open', status: 'pending_card', created_at: '2026-09-01T00:00:00Z' });
    expect(ordersByTenancy([ended, open]).get('t-1')?.id).toBe('open');
    expect(ordersByTenancy([open, ended]).get('t-1')?.id).toBe('open');
    const older = order({ id: 'e1', status: 'ended', created_at: '2026-01-01T00:00:00Z' });
    const newer = order({ id: 'e2', status: 'ended', created_at: '2026-05-01T00:00:00Z' });
    expect(ordersByTenancy([older, newer]).get('t-1')?.id).toBe('e2');
    expect(ordersByTenancy([order({ tenancy_id: 't-2' })]).get('t-1')).toBeUndefined();
  });

  it('offers to open one only with none open, on an agreement still in force', () => {
    expect(canOpenOrder({ status: 'active' }, null)).toBe(true);
    expect(canOpenOrder({ status: 'signed' }, order({ status: 'ended' }))).toBe(true);
    expect(canOpenOrder({ status: 'active' }, order({ status: 'paused' }))).toBe(false);
    expect(canOpenOrder({ status: 'cancelled' }, null)).toBe(false);
    expect(canOpenOrder({ status: 'ended' }, null)).toBe(false);
  });
});

describe('what each order status allows', () => {
  it('sends a card link only while it waits for a card or its charge failed; pauses, resumes and ends by status', () => {
    expect(orderActions({ status: 'pending_card' })).toEqual({ edit: true, cardLink: true, charges: true, pause: false, resume: false, end: true });
    expect(orderActions({ status: 'active' })).toEqual({ edit: true, cardLink: false, charges: true, pause: true, resume: false, end: true });
    expect(orderActions({ status: 'paused' })).toEqual({ edit: true, cardLink: false, charges: true, pause: false, resume: true, end: true });
    expect(orderActions({ status: 'failed' })).toEqual({ edit: true, cardLink: true, charges: true, pause: false, resume: false, end: true });
    expect(orderActions({ status: 'ended' })).toEqual({ edit: true, cardLink: false, charges: true, pause: false, resume: false, end: false });
  });

  it('lets the office change the four fields the server takes — only the notes once ended', () => {
    expect(editableOrderFields({ status: 'active' })).toEqual(['amount_before_vat', 'billing_day', 'end_date', 'notes']);
    expect(editableOrderFields({ status: 'ended' })).toEqual(['notes']);
  });
});

describe('the row’s column', () => {
  it('shows the status, the month with VAT, the next charge and the card', () => {
    expect(orderCell(order())).toEqual({
      statusLabel: 'פעילה',
      tone: 'ok',
      total: '₪566.40 לחודש',
      next: 'חיוב הבא: 1.10.2026',
      card: { last4: '4242', expiry: '12/28' },
      problem: '',
    });
  });

  it('shows no next charge while paused or ended, and no card before one is in', () => {
    expect(orderCell(order({ status: 'paused' })).next).toBe('');
    expect(orderCell(order({ status: 'ended' })).next).toBe('');
    expect(orderCell(order({ status: 'pending_card', has_card: false, card_last4: '', next_charge_date: null }))).toMatchObject({
      next: '',
      card: null,
      tone: 'progress',
    });
  });

  it('says why the last charge failed', () => {
    expect(orderCell(order({ status: 'failed', last_error: 'כרטיס חסום' })).problem).toBe('כרטיס חסום');
    expect(orderCell(order({ status: 'failed' })).problem).toBe('החיוב האחרון נכשל');
  });
});

describe('pause, resume and end', () => {
  it('asks before each, naming the tenant and what follows', () => {
    const pause = lifecycleConfirmCopy('pause', 'דנה לוי');
    expect(pause.title).toBe('השהיית הוראת קבע');
    expect(pause.message).toContain('להשהות את הוראת הקבע של דנה לוי?');
    expect(pause.message).toContain('לא יחויבו גם אחרי החידוש');
    expect(lifecycleConfirmCopy('resume', 'דנה לוי').confirmText).toBe('חידוש');
    const end = lifecycleConfirmCopy('end', ' ');
    expect(end.message).toContain('של השוכר?');
    expect(end.message).toContain('אי אפשר לחדש');
    expect(end.confirmText).toBe('סיום הוראת הקבע');
  });
});

describe('the order’s form', () => {
  it('starts a new order from the tenancy’s agreement', () => {
    expect(
      orderFormFromTenancy({ monthly_amount: '1200.00', billing_day: 5, start_date: '2026-10-01', end_date: '2027-09-30' }),
    ).toEqual({ amount: '1200', billingDay: '5', startDate: '2026-10-01', endDate: '2027-09-30', notes: '' });
    expect(orderFormFromTenancy({ monthly_amount: '', billing_day: 0, start_date: null, end_date: null })).toEqual({
      amount: '',
      billingDay: '1',
      startDate: '',
      endDate: '',
      notes: '',
    });
  });

  it('asks for a positive amount, a billing day, a start for a new order, and an end after it', () => {
    const good = orderFormFromTenancy({ monthly_amount: '480', billing_day: 1, start_date: '2026-10-01', end_date: null });
    expect(orderFormErrors(good, { creating: true })).toEqual([]);
    expect(orderFormErrors({ ...good, amount: '' })).toEqual(['יש להזין סכום חודשי לפני מע״מ']);
    expect(orderFormErrors({ ...good, amount: '12.345' })).toEqual(['הסכום החודשי צריך להיות מספר, עד שתי ספרות אחרי הנקודה']);
    expect(orderFormErrors({ ...good, amount: '0' })).toEqual(['הסכום החודשי חייב להיות גדול מ־0']);
    expect(orderFormErrors({ ...good, billingDay: '29' })).toEqual(['יום החיוב צריך להיות בין 1 ל־28']);
    expect(orderFormErrors({ ...good, startDate: '' }, { creating: true })).toEqual(['יש לבחור תאריך התחלה']);
    expect(orderFormErrors({ ...good, startDate: '' })).toEqual([]);
    expect(orderFormErrors({ ...good, endDate: '2026-09-30' })).toEqual(['תאריך הסיום מוקדם מתאריך ההתחלה']);
  });

  it('opens an order with the form as the office left it', () => {
    expect(
      buildOrderCreatePayload({ amount: '480.5', billingDay: '10', startDate: '2026-10-01', endDate: '', notes: '  בלי ימי שישי ' }, 't-1'),
    ).toEqual({
      tenancy_id: 't-1',
      amount_before_vat: '480.50',
      billing_day: 10,
      start_date: '2026-10-01',
      end_date: null,
      notes: 'בלי ימי שישי',
    });
  });

  it('patches only what changed, among what may change', () => {
    const saved = order({ notes: 'ישן' });
    expect(buildOrderUpdatePayload(orderFormFromOrder(saved), saved)).toEqual({});
    expect(buildOrderUpdatePayload({ ...orderFormFromOrder(saved), amount: '500', endDate: '2027-08-31' }, saved)).toEqual({
      amount_before_vat: '500.00',
      end_date: '2027-08-31',
    });
    expect(buildOrderUpdatePayload({ ...orderFormFromOrder(saved), billingDay: '15', notes: ' חדש ' }, saved)).toEqual({
      billing_day: 15,
      notes: 'חדש',
    });
    const ended = order({ status: 'ended', notes: '' });
    expect(buildOrderUpdatePayload({ ...orderFormFromOrder(ended), amount: '999', notes: 'הסתיים' }, ended)).toEqual({ notes: 'הסתיים' });
  });
});

describe('the card link', () => {
  it('is live with an address, and with no expiry to outlive', () => {
    expect(liveCardLink(link(), NOW)).toEqual({ url: 'https://kogo.example/rc/abc', expiresAt: null });
    expect(liveCardLink(link({ url: '' }), NOW)).toBeNull();
    // The server no longer sends either of these, and is still obeyed if it ever does.
    expect(liveCardLink(link({ expired: true }), NOW)).toBeNull();
    expect(liveCardLink(link({ expires_at: '2026-09-01T00:00:00Z' }), NOW)).toBeNull();
    expect(liveCardLink(null, NOW)).toBeNull();
  });

  it('says where the newest link stands when it is not live', () => {
    expect(cardLinkStateText(null, NOW)).toBe('עדיין לא נוצר קישור לכרטיס.');
    expect(cardLinkStateText(link(), NOW)).toBe('');
    expect(cardLinkStateText(link({ status: 'processing' }), NOW)).toContain('השוכר מזין כרטיס ממש עכשיו');
    expect(cardLinkStateText(link({ status: 'review', url: '', review_reason: 'gateway_uncertain' }), NOW)).toBe(
      'הניסיון האחרון בקישור עבר לבדיקה (טרנזילה לא החזירה תשובה ברורה) — בדקו בחיובים ובטרנזילה לפני שיוצרים קישור חדש.',
    );
    expect(cardLinkStateText(link({ status: 'review', url: '', review_reason: 'weird' }), NOW)).toContain('עבר לבדיקה —');
    expect(cardLinkStateText(link({ status: 'used', url: '', used_at: '2026-09-11T15:05:00Z' }), NOW)).toBe(
      'הכרטיס נקלט בקישור האחרון ב־11.9.2026, 18:05.',
    );
    expect(cardLinkStateText(link({ status: 'cancelled', url: '' }), NOW)).toBe('הקישור האחרון בוטל.');
    // Nothing is ever "expired" here any more: with no address and no status of its own, it just says so.
    expect(cardLinkStateText(link({ url: '' }), NOW)).toBe('אין קישור פעיל לכרטיס.');
  });

  it('counts the tries on the link, with the last one’s failure', () => {
    expect(cardLinkAttemptsText(link())).toBe('');
    expect(cardLinkAttemptsText(link({ attempts: 1 }))).toBe('ניסיון אחד');
    expect(cardLinkAttemptsText(link({ attempts: 2, last_error: 'הכרטיס נדחה' }))).toBe('2 ניסיונות · האחרון נכשל: הכרטיס נדחה');
  });

  it('writes the WhatsApp message the office sends itself', () => {
    expect(
      cardLinkWhatsAppMessage({
        tenant: { first_name: 'דנה', full_name: 'דנה לוי' },
        url: 'https://kogo.example/rc/abc',
        branchName: 'רמת גן',
        monthlyTotal: '566.40',
        expiresAt: '2026-09-25T15:05:00Z',
      }),
    ).toBe(
      [
        'שלום דנה,',
        'זה הקישור להזנת כרטיס האשראי להוראת הקבע של השכירות בסניף רמת גן (₪566.40 לחודש, כולל מע״מ):',
        'https://kogo.example/rc/abc',
        'הקישור בתוקף עד 25.9.2026, 18:05.',
        'תודה, קוגומלו',
      ].join('\n'),
    );
    expect(cardLinkWhatsAppMessage({ tenant: null, url: 'https://x/rc/a' })).toBe(
      ['שלום,', 'זה הקישור להזנת כרטיס האשראי להוראת הקבע של השכירות:', 'https://x/rc/a', 'תודה, קוגומלו'].join('\n'),
    );
  });
});

describe('what each charge status allows', () => {
  const manager = { billingEnabled: true, canDecide: true, order: order() };

  it('retries a failed month — held back while charging is off, without a card, or once the order ended', () => {
    expect(chargeActions(charge({ status: 'failed' }), manager)).toMatchObject({
      retry: { offered: true, blockedReason: '' },
      markCharged: false,
      void: true,
      issueReceipt: false,
    });
    expect(chargeActions(charge({ status: 'failed' }), { ...manager, billingEnabled: false }).retry).toEqual({
      offered: true,
      blockedReason: RETRY_OFF_TEXT,
    });
    expect(chargeActions(charge({ status: 'failed' }), { ...manager, order: order({ has_card: false }) }).retry.blockedReason).toBe(
      'אין כרטיס שמור — שלחו לשוכר קישור לכרטיס',
    );
    expect(chargeActions(charge({ status: 'failed' }), { ...manager, order: order({ status: 'ended' }) }).retry.blockedReason).toBe(
      'הוראת הקבע הסתיימה',
    );
  });

  it('decides a month in review — or a reservation that never heard back — by marking it charged or voiding it', () => {
    for (const settled of [charge({ status: 'review', undecided: true }), charge({ status: 'reserved', undecided: true })]) {
      expect(chargeActions(settled, manager)).toMatchObject({ retry: { offered: false }, markCharged: true, void: true });
    }
    expect(chargeActions(charge({ status: 'reserved', undecided: false }), manager)).toMatchObject({ markCharged: false, void: false });
  });

  it('issues a missing receipt, and downloads one that exists', () => {
    expect(chargeActions(charge({ needs_receipt: true }), manager)).toMatchObject({ issueReceipt: true, downloadReceipt: false });
    const receipt = { id: 'd-1', document_number: '20012', document_date: '2026-09-11', pdf_url: '/api/v1/documents/documents/d-1/pdf/' };
    expect(chargeActions(charge({ receipt }), manager)).toMatchObject({ issueReceipt: false, downloadReceipt: true });
    expect(chargeActions(charge({ status: 'voided' }), manager)).toMatchObject({
      retry: { offered: false },
      markCharged: false,
      void: false,
      issueReceipt: false,
    });
  });

  it('offers a partner none of the four money decisions — only the statuses, and a receipt that exists', () => {
    const partner = { ...manager, canDecide: false };
    const receipt = { id: 'd-1', document_number: '20012', document_date: '2026-09-11', pdf_url: '' };
    for (const any of [
      charge({ status: 'failed' }),
      charge({ status: 'review', undecided: true }),
      charge({ needs_receipt: true }),
    ]) {
      expect(chargeActions(any, partner)).toEqual({
        retry: { offered: false, blockedReason: '' },
        markCharged: false,
        void: false,
        issueReceipt: false,
        downloadReceipt: false,
      });
    }
    expect(chargeActions(charge({ receipt }), partner).downloadReceipt).toBe(true);
  });
});

describe('how a charge reads', () => {
  it('writes its amounts', () => {
    expect(chargeAmountsLine(charge())).toBe('₪480 + מע״מ ₪86.40 = ₪566.40');
  });

  it('writes how it came about, when it went through, at Tranzila, and who decided', () => {
    expect(
      chargeMetaLines(
        charge({ attempts: 2, charged_at: '2026-09-11T15:05:00Z', transaction_id: '77001', confirmation_code: '0123' }),
      ),
    ).toEqual(['הזנת כרטיס · 2 ניסיונות', 'חויב ב־11.9.2026, 18:05 · כרטיס 4242', 'עסקה 77001 · אישור 0123']);
    expect(
      chargeMetaLines(
        charge({
          status: 'voided',
          trigger_label: 'חיוב חודשי',
          resolved_by_name: 'נועה',
          resolved_at: '2026-09-12T07:00:00Z',
          resolution_note: 'לא עבר בטרנזילה',
        }),
      ),
    ).toEqual(['חיוב חודשי', 'בוטל על ידי נועה ב־12.9.2026, 10:00 · לא עבר בטרנזילה']);
  });

  it('writes the receipt line', () => {
    expect(receiptLine({ id: 'd-1', document_number: '20012', document_date: '2026-09-11', pdf_url: '' })).toBe('קבלה 20012 · 11.9.2026');
    expect(
      receiptLine({ id: 'd-1', document_number: '20012', document_date: '2026-10-02', pdf_url: '', issued_late: true }),
    ).toBe('קבלה 20012 · 2.10.2026 · הופק באיחור');
    expect(receiptLine(null)).toBe('');
  });

  it('lists the months that were never charged, newest first, once each', () => {
    expect(monthsNeverCharged(order({ months_never_charged: ['2026-07-01', '2026-08-01', '2026-07-01', 'x'] }))).toEqual([
      '2026-08-01',
      '2026-07-01',
    ]);
    expect(monthsNeverCharged(order())).toEqual([]);
    expect(monthsNeverCharged(order({ months_never_charged: null }))).toEqual([]);
  });

  it('says when a month waiting for a decision is holding every charge up', () => {
    const held = order({ blocked_by_charge: { id: 'ch-9', period: '2026-09-01', status: 'review', status_label: 'בבדיקה' } });
    expect(blockedChargeChip(held)).toEqual({
      label: 'החיוב עצור — ספטמבר 2026 ממתין להחלטה',
      title: BLOCKED_TITLE_TEXT,
      month: 'ספטמבר 2026',
      chargeId: 'ch-9',
    });
    expect(blockedChargeChip(order())).toBeNull();
    expect(blockedChargeChip(order({ blocked_by_charge: null }))).toBeNull();
    expect(blockedChargeChip(order({ blocked_by_charge: { id: 'ch-9', period: 'x', status: 'review', status_label: '' } }))?.label).toBe(
      'החיוב עצור — חודש ממתין להחלטה',
    );
  });

  it('points the charges dialog at the month that holds everything up, and tells a partner who decides', () => {
    const held = order({ blocked_by_charge: { id: 'ch-9', period: '2026-09-01', status: 'review', status_label: 'בבדיקה' } });
    expect(blockedChargeNotice(held, true)).toBe(
      'החיוב של הוראת הקבע עצור: ספטמבר 2026 ממתין להחלטה. סמנו אותו כחויב או בטלו אותו — עד אז שום חודש נוסף לא ייגבה מהשוכר הזה.',
    );
    expect(blockedChargeNotice(held, false)).toContain('ממתין להחלטה של מנהל');
    expect(blockedChargeNotice(order(), true)).toBe('');
    expect(BLOCKED_ROW_TEXT).toContain('עוצר את הוראת הקבע');
  });
});

describe('the office’s decisions on a charge', () => {
  it('asks for Tranzila’s transaction id, saying plainly it comes only after checking there', () => {
    expect(markChargedCopy(charge({ period: '2026-09-01' }))).toEqual({
      title: 'סימון ספטמבר 2026 כחויב',
      warning: MARK_CHARGED_WARNING,
      submit: 'סימון כחויב',
    });
    expect(MARK_CHARGED_WARNING.startsWith('סמנו כחויב רק אחרי שבדקתם בטרנזילה שהחיוב עבר בפועל.')).toBe(true);
  });

  it('asks why before a void, and says it is final — with Tranzila checked first for one in review', () => {
    expect(voidCopy(charge({ status: 'review' }))).toEqual({
      title: 'ביטול החיוב של ספטמבר 2026',
      warning: VOID_UNDECIDED_WARNING,
      submit: 'ביטול החיוב — סופי',
    });
    expect(voidCopy(charge({ status: 'failed' })).warning).toBe(VOID_FAILED_WARNING);
    expect(VOID_UNDECIDED_WARNING.startsWith('הביטול סופי')).toBe(true);
    expect(VOID_UNDECIDED_WARNING).toContain('בדקתם בטרנזילה');
    expect(VOID_FAILED_WARNING.startsWith('הביטול סופי')).toBe(true);
  });

  it('puts the Tranzila check first on a month in review, and tells a partner who decides', () => {
    expect(reviewRowText(charge({ status: 'review', undecided: true }), true)).toContain('לפני כל פעולה בדקו בטרנזילה אם החיוב עבר');
    expect(reviewRowText(charge({ status: 'reserved', undecided: true }), true)).toContain('סמנו כחויב רק אם מצאתם אותו שם');
    expect(reviewRowText(charge({ status: 'review', undecided: true }), false)).toBe('התשובה מטרנזילה לא ברורה — החודש ממתין לבדיקה של מנהל.');
    expect(reviewRowText(charge(), true)).toBe('');
  });

  it('confirms a retry with the sum, the month and the card', () => {
    expect(retryConfirmText(charge({ period: '2026-08-01' }), order())).toBe('לחייב עכשיו ₪566.40 על אוגוסט 2026 בכרטיס שמסתיים ב־4242?');
    expect(retryConfirmText(charge(), null)).toBe('לחייב עכשיו ₪566.40 על ספטמבר 2026 בכרטיס השמור?');
  });

  it('wants a transaction id, and sends the optional fields only when filled', () => {
    expect(markChargedErrors(EMPTY_MARK_CHARGED_FORM)).toEqual(['יש להזין את מזהה העסקה שנמצא בטרנזילה']);
    expect(markChargedErrors({ ...EMPTY_MARK_CHARGED_FORM, transactionId: 'x'.repeat(101) })).toEqual(['מזהה העסקה ארוך מדי']);
    expect(markChargedPayload({ transactionId: ' 77001 ', confirmationCode: '', note: ' ' })).toEqual({ transaction_id: '77001' });
    expect(markChargedPayload({ transactionId: '77001', confirmationCode: ' 0123 ', note: 'נמצא בדוח' })).toEqual({
      transaction_id: '77001',
      confirmation_code: '0123',
      note: 'נמצא בדוח',
    });
  });

  it('wants a reason for a void', () => {
    expect(voidErrors('  ')).toEqual(['יש לכתוב את סיבת הביטול']);
    expect(voidErrors('x'.repeat(1001))).toEqual(['סיבת הביטול ארוכה מדי']);
    expect(voidErrors('לא עבר')).toEqual([]);
  });

  it('says what a retry came to — success only when money moved', () => {
    expect(retryOutcomeText('charged', charge())).toEqual({ ok: true, text: 'החיוב עבר — ₪566.40' });
    expect(retryOutcomeText('failed', charge({ error: 'כרטיס חסום' }))).toEqual({ ok: false, text: 'החיוב נדחה שוב: כרטיס חסום' });
    expect(retryOutcomeText('review', charge()).ok).toBe(false);
    expect(retryOutcomeText('review', charge()).text).toContain('בדקו בטרנזילה');
    expect(retryOutcomeText('late', null).ok).toBe(false);
  });
});

describe('billingApiError', () => {
  it('takes the server’s error whole, never a charge’s fields beside it', () => {
    expect(
      billingApiError(
        { response: { status: 500, data: { error: 'הקבלה לא הופקה. החיוב נשאר רשום כחיוב שעבר.', charge: { tenant_name: 'דנה' } } } },
        'x',
      ),
    ).toBe('הקבלה לא הופקה. החיוב נשאר רשום כחיוב שעבר.');
    expect(billingApiError({ response: { status: 404, data: { error: 'הסכם השכירות לא נמצא' } } }, 'x')).toBe('הסכם השכירות לא נמצא');
    // A retry the server refuses because the month already went to Tranzila today.
    expect(billingApiError({ response: { status: 409, data: { error: 'החיוב כבר נשלח לטרנזילה היום' } } }, 'x')).toBe(
      'החיוב כבר נשלח לטרנזילה היום',
    );
  });

  it('reads field errors and the rest as the tenants screen does', () => {
    expect(billingApiError({ response: { status: 400, data: { amount_before_vat: ['ערך לא תקין'] } } }, 'x')).toBe(
      'סכום חודשי: ערך לא תקין',
    );
    expect(billingApiError({ response: { status: 403, data: { detail: 'אין הרשאה' } } }, 'x')).toBe('אין הרשאה לפעולה הזאת');
    expect(billingApiError({ request: {}, code: 'ECONNABORTED' }, 'נכשל')).toBe('נכשל');
  });
});
