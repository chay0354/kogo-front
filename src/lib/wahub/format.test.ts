import { describe, expect, test } from 'vitest';

import {
  agoText,
  dayKey,
  dayLabel,
  dayTick,
  daysBetween,
  displayName,
  durationText,
  fillQuickReply,
  firstName,
  formatClock,
  formatDateTime,
  formatFullDate,
  formatListTime,
  formatShortDate,
  initials,
  israelToday,
  messageTypeLabel,
  plainDayLabel,
  previewText,
  waitingLabel,
  waitingMinutes,
} from './format';

const NOW = new Date('2026-10-08T12:00:00+03:00');

describe('fillQuickReply — {{first_name}}', () => {
  test('puts in the first name only', () => {
    expect(fillQuickReply('היי {{first_name}}, תודה שפנית', 'דנה כהן')).toBe('היי דנה, תודה שפנית');
  });

  test('fills every place the name is asked for', () => {
    expect(fillQuickReply('{{first_name}}! נשמח לראות את {{first_name}} אצלנו', 'יואב')).toBe(
      'יואב! נשמח לראות את יואב אצלנו',
    );
  });

  test('accepts spaces inside the braces', () => {
    expect(fillQuickReply('שלום {{ first_name }}', 'מיכל לוי')).toBe('שלום מיכל');
  });

  test('a contact with no name gets the sentence without a hole in it', () => {
    expect(fillQuickReply('היי {{first_name}}, תודה שפנית', '')).toBe('היי, תודה שפנית');
    expect(fillQuickReply('היי {{first_name}}, תודה', null)).toBe('היי, תודה');
    expect(fillQuickReply('{{first_name}}, שלום', undefined)).toBe('שלום');
  });

  test('leaves other text, and other braces, alone', () => {
    expect(fillQuickReply('המחיר 250 ₪ לחודש', 'דנה')).toBe('המחיר 250 ₪ לחודש');
    expect(fillQuickReply('שלום {{last_name}}', 'דנה כהן')).toBe('שלום {{last_name}}');
  });

  test('keeps line breaks', () => {
    expect(fillQuickReply('היי {{first_name}}\nמה שלומך?', 'רון')).toBe('היי רון\nמה שלומך?');
  });
});

describe('names', () => {
  test('firstName takes the first word', () => {
    expect(firstName('  דנה  כהן ')).toBe('דנה');
    expect(firstName('')).toBe('');
    expect(firstName(null)).toBe('');
  });

  test('a contact with no name is shown by phone', () => {
    expect(displayName({ name: 'דנה', phone: '972501234567', phone_display: '050-1234567' })).toBe('דנה');
    expect(displayName({ name: '  ', phone: '972501234567', phone_display: '050-1234567' })).toBe('050-1234567');
    expect(displayName({ name: '', phone: '972501234567', phone_display: '' })).toBe('972501234567');
  });

  test('initials are two letters, or the last two digits of a bare phone', () => {
    expect(initials({ name: 'דנה כהן', phone: '', phone_display: '' })).toBe('דכ');
    expect(initials({ name: 'יואב', phone: '', phone_display: '' })).toBe('י');
    expect(initials({ name: 'dana cohen levi', phone: '', phone_display: '' })).toBe('DC');
    expect(initials({ name: '', phone: '972501234567', phone_display: '050-1234567' })).toBe('67');
    expect(initials({ name: '', phone: '', phone_display: '' })).toBe('?');
  });
});

describe('the preview line of a conversation', () => {
  test('an incoming message is shown as it is', () => {
    expect(previewText({ text: 'כמה עולה?', direction: 'in', sender: 'customer', sent_at: '' })).toBe('כמה עולה?');
  });

  test('an outgoing message says who sent it', () => {
    expect(previewText({ text: 'שלום!', direction: 'out', sender: 'bot', sent_at: '' })).toBe('בוט: שלום!');
    expect(previewText({ text: 'חוזרים אלייך', direction: 'out', sender: 'office', sent_at: '' })).toBe('משרד: חוזרים אלייך');
  });

  test('line breaks become one line', () => {
    expect(previewText({ text: 'שלום\n\nמה  נשמע', direction: 'in', sender: 'customer', sent_at: '' })).toBe('שלום מה נשמע');
  });

  test('no message, no preview', () => {
    expect(previewText(null)).toBe('');
  });
});

