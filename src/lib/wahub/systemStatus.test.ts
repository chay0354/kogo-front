/**
 * "מצב המערכת" — the rows of the card at the top of the settings
 * (docs/WAHUB-CONTRACT-POLISH-1.md, ג): what each says, by the server's status.
 */
import { describe, expect, it } from 'vitest';
import type { WahubStatus } from '@/types/wahub';
import { connectionLevel, connectionMissing, sendingState, systemStatusRows } from './systemStatus';

const STATUS: WahubStatus = {
  inbound_configured: true,
  inbound_key_set_at: '2026-10-01T10:00:00+03:00',
  bot_replies_seen: true,
  ai_configured: true,
  send_configured: true,
  sending_enabled: true,
  simulate_send: false,
  shadow_configured: true,
  shadow_model: 'claude-sonnet-4-5',
  last_inbound_at: '2026-10-08T11:57:00+03:00',
  contacts_total: 40,
  messages_last_24h: 120,
  inbound_url: 'https://example.test/api/v1/wahub/inbound/manychat/',
  live_test_contacts: 0,
};

const row = (status: WahubStatus, key: string) => systemStatusRows(status).find((entry) => entry.key === key);

describe('how the connection reads', () => {
  it('a working connection reads as fine', () => {
    expect(connectionLevel(STATUS)).toEqual({ level: 'ok', word: 'תקין' });
    expect(connectionMissing(STATUS)).toEqual([]);
  });

  it('says when nothing is connected', () => {
    const none = { ...STATUS, inbound_configured: false, last_inbound_at: null };
    expect(connectionLevel(none)).toEqual({ level: 'off', word: 'לא מחובר' });
    expect(connectionMissing(none)).toEqual(['מפתח חיבור ל-ManyChat']);
  });

  it('is only partly fine without the bot\'s replies, without sending, or in simulation', () => {
    expect(connectionLevel({ ...STATUS, bot_replies_seen: false }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, send_configured: false }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, sending_enabled: false }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, simulate_send: true }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, last_inbound_at: null }).word).toBe('ממתין להודעה ראשונה');
  });

  it('nothing to read: nothing is said', () => {
    expect(connectionLevel(undefined)).toEqual({ level: 'unknown', word: '' });
  });

  it('a partial connection names what it is short of — each thing once', () => {
    expect(connectionMissing({ ...STATUS, bot_replies_seen: false })).toEqual(['העתק של תשובות הבוט']);
    expect(connectionMissing({ ...STATUS, simulate_send: true })).toEqual(['שליחה אמיתית ללקוחות (כרגע הדמיה)']);
    expect(connectionMissing({ ...STATUS, sending_enabled: false })).toEqual(['שליחה ללקוחות (כבויה)']);
    expect(connectionMissing({ ...STATUS, send_configured: false })).toEqual(['מפתח ManyChat לשליחה']);
    expect(connectionMissing({ ...STATUS, last_inbound_at: null })).toEqual(['הודעה ראשונה מ-ManyChat']);
    // Several at once, in the order they are checked. Simulation says all there is to say about sending.
    expect(connectionMissing({ ...STATUS, bot_replies_seen: false, simulate_send: true, sending_enabled: false, send_configured: false })).toEqual([
      'העתק של תשובות הבוט',
      'שליחה אמיתית ללקוחות (כרגע הדמיה)',
    ]);
  });

  it('whenever the word is not "תקין", something is named', () => {
    const cases: Array<Partial<WahubStatus>> = [
      { inbound_configured: false },
      { last_inbound_at: null },
      { bot_replies_seen: false },
      { send_configured: false },
      { sending_enabled: false },
      { simulate_send: true },
    ];
    for (const over of cases) {
      const status = { ...STATUS, ...over };
      expect(connectionLevel(status).level).not.toBe('ok');
      expect(connectionMissing(status).length).toBeGreaterThan(0);
    }
  });
});

