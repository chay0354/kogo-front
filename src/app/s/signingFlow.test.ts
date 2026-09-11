/**
 * The tenant's signing page: which screen shows for every answer the server
 * can give, when "חתימה ואישור" unlocks, what is sent, and how it reads.
 */
import { describe, expect, it } from 'vitest';
import { readSigningContract, type SigningContract } from '@/lib/rentalSigningApi';
import {
  INITIAL_SIGNING_STATE,
  INVALID_LINK_TEXT,
  NO_ANSWER_TEXT,
  SUBMIT_FAILED_TEXT,
  UNAVAILABLE_TEXT,
  billingDayText,
  canSubmitSignature,
  initialSigner,
  missingForSignature,
  missingLine,
  moneyText,
  periodText,
  serverErrorText,
  shouldRecheckAfterSubmit,
  signaturePayload,
  signedAtText,
  signingReducer,
  telHref,
  vatPercentLabel,
  versionLine,
  viewOfContractState,
  type SignatureDraft,
  type SigningPageState,
} from './signingFlow';

function contract(overrides: Record<string, unknown> = {}): SigningContract {
  return readSigningContract({
    state: 'open',
    version: 2,
    tenant: { name: 'דנה לוי', id_number: '123456782', phone: '050-1234567', email: 'dana@example.com' },
    branch_name: 'רמת גן',
    studio: { name: 'קוגומלו', company_number: '516504412', phone: '050-9424755', email: '' },
    slots: [{ label: 'סטודיו 2', weekday_or_date: 'ימי ג׳', hours: '17:00–19:00', rate: '120', monthly: '480' }],
    monthly_amount: '480.00',
    vat_rate: '0.18',
    vat_amount: '86.40',
    monthly_total: '566.40',
    billing_day: 1,
    start_date: '2026-10-01',
    end_date: '2027-09-30',
    document: ['1. הצדדים'],
    signed_at: null,
    signer_name: '',
    ...overrides,
  });
}

const refused = (status: number, data: unknown = {}) => ({ response: { status, data } });
const lost = { request: {}, code: 'ECONNABORTED' };

const open: SigningPageState = { view: 'open', contract: contract(), message: '' };

describe('viewOfContractState', () => {
  it('shows the screen the server names, and treats a state it does not know as an unusable link', () => {
    expect(viewOfContractState('open')).toBe('open');
    expect(viewOfContractState('signed')).toBe('signed');
    expect(viewOfContractState('expired')).toBe('expired');
    expect(viewOfContractState('cancelled')).toBe('cancelled');
    expect(viewOfContractState('archived')).toBe('invalid');
    expect(viewOfContractState('')).toBe('invalid');
  });
});

describe('signingReducer — loading the contract', () => {
  it('starts loading, and says the link is invalid when there is no token', () => {
    expect(INITIAL_SIGNING_STATE.view).toBe('loading');
    expect(signingReducer(INITIAL_SIGNING_STATE, { type: 'noToken' })).toEqual({
      view: 'invalid',
      contract: null,
      message: INVALID_LINK_TEXT,
    });
  });

  it('opens each state on its own screen', () => {
    for (const state of ['open', 'signed', 'expired', 'cancelled'] as const) {
      const next = signingReducer(INITIAL_SIGNING_STATE, { type: 'loaded', contract: contract({ state }) });
      expect(next.view).toBe(state);
      expect(next.contract?.state).toBe(state);
    }
  });

  it('shows the same success on a reload of a signed contract, with when and who', () => {
    const next = signingReducer(INITIAL_SIGNING_STATE, {
      type: 'loaded',
      contract: contract({ state: 'signed', signed_at: '2026-09-11T18:05:00+03:00', signer_name: 'דנה לוי' }),
    });
    expect(next).toMatchObject({ view: 'signed', contract: { signed_at: '2026-09-11T18:05:00+03:00', signer_name: 'דנה לוי' } });
  });

  it('reads an unknown token as invalid, in the server’s words', () => {
    const next = signingReducer(INITIAL_SIGNING_STATE, {
      type: 'loadFailed',
      error: refused(404, { error: 'הקישור לא נמצא' }),
    });
    expect(next).toEqual({ view: 'invalid', contract: null, message: 'הקישור לא נמצא' });
    expect(signingReducer(INITIAL_SIGNING_STATE, { type: 'loadFailed', error: refused(404) }).message).toBe(INVALID_LINK_TEXT);
    expect(signingReducer(INITIAL_SIGNING_STATE, { type: 'loaded', contract: contract({ state: 'weird' }) }).view).toBe('invalid');
  });

  it('reads 410 as expired, or cancelled when the body says so', () => {
    expect(signingReducer(INITIAL_SIGNING_STATE, { type: 'loadFailed', error: refused(410, { error: 'פג תוקף' }) })).toEqual({
      view: 'expired',
      contract: null,
      message: 'פג תוקף',
    });
    expect(
      signingReducer(INITIAL_SIGNING_STATE, { type: 'loadFailed', error: refused(410, { state: 'cancelled' }) }).view,
    ).toBe('cancelled');
  });

  it('offers a retry, not "invalid", when the contract could not be reached', () => {
    expect(signingReducer(INITIAL_SIGNING_STATE, { type: 'loadFailed', error: lost })).toEqual({
      view: 'unavailable',
      contract: null,
      message: UNAVAILABLE_TEXT,
    });
    expect(signingReducer({ view: 'unavailable', contract: null, message: 'x' }, { type: 'reload' })).toEqual(INITIAL_SIGNING_STATE);
  });
});

