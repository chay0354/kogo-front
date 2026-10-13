/**
 * A conversation that has waited for a person more than three office hours
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.2): it is pinned to the head of the list, in the server's own
 * order, and its mark pulses. The counting is the server's; here is only what the screen does with it.
 */
import { describe, expect, it } from 'vitest';
import { readLeadRow } from './leadsV2';
import { mergeLiveContacts, sameBoxCounts, sortChats } from './live';
import {
  OVERDUE_LIMIT,
  applyOverdue,
  chatWaitTag,
  comparePinned,
  knowsOverdue,
  leadWaitTag,
  overdueHeadCount,
  personWaitTag,
  pinnedCount,
  readOverdueRows,
  sameOverdueRows,
  sinceWords,
} from './overdue';
import { makeContact } from './testFixtures';
import type { WahubContact, WahubOverdueRow } from '@/types/wahub';

/** Tuesday, 13.10.2026, 14:30 in Israel. */
const NOW = new Date('2026-10-13T11:30:00Z');

/** A conversation of a server that knows ט.2: it marks `overdue` on every one. */
function chat(id: number, over: { last?: string; overdue?: boolean; from?: string | null; label?: string; minutes?: number | null; since?: string | null } = {}): WahubContact {
  return makeContact(id, {
    last_message_at: over.last ?? '2026-10-13T08:00:00+00:00',
    chat: {
      open: true,
      overdue: over.overdue ?? false,
      waiting_label: over.label ?? '',
      waiting_from: over.from ?? null,
      waited_office_minutes: over.minutes ?? null,
      waiting_since: over.since ?? null,
    },
  });
}

const late = (id: number, from: string, label = 'מחכה 3:20 שע׳', last?: string) => chat(id, { overdue: true, from, label, minutes: 200, last });
const ids = (list: ReadonlyArray<WahubContact>) => list.map((contact) => contact.id);

describe('the order of the list (ט.2.4)', () => {
  it('whoever is past the line stands first — the longest wait at the head — and the rest by the last message', () => {
    const list = [
      chat(1, { last: '2026-10-13T11:00:00+00:00' }),
      late(2, '2026-10-13T08:10:00+00:00', 'מחכה 3:20 שע׳', '2026-10-13T08:10:00+00:00'),
      chat(3, { last: '2026-10-13T11:20:00+00:00' }),
      late(4, '2026-10-12T13:00:00+00:00', 'מחכה 5:00 שע׳', '2026-10-12T13:00:00+00:00'),
    ];
    expect(ids(sortChats(list, true))).toEqual([4, 2, 3, 1]);
    // Without pinning — a search, or a caller that never asked for it — the order is the one it always was.
    expect(ids(sortChats(list))).toEqual([3, 1, 2, 4]);
  });

  it('two that wait since the same moment: the larger id first, as the server sorts them', () => {
    const same = '2026-10-13T08:10:00+00:00';
    expect(ids([late(5, same), late(9, same), late(7, same)].sort(comparePinned))).toEqual([9, 7, 5]);
  });

  it('one that is marked late with no moment to it stands after those that have one', () => {
    const list = [chat(1, { overdue: true }), late(2, '2026-10-13T08:10:00+00:00')];
    expect(ids(sortChats(list, true))).toEqual([2, 1]);
  });

  it('on a server that marks nobody, pinning changes nothing', () => {
    const list = [makeContact(1, { last_message_at: '2026-10-13T08:00:00+00:00' }), makeContact(2, { last_message_at: '2026-10-13T09:00:00+00:00' })];
    expect(ids(sortChats(list, true))).toEqual(ids(sortChats(list)));
    expect(pinnedCount(sortChats(list, true))).toBe(0);
  });

  it('a live update is merged in the same order: a conversation that was just answered goes back to its place', () => {
    const list = sortChats([late(2, '2026-10-13T08:10:00+00:00'), chat(1, { last: '2026-10-13T11:00:00+00:00' }), chat(3, { last: '2026-10-13T10:00:00+00:00' })], true);
    expect(ids(list)).toEqual([2, 1, 3]);
    // The office answered #2 (the clock stopped), and #3 crossed the three hours.
    const answered = chat(2, { last: '2026-10-13T11:29:00+00:00' });
    const crossed = late(3, '2026-10-13T08:20:00+00:00', 'מחכה 3:01 שע׳', '2026-10-13T10:00:00+00:00');
    const merged = mergeLiveContacts(list, [answered, crossed], { accepts: () => true, pin: true });
    expect(ids(merged.list)).toEqual([3, 2, 1]);
    expect(pinnedCount(merged.list)).toBe(1);
    // While a search is on nobody is pinned.
    expect(ids(mergeLiveContacts(list, [answered, crossed], { accepts: () => true }).list)).toEqual([2, 1, 3]);
  });
});

