import { describe, expect, test } from 'vitest';
import {
  DEFAULT_UNREGISTERED_DAYS,
  UNREGISTERED_DAY_RANGES,
  daysAgoText,
  lastMessageWho,
  leadName,
  leadPhone,
  unregisteredNotes,
  unregisteredParams,
} from './unregistered';

describe('the query of "שאלו ולא נרשמו"', () => {
  test('offers 7, 30 and 90 days and opens on 30', () => {
    expect([...UNREGISTERED_DAY_RANGES]).toEqual([7, 30, 90]);
    expect(DEFAULT_UNREGISTERED_DAYS).toBe(30);
  });

  test('sends the days, and "hot" only when it is on', () => {
    expect(unregisteredParams(30, false)).toEqual({ days: '30' });
    expect(unregisteredParams(7, true)).toEqual({ days: '7', hot: '1' });
  });

  test('keeps the days inside the server\'s limits', () => {
    expect(unregisteredParams(0, false)).toEqual({ days: '1' });
    expect(unregisteredParams(1000, false)).toEqual({ days: '365' });
  });
});

describe('the words on the card', () => {
  test('"לפני X ימים" from a count of days', () => {
    expect(daysAgoText(0)).toBe('היום');
    expect(daysAgoText(1)).toBe('אתמול');
    expect(daysAgoText(2)).toBe('לפני יומיים');
    expect(daysAgoText(23)).toBe('לפני 23 ימים');
    expect(daysAgoText(null)).toBe('');
    expect(daysAgoText(-1)).toBe('');
  });

  test('the two lines under the number: how many are hot, and who has waited longest', () => {
    expect(unregisteredNotes({ total: 12, hot: 4, oldest_days: 23 })).toEqual(['מתוכם חמים 4', 'הוותיק ביותר: לפני 23 ימים']);
    expect(unregisteredNotes({ total: 3, hot: 0, oldest_days: 1 })).toEqual(['הוותיק ביותר: אתמול']);
  });

  test('an empty list has no lines; a list from today alone says nothing about age', () => {
    expect(unregisteredNotes({ total: 0, hot: 0, oldest_days: null })).toEqual([]);
    expect(unregisteredNotes(undefined)).toEqual([]);
    expect(unregisteredNotes({ total: 2, hot: 1, oldest_days: 0 })).toEqual(['מתוכם חמים 1']);
  });

  test('a row without a name shows the phone, in its display form when the server sent one', () => {
    expect(leadName({ name: 'דנה כהן', phone: '0501234567' })).toBe('דנה כהן');
    expect(leadName({ name: '  ', phone: '0501234567' })).toBe('0501234567');
    expect(leadName({ name: '', phone: '972501234567', phone_display: '050-123-4567' })).toBe('050-123-4567');
    expect(leadPhone({ phone: '972501234567' })).toBe('972501234567');
  });

  test('who wrote the last message, in one word', () => {
    expect(lastMessageWho({ last_message_direction: 'in', last_message_sender: 'customer' })).toBe('הלקוח');
    expect(lastMessageWho({ last_message_direction: 'out', last_message_sender: 'bot' })).toBe('הבוט');
    expect(lastMessageWho({ last_message_direction: 'out', last_message_sender: 'office' })).toBe('המשרד');
    expect(lastMessageWho({ last_message_direction: '', last_message_sender: '' })).toBe('');
  });
});