describe('signingReducer — signing', () => {
  it('clears the last refusal when a new try starts', () => {
    expect(signingReducer({ ...open, message: 'שגיאה' }, { type: 'submitStarted' }).message).toBe('');
    expect(signingReducer(open, { type: 'submitStarted' })).toBe(open);
  });

  it('moves to the success screen with the time the server stamped and the name signed', () => {
    const next = signingReducer(open, {
      type: 'signed',
      result: { state: 'signed', signed_at: '2026-09-11T18:05:00+03:00', pdf_url: null },
      signerName: '  דנה לוי ',
    });
    expect(next).toMatchObject({
      view: 'signed',
      message: '',
      contract: { state: 'signed', signed_at: '2026-09-11T18:05:00+03:00', signer_name: 'דנה לוי' },
    });
  });

  it('keeps the form open with the server’s words for bad input and for a conflict', () => {
    expect(signingReducer(open, { type: 'submitFailed', error: refused(400, { error: 'תעודת הזהות לא תקינה' }) })).toEqual({
      ...open,
      message: 'תעודת הזהות לא תקינה',
    });
    expect(signingReducer(open, { type: 'submitFailed', error: refused(409, { error: 'החוזה השתנה' }) }).message).toBe(
      'החוזה השתנה',
    );
    expect(signingReducer(open, { type: 'submitFailed', error: refused(500, '<html>') }).message).toBe(SUBMIT_FAILED_TEXT);
  });

  it('moves an expired or cancelled link to its screen, keeping the version for the office’s phone', () => {
    const next = signingReducer(open, { type: 'submitFailed', error: refused(410, { error: 'הקישור בוטל', state: 'cancelled' }) });
    expect(next.view).toBe('cancelled');
    expect(next.message).toBe('הקישור בוטל');
    expect(next.contract?.studio.phone).toBe('050-9424755');
  });

  it('says plainly when no answer came back', () => {
    expect(signingReducer(open, { type: 'submitFailed', error: lost })).toEqual({ ...open, message: NO_ANSWER_TEXT });
  });

  it('keeps the refusal on screen when the contract read again is still open, and drops it once signed', () => {
    const refusedState = { ...open, message: 'החוזה השתנה' };
    const changed = contract({ version: 3 });
    expect(signingReducer(refusedState, { type: 'loaded', contract: changed, keepMessage: true })).toEqual({
      view: 'open',
      contract: changed,
      message: 'החוזה השתנה',
    });
    expect(
      signingReducer(refusedState, { type: 'loaded', contract: contract({ state: 'signed' }), keepMessage: true }).message,
    ).toBe('');
    expect(signingReducer(refusedState, { type: 'loaded', contract: changed }).message).toBe('');
  });

  it('keeps the form when the check after a failed signing cannot get through', () => {
    const refusedState = { ...open, message: NO_ANSWER_TEXT };
    expect(signingReducer(refusedState, { type: 'loadFailed', error: lost, recheck: true })).toBe(refusedState);
    expect(signingReducer(refusedState, { type: 'loadFailed', error: refused(410), recheck: true }).view).toBe('expired');
  });
});

describe('shouldRecheckAfterSubmit', () => {
  it('reads the contract again when the signature may have gone through or the version changed', () => {
    expect(shouldRecheckAfterSubmit(lost)).toBe(true);
    expect(shouldRecheckAfterSubmit(refused(409))).toBe(true);
    expect(shouldRecheckAfterSubmit(refused(502))).toBe(true);
    expect(shouldRecheckAfterSubmit(refused(400))).toBe(false);
    expect(shouldRecheckAfterSubmit(refused(410))).toBe(false);
  });
});

describe('serverErrorText', () => {
  it('takes the server’s error, its detail, or its field errors, in that order', () => {
    expect(serverErrorText(refused(400, { error: ' החתימה ריקה ' }), 'x')).toBe('החתימה ריקה');
    expect(serverErrorText(refused(400, { detail: 'Not found.' }), 'x')).toBe('Not found.');
    expect(serverErrorText(refused(400, { signer_id_number: ['מספר ת.ז. אינו תקין'], signer_name: 'חובה' }), 'x')).toBe(
      'מספר ת.ז. אינו תקין\nחובה',
    );
  });

  it('falls back when the server said nothing usable', () => {
    expect(serverErrorText(refused(502, '<html>Bad gateway</html>'), 'fallback')).toBe('fallback');
    expect(serverErrorText(refused(500, {}), 'fallback')).toBe('fallback');
    expect(serverErrorText(lost, 'fallback')).toBe('fallback');
    expect(serverErrorText(null, 'fallback')).toBe('fallback');
  });
});

