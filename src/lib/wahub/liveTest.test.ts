import { describe, expect, test } from 'vitest';

import { liveTestCount } from './liveTest';
import { contactsParams } from './params';
import { phoneStatusLine } from './screens';

describe('the live test, as the server reports it', () => {
  test('the count is read from a number or from a list of people', () => {
    expect(liveTestCount({ live_test_contacts: 2 })).toBe(2);
    expect(liveTestCount({ live_test_contacts: 0 })).toBe(0);
    expect(liveTestCount({ live_test_contacts: [{ id: 1, name: 'דור', phone: '972500000001' }] })).toBe(1);
  });

  test('a server built before the live test says nothing, and nothing is shown', () => {
    expect(liveTestCount({})).toBeNull();
    expect(liveTestCount(undefined)).toBeNull();
  });

  test('the list asks for live_test=1, on the conversations view only', () => {
    expect(contactsParams({ view: 'chats', liveTest: true })).toMatchObject({ view: 'chats', live_test: '1' });
    expect(contactsParams({ view: 'chats' })).not.toHaveProperty('live_test');
    expect(contactsParams({ view: 'leads', liveTest: true })).not.toHaveProperty('live_test');
  });

  test('the phone\'s state line under the name says it', () => {
    const chat = { handled_by: 'bot' as const, handled_by_label: 'הבוט עונה', needs_human: false };
    expect(phoneStatusLine(chat, false, true)).toBe('בדיקה חיה · הבוט עונה');
    expect(phoneStatusLine(chat)).toBe('הבוט עונה');
  });
});
