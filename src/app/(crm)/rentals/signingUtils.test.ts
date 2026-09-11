/**
 * Sending a version for signing: the WhatsApp number and message, the link's
 * expiry, which link is still live, when a version may be sent, and the chips.
 */
import { describe, expect, it } from 'vitest';
import {
  absoluteSigningUrl,
  isSigningLinkExpired,
  liveSigningLink,
  sendForSigningState,
  signedByText,
  signingChips,
  signingExpiryText,
  signingWhatsAppMessage,
  whatsAppNumber,
  whatsAppUrl,
} from './signingUtils';

const NOW = new Date('2026-09-11T12:00:00+03:00');

describe('whatsAppNumber', () => {
  it('turns an Israeli mobile into 9725X…, however it was typed', () => {
    expect(whatsAppNumber('050-1234567')).toBe('972501234567');
    expect(whatsAppNumber('052 765 4321')).toBe('972527654321');
    expect(whatsAppNumber('0541234567')).toBe('972541234567');
    expect(whatsAppNumber('501234567')).toBe('972501234567');
    expect(whatsAppNumber('+972-50-1234567')).toBe('972501234567');
    expect(whatsAppNumber('+972 050 1234567')).toBe('972501234567');
    expect(whatsAppNumber('972501234567')).toBe('972501234567');
    expect(whatsAppNumber('00972501234567')).toBe('972501234567');
  });

  it('takes a foreign number only when it says its country', () => {
    expect(whatsAppNumber('+1 415 555 2671')).toBe('14155552671');
    expect(whatsAppNumber('0044 20 7946 0958')).toBe('442079460958');
  });

  it('refuses what cannot be a WhatsApp number, so no button is offered', () => {
    expect(whatsAppNumber('02-6234567')).toBeNull(); // a landline
    expect(whatsAppNumber('+972 3 1234567')).toBeNull();
    expect(whatsAppNumber('050-123456')).toBeNull(); // a digit short
    expect(whatsAppNumber('050-1234567, 052-7654321')).toBeNull(); // two numbers in one field
    expect(whatsAppNumber('12345')).toBeNull();
    expect(whatsAppNumber('+12')).toBeNull();
    expect(whatsAppNumber('אין')).toBeNull();
    expect(whatsAppNumber('')).toBeNull();
    expect(whatsAppNumber(null)).toBeNull();
  });
});

describe('whatsAppUrl', () => {
  it('opens a chat with the message typed in, encoded', () => {
    expect(whatsAppUrl('050-1234567', 'שלום\nhttps://x.example/s/a?b=1&c')).toBe(
      'https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D%0Ahttps%3A%2F%2Fx.example%2Fs%2Fa%3Fb%3D1%26c',
    );
  });

  it('gives nothing for a bad number', () => {
    expect(whatsAppUrl('03-1234567', 'x')).toBeNull();
  });
});

describe('signingWhatsAppMessage', () => {
  it('greets the tenant, names the branch and the version, and says until when the link opens', () => {
    expect(
      signingWhatsAppMessage({
        tenant: { first_name: 'דנה', full_name: 'דנה לוי' },
        url: 'https://kogo.example/s/tok',
        version: 2,
        branchName: 'רמת גן',
        expiresAt: '2026-09-25T14:05:00+03:00',
      }),
    ).toBe(
      [
        'שלום דנה,',
        'זה הקישור לקריאה ולחתימה על חוזה השכירות בסניף רמת גן (גרסה 2):',
        'https://kogo.example/s/tok',
        'הקישור בתוקף עד 25.9.2026, 14:05.',
        'תודה, קוגומלו',
      ].join('\n'),
    );
  });

  it('leaves out what it does not know', () => {
    expect(signingWhatsAppMessage({ tenant: { first_name: '', full_name: 'סטודיו אור' }, url: 'u', version: 1 })).toBe(
      ['שלום סטודיו אור,', 'זה הקישור לקריאה ולחתימה על חוזה השכירות (גרסה 1):', 'u', 'תודה, קוגומלו'].join('\n'),
    );
    expect(signingWhatsAppMessage({ tenant: null, url: 'u', version: 1 }).startsWith('שלום,\n')).toBe(true);
  });
});

describe('the link’s expiry', () => {
  it('says until when, and how long is left', () => {
    expect(signingExpiryText('2026-09-25T14:05:00+03:00', NOW)).toBe('בתוקף עד 25.9.2026, 14:05 (עוד 14 ימים)');
    expect(signingExpiryText('2026-09-12T20:00:00+03:00', NOW)).toBe('בתוקף עד 12.9.2026, 20:00 (עוד יום)');
    expect(signingExpiryText('2026-09-11T18:00:00+03:00', NOW)).toBe('בתוקף עד 11.9.2026, 18:00 (פחות מיום)');
  });

  it('says when it expired once it has', () => {
    expect(signingExpiryText('2026-09-10T09:30:00+03:00', NOW)).toBe('פג תוקף ב־10.9.2026, 09:30');
    expect(isSigningLinkExpired('2026-09-10T09:30:00+03:00', NOW)).toBe(true);
    expect(isSigningLinkExpired('2026-09-11T12:00:00+03:00', NOW)).toBe(true);
    expect(isSigningLinkExpired('2026-09-25T14:05:00+03:00', NOW)).toBe(false);
  });

  it('says nothing, and calls nothing expired, without a readable time', () => {
    expect(signingExpiryText(null, NOW)).toBe('');
    expect(signingExpiryText('not a date', NOW)).toBe('');
    expect(isSigningLinkExpired(null, NOW)).toBe(false);
    expect(isSigningLinkExpired('not a date', NOW)).toBe(false);
  });
});

