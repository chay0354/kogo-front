import { describe, expect, test } from 'vitest';

import {
  dropOptimistic,
  firstServerMessageId,
  groupMessagesByDay,
  isOptimistic,
  lastServerMessageId,
  makeOptimisticMessage,
  mergeMessages,
  newMessages,
  settleOptimistic,
} from './messages';
import { makeMessage } from './testFixtures';

const ids = (list: Array<{ id: number }>) => list.map((message) => message.id);
const at = (day: string, time: string) => `2026-10-${day}T${time}:00+03:00`;

describe('mergeMessages', () => {
  test('new messages are added at the bottom, old to new', () => {
    const existing = [makeMessage(1, { sent_at: at('08', '09:00') }), makeMessage(2, { sent_at: at('08', '09:05') })];
    const incoming = [makeMessage(3, { sent_at: at('08', '09:10') }), makeMessage(4, { sent_at: at('08', '09:12') })];
    expect(ids(mergeMessages(existing, incoming))).toEqual([1, 2, 3, 4]);
  });

  test('a message that arrives twice is drawn once', () => {
    const existing = [makeMessage(1), makeMessage(2, { sent_at: at('08', '09:05') })];
    const incoming = [makeMessage(2, { sent_at: at('08', '09:05') }), makeMessage(3, { sent_at: at('08', '09:10') })];
    expect(ids(mergeMessages(existing, incoming))).toEqual([1, 2, 3]);
  });

  test('the later copy wins, so a status that changed is shown', () => {
    const existing = [makeMessage(5, { direction: 'out', sender: 'office', status: 'sent' })];
    const incoming = [makeMessage(5, { direction: 'out', sender: 'office', status: 'failed', error: 'לא נמצא' })];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ status: 'failed', error: 'לא נמצא' });
  });

  test('earlier messages loaded later take their place above', () => {
    const existing = [makeMessage(10, { sent_at: at('08', '09:00') }), makeMessage(11, { sent_at: at('08', '09:05') })];
    const older = [makeMessage(8, { sent_at: at('07', '18:00') }), makeMessage(9, { sent_at: at('07', '18:30') })];
    expect(ids(mergeMessages(existing, older))).toEqual([8, 9, 10, 11]);
  });

  test('order follows the time sent, and the id only settles a tie', () => {
    const merged = mergeMessages(
      [],
      [
        makeMessage(7, { sent_at: at('08', '09:00') }),
        makeMessage(6, { sent_at: at('08', '09:00') }),
        makeMessage(9, { sent_at: at('08', '08:00') }),
      ],
    );
    expect(ids(merged)).toEqual([9, 6, 7]);
  });

  test('nothing new returns the very same list, so nothing is drawn again', () => {
    const existing = [makeMessage(1)];
    expect(mergeMessages(existing, [])).toBe(existing);
  });

  test('a message still being sent stays last, whatever the clocks say', () => {
    const typed = makeOptimisticMessage('בדרך', -5, new Date('2026-10-08T06:00:00Z'));
    const merged = mergeMessages([makeMessage(1, { sent_at: at('08', '09:00') }), typed], [
      makeMessage(2, { sent_at: at('08', '09:30') }),
    ]);
    expect(ids(merged)).toEqual([1, 2, -5]);
  });
});

describe('newMessages', () => {
  test('returns only what the conversation did not hold', () => {
    const existing = [makeMessage(1), makeMessage(2)];
    expect(ids(newMessages(existing, [makeMessage(2), makeMessage(3)]))).toEqual([3]);
  });
});

describe('asking for more by id', () => {
  const messages = [
    makeMessage(12),
    makeMessage(15),
    makeOptimisticMessage('בדרך', -1_700_000_000_000, new Date('2026-10-08T07:00:00Z')),
    makeMessage(14),
  ];

  test('"anything after?" uses the highest id the server gave, never a made-up one', () => {
    expect(lastServerMessageId(messages)).toBe(15);
  });

  test('"anything before?" uses the lowest id the server gave', () => {
    expect(firstServerMessageId(messages)).toBe(12);
  });

  test('a conversation with no message from the server has no id to ask with', () => {
    expect(lastServerMessageId([])).toBeNull();
    expect(firstServerMessageId([makeOptimisticMessage('א', -3, new Date())])).toBeNull();
  });
});

describe('a message the office just typed', () => {
  const now = new Date('2026-10-08T07:00:00Z');

  test('is an outgoing office message marked as on its way', () => {
    const typed = makeOptimisticMessage('שלום', -1, now, 'דור');
    expect(typed).toMatchObject({
      id: -1,
      direction: 'out',
      sender: 'office',
      sender_name: 'דור',
      text: 'שלום',
      local_state: 'sending',
    });
    expect(isOptimistic(typed)).toBe(true);
    expect(isOptimistic(makeMessage(4))).toBe(false);
  });

  test('is replaced by what the server stored', () => {
    const typed = makeOptimisticMessage('שלום', -1, now);
    const saved = makeMessage(20, { direction: 'out', sender: 'office', status: 'sent', text: 'שלום', sent_at: at('08', '10:00') });
    const settled = settleOptimistic([makeMessage(19, { sent_at: at('08', '09:59') }), typed], -1, saved);
    expect(ids(settled)).toEqual([19, 20]);
    expect(settled[1].local_state).toBeUndefined();
  });

  test('never leaves two bubbles when the live poll brought the stored message first', () => {
    const typed = makeOptimisticMessage('שלום', -1, now);
    const saved = makeMessage(20, { direction: 'out', sender: 'office', status: 'sent', sent_at: at('08', '10:00') });
    const settled = settleOptimistic([saved, typed], -1, saved);
    expect(ids(settled)).toEqual([20]);
  });

  test('is taken away when the send was refused', () => {
    const typed = makeOptimisticMessage('שלום', -1, now);
    expect(ids(dropOptimistic([makeMessage(19), typed], -1))).toEqual([19]);
  });
});

describe('groupMessagesByDay', () => {
  const now = new Date('2026-10-08T12:00:00+03:00');

  test('cuts the conversation into days, oldest first, and names today and yesterday', () => {
    const days = groupMessagesByDay(
      [
        makeMessage(1, { sent_at: at('05', '10:00') }),
        makeMessage(2, { sent_at: at('07', '21:00') }),
        makeMessage(3, { sent_at: at('07', '21:30') }),
        makeMessage(4, { sent_at: at('08', '08:00') }),
      ],
      now,
    );
    expect(days.map((day) => day.key)).toEqual(['2026-10-05', '2026-10-07', '2026-10-08']);
    expect(days.map((day) => ids(day.messages))).toEqual([[1], [2, 3], [4]]);
    expect(days[1].label).toBe('אתמול');
    expect(days[2].label).toBe('היום');
    expect(days[0].label).toContain('5.10.2026');
  });

  test('a day is a day in Israel: 23:30 and 00:30 are two days', () => {
    const days = groupMessagesByDay(
      [
        makeMessage(1, { sent_at: '2026-10-07T20:30:00Z' }), // 23:30 in Israel
        makeMessage(2, { sent_at: '2026-10-07T21:30:00Z' }), // 00:30 the next day in Israel
      ],
      now,
    );
    expect(days.map((day) => day.key)).toEqual(['2026-10-07', '2026-10-08']);
  });

  test('an empty conversation has no days', () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });
});
