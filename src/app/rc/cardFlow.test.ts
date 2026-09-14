/**
 * The tenant's card page: which screen shows for every answer the server can
 * give, when the button unlocks (and that nothing goes out twice), what is
 * sent, and how the charge of the day reads.
 */
import { describe, expect, it } from 'vitest';
import { readCardPreview, type CardPagePreview } from '@/lib/rentalBillingApi';
import { INVALID_LINK_TEXT } from '../s/signingFlow';
import {
  DISABLED_TITLE,
  EMPTY_CARD_DRAFT,
  INITIAL_CARD_STATE,
  NO_ANSWER_TEXT,
  REVIEW_TITLE,
  SUBMIT_FAILED_TEXT,
  SUCCESS_TITLE,
  UNAVAILABLE_TEXT,
  billingMonthLabel,
  canSubmitCard,
  cardHeaderNote,
  cardMissingLine,
  cardPayload,
  cardProblems,
  cardReducer,
  chargePlanText,
  expiryYearOf,
  luhnValid,
  shouldRecheckAfterCardSubmit,
  submitLabel,
  successLines,
  type CardDraft,
  type CardPageState,
} from './cardFlow';

function preview(overrides: Record<string, unknown> = {}): CardPagePreview {
  return readCardPreview({
    ok: true,
    enabled: true,
    state: 'pending_card',
    tenant_name: 'דנה לוי',
    branch_name: 'רמת גן',
    amount_before_vat: '480.00',
    vat_amount: '86.40',
    monthly_total: '566.40',
    billing_day: 1,
    start_date: '2026-09-01',
    end_date: null,
    expires_at: '2026-09-25T18:00:00+03:00',
    charge_now: true,
    charge_amount: '566.40',
    charge_period: '2026-09-01',
    next_charge_date: '2026-10-01',
    ...overrides,
  });
}

const refused = (status: number, data: unknown = {}) => ({ response: { status, data } });
const lost = { request: {}, code: 'ECONNABORTED' };

const form: CardPageState = { view: 'form', preview: preview(), result: null, message: '' };

/** 11 September 2026, the day these cards are typed. */
const TODAY = new Date(2026, 8, 11);

const ready: CardDraft = {
  cardNumber: '4111 1111 1111 1111',
  expiryMonth: '12',
  expiryYear: '2028',
  cvv: '123',
  cardHolderId: '123456782',
};

describe('the copy the page owes the tenant', () => {
  it('says the off state, the review state and the success in the agreed words', () => {
    expect(DISABLED_TITLE).toBe('התשלום עדיין לא זמין בקישור — המשרד ייצור איתכם קשר');
    expect(REVIEW_TITLE).toBe('התשלום בבדיקה — אל תנסו שוב, המשרד יחזור אליכם');
    expect(SUCCESS_TITLE).toBe('הוראת הקבע פעילה ✓');
  });
});