describe('when "חתימה ואישור" unlocks', () => {
  const ready: SignatureDraft = {
    signerName: 'דנה לוי',
    signerId: '123456782',
    signature: 'data:image/png;base64,iVBORw0KGgo=',
    readToEnd: true,
    accepted: true,
  };

  it('unlocks once everything is filled, on an open contract, while nothing is being sent', () => {
    expect(missingForSignature(ready)).toEqual([]);
    expect(canSubmitSignature(ready, { view: 'open', submitting: false })).toBe(true);
    expect(canSubmitSignature(ready, { view: 'open', submitting: true })).toBe(false);
    expect(canSubmitSignature(ready, { view: 'signed', submitting: false })).toBe(false);
    expect(canSubmitSignature(ready, { view: 'expired', submitting: false })).toBe(false);
  });

  it('names what is still missing, in the order the page asks it', () => {
    expect(
      missingForSignature({ signerName: ' ', signerId: '', signature: null, readToEnd: false, accepted: false }),
    ).toEqual(['קריאת החוזה עד הסוף', 'שם מלא', 'תעודת זהות תקינה', 'חתימה', 'סימון האישור']);
    expect(missingLine(['חתימה', 'סימון האישור'])).toBe('כדי לחתום חסר: חתימה · סימון האישור');
    expect(missingLine([])).toBe('');
  });

  it('does not count a tick given before the text was read to its end', () => {
    expect(missingForSignature({ ...ready, readToEnd: false })).toEqual(['קריאת החוזה עד הסוף', 'סימון האישור']);
  });

  it('wants a whole name, a valid ID and a drawn PNG', () => {
    expect(missingForSignature({ ...ready, signerName: 'ד' })).toEqual(['שם מלא']);
    expect(missingForSignature({ ...ready, signerId: '123456789' })).toEqual(['תעודת זהות תקינה']);
    expect(missingForSignature({ ...ready, signature: 'data:image/svg+xml;base64,PHN2Zz4=' })).toEqual(['חתימה']);
    expect(missingForSignature({ ...ready, signature: 'data:,' })).toEqual(['חתימה']);
  });

  it('sends the name tidied, the ID as digits, and the acceptance', () => {
    expect(signaturePayload({ ...ready, signerName: '  דנה   לוי ', signerId: '12345678-2' })).toEqual({
      signer_name: 'דנה לוי',
      signer_id_number: '123456782',
      signature: 'data:image/png;base64,iVBORw0KGgo=',
      accept: true,
    });
  });

  it('starts from the tenant’s name and ID as the office entered them', () => {
    expect(initialSigner(contract())).toEqual({ name: 'דנה לוי', id: '123456782' });
    expect(initialSigner(contract({ tenant: { name: 'סטודיו אור', id_number: '' } }))).toEqual({ name: 'סטודיו אור', id: '' });
    expect(initialSigner(null)).toEqual({ name: '', id: '' });
  });
});

describe('how it reads', () => {
  it('writes the header’s version line', () => {
    expect(versionLine(contract())).toBe('גרסה 2 · רמת גן');
    expect(versionLine(contract({ branch_name: '' }))).toBe('גרסה 2');
    expect(versionLine(null)).toBe('');
  });

  it('writes money as shekels, and a dash when there is none', () => {
    expect(moneyText('566.40')).toBe('₪566.40');
    expect(moneyText('480.00')).toBe('₪480');
    expect(moneyText('')).toBe('—');
    expect(moneyText('abc')).toBe('—');
  });

  it('writes the VAT rate as a percentage, whichever way the server sent it', () => {
    expect(vatPercentLabel('0.18')).toBe('18%');
    expect(vatPercentLabel('18.00')).toBe('18%');
    expect(vatPercentLabel(0.17)).toBe('17%');
    expect(vatPercentLabel('')).toBe('');
    expect(vatPercentLabel('x')).toBe('');
  });

  it('writes the billing day and the period', () => {
    expect(billingDayText(1)).toBe('ב־1 לכל חודש');
    expect(billingDayText(null)).toBe('—');
    expect(periodText('2026-10-01', '2027-09-30')).toBe('1.10.2026 – 30.9.2027');
    expect(periodText('2026-10-01', null)).toBe('מ־1.10.2026');
    expect(periodText(null, '2027-09-30')).toBe('עד 30.9.2027');
    expect(periodText(null, null)).toBe('—');
  });

  it('writes when it was signed on Israel’s clock', () => {
    expect(signedAtText('2026-09-11T15:05:00Z')).toBe('11.09.2026 בשעה 18:05');
    expect(signedAtText(null)).toBe('');
  });

  it('dials the office only when the phone is a number', () => {
    expect(telHref('050-9424755')).toBe('tel:0509424755');
    expect(telHref('+972 50 942 4755')).toBe('tel:+972509424755');
    expect(telHref('')).toBe('');
    expect(telHref('משרד')).toBe('');
  });
});