describe('days and hours are Israel\'s', () => {
  test('a moment late at night in UTC is already the next day in Israel', () => {
    expect(dayKey('2026-10-07T21:30:00Z')).toBe('2026-10-08');
    expect(dayKey('2026-10-07T20:30:00Z')).toBe('2026-10-07');
    expect(israelToday(new Date('2026-10-07T22:00:00Z'))).toBe('2026-10-08');
  });

  test('winter time is two hours ahead of UTC, summer time three', () => {
    expect(formatClock('2026-01-15T10:00:00Z')).toBe('12:00');
    expect(formatClock('2026-07-15T10:00:00Z')).toBe('13:00');
  });

  test('midnight reads 00, not 24', () => {
    expect(formatClock('2026-10-07T21:05:00Z')).toBe('00:05');
  });

  test('something that is not a time gives nothing rather than "Invalid Date"', () => {
    expect(dayKey('nonsense')).toBe('');
    expect(formatClock('nonsense')).toBe('');
    expect(formatClock(null)).toBe('');
    expect(formatListTime('nonsense', NOW)).toBe('');
  });

  test('daysBetween counts whole days', () => {
    expect(daysBetween('2026-10-07', '2026-10-08')).toBe(1);
    expect(daysBetween('2026-10-08', '2026-10-08')).toBe(0);
    expect(daysBetween('2026-09-30', '2026-10-08')).toBe(8);
  });
});

describe('dates on the screen', () => {
  test('a date this year is short; another year shows its year', () => {
    expect(formatShortDate('2026-10-24', NOW)).toBe('24.10');
    expect(formatShortDate('2025-12-03', NOW)).toBe('3.12.25');
    expect(formatShortDate('2026-10-08T09:00:00+03:00', NOW)).toBe('8.10');
    expect(formatShortDate(null, NOW)).toBe('');
  });

  test('a plain date is not shifted by a time zone', () => {
    expect(formatShortDate('2026-10-01', NOW)).toBe('1.10');
    expect(formatFullDate('2026-10-01')).toBe('1.10.2026');
  });

  test('a moment in a log is date and hour', () => {
    expect(formatDateTime('2026-10-06T14:05:00+03:00', NOW)).toBe('6.10 14:05');
  });

  test('the list shows the hour today, "אתמול" for yesterday, the date before that', () => {
    expect(formatListTime('2026-10-08T09:15:00+03:00', NOW)).toBe('09:15');
    expect(formatListTime('2026-10-07T23:50:00+03:00', NOW)).toBe('אתמול');
    expect(formatListTime('2026-10-02T10:00:00+03:00', NOW)).toBe('2.10');
    expect(formatListTime(null, NOW)).toBe('');
  });

  test('the line between two days of a conversation', () => {
    expect(dayLabel('2026-10-08T01:00:00+03:00', NOW)).toBe('היום');
    expect(dayLabel('2026-10-07T10:00:00+03:00', NOW)).toBe('אתמול');
    expect(dayLabel('2026-10-06T10:00:00+03:00', NOW)).toBe('יום שלישי, 6.10.2026');
  });

  test('a plain date on the chart', () => {
    expect(dayTick('2026-10-08')).toBe('8.10');
    expect(plainDayLabel('2026-10-08')).toBe('יום חמישי, 8.10.2026');
  });
});

describe('how long someone has waited', () => {
  const since = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

  test('reads in minutes, then hours, then days', () => {
    expect(waitingLabel(since(0), NOW)).toBe('מחכה פחות מדקה');
    expect(waitingLabel(since(1), NOW)).toBe('מחכה דקה');
    expect(waitingLabel(since(12), NOW)).toBe('מחכה 12 דק׳');
    expect(waitingLabel(since(60), NOW)).toBe('מחכה שעה');
    expect(waitingLabel(since(130), NOW)).toBe('מחכה שעתיים');
    expect(waitingLabel(since(5 * 60), NOW)).toBe('מחכה 5 שעות');
    expect(waitingLabel(since(24 * 60), NOW)).toBe('מחכה יום');
    expect(waitingLabel(since(49 * 60), NOW)).toBe('מחכה יומיים');
    expect(waitingLabel(since(4 * 24 * 60), NOW)).toBe('מחכה 4 ימים');
  });

  test('nobody waiting, nothing written', () => {
    expect(waitingLabel(null, NOW)).toBe('');
    expect(waitingMinutes(null, NOW)).toBe(0);
    expect(waitingMinutes(since(45), NOW)).toBe(45);
  });

  test('a clock that is slightly ahead does not make a negative wait', () => {
    expect(durationText(-5000)).toBe('פחות מדקה');
    expect(agoText(new Date(NOW.getTime() + 5000).toISOString(), NOW)).toBe('עכשיו');
  });

  test('"ago" in words', () => {
    expect(agoText(since(3), NOW)).toBe('לפני 3 דק׳');
    expect(agoText(since(0), NOW)).toBe('עכשיו');
    expect(agoText(null, NOW)).toBe('');
  });
});

describe('message kinds', () => {
  test('plain text has no label; the others say what they are', () => {
    expect(messageTypeLabel('text')).toBe('');
    expect(messageTypeLabel('voice')).toBe('הודעה קולית');
    expect(messageTypeLabel('image')).toBe('תמונה');
    expect(messageTypeLabel('template')).toBe('תבנית');
  });
});
