import { describe, expect, it } from 'vitest';
import { quoteItems, toPaymentResponse, type PlanChild } from './registrationPlan';

const parent = {
  parent_id_number: '123456782', parent_first_name: 'דנה', parent_phone: '0501234567',
  signature: 'data:image/png;base64,AAAA', computerized_docs_consent: true, terms_consent: true, health_consent: true,
};

const child = (name: string, selections: PlanChild['selections'], extra: Partial<PlanChild> = {}): PlanChild => ({
  payload: { child_first_name: name },
  selections,
  discountConfirmed: false,
  startingChildId: '',
  ...extra,
});

describe('quoteItems', () => {
  it('sends a quote nothing that only a signed registration carries', () => {
    const [item] = quoteItems(parent, [child('מאיה', [{ courseId: 'c1', lessonId: 'l1' }])]);
    expect(item.signature).toBeUndefined();
    expect(item.computerized_docs_consent).toBeUndefined();
    expect(item.terms_consent).toBeUndefined();
    expect(item.health_consent).toBeUndefined();
    expect(item.parent_id_number).toBe('123456782');
    expect(item).toMatchObject({ course_id: 'c1', lesson_id: 'l1', child_first_name: 'מאיה' });
  });

  it('keeps the order the form registers in: each child, each of its courses', () => {
    const items = quoteItems(parent, [
      child('מאיה', [{ courseId: 'c1' }, { courseId: 'c2' }]),
      child('איתי', [{ courseId: 'c3' }]),
    ]);
    expect(items.map((item) => [item.child_first_name, item.course_id])).toEqual([
      ['מאיה', 'c1'], ['מאיה', 'c2'], ['איתי', 'c3'],
    ]);
  });

  it("ties a child's later courses to the child the first one produced", () => {
    const items = quoteItems(parent, [
      child('מאיה', [{ courseId: 'c1' }]),
      child('איתי', [{ courseId: 'c2' }, { courseId: 'c3' }, { courseId: 'c4' }]),
    ]);
    expect(items.map((item) => item.same_child_as)).toEqual([undefined, undefined, 1, 1]);
  });

  it("gives the lookup's child and answer to a child's first course only", () => {
    const items = quoteItems(parent, [
      child('מאיה', [{ courseId: 'c1' }, { courseId: 'c2' }], { discountConfirmed: true, startingChildId: 'kid-1' }),
    ]);
    expect(items[0]).toMatchObject({ existing_child_id: 'kid-1', discount_confirmed: true });
    expect(items[1]).toMatchObject({ existing_child_id: '', discount_confirmed: false, same_child_as: 0 });
  });

  it('carries the identification token and a child chosen from the list', () => {
    const [item] = quoteItems({ ...parent, identify_token: 'tok', device_id: 'dev' }, [{
      payload: { identified_child_id: 'kid-9', child_first_name: 'מאיה', child_last_name: '' },
      selections: [{ courseId: 'c1' }], discountConfirmed: false, startingChildId: '',
    }]);
    expect(item).toMatchObject({ identify_token: 'tok', device_id: 'dev', identified_child_id: 'kid-9' });
  });
});

describe('toPaymentResponse', () => {
  it('leaves a single registration as the server sent it', () => {
    const data = { payment_id: 'p1', final_amount: 470, base_amount: 350, discount_amount: 0, discounts_applied: [] };
    expect(toPaymentResponse(data)).toBe(data);
  });

  it('gathers a twice-a-week registration into one payment with all its ids and discounts', () => {
    const answer = toPaymentResponse({
      is_bundle: true, child_id: 'k1', final_amount: 620, base_amount: 500, discount_amount: 0,
      registration_fee: 120, monthly_amount: 500, next_billing_date: '2026-11-01',
      payments: [{ payment_id: 'p1', discounts_applied: [{ name: 'הנחה', type: 'x', value: 10 }] }, { payment_id: 'p2' }],
    });
    expect(answer.payment_id).toBe('p1');
    expect(answer.payment_ids).toEqual(['p1', 'p2']);
    expect(answer.discounts_applied).toHaveLength(1);
    expect(answer.next_billing_date).toBe('2026-11-01');
  });

  it('copes with a quote of a twice-a-week course, which names no payment', () => {
    const answer = toPaymentResponse({
      is_bundle: true, final_amount: 570, base_amount: 500, discount_amount: 50,
      discounts_applied: [{ name: 'הנחת ילד שני', type: 'second_child', value: 50 }],
    });
    expect(answer.payment_id).toBe('');
    expect(answer.payment_ids).toEqual([]);
    expect(answer.discounts_applied).toHaveLength(1);
  });
});
