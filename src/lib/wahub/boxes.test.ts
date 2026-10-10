import { describe, expect, test } from 'vitest';

import {
  CHAT_BOXES,
  LEAD_QUEUES,
  badgeText,
  boxCount,
  isHiddenLead,
  labelOptions,
  learnLabels,
  matchesBox,
  matchesLeadView,
  matchesQueue,
  menuBadgeCount,
  queueCount,
  queueDef,
  TOPIC_LABELS,
} from './boxes';
import { makeContact } from './testFixtures';

describe('the boxes above the conversations', () => {
  test('are the five the screen offers, in order, each with its Hebrew name', () => {
    expect(CHAT_BOXES.map((box) => [box.key, box.label])).toEqual([
      ['all', 'הכול'],
      ['needs_human', 'מבקשים נציג'],
      ['human', 'בטיפול נציג'],
      ['waiting', 'מחכים לתשובה'],
      ['unread', 'לא נקראו'],
    ]);
  });

  test('a contact is placed by the same facts the server uses', () => {
    const quiet = makeContact(1);
    const waiting = makeContact(2, { chat: { waiting_since: '2026-10-08T09:00:00+03:00' } });
    const asks = makeContact(3, { chat: { needs_human: true } });
    const unread = makeContact(4, { chat: { unread_count: 2 } });
    const taken = makeContact(5, { chat: { handled_by: 'human' } });

    expect([quiet, waiting, asks, unread, taken].every((contact) => matchesBox(contact, 'all'))).toBe(true);
    expect([quiet, waiting, asks, unread, taken].map((contact) => matchesBox(contact, 'waiting'))).toEqual([
      false, true, false, false, false,
    ]);
    expect(matchesBox(asks, 'needs_human')).toBe(true);
    expect(matchesBox(quiet, 'needs_human')).toBe(false);
    expect(matchesBox(unread, 'unread')).toBe(true);
    expect(matchesBox(quiet, 'unread')).toBe(false);
    expect(matchesBox(taken, 'human')).toBe(true);
    expect(matchesBox(taken, 'bot')).toBe(false);
    expect(matchesBox(quiet, 'bot')).toBe(true);
  });

  test('a count that the server did not send reads as unknown, not as zero', () => {
    expect(boxCount({ all: 7, waiting: 0 }, 'waiting')).toBe(0);
    expect(boxCount({ all: 7 }, 'waiting')).toBeNull();
    expect(boxCount(null, 'all')).toBeNull();
  });
});

describe('the queues of the leads tab', () => {
  test('are the eight the screen offers, opening on "הכול"', () => {
    expect(LEAD_QUEUES.map((queue) => [queue.key, queue.label])).toEqual([
      ['all', 'הכול'],
      ['due', 'לחזור אליהם'],
      ['none', 'עוד לא פנינו'],
      ['no_answer', 'לא ענו לנו'],
      ['answered', 'בשיחה'],
      ['later', 'בזמן אחר'],
      ['registered', 'נרשמו'],
      ['not_relevant', 'לא רלוונטי'],
    ]);
    expect(queueDef('all').label).toBe('הכול');
  });

  test('each mark leads to its own queue', () => {
    expect(matchesQueue(makeContact(1), 'none')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'answered' } }), 'none')).toBe(false);
    expect(matchesQueue(makeContact(1, { followup: { status: 'no_answer' } }), 'no_answer')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'answered' } }), 'answered')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'later' } }), 'later')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'registered' } }), 'registered')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'not_relevant' } }), 'not_relevant')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'registered' } }), 'answered')).toBe(false);
  });

  test('"לחזור אליהם" is whatever the server says is due', () => {
    expect(matchesQueue(makeContact(1, { followup: { status: 'answered', is_due: true } }), 'due')).toBe(true);
    expect(matchesQueue(makeContact(1, { followup: { status: 'waiting_us', is_due: false } }), 'due')).toBe(false);
  });

  test('the hidden count is read beside the queues', () => {
    expect(queueCount({ all: 10, hidden: 4 } as never, 'hidden')).toBe(4);
    expect(queueCount(undefined, 'due')).toBeNull();
  });
});

