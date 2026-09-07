import { describe, expect, test } from 'vitest';
import { upcomingCharges, type UpcomingStandingOrder } from './upcomingCharges';

function order(partial: Partial<UpcomingStandingOrder> & Pick<UpcomingStandingOrder, 'id'>): UpcomingStandingOrder {
  return {
    status: 'active',
    amount: 275,
    next_billing_date: '2026-10-01',
    ...partial,
  };
}

describe('upcomingCharges', () => {
  test('lists the next ten monthly charges from one standing order', () => {
    const rows = upcomingCharges([
      order({
        id: 'sto-1',
        amount: 275,
        next_billing_date: '2026-10-01',
        initial_payment_details: { lesson_name: 'ערסלים חטיבה', lesson_course_display_id: 80 },
      }),
    ], new Date(2026, 8, 1));

    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({
      description: 'ערסלים חטיבה',
      amount: 275,
      courseDisplayId: 80,
    });
    expect(rows[0].date).toEqual(new Date(2026, 9, 1));
    expect(rows[9].date).toEqual(new Date(2027, 6, 1));
  });

  test('interleaves two standing orders by date', () => {
    const rows = upcomingCharges([
      order({
        id: 'jazz',
        amount: 150,
        next_billing_date: '2026-10-01',
        initial_payment_details: { lesson_name: 'פאנקי ג׳אז' },
      }),
      order({
        id: 'acro',
        amount: 125,
        next_billing_date: '2026-10-01',
        initial_payment_details: { lesson_name: 'ערסלים חטיבה' },
      }),
    ], new Date(2026, 8, 1));

    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 2).map((row) => [row.date.getMonth(), row.description, row.amount])).toEqual([
      [9, 'ערסלים חטיבה', 125],
      [9, 'פאנקי ג׳אז', 150],
    ]);
    expect(rows[2].date).toEqual(new Date(2026, 10, 1));
  });

  test('uses the pending amount from its effective date', () => {
    const rows = upcomingCharges([
      order({
        id: 'sto-pending',
        amount: 275,
        pending_amount: 300,
        pending_amount_effective_date: '2026-11-01',
        next_billing_date: '2026-10-01',
        initial_payment_details: { lesson_name: 'ערסלים' },
      }),
    ], new Date(2026, 8, 1));

    expect(rows[0].amount).toBe(275);
    expect(rows[1].amount).toBe(300);
  });

  test('a month with an override bills that amount, and only that month', () => {
    const rows = upcomingCharges([
      order({
        id: 'ov-order-1',
        amount: 275,
        next_billing_date: '2026-10-01',
        upcoming_overrides: [{
          id: 'ov-1',
          billing_month: '2026-11-01',
          amount: 150,
          original_amount: 275,
          reason: 'רק שני שיעורים בנובמבר',
          source: 'manual',
        }],
      }),
    ], new Date(2026, 8, 1));

    expect(rows[0].amount).toBe(275);
    expect(rows[0].override).toBeNull();
    expect(rows[1].amount).toBe(150);
    expect(rows[1].regularAmount).toBe(275);
    expect(rows[1].override?.reason).toContain('שני שיעורים');
    expect(rows[2].amount).toBe(275);
  });

  test('a store purchase shows as the month it rides on, above the regular amount', () => {
    const rows = upcomingCharges([
      order({
        id: 'ov-order-2',
        amount: 275,
        next_billing_date: '2026-10-01',
        upcoming_overrides: [{
          id: 'ov-2',
          billing_month: '2026-10-01',
          amount: 395,
          original_amount: 275,
          reason: 'רכישה בחנות: חולצה',
          source: 'store',
          store_invoice_number: 'S-1001',
        }],
      }),
    ], new Date(2026, 8, 1));

    expect(rows[0].amount).toBe(395);
    expect(rows[0].regularAmount).toBe(275);
    expect(rows[0].override?.source).toBe('store');
  });

  test('an override for a month outside the window changes nothing', () => {
    const rows = upcomingCharges([
      order({
        id: 'ov-order-3',
        amount: 275,
        next_billing_date: '2026-10-01',
        upcoming_overrides: [{
          id: 'ov-3',
          billing_month: '2030-01-01',
          amount: 1,
          reason: 'רחוק',
          source: 'manual',
        }],
      }),
    ], new Date(2026, 8, 1));

    expect(rows.every((row) => row.amount === 275)).toBe(true);
  });

  test('skips cancelled orders and stops after end_date', () => {
    const rows = upcomingCharges([
      order({ id: 'cancelled', status: 'cancelled', next_billing_date: '2026-10-01' }),
      order({
        id: 'ending',
        amount: 200,
        next_billing_date: '2026-10-01',
        end_date: '2026-11-15',
        initial_payment_details: { lesson_name: 'בלט' },
      }),
    ], new Date(2026, 8, 1));

    expect(rows.map((row) => row.date.getMonth())).toEqual([9, 10]);
  });
});
