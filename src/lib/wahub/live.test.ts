import { describe, expect, test } from 'vitest';

import { matchesBox } from './boxes';
import { applyFollowupPatch, toggleFollowup } from './followup';
import {
  appendPage,
  dedupeContacts,
  isBatchTruncated,
  logMoved,
  longestWaiting,
  mergeContactIntoDetail,
  mergeLiveContacts,
  messagesMoved,
  patchContactsInPlace,
  replaceContactInPlace,
  sameBoxCounts,
  sortChats,
} from './live';
import { makeContact, makeMessage } from './testFixtures';

const at = (time: string) => `2026-10-08T${time}:00+03:00`;
const ids = (list: Array<{ id: number }>) => list.map((contact) => contact.id);
const everything = () => true;

describe('sortChats', () => {
  test('puts the last message first', () => {
    const list = [
      makeContact(1, { last_message_at: at('09:00') }),
      makeContact(2, { last_message_at: at('11:00') }),
      makeContact(3, { last_message_at: at('10:00') }),
    ];
    expect(ids(sortChats(list))).toEqual([2, 3, 1]);
  });

  test('breaks a tie by the higher id, as the server does (-last_message_at, -id)', () => {
    const list = [makeContact(4, { last_message_at: at('09:00') }), makeContact(9, { last_message_at: at('09:00') })];
    expect(ids(sortChats(list))).toEqual([9, 4]);
  });

  test('a contact that never had a message goes last', () => {
    const list = [
      makeContact(1, { last_message_at: null }),
      makeContact(2, { last_message_at: at('08:00') }),
      makeContact(3, { last_message_at: null }),
    ];
    expect(ids(sortChats(list))).toEqual([2, 3, 1]);
  });

  test('does not change the list it was given', () => {
    const list = [makeContact(1, { last_message_at: at('09:00') }), makeContact(2, { last_message_at: at('11:00') })];
    sortChats(list);
    expect(ids(list)).toEqual([1, 2]);
  });
});

describe('mergeLiveContacts', () => {
  const base = [
    makeContact(1, { last_message_at: at('11:00') }),
    makeContact(2, { last_message_at: at('10:00') }),
    makeContact(3, { last_message_at: at('09:00') }),
  ];

  test('whoever just wrote rises to the top', () => {
    const update = makeContact(3, { last_message_at: at('12:00'), chat: { unread_count: 1 } });
    const result = mergeLiveContacts(base, [update], { accepts: everything });
    expect(ids(result.list)).toEqual([3, 1, 2]);
    expect(result.list[0].chat.unread_count).toBe(1);
  });

  test('a contact is never listed twice', () => {
    const update = makeContact(2, { last_message_at: at('12:00') });
    const result = mergeLiveContacts(base, [update, update], { accepts: everything });
    expect(ids(result.list)).toEqual([2, 1, 3]);
    expect(result.list).toHaveLength(3);
  });

  test('when an update names a contact twice, the first one (the newest) wins', () => {
    const newest = makeContact(2, { last_message_at: at('13:00'), name: 'חדש' });
    const older = makeContact(2, { last_message_at: at('12:00'), name: 'ישן' });
    const result = mergeLiveContacts(base, [newest, older], { accepts: everything });
    expect(result.list.find((contact) => contact.id === 2)?.name).toBe('חדש');
  });

  test('a new contact is added in its place by time', () => {
    const fresh = makeContact(7, { last_message_at: at('10:30') });
    const result = mergeLiveContacts(base, [fresh], { accepts: everything });
    expect(ids(result.list)).toEqual([1, 7, 2, 3]);
  });

  test('rows that did not change are the same objects, so they are not drawn again', () => {
    const update = makeContact(3, { last_message_at: at('12:00') });
    const result = mergeLiveContacts(base, [update], { accepts: everything });
    expect(result.list.find((contact) => contact.id === 1)).toBe(base[0]);
    expect(result.list.find((contact) => contact.id === 2)).toBe(base[1]);
  });

  test('a contact that no longer belongs in the box leaves it', () => {
    const waiting = [
      makeContact(1, { last_message_at: at('11:00'), chat: { waiting_since: at('11:00') } }),
      makeContact(2, { last_message_at: at('10:00'), chat: { waiting_since: at('10:00') } }),
    ];
    const answered = makeContact(1, { last_message_at: at('11:05'), chat: { waiting_since: null } });
    const result = mergeLiveContacts(waiting, [answered], { accepts: (c) => matchesBox(c, 'waiting') });
    expect(ids(result.list)).toEqual([2]);
    expect(result.removed).toBe(1);
  });

  test('the open conversation stays in the list even when it no longer belongs', () => {
    const waiting = [makeContact(1, { last_message_at: at('11:00'), chat: { waiting_since: at('11:00') } })];
    const answered = makeContact(1, { last_message_at: at('11:05'), chat: { waiting_since: null } });
    const result = mergeLiveContacts(waiting, [answered], {
      accepts: (c) => matchesBox(c, 'waiting'),
      keepIds: new Set([1]),
    });
    expect(ids(result.list)).toEqual([1]);
    expect(result.removed).toBe(0);
    expect(result.list[0].chat.waiting_since).toBeNull();
  });

  test('a contact that does not belong in the box is not added', () => {
    const quiet = makeContact(8, { last_message_at: at('12:00') });
    const result = mergeLiveContacts(base, [quiet], { accepts: (c) => matchesBox(c, 'needs_human') });
    expect(ids(result.list)).toEqual([1, 2, 3]);
  });

  test('under a text search an unknown contact is counted, not inserted', () => {
    const fresh = makeContact(7, { last_message_at: at('12:00') });
    const known = makeContact(2, { last_message_at: at('12:30') });
    const result = mergeLiveContacts(base, [fresh, known], { accepts: everything, insertUnknown: false });
    expect(ids(result.list)).toEqual([2, 1, 3]);
    expect(result.unplaced).toBe(1);
  });

  test('an empty update keeps the order as it was', () => {
    const result = mergeLiveContacts(base, [], { accepts: everything });
    expect(ids(result.list)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ removed: 0, unplaced: 0 });
  });
});