describe('liveSigningLink', () => {
  const sent = {
    status: 'sent',
    signing_url: 'https://kogo.example/s/tok',
    signing_expires_at: '2026-09-25T14:05:00+03:00',
  };

  it('is the link of an unsigned version, until it expires', () => {
    expect(liveSigningLink(sent, NOW)).toEqual({ url: 'https://kogo.example/s/tok', expiresAt: '2026-09-25T14:05:00+03:00' });
    expect(liveSigningLink({ ...sent, status: 'viewed' }, NOW)?.url).toBe('https://kogo.example/s/tok');
    expect(liveSigningLink({ ...sent, signing_expires_at: null }, NOW)?.expiresAt).toBeNull();
  });

  it('is none once expired, cancelled (no link), signed or void', () => {
    expect(liveSigningLink({ ...sent, signing_expires_at: '2026-09-10T09:30:00+03:00' }, NOW)).toBeNull();
    expect(liveSigningLink({ ...sent, signing_url: '' }, NOW)).toBeNull();
    expect(liveSigningLink({ ...sent, signing_url: null }, NOW)).toBeNull();
    expect(liveSigningLink({ status: 'draft' }, NOW)).toBeNull();
    expect(liveSigningLink({ ...sent, status: 'signed' }, NOW)).toBeNull();
    expect(liveSigningLink({ ...sent, status: 'void' }, NOW)).toBeNull();
    expect(liveSigningLink(null, NOW)).toBeNull();
  });
});

describe('absoluteSigningUrl', () => {
  it('keeps a full address, and makes a path full on this origin', () => {
    expect(absoluteSigningUrl('https://kogo.example/s/tok', 'https://crm.example')).toBe('https://kogo.example/s/tok');
    expect(absoluteSigningUrl('/s/tok', 'https://crm.example/')).toBe('https://crm.example/s/tok');
  });

  it('refuses anything else', () => {
    expect(absoluteSigningUrl('//evil.example/s/tok', 'https://crm.example')).toBe('');
    expect(absoluteSigningUrl('javascript:alert(1)', 'https://crm.example')).toBe('');
    expect(absoluteSigningUrl('', 'https://crm.example')).toBe('');
    expect(absoluteSigningUrl(null, 'https://crm.example')).toBe('');
  });
});

describe('sendForSigningState', () => {
  it('offers an unsigned version, and holds back one that no longer matches the agreement', () => {
    expect(sendForSigningState({ status: 'draft' })).toEqual({ offered: true, blockedReason: '' });
    expect(sendForSigningState({ status: 'sent' }).offered).toBe(true);
    expect(sendForSigningState({ status: 'viewed', is_stale: false }).blockedReason).toBe('');
    expect(sendForSigningState({ status: 'draft', is_stale: true })).toEqual({
      offered: true,
      blockedReason: 'ההסכם השתנה אחרי שהגרסה הופקה — הפיקו גרסה חדשה ושלחו אותה',
    });
  });

  it('does not offer a signed or void version, or none', () => {
    expect(sendForSigningState({ status: 'signed' }).offered).toBe(false);
    expect(sendForSigningState({ status: 'void' }).offered).toBe(false);
    expect(sendForSigningState(null).offered).toBe(false);
  });
});

describe('signingChips', () => {
  it('lists each step with when, in order', () => {
    expect(
      signingChips({
        signed_at: '2026-09-12T10:00:00+03:00',
        sent_at: '2026-09-11T14:05:00+03:00',
        viewed_at: '2026-09-11T20:30:00+03:00',
      }),
    ).toEqual([
      { step: 'sent', label: 'נשלח', time: '11.9.2026, 14:05', tone: 'progress', text: 'נשלח 11.9.2026, 14:05' },
      { step: 'viewed', label: 'נצפה', time: '11.9.2026, 20:30', tone: 'progress', text: 'נצפה 11.9.2026, 20:30' },
      { step: 'signed', label: 'נחתם', time: '12.9.2026, 10:00', tone: 'signed', text: 'נחתם 12.9.2026, 10:00' },
    ]);
  });

  it('leaves out a step without a readable time', () => {
    expect(signingChips({ sent_at: '2026-09-11T14:05:00+03:00', viewed_at: null, signed_at: 'x' }).map((chip) => chip.step)).toEqual([
      'sent',
    ]);
    expect(signingChips({})).toEqual([]);
    expect(signingChips(null)).toEqual([]);
  });

  it('names who signed', () => {
    expect(signedByText(' דנה לוי ')).toBe('נחתם על ידי דנה לוי');
    expect(signedByText('')).toBe('');
    expect(signedByText(null)).toBe('');
  });
});
