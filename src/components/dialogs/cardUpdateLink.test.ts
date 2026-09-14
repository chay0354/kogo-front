import { describe, expect, it } from 'vitest';
import type { CardLinkOption, OptionStandingOrder } from '@/lib/paymentLinksApi';
import {
  isOverridden,
  isSelectable,
  monthsSummary,
  opensNewStandingOrder,
  optionAction,
  renewAmountError,
  renewAmountToSend,
  standingOrderRows,
  standingOrderStatusLabel,
} from './cardUpdateLink';

function sto(over: Partial<OptionStandingOrder> = {}): OptionStandingOrder {
  return {
    id: 'sto-1',
    status: 'active',
    monthly_amount: '250.00',
    next_billing_date: '2026-08-01',
    last_charge_date: '2026-07-03',
    months: [
      { month: '2026-08', label: 'אוגוסט 2026' },
      { month: '2026-09', label: 'ספטמבר 2026' },
    ],
    months_label: 'אוגוסט, ספטמבר',
    renew_amount: '500.00',
    can_renew: true,
    ...over,
  };
}

function option(over: Partial<CardLinkOption> = {}): CardLinkOption {
  return {
    key: 'lesson:1',
    kind: 'lesson',
    lesson_id: 'l1',
    bundle_id: null,
    course_name: 'קפואירה',
    branch_name: 'מרכז',
    label: 'קפואירה · שני 16:00',
    frequency_label: 'פעם בשבוע',
    sessions: [],
    enrolled: true,
    is_trial: false,
    has_standing_order: false,
    quote: { first_charge: '180.00', monthly_amount: '250.00', registration_fee: '0.00', next_billing_date: '2026-10-01' },
    ...over,
  };
}

describe('optionAction', () => {
  it('offers a new standing order when there is none', () => {
    expect(optionAction(option())).toBe('new');
    expect(opensNewStandingOrder(option())).toBe(true);
  });

  it('offers חידוש when the standing order has months that were never collected', () => {
    const row = option({ has_standing_order: true, standing_order: sto(), quote: undefined });
    expect(optionAction(row)).toBe('renew');
    expect(opensNewStandingOrder(row)).toBe(false);
    expect(isSelectable(row)).toBe(true);
  });

  it('offers only a card swap when the standing order owes nothing', () => {
    const row = option({
      has_standing_order: true,
      standing_order: sto({ months: [], months_label: '', renew_amount: '0.00', can_renew: false }),
      quote: undefined,
    });
    expect(optionAction(row)).toBe('card_only');
  });

  it('treats a stopped standing order as renewable, not as a fresh signup', () => {
    // `has_standing_order` only knows active/paused, so a failed order arrives false.
    const row = option({ has_standing_order: false, standing_order: sto({ status: 'failed' }) });
    expect(optionAction(row)).toBe('renew');
    expect(opensNewStandingOrder(row)).toBe(false);
  });

  it('blocks a unit with no usable price and no standing order', () => {
    const row = option({ quote: undefined, quote_error: 'לשיעור אין מחיר מוגדר' });
    expect(optionAction(row)).toBe('blocked');
    expect(isSelectable(row)).toBe(false);
  });
});

describe('standingOrderRows', () => {
  it('lists each standing order once, even when a track and its day both point at it', () => {
    const shared = sto({ id: 'sto-7' });
    const rows = standingOrderRows([
      option({ key: 'bundle:9', standing_order: shared }),
      option({ key: 'lesson:1', standing_order: shared }),
      option({ key: 'lesson:2', standing_order: sto({ id: 'sto-8' }) }),
      option({ key: 'lesson:3' }),
    ]);
    expect(rows.map((r) => r.standingOrder.id)).toEqual(['sto-7', 'sto-8']);
    expect(rows[0].option.key).toBe('bundle:9');
  });

  it('is empty when nothing is loaded', () => {
    expect(standingOrderRows(null)).toEqual([]);
  });
});

describe('renewAmountError', () => {
  it('accepts the computed total', () => {
    expect(renewAmountError('500')).toBe('');
    expect(renewAmountError('500.00')).toBe('');
  });

  it('refuses nothing, nonsense, zero and the absurd', () => {
    expect(renewAmountError('')).toBe('יש להזין סכום');
    expect(renewAmountError('abc')).toBe('סכום לא תקין');
    expect(renewAmountError('0')).not.toBe('');
    expect(renewAmountError('-5')).not.toBe('');
    expect(renewAmountError('50001')).not.toBe('');
  });
});

describe('renewAmountToSend', () => {
  it('sends nothing when the office left the computed total alone', () => {
    expect(renewAmountToSend(sto(), '500')).toBeUndefined();
    expect(renewAmountToSend(sto(), '500.00')).toBeUndefined();
    expect(isOverridden(sto(), '500')).toBe(false);
  });

  it('sends the override when the office changed it', () => {
    expect(renewAmountToSend(sto(), '380')).toBe('380.00');
    expect(isOverridden(sto(), '380')).toBe(true);
  });
});

describe('monthsSummary', () => {
  it('counts the months and names them', () => {
    expect(monthsSummary(sto())).toBe('חודשיים שלא נגבו · אוגוסט, ספטמבר');
    expect(monthsSummary(sto({ months: [{ month: '2026-09', label: 'ספטמבר 2026' }], months_label: 'ספטמבר' })))
      .toBe('חודש אחד שלא נגבה · ספטמבר');
    expect(
      monthsSummary(
        sto({
          months: [
            { month: '2026-07', label: 'יולי 2026' },
            { month: '2026-08', label: 'אוגוסט 2026' },
            { month: '2026-09', label: 'ספטמבר 2026' },
          ],
          months_label: 'יולי, אוגוסט, ספטמבר',
        }),
      ),
    ).toBe('3 חודשים שלא נגבו · יולי, אוגוסט, ספטמבר');
  });

  it('says so when there is nothing outstanding', () => {
    expect(monthsSummary(sto({ months: [], months_label: '', can_renew: false }))).toBe('אין חודשים שלא נגבו');
  });
});

describe('standingOrderStatusLabel', () => {
  it('names the states the office sees', () => {
    expect(standingOrderStatusLabel('active')).toBe('פעילה');
    expect(standingOrderStatusLabel('failed')).toBe('נעצרה');
    expect(standingOrderStatusLabel('whatever')).toBe('whatever');
  });
});
