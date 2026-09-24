import { describe, expect, it } from 'vitest';
import { HOSTED_PAGE_MISSING, hostedPagePaid, readTillInitiateOutcome } from './tillHostedPage';

describe('what the till does with the first answer for a card sale', () => {
  it('the hosted page opens, tied to the invoice it will complete', () => {
    expect(
      readTillInitiateOutcome({ requires_iframe: true, iframe_url: 'https://direct.tranzila.com/cogolive/iframenew.php?x', invoice_id: 'inv-1' }),
    ).toEqual({ kind: 'hosted_page', url: 'https://direct.tranzila.com/cogolive/iframenew.php?x', invoiceId: 'inv-1' });
  });

  it('a hosted page without its invoice is not opened', () => {
    expect(readTillInitiateOutcome({ requires_iframe: true, iframe_url: 'https://x' })).toEqual({
      kind: 'failed',
      message: HOSTED_PAGE_MISSING,
    });
  });

  it('with the hosted page off, the card is typed', () => {
    expect(readTillInitiateOutcome({ requires_iframe: false, success: false, use_direct_card: true, error: 'סגור' })).toEqual({
      kind: 'type_card',
      message: 'סגור',
    });
  });

  it("a child's saved card that went through is paid", () => {
    expect(readTillInitiateOutcome({ requires_iframe: false, success: true })).toEqual({ kind: 'paid', invoice: undefined });
  });

  it("a child's saved card that was declined is a failure, with the reason", () => {
    expect(readTillInitiateOutcome({ requires_iframe: false, success: false, error: 'העסקה נדחתה' })).toEqual({
      kind: 'failed',
      message: 'העסקה נדחתה',
    });
  });
});

describe('when a hosted-page sale is paid', () => {
  it('only once the server completed the invoice', () => {
    expect(hostedPagePaid({ payment_status: 'completed' })).toBe(true);
    expect(hostedPagePaid({ payment_status: 'pending' })).toBe(false);
    expect(hostedPagePaid({ payment_status: 'failed' })).toBe(false);
    expect(hostedPagePaid(null)).toBe(false);
  });
});
