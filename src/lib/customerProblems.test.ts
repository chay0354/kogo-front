import { describe, expect, it } from 'vitest';
import {
  fromOtherCard,
  problemCount,
  problemsSummary,
  readProblemDetail,
  readRefundInfo,
  refundRequestBody,
  serverReportsProblems,
  standingOrderLeftAloneNote,
} from './customerProblems';

describe('the light on a list row', () => {
  it('counts what the server counted', () => {
    expect(problemCount({ problems_count: 2 })).toBe(2);
    expect(problemCount({ problems_count: 0 })).toBe(0);
  });

  it('shows nothing when the server did not say', () => {
    expect(problemCount({})).toBe(0);
    expect(problemCount({ problems_count: null })).toBe(0);
    expect(problemsSummary({})).toBe('');
  });

  it('says in words what the colour says', () => {
    expect(problemsSummary({ problems_count: 1, problem_titles: ['חיוב כפול באותו חודש'] }))
      .toBe('תקלה אחת: חיוב כפול באותו חודש');
    expect(problemsSummary({ problems_count: 3, problem_titles: ['חיוב כפול באותו חודש', 'חיוב תקוע'] }))
      .toBe('3 תקלות: חיוב כפול באותו חודש · חיוב תקוע');
    expect(problemsSummary({ problems_count: 2, problem_titles: null })).toBe('2 תקלות');
  });

  it('knows a server that reports problems from one that predates them', () => {
    expect(serverReportsProblems([{ problems_count: 0 }, {}])).toBe(true);
    expect(serverReportsProblems([{}, { problems_count: null }])).toBe(false);
    expect(serverReportsProblems([])).toBe(false);
  });
});

describe('the card’s answer', () => {
  it('reads each problem and each other card', () => {
    const detail = readProblemDetail({
      problems: [{ code: 'double_charge', title: 'חיוב כפול באותו חודש', what: 'נגבו 2 חיובים', action: 'לזכות' }],
      duplicate_cards: [{
        id: 'c2', full_name: 'נועם בדיקה', status: 'pending', status_label: 'בתהליך רישום',
        created_at: '2026-08-05T10:00:00+03:00', payments_count: 2, completed_total: '520.00',
        standing_orders_count: 1, documents_count: 2,
        standing_orders: [{ id: 'r9', status: 'active', amount: '260.00' }, null],
      }],
    });

    expect(detail.problems).toEqual([
      { code: 'double_charge', title: 'חיוב כפול באותו חודש', what: 'נגבו 2 חיובים', action: 'לזכות' },
    ]);
    expect(detail.duplicateCards[0]).toMatchObject({ id: 'c2', payments_count: 2, documents_count: 2 });
    expect(detail.duplicateCards[0].standing_orders).toEqual([{ id: 'r9', status: 'active', amount: '260.00' }]);
  });

  it('is empty for an answer it cannot read', () => {
    expect(readProblemDetail(null)).toEqual({ problems: [], duplicateCards: [] });
    expect(readProblemDetail({ problems: 'x', duplicate_cards: {} })).toEqual({ problems: [], duplicateCards: [] });
    expect(readProblemDetail({ problems: [{ title: 'בלי תיאור' }, null] }).problems).toEqual([]);
  });

  it('marks the rows of the other card', () => {
    expect(fromOtherCard([{ id: 'p1' }])).toEqual([{ id: 'p1', from_other_card: true }]);
  });
});

describe('the refund window', () => {
  it('reads a monthly charge with a standing order behind it', () => {
    const info = readRefundInfo({
      refundable: true, blocked_reason: '', declined: false,
      standing_orders: [{ id: 'r1', amount: '260.00', next_billing_date: '2026-11-01', course_name: 'קפואירה' }],
    });

    expect(info.refundable).toBe(true);
    expect(info.standingOrders).toEqual([
      { id: 'r1', amount: 260, nextBillingDate: '2026-11-01', courseName: 'קפואירה' },
    ]);
    expect(standingOrderLeftAloneNote(info))
      .toBe('בלי הסימון הוראת הקבע נשארת פעילה: החיוב הבא (₪260) ירד ב־1.11.2026.');
  });

  it('says why a declined charge cannot be refunded', () => {
    const info = readRefundInfo({
      refundable: false, declined: true,
      blocked_reason: 'החיוב הזה נדחה בטרנזילה ולא נגבה — אין מה לזכות (קוד 141).',
      standing_orders: [],
    });

    expect(info.refundable).toBe(false);
    expect(info.declined).toBe(true);
    expect(info.blockedReason).toContain('נדחה בטרנזילה');
  });

  it('never blocks a refund over an answer it cannot read', () => {
    expect(readRefundInfo(undefined)).toEqual({
      refundable: true, blockedReason: '', declined: false, standingOrders: [],
    });
    expect(standingOrderLeftAloneNote(readRefundInfo({}))).toBe('');
  });

  it('adds the two orders of a bundle together', () => {
    const note = standingOrderLeftAloneNote({
      standingOrders: [
        { id: 'a', amount: 200, nextBillingDate: '2026-12-01', courseName: '' },
        { id: 'b', amount: 150.5, nextBillingDate: null, courseName: '' },
      ],
    });

    expect(note).toBe('בלי הסימון הוראת הקבע נשארת פעילה: החיוב הבא (₪350.5) ירד ב־1.12.2026.');
  });

  it('sends the field only when the box is ticked', () => {
    expect(refundRequestBody(null, 'זיכוי מלא')).toEqual({ amount: null, reason: 'זיכוי מלא' });
    expect(refundRequestBody(120, 'חלקי', false)).toEqual({ amount: 120, reason: 'חלקי' });
    expect(refundRequestBody(null, 'עזב', true)).toEqual({ amount: null, reason: 'עזב', cancel_standing_order: true });
  });
});
