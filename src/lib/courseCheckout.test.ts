import { describe, expect, it } from 'vitest';

import { cardAccepted, checkoutOutcome, checkoutSettlement, readCheckoutStart, readFrameMessage } from './courseCheckout';

describe('readCheckoutStart', () => {
  it('keeps the card form when the server says so', () => {
    expect(readCheckoutStart({ use_card_form: true })).toEqual({ kind: 'card_form' });
  });

  it('opens the page when the server hands one out', () => {
    expect(readCheckoutStart({ checkout_id: 'c1', url: 'https://direct.tranzila.com/cogolive/iframenew.php?x=1' }))
      .toEqual({ kind: 'hosted', checkoutId: 'c1', url: 'https://direct.tranzila.com/cogolive/iframenew.php?x=1' });
  });

  it('shows the server error, or a plain one', () => {
    expect(readCheckoutStart({ error: 'השיעור מלא' })).toEqual({ kind: 'error', message: 'השיעור מלא' });
    expect(readCheckoutStart(undefined).kind).toBe('error');
  });
});

describe('checkoutOutcome', () => {
  it('only a completed checkout is paid', () => {
    expect(checkoutOutcome('completed')).toBe('paid');
  });

  it('a card that may be charged is pending, never failed', () => {
    expect(checkoutOutcome('uncertain')).toBe('pending');
    expect(checkoutOutcome('review')).toBe('pending');
  });

  it('keeps waiting while the card is checked and charged', () => {
    for (const status of ['page_open', 'verified', 'charging', undefined]) {
      expect(checkoutOutcome(status)).toBe('waiting');
    }
  });

  it('a decline and a refusal are what they are', () => {
    expect(checkoutOutcome('declined')).toBe('declined');
    expect(checkoutOutcome('failed')).toBe('failed');
  });
});

describe('readFrameMessage', () => {
  it('reads the result page message for this checkout only', () => {
    const msg = { type: 'kogo-course-checkout', checkoutId: 'c1', result: 'ok', index: '5555', code: '0012345' };
    expect(readFrameMessage(msg, 'c1')).toEqual(msg);
    expect(readFrameMessage(msg, 'c2')).toBeNull();
    expect(readFrameMessage({ type: 'other' }, 'c1')).toBeNull();
  });

  it('drops anything that is not a number from the frame', () => {
    const msg = readFrameMessage(
      { type: 'kogo-course-checkout', checkoutId: 'c1', result: 'ok', index: '55<script>', code: 'x' },
      'c1',
    );
    expect(msg?.index).toBe('');
    expect(msg?.code).toBe('');
  });
});

describe('cardAccepted / checkoutSettlement', () => {
  it('shows the working panel once the card passed and the charge runs', () => {
    expect(cardAccepted('verified')).toBe(true);
    expect(cardAccepted('charging')).toBe(true);
    expect(cardAccepted('page_open')).toBe(false);
  });

  it('the checking screen never reads an unknown charge as failed', () => {
    expect(checkoutSettlement('completed')).toBe('completed');
    expect(checkoutSettlement('declined')).toBe('failed');
    expect(checkoutSettlement('failed')).toBe('failed');
    for (const status of ['uncertain', 'review', 'page_open', 'charging']) {
      expect(checkoutSettlement(status)).toBe('processing');
    }
  });
});