describe('sending to customers', () => {
  it('simulated, switched off, on, or on with no key', () => {
    expect(sendingState(STATUS)).toBe('on');
    expect(sendingState({ ...STATUS, simulate_send: true })).toBe('simulated');
    expect(sendingState({ ...STATUS, sending_enabled: false })).toBe('off');
    expect(sendingState({ ...STATUS, send_configured: false })).toBe('unconfigured');
    // Simulation comes first: nothing goes out, whatever the switch says.
    expect(sendingState({ ...STATUS, simulate_send: true, sending_enabled: false })).toBe('simulated');
  });
});

describe('the rows of "מצב המערכת"', () => {
  it('five rows, in a fixed order, a title and a word each', () => {
    expect(systemStatusRows(STATUS).map((entry) => [entry.title, entry.value])).toEqual([
      ['חיבור הוואטסאפ', 'תקין'],
      ['סיכום אוטומטי', 'פעיל'],
      ['הבוט בצל', 'claude-sonnet-4-5'],
      ['שליחה ללקוחות', 'פעילה'],
      ['בדיקה חיה', 'כבויה'],
    ]);
    expect(systemStatusRows(STATUS).map((entry) => entry.level)).toEqual(['ok', 'ok', 'ok', 'ok', 'unknown']);
  });

  it('the connection row carries the same word the chip beside the title used to', () => {
    expect(row({ ...STATUS, simulate_send: true }, 'connection')).toMatchObject({ value: 'חלקי', level: 'warn' });
    expect(row({ ...STATUS, inbound_configured: false }, 'connection')).toMatchObject({ value: 'לא מחובר', level: 'off' });
  });

  it('the automatic summary: on, or off without its key', () => {
    expect(row({ ...STATUS, ai_configured: false }, 'summary')).toMatchObject({ value: 'כבוי', level: 'unknown' });
  });

  it('the shadow bot: the model it drafts with, or "דמה" without a key', () => {
    expect(row(STATUS, 'shadow')).toMatchObject({ value: 'claude-sonnet-4-5', level: 'ok', ltr: true });
    expect(row({ ...STATUS, shadow_configured: false, shadow_model: 'stub' }, 'shadow')).toMatchObject({ value: 'דמה', level: 'warn' });
    expect(row({ ...STATUS, shadow_model: 'stub' }, 'shadow')).toMatchObject({ value: 'דמה', level: 'warn' });
    // A key, and no model named: it is on.
    expect(row({ ...STATUS, shadow_model: undefined }, 'shadow')).toMatchObject({ value: 'פעיל', level: 'ok' });
  });

  it('sending to customers: each of its four states in a word', () => {
    expect(row({ ...STATUS, simulate_send: true }, 'sending')).toMatchObject({ value: 'הדמיה', level: 'warn' });
    expect(row({ ...STATUS, sending_enabled: false }, 'sending')).toMatchObject({ value: 'כבויה', level: 'warn' });
    expect(row({ ...STATUS, send_configured: false }, 'sending')).toMatchObject({ value: 'לא מוגדרת', level: 'warn' });
  });

  it('the live test: off, one person, or how many', () => {
    expect(row({ ...STATUS, live_test_contacts: 1 }, 'liveTest')).toMatchObject({ value: 'איש קשר אחד', level: 'warn' });
    expect(row({ ...STATUS, live_test_contacts: 3 }, 'liveTest')).toMatchObject({ value: '3 אנשי קשר', level: 'warn' });
    expect(row({ ...STATUS, live_test_contacts: [{ id: 1, name: 'דור', phone: '972500000001' }] }, 'liveTest')?.value).toBe('איש קשר אחד');
  });

  it('a server that knows nothing of the shadow bot or of the live test: those rows are left out, not guessed', () => {
    const { shadow_configured: _a, shadow_model: _b, live_test_contacts: _c, ...older } = STATUS;
    expect(systemStatusRows(older).map((entry) => entry.key)).toEqual(['connection', 'summary', 'sending']);
  });
});
