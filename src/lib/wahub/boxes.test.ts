import { describe, expect, test } from 'vitest';

import {
  BOX_GROUPS,
  CHAT_BOXES,
  LEAD_QUEUES,
  badgeText,
  boxCount,
  boxesInGroup,
  isHiddenLead,
  labelOptions,
  learnLabels,
  matchesBox,
  matchesLeadView,
  matchesQueue,
  menuBadgeCount,
  queueCount,
  queueDef,
  shownBox,
  TOPIC_LABELS,
} from './boxes';
import { makeContact } from './testFixtures';

describe('the boxes above the conversations', () => {
  test('are the ones the screen offers, in order, each with its Hebrew name — "פתוחות" first among the person\'s', () => {
    expect(CHAT_BOXES.map((box) => [box.key, box.label])).toEqual([
      ['all', 'הכול'],
      ['open', 'פתוחות'],
      ['needs_human', 'מבקשים נציג'],
      ['birthday', 'ברכת יום הולדת'],
      ['human', 'בטיפול נציג'],
      ['future', 'לידים עתידיים'],
      ['waiting', 'לא נענו'],
      ['unread', 'לא נפתחו'],
    ]);
    // "פתוחות" leads the person's boxes; "לידים עתידיים" closes them, quietly.
    expect(boxesInGroup('human').map((box) => box.key)).toEqual(['open', 'needs_human', 'birthday', 'human', 'future']);
    expect(CHAT_BOXES.filter((box) => box.quiet).map((box) => box.key)).toEqual(['future']);
  });

  test('the second group is "מצב השיחה" — what the conversation is waiting for, not the bot (owner, 15.10.2026)', () => {
    expect(BOX_GROUPS.map((group) => group.label)).toEqual(['', 'נציג', 'מצב השיחה']);
    const byKey = Object.fromEntries(CHAT_BOXES.map((box) => [box.key, box]));
    expect(byKey.waiting.help?.what).toBe('הלקוח כתב, ועוד **אף אחד** (לא הבוט ולא נציג) **לא ענה לו**');
    expect(byKey.unread.help?.what).toBe('הלקוח כתב, ו**אף אחד מהמשרד עוד לא פתח** את השיחה (גם אם הבוט כבר ענה)');
    // Every box a person works from has its two lines, the point in bold; "הכול" needs none.
    for (const box of CHAT_BOXES.filter((def) => def.key !== 'all')) {
      expect(box.help?.what, box.key).toMatch(/\*\*.+\*\*/);
      expect(box.help?.now, box.key).toBeTruthy();
    }
    expect(byKey.all.help).toBeUndefined();
  });

  test('"ברכת יום הולדת" is a box of the person\'s, with a clock in place of "מחכים"', () => {
    const birthday = CHAT_BOXES.find((box) => box.key === 'birthday');
    expect(birthday).toMatchObject({ group: 'human', icon: 'clock', needsCount: true });
    expect(CHAT_BOXES.filter((box) => box.icon).map((box) => box.key)).toEqual(['birthday']);
  });

  test('a server that does not count "פתוחות" is not offered the new boxes — and never before the first count', () => {
    const old = { all: 9, waiting: 1, needs_human: 2, unread: 3, human: 1, bot: 8 };
    expect(boxesInGroup('human', old).map((box) => box.key)).toEqual(['needs_human', 'human']);
    expect(boxesInGroup('human', null).map((box) => box.key)).toEqual(['needs_human', 'human']);
    // A server of 13.10 counts "פתוחות" but not "ברכת יום הולדת": that one is not offered.
    expect(boxesInGroup('human', { ...old, open: 4, future: 0 }).map((box) => box.key)).toEqual(['open', 'needs_human', 'human', 'future']);
    expect(boxesInGroup('human', { ...old, open: 4, future: 0, birthday: 1 }).map((box) => box.key)).toEqual([
      'open', 'needs_human', 'birthday', 'human', 'future',
    ]);
    expect(boxesInGroup('bot', old).map((box) => box.key)).toEqual(['waiting', 'unread']);
    expect(shownBox('birthday', { ...old, open: 4, future: 0 })).toBe('all');
    expect(shownBox('birthday', { ...old, birthday: 0 })).toBe('birthday');
  });

  test('a conversation is in "ברכת יום הולדת" while the server says it waits for the greeting', () => {
    const waits = makeContact(1, { chat: { open: true, open_reason: 'birthday', birthday_wait_since: '2026-10-15T09:00:00+03:00' } });
    const done = makeContact(2, { chat: { open: false, birthday_wait_since: null } });
    const older = makeContact(3);
    expect([waits, done, older].map((contact) => matchesBox(contact, 'birthday'))).toEqual([true, false, false]);
    // And it is open: "פתוחות" has it too.
    expect(matchesBox(waits, 'open')).toBe(true);
  });

  test('an address that asks for a box the server does not have falls back to "הכול" — it would answer with everything', () => {
    const old = { all: 9, waiting: 1, needs_human: 2, unread: 3, human: 1, bot: 8 };
    expect(shownBox('open', old)).toBe('all');
    expect(shownBox('future', old)).toBe('all');
    expect(shownBox('open', { ...old, open: 4, future: 0 })).toBe('open');
    // Nothing is known until the first counts are in hand: the box stands.
    expect(shownBox('open', null)).toBe('open');
    expect(shownBox('needs_human', old)).toBe('needs_human');
  });

  test('"פתוחות", "לידים עתידיים" and "בטיפול נציג" place a contact by the contract\'s own words', () => {
    const parkedFuture = { due: '2026-12-01', reason: 'x', by_name: 'מיכל', at: null, state: 'parked' as const, label: 'ליד עתידי', days_left: 49, muted: true };
    const open = makeContact(1, { chat: { open: true, open_reason: 'needs_human', needs_human: true } });
    const parked = makeContact(2, { chat: { open: false, handled_by: 'human' }, future: parkedFuture });
    const due = makeContact(3, { chat: { open: true, open_reason: 'future_due', handled_by: 'human' }, future: { ...parkedFuture, state: 'due' } });
    const held = makeContact(4, { chat: { open: true, open_reason: 'human', handled_by: 'human' }, future: null });
    const quiet = makeContact(5, { chat: { open: false } });

    expect([open, parked, due, held, quiet].map((contact) => matchesBox(contact, 'open'))).toEqual([true, false, true, true, false]);
    expect([open, parked, due, held, quiet].map((contact) => matchesBox(contact, 'future'))).toEqual([false, true, false, false, false]);
    // A person holds it — but a future lead that still waits for its day is not "in handling".
    expect([open, parked, due, held, quiet].map((contact) => matchesBox(contact, 'human'))).toEqual([false, false, true, true, false]);
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