describe('how many stand pinned, and the number the quiet line says', () => {
  const list = sortChats([late(2, '2026-10-13T08:10:00+00:00'), late(4, '2026-10-12T13:00:00+00:00'), chat(1), chat(3)], true);

  it('the conversations at the head of the list that are past the line', () => {
    expect(pinnedCount(list)).toBe(2);
    expect(pinnedCount([])).toBe(0);
    expect(pinnedCount([chat(1), late(2, '2026-10-13T08:10:00+00:00')])).toBe(0);
  });

  it('the number is the conversations under the line', () => {
    expect(overdueHeadCount(2, 'open', { overdue: 2 }, false)).toBe(2);
    // A box that holds only some of them says how many it holds, whatever the server counts in all.
    expect(overdueHeadCount(1, 'needs_human', { overdue: 5 }, true)).toBe(1);
    expect(overdueHeadCount(2, 'open', null, true)).toBe(2);
  });

  it('…unless more of them are a "load more" away, in a box that holds them all: then the server\'s own count', () => {
    expect(overdueHeadCount(40, 'open', { overdue: 52 }, true)).toBe(52);
    expect(overdueHeadCount(40, 'all', { overdue: 52 }, true)).toBe(52);
    expect(overdueHeadCount(40, 'open', { overdue: 52 }, false)).toBe(40);
  });
});

