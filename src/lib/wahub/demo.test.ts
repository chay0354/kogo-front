import { describe, expect, test } from 'vitest';

import { isDemoContact, isDemoPhone, newContactBody, simulateInboundBody, suggestDemoPhone } from './demo';
import { makeContact } from './testFixtures';

describe('demo contacts', () => {
  test('are known by the flag, or by the source when the flag is missing', () => {
    expect(isDemoContact(makeContact(1, { is_demo: true }))).toBe(true);
    expect(isDemoContact(makeContact(1, { source: 'demo', source_label: 'דמו' }))).toBe(true);
    expect(isDemoContact(makeContact(1))).toBe(false);
    expect(isDemoContact(null)).toBe(false);
  });

  test('a free 050-555 number is suggested, skipping the ones already taken however they are written', () => {
    expect(suggestDemoPhone()).toBe('050-5550001');
    expect(suggestDemoPhone(['050-5550001', '972505550002', '0505550003', '050-1234567'])).toBe('050-5550004');
    expect(suggestDemoPhone(['972505550001'])).toBe('050-5550002');
  });

  test('a demo phone is told from a real one', () => {
    expect(isDemoPhone('050-5550012')).toBe(true);
    expect(isDemoPhone('972505550012')).toBe(true);
    expect(isDemoPhone('050-1234567')).toBe(false);
    expect(isDemoPhone('0505551')).toBe(false);
  });

  test('a simulated message carries its text and who "sent" it; an empty one is refused', () => {
    expect(simulateInboundBody('  היי, יש ניסיון?  ', 'customer')).toEqual({ text: 'היי, יש ניסיון?', sender: 'customer' });
    expect(simulateInboundBody('בטח!', 'bot')).toEqual({ text: 'בטח!', sender: 'bot' });
    expect(simulateInboundBody('   ', 'customer')).toBeNull();
  });

  test('a new contact is written with is_demo only when asked, and the note only when there is one', () => {
    expect(newContactBody({ phone: ' 050-5550001 ', name: ' הדס ', note: ' ' })).toEqual({ phone: '050-5550001', name: 'הדס' });
    expect(newContactBody({ phone: '050-5550001', name: 'הדס', note: 'בדיקה', isDemo: true })).toEqual({
      phone: '050-5550001',
      name: 'הדס',
      note: 'בדיקה',
      is_demo: true,
    });
    expect(newContactBody({ phone: '050-1234567', name: 'דנה', isDemo: false })).not.toHaveProperty('is_demo');
  });
});