describe('the leads list keeps its order', () => {
  // The server's order for leads: -last_inbound_at, -id. Nothing here re-sorts it.
  const leads = [
    makeContact(30, { last_inbound_at: at('12:00') }),
    makeContact(20, { last_inbound_at: at('11:00') }),
    makeContact(10, { last_inbound_at: at('10:00') }),
  ];

  test('a card that was marked stays exactly where it was', () => {
    const marked = applyFollowupPatch(leads[2], toggleFollowup('', 'registered'), '2026-10-08');
    const next = replaceContactInPlace(leads, marked);
    expect(ids(next)).toEqual([30, 20, 10]);
    expect(next[2].followup.status).toBe('registered');
  });

  test('it stays even when the server sends it back with a newer message time', () => {
    const saved = makeContact(10, {
      last_inbound_at: at('13:00'),
      last_message_at: at('13:00'),
      followup: { status: 'waiting_us', is_due: true },
    });
    expect(ids(replaceContactInPlace(leads, saved))).toEqual([30, 20, 10]);
  });

  test('marking several cards one after another moves none of them', () => {
    let list = leads;
    for (const contact of leads) {
      list = replaceContactInPlace(list, applyFollowupPatch(contact, toggleFollowup('', 'not_relevant'), '2026-10-08'));
    }
    expect(ids(list)).toEqual([30, 20, 10]);
    expect(list.every((contact) => contact.followup.status === 'not_relevant')).toBe(true);
  });

  test('a contact that is not in the list is not added to it', () => {
    const stranger = makeContact(99);
    expect(replaceContactInPlace(leads, stranger)).toBe(leads);
  });

  test('a live update refreshes the cards on screen in place, and adds none', () => {
    const update = [makeContact(99, { last_inbound_at: at('14:00') }), makeContact(20, { name: 'שם חדש' })];
    const next = patchContactsInPlace(leads, update);
    expect(ids(next)).toEqual([30, 20, 10]);
    expect(next[1].name).toBe('שם חדש');
  });

  test('a live update that touches no card on screen changes nothing', () => {
    expect(patchContactsInPlace(leads, [makeContact(99)])).toBe(leads);
    expect(patchContactsInPlace(leads, [])).toBe(leads);
  });
});

describe('appendPage', () => {
  test('adds only the contacts not shown yet, in the order the server sent them', () => {
    const shown = [makeContact(5), makeContact(4), makeContact(3)];
    const page = [makeContact(3, { name: 'כפול' }), makeContact(2), makeContact(1)];
    const next = appendPage(shown, page);
    expect(ids(next)).toEqual([5, 4, 3, 2, 1]);
    expect(next[2]).toBe(shown[2]);
  });

  test('a page with nothing new leaves the list as it is', () => {
    const shown = [makeContact(5), makeContact(4)];
    expect(appendPage(shown, [makeContact(4)])).toBe(shown);
  });
});

describe('dedupeContacts', () => {
  test('keeps one row per contact, the later copy', () => {
    const list = dedupeContacts([makeContact(1, { name: 'א' }), makeContact(2), makeContact(1, { name: 'ב' })]);
    expect(ids(list)).toEqual([1, 2]);
    expect(list[0].name).toBe('ב');
  });
});