describe('cardReducer — loading the link', () => {
  it('starts loading, and says the link is invalid when there is no token', () => {
    expect(INITIAL_CARD_STATE.view).toBe('loading');
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'noToken' })).toEqual({
      view: 'invalid',
      preview: null,
      result: null,
      message: INVALID_LINK_TEXT,
    });
  });

  it('opens the form on a link that takes a card', () => {
    const loaded = preview();
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loaded', preview: loaded })).toEqual({
      view: 'form',
      preview: loaded,
      result: null,
      message: '',
    });
  });

  it('shows the off state while charging is switched off — ahead of anything else the preview says', () => {
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loaded', preview: preview({ enabled: false }) }).view).toBe('disabled');
    expect(
      cardReducer(INITIAL_CARD_STATE, { type: 'loaded', preview: preview({ enabled: false, error: 'החוזה עדיין לא נחתם.' }) }).view,
    ).toBe('disabled');
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(503, { error: 'x', disabled: true }) })).toMatchObject({
      view: 'disabled',
      message: '',
    });
  });

  it('holds the form back, in the server’s words, when the order takes no card now', () => {
    expect(
      cardReducer(INITIAL_CARD_STATE, {
        type: 'loaded',
        preview: preview({ error: 'החוזה עדיין לא נחתם. יש לחתום על החוזה לפני הזנת הכרטיס.' }),
      }),
    ).toMatchObject({ view: 'blocked', message: 'החוזה עדיין לא נחתם. יש לחתום על החוזה לפני הזנת הכרטיס.' });
  });

  it('reads an unknown link as invalid, in the server’s words', () => {
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(404, { error: 'קישור לא תקין' }) })).toMatchObject({
      view: 'invalid',
      message: 'קישור לא תקין',
    });
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(404) }).message).toBe(INVALID_LINK_TEXT);
  });

  it('reads a try in progress or in review as review', () => {
    expect(
      cardReducer(INITIAL_CARD_STATE, {
        type: 'loadFailed',
        error: refused(409, { success: false, error: 'הניסיון הקודם נמצא בבדיקה במשרד. אל תנסו שוב.', processing: true }),
      }),
    ).toMatchObject({ view: 'review', message: 'הניסיון הקודם נמצא בבדיקה במשרד. אל תנסו שוב.' });
  });

  it('tells a used link, an expired one, a cancelled one and one the server does not name apart', () => {
    expect(
      cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(400, { error: 'הקישור כבר מומש.', already_done: true }) }),
    ).toMatchObject({ view: 'used', message: 'הקישור כבר מומש.' });
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(400, { state: 'expired' }) }).view).toBe('expired');
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(400, { state: 'cancelled' }) }).view).toBe('cancelled');
    expect(
      cardReducer(INITIAL_CARD_STATE, {
        type: 'loadFailed',
        error: refused(400, { success: false, error: 'פג תוקף הקישור. בקשו מהמשרד קישור חדש.' }),
      }),
    ).toMatchObject({ view: 'closed', message: 'פג תוקף הקישור. בקשו מהמשרד קישור חדש.' });
  });

  it('offers a retry, not a verdict, when the link could not be reached', () => {
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: lost })).toMatchObject({
      view: 'unavailable',
      message: UNAVAILABLE_TEXT,
    });
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(502, '<html>Bad gateway</html>') }).message).toBe(
      UNAVAILABLE_TEXT,
    );
    expect(cardReducer(INITIAL_CARD_STATE, { type: 'loadFailed', error: refused(429, { detail: 'יותר מדי בקשות' }) })).toMatchObject({
      view: 'unavailable',
      message: 'יותר מדי בקשות',
    });
    expect(cardReducer({ ...form, view: 'unavailable' }, { type: 'reload' })).toEqual(INITIAL_CARD_STATE);
  });
});

describe('cardReducer — submitting the card', () => {
  it('clears the last refusal when a new try starts', () => {
    expect(cardReducer({ ...form, message: 'שגיאה' }, { type: 'submitStarted' }).message).toBe('');
    expect(cardReducer(form, { type: 'submitStarted' })).toBe(form);
  });

  it('moves to the success screen with what was charged and when the next charge comes', () => {
    const result = { success: true, state: 'active', charged: true, amount: '566.40', next_charge_date: '2026-10-01' };
    expect(cardReducer(form, { type: 'submitted', result })).toEqual({ view: 'success', preview: form.preview, result, message: '' });
  });

  it('keeps the form when the answer does not say it succeeded', () => {
    const result = { success: false, state: '', charged: false, amount: '', next_charge_date: null };
    expect(cardReducer(form, { type: 'submitted', result })).toEqual({ ...form, message: SUBMIT_FAILED_TEXT });
  });

  it('keeps the form with the server’s words for a declined or mistyped card, and for too many tries', () => {
    expect(
      cardReducer(form, { type: 'submitFailed', error: refused(400, { success: false, error: 'התשלום לא אושר. נסו כרטיס אחר או פנו למשרד.' }) }),
    ).toEqual({ ...form, message: 'התשלום לא אושר. נסו כרטיס אחר או פנו למשרד.' });
    expect(cardReducer(form, { type: 'submitFailed', error: refused(429, { detail: 'יותר מדי ניסיונות' }) }).message).toBe(
      'יותר מדי ניסיונות',
    );
    expect(cardReducer(form, { type: 'submitFailed', error: refused(400) }).message).toBe(SUBMIT_FAILED_TEXT);
  });

  it('says plainly that the card may have gone in when no answer came, or the server broke on the way', () => {
    expect(cardReducer(form, { type: 'submitFailed', error: lost })).toEqual({ ...form, message: NO_ANSWER_TEXT });
    expect(cardReducer(form, { type: 'submitFailed', error: refused(500, '<html>') }).message).toBe(NO_ANSWER_TEXT);
    // A proxy's plain-text page is not the server's words.
    expect(cardReducer(form, { type: 'submitFailed', error: refused(504, 'FUNCTION_INVOCATION_TIMEOUT') }).message).toBe(NO_ANSWER_TEXT);
    expect(cardReducer(form, { type: 'submitFailed', error: refused(500, { error: 'שגיאת שרת' }) }).message).toBe('שגיאת שרת');
  });

  it('moves to the screen a refusal names: review, off, used, invalid', () => {
    expect(
      cardReducer(form, {
        type: 'submitFailed',
        error: refused(409, { error: 'החיוב לא אושר בוודאות. המשרד יבדוק לפני ניסיון נוסף — אל תנסו שוב.', processing: true }),
      }),
    ).toMatchObject({ view: 'review', message: 'החיוב לא אושר בוודאות. המשרד יבדוק לפני ניסיון נוסף — אל תנסו שוב.' });
    expect(cardReducer(form, { type: 'submitFailed', error: refused(503, { disabled: true }) }).view).toBe('disabled');
    expect(cardReducer(form, { type: 'submitFailed', error: refused(400, { already_done: true }) }).view).toBe('used');
    expect(cardReducer(form, { type: 'submitFailed', error: refused(404) }).view).toBe('invalid');
  });

  it('keeps the form and its words when the check after a lost answer cannot get through, or finds the form still open', () => {
    const waiting = { ...form, message: NO_ANSWER_TEXT };
    expect(cardReducer(waiting, { type: 'loadFailed', error: lost, recheck: true })).toBe(waiting);
    expect(cardReducer(waiting, { type: 'loaded', preview: preview(), keepMessage: true }).message).toBe(NO_ANSWER_TEXT);
    // …and moves on when the check finds the card went in, or is in review.
    expect(cardReducer(waiting, { type: 'loadFailed', error: refused(400, { already_done: true }), recheck: true }).view).toBe('used');
    expect(cardReducer(waiting, { type: 'loadFailed', error: refused(409, { processing: true }), recheck: true }).view).toBe('review');
    expect(
      cardReducer(waiting, {
        type: 'loaded',
        preview: preview({ error: 'חיוב על החודש הזה כבר בעיבוד או בבדיקה במשרד. אל תנסו שוב — המשרד יחזור אליכם.' }),
        keepMessage: true,
      }).view,
    ).toBe('blocked');
  });
});

