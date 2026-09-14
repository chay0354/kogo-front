/**
 * The tenant billing client against the contract: which URL each call reaches,
 * what it sends, and how the answer is read. The axios instance is mocked —
 * nothing here reaches the server, let alone Tranzila.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import {
  chargeQueryParams,
  createCardLink,
  createStandingOrder,
  downloadChargeReceipt,
  endStandingOrder,
  fetchBillingStatus,
  fetchCardPage,
  fetchCharge,
  fetchCharges,
  fetchOrderCharges,
  fetchStandingOrder,
  fetchStandingOrders,
  issueChargeReceipt,
  markChargeCharged,
  pauseStandingOrder,
  readCardPreview,
  readCardSubmitResult,
  receiptFileName,
  resumeStandingOrder,
  retryCharge,
  standingOrderQueryParams,
  submitCardPage,
  updateStandingOrder,
  voidCharge,
} from './rentalBillingApi';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('query strings', () => {
  it('sends only the order filters that are set, several statuses as one', () => {
    expect(standingOrderQueryParams({ tenancy: ' t-1 ', status: ['active', ' failed', ''], branch: '' })).toEqual({
      tenancy: 't-1',
      status: 'active,failed',
    });
    expect(standingOrderQueryParams({ status: 'pending_card, active' })).toEqual({ status: 'pending_card,active' });
    expect(standingOrderQueryParams()).toEqual({});
  });

  it('sends the charge filters that are set, and needs_receipt as 1', () => {
    expect(
      chargeQueryParams({ status: 'review', branch: 'b-1', standing_order: '', period: '2026-09', needs_receipt: true }),
    ).toEqual({ status: 'review', branch: 'b-1', period: '2026-09', needs_receipt: '1' });
    expect(chargeQueryParams({ needs_receipt: false, tenancy: 't-1' })).toEqual({ tenancy: 't-1' });
  });
});

describe('fetchBillingStatus', () => {
  it('reads the switch and the business', async () => {
    api.get.mockResolvedValue({ data: { enabled: true, message: '', business_name: 'סוחרים', business_found: true } });
    expect(await fetchBillingStatus()).toEqual({
      enabled: true,
      message: '',
      business_name: 'סוחרים',
      business_found: true,
      terminal_mode: '',
    });
    api.get.mockResolvedValue({ data: { enabled: true, terminal_mode: ' rental_override ' } });
    expect((await fetchBillingStatus()).terminal_mode).toBe('rental_override');
    expect(api.get).toHaveBeenCalledWith('/rental-billing/status/');
  });

  it('reads a body that does not say it is on as off', async () => {
    api.get.mockResolvedValue({ data: { message: 'חיוב השכירויות כבוי כרגע.' } });
    expect(await fetchBillingStatus()).toMatchObject({ enabled: false, message: 'חיוב השכירויות כבוי כרגע.', business_found: true });
    api.get.mockResolvedValue({ data: null });
    expect((await fetchBillingStatus()).enabled).toBe(false);
  });
});

describe('standing orders', () => {
  it('reads the list with its filters, and unwraps a paginated answer', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'o-1' }] });
    expect(await fetchStandingOrders({ tenancy: 't-1' })).toEqual([{ id: 'o-1' }]);
    expect(api.get).toHaveBeenCalledWith('/rental-billing/standing-orders/', { params: { tenancy: 't-1' } });
    api.get.mockResolvedValue({ data: { results: [{ id: 'o-2' }] } });
    expect(await fetchStandingOrders()).toEqual([{ id: 'o-2' }]);
    api.get.mockResolvedValue({ data: null });
    expect(await fetchStandingOrders()).toEqual([]);
  });

  it('reads one, the id kept inside its place in the path', async () => {
    api.get.mockResolvedValue({ data: { id: 'o/1' } });
    await fetchStandingOrder('o/1');
    expect(api.get).toHaveBeenCalledWith('/rental-billing/standing-orders/o%2F1/');
  });

  it('opens one with the payload as given', async () => {
    const payload = {
      tenancy_id: 't-1',
      amount_before_vat: '480.00',
      billing_day: 1,
      start_date: '2026-10-01',
      end_date: null,
      notes: '',
    };
    api.post.mockResolvedValue({ data: { id: 'o-1', status: 'pending_card' } });
    expect(await createStandingOrder(payload)).toEqual({ id: 'o-1', status: 'pending_card' });
    expect(api.post).toHaveBeenCalledWith('/rental-billing/standing-orders/', payload);
  });

  it('patches only what it is given', async () => {
    api.patch.mockResolvedValue({ data: { id: 'o-1' } });
    await updateStandingOrder('o-1', { billing_day: 10 });
    expect(api.patch).toHaveBeenCalledWith('/rental-billing/standing-orders/o-1/', { billing_day: 10 });
  });

  it('pauses, resumes and ends at their own paths', async () => {
    api.post.mockResolvedValue({ data: { id: 'o-1' } });
    await pauseStandingOrder('o-1');
    await resumeStandingOrder('o-1');
    await endStandingOrder('o-1');
    expect(api.post.mock.calls).toEqual([
      ['/rental-billing/standing-orders/o-1/pause/', {}],
      ['/rental-billing/standing-orders/o-1/resume/', {}],
      ['/rental-billing/standing-orders/o-1/end/', {}],
    ]);
  });

  it('asks for a card link, and passes the server’s refusal through in its words', async () => {
    api.post.mockResolvedValue({ data: { id: 'l-1', url: 'https://kogo.example/rc/abc', status: 'pending' } });
    expect(await createCardLink('o-1')).toMatchObject({ url: 'https://kogo.example/rc/abc' });
    expect(api.post).toHaveBeenCalledWith('/rental-billing/standing-orders/o-1/card-link/', {});
    const refusal = { response: { status: 409, data: { error: 'השוכר מזין כרטיס ממש עכשיו — נסו שוב בעוד דקה' } } };
    api.post.mockRejectedValue(refusal);
    await expect(createCardLink('o-1')).rejects.toBe(refusal);
  });
});

describe('charges', () => {
  it('reads an order’s charges, the list across orders and one charge', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'c-1' }] });
    expect(await fetchOrderCharges('o-1')).toEqual([{ id: 'c-1' }]);
    expect(api.get).toHaveBeenLastCalledWith('/rental-billing/standing-orders/o-1/charges/');
    await fetchCharges({ status: ['review', 'reserved'], needs_receipt: true });
    expect(api.get).toHaveBeenLastCalledWith('/rental-billing/charges/', {
      params: { status: 'review,reserved', needs_receipt: '1' },
    });
    api.get.mockResolvedValue({ data: { id: 'c-1' } });
    await fetchCharge('c-1');
    expect(api.get).toHaveBeenLastCalledWith('/rental-billing/charges/c-1/');
  });

  it('retries a failed month with a longer wait, and reads the outcome', async () => {
    api.post.mockResolvedValue({ data: { outcome: 'charged', charge: { id: 'c-1', status: 'charged' } } });
    expect(await retryCharge('c-1')).toEqual({ outcome: 'charged', charge: { id: 'c-1', status: 'charged' } });
    expect(api.post).toHaveBeenCalledWith('/rental-billing/charges/c-1/retry/', {}, { timeout: 60000 });
  });

  it('passes the refusal to retry while switched off through as it came', async () => {
    const refusal = { response: { status: 503, data: { error: 'חיוב השכירויות כבוי כרגע.', disabled: true } } };
    api.post.mockRejectedValue(refusal);
    await expect(retryCharge('c-1')).rejects.toBe(refusal);
  });

  it('marks a month charged with the transaction found in Tranzila, and voids one with a reason', async () => {
    api.post.mockResolvedValue({ data: { id: 'c-1' } });
    await markChargeCharged('c-1', { transaction_id: '77001', confirmation_code: '0123' });
    expect(api.post).toHaveBeenLastCalledWith(
      '/rental-billing/charges/c-1/mark-charged/',
      { transaction_id: '77001', confirmation_code: '0123' },
      { timeout: 60000 },
    );
    await voidCharge('c-1', 'לא עבר בטרנזילה');
    expect(api.post).toHaveBeenLastCalledWith('/rental-billing/charges/c-1/void/', { reason: 'לא עבר בטרנזילה' });
    await issueChargeReceipt('c-1');
    expect(api.post).toHaveBeenLastCalledWith('/rental-billing/charges/c-1/issue-receipt/', {}, { timeout: 60000 });
  });
});

describe('the receipt', () => {
  it('names the file by the document number', () => {
    expect(receiptFileName({ document_number: '20012' })).toBe('קבלה 20012.pdf');
    expect(receiptFileName({ document_number: 'RT/7:1' })).toBe('קבלה RT 7 1.pdf');
    expect(receiptFileName({ document_number: '' })).toBe('קבלה.pdf');
  });

  it('downloads it from the documents module by id, as a blob with the token', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    api.get.mockResolvedValue({ data: pdf });
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('window', { URL: { createObjectURL: vi.fn(() => 'blob:receipt'), revokeObjectURL: vi.fn() } });
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });

    await downloadChargeReceipt({ id: 'd-1', document_number: '20012' });

    expect(api.get).toHaveBeenCalledWith('/documents/documents/d-1/pdf/', { responseType: 'blob' });
    expect(link.download).toBe('קבלה 20012.pdf');
    expect(link.click).toHaveBeenCalledTimes(1);
  });

  it('reads a refusal back out of the blob, and saves nothing', async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: new Blob([JSON.stringify({ error: 'המסמך לא נמצא' })]) } });
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement, body: { appendChild: vi.fn() } });
    await expect(downloadChargeReceipt({ id: 'd-1', document_number: '1' })).rejects.toMatchObject({
      response: { status: 404, data: { error: 'המסמך לא נמצא' } },
    });
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('the card page (public)', () => {
  const SERVER_PREVIEW = {
    ok: true,
    enabled: true,
    state: 'pending_card',
    tenant_name: 'דנה לוי',
    branch_name: 'רמת גן',
    amount_before_vat: '480.00',
    vat_amount: '86.40',
    monthly_total: '566.40',
    billing_day: 1,
    start_date: '2026-09-01',
    end_date: null,
    expires_at: '2026-09-25T18:00:00+03:00',
    charge_now: true,
    charge_amount: '566.40',
    charge_period: '2026-09-01',
    next_charge_date: '2026-10-01',
  };

  it('reads the preview at the token’s own path, the token kept inside it', async () => {
    api.get.mockResolvedValue({ data: SERVER_PREVIEW });
    const preview = await fetchCardPage('ab/c');
    expect(api.get).toHaveBeenCalledWith('/rental-billing/card/ab%2Fc/');
    expect(preview).toEqual({
      enabled: true,
      state: 'pending_card',
      tenant_name: 'דנה לוי',
      branch_name: 'רמת גן',
      amount_before_vat: '480.00',
      vat_amount: '86.40',
      monthly_total: '566.40',
      billing_day: 1,
      start_date: '2026-09-01',
      end_date: null,
      expires_at: '2026-09-25T18:00:00+03:00',
      charge_now: true,
      charge_amount: '566.40',
      charge_period: '2026-09-01',
      next_charge_date: '2026-10-01',
      error: '',
      message: '',
    });
  });

  it('makes every text a string and every flag a boolean, and reads a missing switch as off', () => {
    expect(readCardPreview(null)).toMatchObject({
      enabled: false,
      state: '',
      billing_day: null,
      charge_now: false,
      charge_period: null,
      next_charge_date: null,
      error: '',
    });
    expect(readCardPreview({ enabled: 'yes', charge_now: 1, billing_day: '0' })).toMatchObject({
      enabled: false,
      charge_now: false,
      billing_day: null,
    });
    expect(readCardPreview({ enabled: true, error: ' החוזה עדיין לא נחתם. ' }).error).toBe('החוזה עדיין לא נחתם.');
  });

  it('posts the card under card_details, with a longer wait, and reads the answer', async () => {
    const card = { card_number: '4111111111111111', expiry_month: 12, expiry_year: 2028, cvv: '123', card_holder_id: '123456782' };
    api.post.mockResolvedValue({
      data: { success: true, state: 'active', charged: true, amount: '566.40', next_charge_date: '2026-10-01' },
    });
    expect(await submitCardPage('tok', card)).toEqual({
      success: true,
      state: 'active',
      charged: true,
      amount: '566.40',
      next_charge_date: '2026-10-01',
    });
    expect(api.post).toHaveBeenCalledWith('/rental-billing/card/tok/', { card_details: card }, { timeout: 90000 });
  });

  it('passes a refusal through to the page as it came', async () => {
    const refusal = { response: { status: 409, data: { success: false, error: 'הכרטיס בעיבוד, המתינו רגע.', processing: true } } };
    api.post.mockRejectedValue(refusal);
    await expect(
      submitCardPage('tok', { card_number: '', expiry_month: 1, expiry_year: 2030, cvv: '', card_holder_id: '' }),
    ).rejects.toBe(refusal);
  });

  it('reads a submit answer that is missing fields as nothing charged', () => {
    expect(readCardSubmitResult({ success: true })).toEqual({
      success: true,
      state: '',
      charged: false,
      amount: '',
      next_charge_date: null,
    });
  });
});