describe('mergeContactIntoDetail', () => {
  const detail = {
    ...makeContact(1, { kogo: { outcome: 'trial_only', children: [{ id: 31, name: 'נועה', status: 'trial_completed', status_label: 'ביצע ניסיון' }] } }),
    messages: [makeMessage(1)],
    has_older: true,
    events: [{ id: 1, kind: 'created' as const, kind_label: 'נוצר', text: '', actor_name: '', created_at: at('08:00') }],
  };

  test('takes the newer contact and keeps the messages, the log and the children', () => {
    const next = mergeContactIntoDetail(detail, makeContact(1, { name: 'שם חדש', chat: { unread_count: 0 } }));
    expect(next.name).toBe('שם חדש');
    expect(next.messages).toBe(detail.messages);
    expect(next.events).toBe(detail.events);
    expect(next.has_older).toBe(true);
    expect(next.kogo.children).toEqual(detail.kogo.children);
  });

  test('ignores a contact that is not the one open', () => {
    expect(mergeContactIntoDetail(detail, makeContact(2))).toBe(detail);
  });
});

describe('longestWaiting', () => {
  test('orders by how long they have waited, and leaves out whoever is not waiting', () => {
    const pool = [
      makeContact(1, { chat: { waiting_since: at('11:00') } }),
      makeContact(2, { chat: { waiting_since: null } }),
      makeContact(3, { chat: { waiting_since: at('08:00') } }),
      makeContact(4, { chat: { waiting_since: at('09:30') } }),
    ];
    expect(ids(longestWaiting(pool))).toEqual([3, 4, 1]);
  });

  test('stops at the limit and never repeats a contact', () => {
    const pool = [
      makeContact(1, { chat: { waiting_since: at('08:00') } }),
      makeContact(1, { chat: { waiting_since: at('08:00') } }),
      makeContact(2, { chat: { waiting_since: at('09:00') } }),
      makeContact(3, { chat: { waiting_since: at('10:00') } }),
    ];
    expect(ids(longestWaiting(pool, 2))).toEqual([1, 2]);
  });
});

describe('counts and batches', () => {
  test('sameBoxCounts compares number by number', () => {
    const a = { all: 5, waiting: 2, needs_human: 0, unread: 1, human: 0, bot: 5 };
    expect(sameBoxCounts(a, { ...a })).toBe(true);
    expect(sameBoxCounts(a, { ...a, waiting: 3 })).toBe(false);
    expect(sameBoxCounts(null, a)).toBe(false);
    expect(sameBoxCounts(null, null)).toBe(true);
  });

  test('a batch of a hundred may have left some out', () => {
    expect(isBatchTruncated(new Array(100).fill(0))).toBe(true);
    expect(isBatchTruncated(new Array(99).fill(0))).toBe(false);
  });
});

describe('what a newer copy of the open contact asks the conversation to do', () => {
  const held = makeContact(1, { messages_count: 4, last_message_at: at('09:00'), tags: [{ id: 2, name: 'א', color: '' }] });

  test('a message that came or went means: ask for messages', () => {
    expect(messagesMoved(held, makeContact(1, { messages_count: 5, last_message_at: at('09:01') }))).toBe(true);
    expect(messagesMoved(held, { ...held })).toBe(false);
  });

  test('a mark, a tag, a re-check, a handover or a summary means: read the log again', () => {
    expect(logMoved(held, { ...held })).toBe(false);
    expect(logMoved(held, { ...held, followup: { ...held.followup, status: 'answered' } })).toBe(true);
    expect(logMoved(held, { ...held, followup: { ...held.followup, note: 'חדש' } })).toBe(true);
    expect(logMoved(held, { ...held, tags: [] })).toBe(true);
    expect(logMoved(held, { ...held, kogo: { ...held.kogo, checked_at: at('10:00') } })).toBe(true);
    expect(logMoved(held, { ...held, chat: { ...held.chat, handled_by: 'human' } })).toBe(true);
    expect(logMoved(held, { ...held, chat: { ...held.chat, needs_human: true } })).toBe(true);
    expect(logMoved(held, { ...held, known: { ...held.known, analyzed_at: at('10:00') } })).toBe(true);
  });

  test('being read, or a new unread count, is not a reason to read the log', () => {
    expect(logMoved(held, { ...held, chat: { ...held.chat, unread_count: 3 } })).toBe(false);
  });

  test('the same tags in another order are the same tags', () => {
    const two = makeContact(1, { tags: [{ id: 2, name: 'א', color: '' }, { id: 5, name: 'ב', color: '' }] });
    const swapped = { ...two, tags: [two.tags[1], two.tags[0]] };
    expect(logMoved(two, swapped)).toBe(false);
  });
});