describe('shouldRecheckAfterCardSubmit', () => {
  it('reads the link again only when the card may have gone in unseen', () => {
    expect(shouldRecheckAfterCardSubmit(lost)).toBe(true);
    expect(shouldRecheckAfterCardSubmit(refused(500))).toBe(true);
    expect(shouldRecheckAfterCardSubmit(refused(504))).toBe(true);
    expect(shouldRecheckAfterCardSubmit(refused(503))).toBe(false);
    expect(shouldRecheckAfterCardSubmit(refused(409))).toBe(false);
    expect(shouldRecheckAfterCardSubmit(refused(400))).toBe(false);
    expect(shouldRecheckAfterCardSubmit(refused(429))).toBe(false);
  });
});

describe('when the button unlocks', () => {
  it('unlocks once the card is complete, on the form, while nothing is being sent — never a second submit', () => {
    expect(cardProblems(ready, TODAY)).toEqual([]);
    expect(canSubmitCard(ready, { view: 'form', submitting: false }, TODAY)).toBe(true);
    expect(canSubmitCard(ready, { view: 'form', submitting: true }, TODAY)).toBe(false);
    for (const view of ['loading', 'success', 'review', 'disabled', 'used', 'blocked', 'closed'] as const) {
      expect(canSubmitCard(ready, { view, submitting: false }, TODAY)).toBe(false);
    }
  });

  it('names what is still missing, in the order the form asks it', () => {
    expect(cardProblems(EMPTY_CARD_DRAFT, TODAY)).toEqual(['מספר כרטיס תקין', 'תוקף תקין', 'CVV', 'תעודת זהות תקינה של בעל הכרטיס']);
    expect(cardMissingLine(['CVV', 'תוקף תקין'])).toBe('כדי להמשיך חסר: CVV · תוקף תקין');
    expect(cardMissingLine([])).toBe('');
  });

  it('checks the card number as the server does: 12–19 digits and its check digit', () => {
    expect(cardProblems({ ...ready, cardNumber: '4111-1111-1111-1112' }, TODAY)).toEqual(['מספר כרטיס תקין']);
    expect(cardProblems({ ...ready, cardNumber: '41111111111' }, TODAY)).toEqual(['מספר כרטיס תקין']);
    expect(luhnValid('4580 4580 4580 4580')).toBe(true);
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('')).toBe(false);
  });

  it('takes this month as still valid, and neither a past month nor a year too far', () => {
    expect(cardProblems({ ...ready, expiryMonth: '9', expiryYear: '26' }, TODAY)).toEqual([]);
    expect(cardProblems({ ...ready, expiryMonth: '8', expiryYear: '2026' }, TODAY)).toEqual(['תוקף תקין']);
    expect(cardProblems({ ...ready, expiryMonth: '13' }, TODAY)).toEqual(['תוקף תקין']);
    expect(cardProblems({ ...ready, expiryYear: '2047' }, TODAY)).toEqual(['תוקף תקין']);
    expect(cardProblems({ ...ready, expiryYear: '202' }, TODAY)).toEqual(['תוקף תקין']);
    expect(expiryYearOf('28')).toBe(2028);
    expect(expiryYearOf('2031')).toBe(2031);
    expect(expiryYearOf('3')).toBeNull();
  });

  it('wants a 3–4 digit CVV and a valid ID', () => {
    expect(cardProblems({ ...ready, cvv: '12' }, TODAY)).toEqual(['CVV']);
    expect(cardProblems({ ...ready, cvv: '1234' }, TODAY)).toEqual([]);
    expect(cardProblems({ ...ready, cvv: '12a' }, TODAY)).toEqual(['CVV']);
    expect(cardProblems({ ...ready, cardHolderId: '123456789' }, TODAY)).toEqual(['תעודת זהות תקינה של בעל הכרטיס']);
  });

  it('sends digits only, the year in four digits', () => {
    expect(cardPayload({ ...ready, expiryMonth: '09', expiryYear: '28', cardHolderId: '12345678-2' })).toEqual({
      card_number: '4111111111111111',
      expiry_month: 9,
      expiry_year: 2028,
      cvv: '123',
      card_holder_id: '123456782',
    });
  });
});