describe('what the poll says (ט.2.5)', () => {
  it('`overdue` is read row by row; a server that sends no list is told apart from one that names nobody', () => {
    expect(readOverdueRows(undefined)).toBeUndefined();
    expect(readOverdueRows(null)).toBeUndefined();
    expect(readOverdueRows([])).toEqual([]);
    expect(
      readOverdueRows([
        { id: 12, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' },
        { id: 12, waited_office_minutes: 1 },
        { id: 'x' },
        null,
        { id: 40, waiting_label: 'מחכה 3:03 שע׳', waiting_from: 'מזמן' },
      ]),
    ).toEqual([
      { id: 12, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' },
      { id: 40, waited_office_minutes: null, waiting_label: 'מחכה 3:03 שע׳', waiting_from: null },
    ]);
  });

  it('a poll that changed nothing is the same list, so nothing is drawn again', () => {
    const rows: WahubOverdueRow[] = [{ id: 12, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' }];
    expect(sameOverdueRows(rows, rows.map((row) => ({ ...row })))).toBe(true);
    expect(sameOverdueRows(rows, [{ ...rows[0], waiting_label: 'מחכה 3:36 שע׳' }])).toBe(false);
    expect(sameOverdueRows(rows, [])).toBe(false);
    expect(sameOverdueRows(null, [])).toBe(false);
    expect(sameOverdueRows(null, null)).toBe(true);
  });

  it('`boxes.overdue` is one of the counts: a change in it alone is a change', () => {
    const boxes = { all: 9, waiting: 1, needs_human: 1, unread: 0, human: 2, bot: 7, open: 3, future: 0 };
    expect(sameBoxCounts({ ...boxes, overdue: 1 }, { ...boxes, overdue: 2 })).toBe(false);
    expect(sameBoxCounts({ ...boxes, overdue: 1 }, { ...boxes, overdue: 1 })).toBe(true);
    expect(sameBoxCounts(boxes, boxes)).toBe(true);
  });

  it('a conversation crosses the three hours with nobody touching it: the poll names it, and it is marked — with the fresh words', () => {
    const waiting = chat(12, { label: 'מחכה 2:58 שע׳', from: '2026-10-13T08:10:00+00:00', minutes: 178 });
    const other = chat(13);
    const list = [other, waiting];
    const laid = applyOverdue(list, [{ id: 12, waited_office_minutes: 181, waiting_label: 'מחכה 3:01 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' }]);
    expect(laid).not.toBe(list);
    expect(laid[1].chat).toMatchObject({ overdue: true, waiting_label: 'מחכה 3:01 שע׳', waited_office_minutes: 181 });
    // The row that did not change is the very same object: only what moved is drawn again.
    expect(laid[0]).toBe(other);
    // …and put in the server's order, it rises to the head of the list.
    expect(ids(sortChats(laid, true))).toEqual([12, 13]);
  });

  it('the same answer again changes nothing — the list is handed back as it was', () => {
    const list = [late(12, '2026-10-13T08:10:00+00:00', 'מחכה 3:01 שע׳'), chat(13)];
    const rows = [{ id: 12, waited_office_minutes: 200, waiting_label: 'מחכה 3:01 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' }];
    expect(applyOverdue(list, rows)).toBe(list);
    // A minute later the words moved: only that row is new.
    const next = applyOverdue(list, [{ ...rows[0], waited_office_minutes: 201, waiting_label: 'מחכה 3:02 שע׳' }]);
    expect(next[0].chat.waiting_label).toBe('מחכה 3:02 שע׳');
    expect(next[1]).toBe(list[1]);
  });

  it('somebody who was past the line and is no longer named goes back to their place', () => {
    const list = [late(12, '2026-10-13T08:10:00+00:00'), chat(13, { last: '2026-10-13T11:00:00+00:00' })];
    const laid = applyOverdue(list, []);
    expect(laid[0].chat.overdue).toBe(false);
    expect(pinnedCount(sortChats(laid, true))).toBe(0);
    expect(ids(sortChats(laid, true))).toEqual([13, 12]);
  });

  it('a full answer may have left some out: nobody is un-marked on its word', () => {
    const list = [late(999, '2026-10-01T08:10:00+00:00')];
    const full: WahubOverdueRow[] = Array.from({ length: OVERDUE_LIMIT }, (_, index) => ({ id: index + 1, waited_office_minutes: 200, waiting_label: 'מחכה 3:20 שע׳', waiting_from: null }));
    expect(applyOverdue(list, full)).toBe(list);
  });

  it('a contact whose save is on its way is left alone', () => {
    const list = [late(12, '2026-10-13T08:10:00+00:00'), chat(13)];
    expect(applyOverdue(list, [], { skip: (id) => id === 12 })).toBe(list);
    expect(applyOverdue(list, [{ id: 13, waited_office_minutes: 181, waiting_label: 'מחכה 3:01 שע׳', waiting_from: null }], { skip: (id) => id === 13 })[1]).toBe(list[1]);
  });

  it('a conversation the list has not read is not invented: only what is on screen is touched', () => {
    const list = [chat(13)];
    expect(applyOverdue(list, [{ id: 77, waited_office_minutes: 300, waiting_label: 'מחכה 5:00 שע׳', waiting_from: null }])).toBe(list);
  });

  it('a contact from a server built before all this is never marked, whatever a list says', () => {
    const list = [makeContact(12)];
    expect(applyOverdue(list, [{ id: 12, waited_office_minutes: 300, waiting_label: 'מחכה 5:00 שע׳', waiting_from: null }])).toBe(list);
    expect(knowsOverdue(list[0])).toBe(false);
  });
});

describe('the mark: how long they wait', () => {
  it('the server\'s own words whenever the conversation waits for a person — and past three office hours it pulses', () => {
    expect(chatWaitTag(chat(1, { label: 'מחכה 40 דק׳', from: '2026-10-13T10:50:00+00:00' }).chat, NOW)).toEqual({ label: 'מחכה 40 דק׳', overdue: false, title: 'מאז 13:50 · נספרות שעות המשרד בלבד' });
    expect(chatWaitTag(late(1, '2026-10-12T13:00:00+00:00').chat, NOW)).toEqual({ label: 'מחכה 3:20 שע׳', overdue: true, title: 'מאז אתמול 16:00 · נספרות שעות המשרד בלבד' });
  });

  it('the words of the night are the server\'s too: "כתב מחוץ לשעות המשרד" is shown as it is, and does not pulse', () => {
    expect(chatWaitTag(chat(1, { label: 'כתב מחוץ לשעות המשרד', from: '2026-10-12T17:00:00+00:00', minutes: 0 }).chat, NOW)).toMatchObject({ label: 'כתב מחוץ לשעות המשרד', overdue: false });
  });

  it('a conversation the bot handles has no such words: the mark is the screen\'s ordinary one, by the clock on the wall — and never pulses', () => {
    const botChat = chat(1, { since: '2026-10-13T06:30:00+00:00' }).chat;
    expect(chatWaitTag(botChat, NOW)).toEqual({ label: 'מחכה 5 שעות', overdue: false, title: '' });
    // …and it is not a mark of somebody who waits for a person: the head of the conversation carries none.
    expect(personWaitTag(botChat, NOW)).toBeNull();
    expect(chatWaitTag(chat(1).chat, NOW)).toBeNull();
  });

  it('on a server built before it the mark is exactly the one it always was', () => {
    const old = makeContact(1, { chat: { waiting_since: '2026-10-13T11:18:00+00:00' } }).chat;
    expect(chatWaitTag(old, NOW)).toEqual({ label: 'מחכה 12 דק׳', overdue: false, title: '' });
    expect(personWaitTag(old, NOW)).toBeNull();
    expect(chatWaitTag(makeContact(1).chat, NOW)).toBeNull();
  });

  it('marked late with its words still on their way: it stands out all the same', () => {
    const tag = chatWaitTag(chat(1, { overdue: true, from: '2026-10-13T08:10:00+00:00' }).chat, NOW);
    expect(tag).toMatchObject({ overdue: true });
    expect(tag?.label).toBeTruthy();
  });

  it('"since when", for whoever hovers', () => {
    expect(sinceWords('2026-10-13T08:10:00+00:00', NOW)).toBe('מאז 11:10');
    expect(sinceWords('2026-10-12T13:00:00+00:00', NOW)).toBe('מאז אתמול 16:00');
    expect(sinceWords('2026-10-08T14:00:00+00:00', NOW)).toBe('מאז יום ה׳ 17:00');
    expect(sinceWords('2026-09-30T14:00:00+00:00', NOW)).toBe('מאז 30.9 17:00');
    expect(sinceWords(null, NOW)).toBe('');
    expect(sinceWords('לא תאריך', NOW)).toBe('');
  });
});

describe('a row of the leads (ט.2.3: the four fields stand on the row)', () => {
  const row = (over: Record<string, unknown> = {}) =>
    readLeadRow({ contact_id: 7, name: 'דנה לוי', phone: '972500000007', stage: 'needs_reply', owner: 'office', summary: '', chips: {}, next: {}, ...over })!;

  it('read only when the server sends them', () => {
    expect(row().overdue).toBeUndefined();
    expect(leadWaitTag(row(), NOW)).toBeNull();
    const lead = row({ overdue: true, waited_office_minutes: 200, waiting_label: 'מחכה 3:20 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' });
    expect(lead).toMatchObject({ overdue: true, waited_office_minutes: 200, waiting_label: 'מחכה 3:20 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' });
    expect(leadWaitTag(lead, NOW)).toEqual({ label: 'מחכה 3:20 שע׳', overdue: true, title: 'מאז 11:10 · נספרות שעות המשרד בלבד' });
  });

  it('a lead that does not wait for a person carries no mark — the row is what it was', () => {
    expect(leadWaitTag(row({ overdue: false, waited_office_minutes: null, waiting_label: '', waiting_from: null }), NOW)).toBeNull();
  });

  it('waiting, and not yet three hours: the words, and no pulse', () => {
    expect(leadWaitTag(row({ overdue: false, waited_office_minutes: 40, waiting_label: 'מחכה 40 דק׳', waiting_from: null }), NOW)).toEqual({ label: 'מחכה 40 דק׳', overdue: false, title: '' });
  });
});
