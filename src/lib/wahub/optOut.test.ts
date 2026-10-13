/**
 * "ביקש הסר" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.1), as the screens read it: who is on the list is the
 * server's alone, and a server built before the list sends nothing of it — the screen then shows nothing.
 */
import { describe, expect, it } from 'vitest';
import { readLeadRow, leadActions, leadBotBlocked } from './leadsV2';
import {
  OPT_OUT_LABEL,
  OPT_OUT_TEXT,
  botBlockedReason,
  knowsOptOut,
  optOutChip,
  optOutFacts,
  optOutFailedText,
  optOutSource,
  optedOutOf,
  readOptedOut,
  saysOptedOut,
} from './optOut';
import { makeContact } from './testFixtures';
import { notSentText, notifyOutcome, readNotifyPreview } from './waitingList';

/** Tuesday, 13.10.2026, 21:30 in Israel. */
const NOW = new Date('2026-10-13T18:30:00Z');

const BY_MESSAGE = { at: '2026-10-13T18:02:00+00:00', source: 'message', source_label: 'ביקש בהודעה', by_name: null, text: 'הסר', label: 'ביקש הסר' };
const BY_OFFICE = { at: '2026-10-12T09:15:00+00:00', source: 'office', source_label: 'סומן על ידי נציג', by_name: 'מיכל כהן', text: '', label: 'ביקש הסר' };

describe('reading `opted_out`', () => {
  it('the object of the contract, field for field', () => {
    expect(readOptedOut(BY_MESSAGE)).toEqual({ at: '2026-10-13T18:02:00+00:00', source: 'message', source_label: 'ביקש בהודעה', by_name: '', text: 'הסר', label: 'ביקש הסר' });
    expect(readOptedOut(BY_OFFICE)).toMatchObject({ source: 'office', by_name: 'מיכל כהן', text: '' });
  });

  it('null is "not on the list"; so is anything that is not the object', () => {
    for (const raw of [null, undefined, false, true, 'כן', 1, []]) expect(readOptedOut(raw)).toBeNull();
  });

  it('words the server left out are the screen\'s own; a moment that cannot be read is no moment', () => {
    expect(readOptedOut({ source: 'office' })).toEqual({ at: null, source: 'office', source_label: 'סומן על ידי נציג', by_name: '', text: '', label: OPT_OUT_LABEL });
    expect(readOptedOut({ at: 'אתמול', source: 'message' })).toMatchObject({ at: null, source_label: 'ביקש בהודעה' });
    expect(readOptedOut({ source: 'sms' })).toMatchObject({ source: '', source_label: '' });
  });

  it('the key itself is the sign of a server that knows the list — null included', () => {
    expect(knowsOptOut({ opted_out: null })).toBe(true);
    expect(knowsOptOut({ opted_out: BY_MESSAGE })).toBe(true);
    expect(knowsOptOut(makeContact(1))).toBe(false);
    expect(knowsOptOut(null)).toBe(false);
    expect(optedOutOf({ opted_out: null })).toBeNull();
    expect(optedOutOf(makeContact(1))).toBeNull();
  });
});

describe('the mark', () => {
  it('"ביקש הסר · 13.10" — and all of it in one line for whoever hovers', () => {
    const chip = optOutChip(readOptedOut(BY_MESSAGE)!, NOW);
    expect(chip.text).toBe('ביקש הסר · 13.10');
    expect(chip.title).toBe('ביקש הסר · 13.10 21:02 · ביקש בהודעה: "הסר"');
  });

  it('marked by a person: who, and no quote', () => {
    const opted = readOptedOut(BY_OFFICE)!;
    expect(optOutSource(opted)).toBe('סומן על ידי נציג · מיכל כהן');
    expect(optOutChip(opted, NOW).text).toBe('ביקש הסר · 12.10');
  });

  it('with no day to say, the mark is its two words alone', () => {
    expect(optOutChip(readOptedOut({ source: 'office' })!, NOW).text).toBe('ביקש הסר');
  });

  it('a press opens when, where from, and — for their own message — what they wrote', () => {
    expect(optOutFacts(readOptedOut(BY_MESSAGE)!, NOW)).toEqual([
      { label: 'מתי', value: '13.10 21:02' },
      { label: 'מאיפה', value: 'ביקש בהודעה' },
      { label: 'מה נכתב', value: 'הסר', quote: true },
    ]);
    expect(optOutFacts(readOptedOut(BY_OFFICE)!, NOW)).toEqual([
      { label: 'מתי', value: '12.10 12:15' },
      { label: 'מאיפה', value: 'סומן על ידי נציג · מיכל כהן' },
    ]);
  });

  it('a sentence that already says it is not said again beside the mark', () => {
    expect(saysOptedOut('ביקש הסר — הבוט לא חוזר אליו')).toBe(true);
    expect(saysOptedOut('', null, undefined, 'התחילו הרשמה ולא סיימו. ביקש הסר — הבוט לא חוזר אליו')).toBe(true);
    expect(saysOptedOut('אפשר להסיר את הילד מהחוג?', 'מחכה לך: להתקשר')).toBe(false);
  });
});