describe('how it reads', () => {
  it('names a billing month in Hebrew', () => {
    expect(billingMonthLabel('2026-09-01')).toBe('ספטמבר 2026');
    expect(billingMonthLabel('2027-01')).toBe('ינואר 2027');
    expect(billingMonthLabel('2026-13-01')).toBe('');
    expect(billingMonthLabel(null)).toBe('');
  });

  it('says what today’s card charges, and for which month', () => {
    expect(chargePlanText(preview())).toEqual({
      chargesToday: true,
      title: 'לחיוב היום',
      amount: '₪566.40',
      note: 'היום ירד התשלום על ספטמבר 2026, והכרטיס יישמר להוראת הקבע. החיוב הבא: 1.10.2026.',
    });
  });

  it('says plainly when the card is only checked, and when the first charge comes', () => {
    expect(
      chargePlanText(preview({ charge_now: false, charge_amount: '0.00', charge_period: null, next_charge_date: '2026-11-01' })),
    ).toEqual({
      chargesToday: false,
      title: 'היום לא יורד חיוב',
      amount: '',
      note: 'הכרטיס רק יאומת ויישמר להוראת הקבע. החיוב הראשון: 1.11.2026.',
    });
    expect(chargePlanText(preview({ charge_now: false, next_charge_date: null })).note).toBe('הכרטיס רק יאומת ויישמר להוראת הקבע.');
  });

  it('words the button by what it does', () => {
    expect(submitLabel(preview(), false)).toBe('אישור ותשלום');
    expect(submitLabel(preview({ charge_now: false }), false)).toBe('אימות כרטיס');
    expect(submitLabel(preview(), true)).toBe('מעבד…');
    expect(submitLabel(null, false)).toBe('אימות כרטיס');
  });

  it('writes the success screen: the amount charged and the next charge date', () => {
    expect(successLines({ charged: true, amount: '566.40', next_charge_date: '2026-10-01' })).toEqual({
      title: 'הוראת הקבע פעילה ✓',
      charged: 'חויב היום ₪566.40',
      next: 'החיוב הבא: 1.10.2026',
    });
    expect(successLines({ charged: false, amount: '0.00', next_charge_date: '2026-11-01' })).toEqual({
      title: 'הוראת הקבע פעילה ✓',
      charged: 'הכרטיס אומת ונשמר — היום לא חויב סכום',
      next: 'החיוב הבא: 1.11.2026',
    });
    expect(successLines(null).next).toBe('');
  });

  it('writes the header’s line', () => {
    expect(cardHeaderNote(preview())).toBe('דנה לוי · רמת גן');
    expect(cardHeaderNote(preview({ branch_name: '' }))).toBe('דנה לוי');
    expect(cardHeaderNote(null)).toBe('');
  });
});