describe('who is shown in the leads tab', () => {
  const view = { queue: 'all' as const, showHidden: false, filters: {} };

  test('registered customers and people waiting for their trial are hidden by default', () => {
    const customer = makeContact(1, { kogo: { outcome: 'registered_after', hidden_by_default: true } });
    expect(isHiddenLead(customer)).toBe(true);
    expect(matchesLeadView(customer, view)).toBe(false);
    expect(matchesLeadView(customer, { ...view, showHidden: true })).toBe(true);
  });

  test('an ordinary lead is shown', () => {
    expect(matchesLeadView(makeContact(2, { kogo: { outcome: 'trial_only' } }), view)).toBe(true);
  });

  test('each filter narrows by its own field', () => {
    const lead = makeContact(3, {
      known: { topic: 'trial', interest: 'warm', branch_id: 3, flags: ['price'] },
      kogo: { outcome: 'trial_only' },
      tags: [{ id: 9, name: 'חם', color: '#f00' }],
    });
    const withFilters = (filters: Record<string, string>) => matchesLeadView(lead, { ...view, filters });
    expect(withFilters({ topic: 'trial', interest: 'warm', branch: '3', outcome: 'trial_only', tag: '9', flag: 'price' })).toBe(true);
    expect(withFilters({ topic: 'info' })).toBe(false);
    expect(withFilters({ interest: 'hot' })).toBe(false);
    expect(withFilters({ branch: '4' })).toBe(false);
    expect(withFilters({ outcome: 'not_found' })).toBe(false);
    expect(withFilters({ tag: '1' })).toBe(false);
    expect(withFilters({ flag: 'complaint' })).toBe(false);
  });

  test('the queue on screen counts too', () => {
    const lead = makeContact(4, { followup: { status: 'answered' } });
    expect(matchesLeadView(lead, { ...view, queue: 'answered' })).toBe(true);
    expect(matchesLeadView(lead, { ...view, queue: 'none' })).toBe(false);
  });

  test('a text search cannot be answered on the screen', () => {
    expect(matchesLeadView(makeContact(5), { ...view, filters: { search: 'דנה' } })).toBeNull();
  });
});

describe('the number beside the menu entry', () => {
  test('is the people waiting plus the people asking for a person', () => {
    expect(menuBadgeCount({ waiting: 3, needs_human: 2 })).toBe(2);
  });

  test('is nothing when nobody waits, or when the server has not answered', () => {
    expect(menuBadgeCount({ waiting: 0, needs_human: 0 })).toBe(0);
    expect(menuBadgeCount(undefined)).toBe(0);
    expect(menuBadgeCount(null)).toBe(0);
    expect(badgeText(0)).toBe('');
  });

  test('reads short', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(140)).toBe('99+');
  });
});

describe('filter options', () => {
  test('the server\'s own wording replaces the built-in name once a contact brought it', () => {
    const learned = learnLabels([
      makeContact(1, { known: { topic: 'trial', topic_label: 'ניסיון' }, kogo: { outcome: 'pending', outcome_label: 'בתהליך' } }),
      makeContact(2, { known: { interest: 'hot', interest_label: 'רותח' } }),
    ]);
    expect(learned.topic).toEqual({ trial: 'ניסיון' });
    expect(learned.interest).toEqual({ hot: 'רותח' });
    expect(learned.outcome).toEqual({ pending: 'בתהליך' });
    const options = labelOptions(TOPIC_LABELS, learned.topic);
    expect(options.map((option) => option.value)).toEqual(['trial', 'registration', 'info', 'other']);
    expect(options[0].label).toBe('ניסיון');
    expect(options[1].label).toBe(TOPIC_LABELS.registration);
  });
});