describe('a lead who asked out', () => {
  const row = (over: Record<string, unknown> = {}) =>
    readLeadRow({ contact_id: 7, name: 'דנה לוי', phone: '972500000007', stage: 'signup_started', owner: 'office', summary: '', chips: {}, next: { who: 'office', what: 'להתקשר', when: null, state: 'none' }, ...over })!;

  it('the row carries the mark only when the server sends the key', () => {
    expect(row().opted_out).toBeUndefined();
    expect(row({ opted_out: null }).opted_out).toBeNull();
    expect(row({ opted_out: BY_MESSAGE }).opted_out).toMatchObject({ source: 'message', text: 'הסר' });
  });

  it('"החזר לבוט" is locked, with the reason — the bot does not come back to them', () => {
    const lead = row({ opted_out: BY_MESSAGE });
    // The set of actions is what it was: the press is offered, and locked.
    expect(leadActions(lead)).toEqual({ owner: 'bot', snooze: true, remove: true, reopen: false });
    expect(leadBotBlocked(lead)).toBe(OPT_OUT_TEXT.botBlocked);
    expect(botBlockedReason(lead)).toBe('ביקש הסר — הבוט לא חוזר אליו');
  });

  it('nothing is locked for whoever did not ask out, for a lead nobody holds ("קח אליי"), or for a closed one', () => {
    expect(leadBotBlocked(row({ opted_out: null }))).toBe('');
    expect(leadBotBlocked(row())).toBe('');
    expect(leadBotBlocked(row({ opted_out: BY_MESSAGE, owner: '' }))).toBe('');
    expect(leadBotBlocked(row({ opted_out: BY_MESSAGE, stage: 'not_interested' }))).toBe('');
  });
});

describe('"להודיע ללקוח" on the waiting list', () => {
  it('`blocked: "opted_out"` — nothing would go out, and the reason is said in plain words', () => {
    const preview = readNotifyPreview({ notify: { can: false, how: '', text: 'היי, התפנה מקום…', blocked: 'opted_out', detail: 'הלקוח ביקש הסר — לא שולחים לו הודעה יזומה. אפשר להתקשר אליו, או להחזיר אותו לתפוצה מתוך השיחה.' } })!;
    expect(preview.can).toBe(false);
    expect(preview.blocked).toBe('opted_out');
    expect(notSentText(preview.blocked, preview.detail)).toBe('הלקוח ביקש הסר — לא שולחים הודעה יזומה. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
  });

  it('a send the server answered with `code: "opted_out"` stays on screen as "לא נשלחה", with the same reason', () => {
    const outcome = notifyOutcome({ sent: false, how: '', code: 'opted_out', detail: '', text: '', already_notified_at: null, already_notified_by_name: '', entry: null, contact: null });
    expect(outcome).toEqual({ kind: 'held', text: 'הלקוח ביקש הסר — לא שולחים הודעה יזומה. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.' });
  });

  it('the list itself could not be read: nothing goes out on a guess, and the screen says that', () => {
    const preview = readNotifyPreview({ notify: { can: false, how: '', text: '', blocked: 'opt_out_list_unavailable', detail: 'לא ניתן לקרוא עכשיו את רשימת "הסר", ולכן שום הודעה לא נשלחה. נסו שוב בעוד רגע.' } })!;
    expect(preview.can).toBe(false);
    expect(notSentText(preview.blocked, preview.detail)).toBe('לא ניתן לקרוא עכשיו את רשימת "הסר", ולכן ההודעה לא נשלחה. נסו שוב בעוד רגע.');
  });
});

describe('a mark that was not saved', () => {
  it('503 `opt_out_list_unavailable`: the list could not be written — said so, and that nothing changed', () => {
    const refused = { response: { status: 503, data: { detail: 'x', code: 'opt_out_list_unavailable' } } };
    expect(optOutFailedText(refused, OPT_OUT_TEXT.markFailed)).toBe(OPT_OUT_TEXT.unavailable);
  });

  it('no answer at all: what happened is not known, and the screen says that — never "saved"', () => {
    expect(optOutFailedText(new Error('timeout'), OPT_OUT_TEXT.markFailed)).toBe(OPT_OUT_TEXT.unknown);
  });

  it('any other refusal is said in the server\'s words, else in the screen\'s', () => {
    expect(optOutFailedText({ response: { status: 404, data: { detail: 'איש הקשר לא נמצא' } } }, OPT_OUT_TEXT.backFailed)).toBe('איש הקשר לא נמצא');
    expect(optOutFailedText({ response: { status: 500, data: '<html>' } }, OPT_OUT_TEXT.backFailed)).toBe(OPT_OUT_TEXT.backFailed);
  });
});
