import { describe, expect, test } from 'vitest';

import { customerCardFor } from './customerCard';
import { readWaitingEntry, readWaitingMark } from './futureLeads';
import { applyLeadChange, knowsListsApart, readLeadDetail, readLeadRow, readLeadsPage } from './leadsV2';
import {
  callLabel,
  readWaitingState,
  readWaitingSummary,
  sentenceParts,
  summaryOfEntry,
  waitingActText,
  wantedFacts,
} from './waitingSummary';

/**
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.2 – ח.3 — "מחכים שיתפנה מקום" under its own title, the summary of what
 * was asked for, and the way to the customer's card, as the screen reads them. Every name and number is invented.
 */

const SUMMARY = {
  sentence: 'רצו *קפוארה גן חובה* ביום שלישי 17:00 במינץ, לבת 5 · ממתינים מ-11.10, ראשונים בתור',
  sentence_plain: 'רצו קפוארה גן חובה ביום שלישי 17:00 במינץ, לבת 5 · ממתינים מ-11.10, ראשונים בתור',
  entry_id: 7,
  state: 'freed',
  state_label: 'התפנה מקום',
  needs_office: true,
  wanted: { lesson_id: '0b0e', course_id: '77aa', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', end: '17:45', branch: 'מינץ', city: 'פתח תקווה', instructor: 'יוסי כהן', ages: 'גיל 4.5-6', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ', exists: true },
  child: 'בת 5',
  since: '2026-10-11T08:40:00+00:00',
  since_label: '11.10',
  days: 2,
  position: 1,
  queue: 3,
  position_label: 'ראשונים בתור · 3 ממתינים',
  seats: { enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד' },
  phone: '972501234567',
  phone_display: '050-1234567',
  tel: 'tel:+972501234567',
  notified_at: null,
  customer: { family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' },
  alternatives: [
    { lesson_id: '1c2d', course: 'קפוארה גן חובה', day: 'חמישי', start: '17:00', branch: 'מינץ', instructor: 'יוסי כהן', label: 'קפוארה גן חובה · יום חמישי · 17:00 · מינץ', kind: 'same_course', kind_label: 'מועד אחר של אותו חוג', seats_left: 6, seats_label: 'נשארו 6' },
    { lesson_id: '2d3e', course: 'קפוארה כיתות א׳–ב׳', day: 'שני', start: '16:00', branch: 'מינץ', kind: 'same_branch', kind_label: 'חוג אחר באותו סניף', seats_label: 'נשאר מקום אחד' },
  ],
  alternatives_note: '',
  others: [{ sentence: 'רצו *אקרובטיקה* ביום ראשון 16:00', entry_id: 9, state: 'waiting', state_label: 'ממתין', needs_office: false, wanted: { course: 'אקרובטיקה', day: 'ראשון', start: '16:00', branch: 'אם המושבות', label: 'אקרובטיקה · יום ראשון · 16:00 · אם המושבות', exists: true }, alternatives: [] }],
};

describe('`waiting_summary`', () => {
  test('everything the block shows is read: the sentence, the state, the lesson now, the number, what to offer', () => {
    const summary = readWaitingSummary(SUMMARY);
    expect(summary).toMatchObject({
      sentence: SUMMARY.sentence,
      entry_id: 7,
      state: 'freed',
      state_label: 'התפנה מקום',
      needs_office: true,
      child: 'בת 5',
      since_label: '11.10',
      position: 1,
      queue: 3,
      position_label: 'ראשונים בתור · 3 ממתינים',
      phone_display: '050-1234567',
      tel: 'tel:+972501234567',
      alternatives_note: '',
    });
    expect(summary?.wanted).toMatchObject({ course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', end: '17:45', branch: 'מינץ', city: 'פתח תקווה', instructor: 'יוסי כהן', ages: 'גיל 4.5-6', exists: true });
    expect(summary?.seats).toEqual({ enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד' });
    expect(summary?.customer).toEqual({ family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' });
    expect(summary?.alternatives.map((offer) => [offer.label, offer.seats_label, offer.kind_label])).toEqual([
      ['קפוארה גן חובה · יום חמישי · 17:00 · מינץ', 'נשארו 6', 'מועד אחר של אותו חוג'],
      ['קפוארה כיתות א׳–ב׳ · יום שני · 16:00 · מינץ', 'נשאר מקום אחד', 'חוג אחר באותו סניף'],
    ]);
  });

  test('no active entry, or a server built before it: no summary at all', () => {
    expect(readWaitingSummary(null)).toBeNull();
    expect(readWaitingSummary(undefined)).toBeNull();
    expect(readWaitingSummary({})).toBeNull();
    expect(readWaitingSummary('רצו קפוארה')).toBeNull();
  });

  test('what is not known is left empty, never guessed', () => {
    const bare = readWaitingSummary({ sentence: 'רצו קפוארה', entry_id: 3, wanted: { course: 'קפוארה' } });
    expect(bare).toMatchObject({ state: '', state_label: '', needs_office: false, child: '', tel: '', phone_display: '', customer: null, alternatives: [], others: [], position: null });
    expect(bare?.seats.seats_label).toBe('');
    // Without the words of a state, the screen's own.
    expect(readWaitingSummary({ sentence: 'x', state: 'answered' })?.state_label).toBe('הלקוח ענה');
  });

  test('only a number that can be dialled becomes a link to dial', () => {
    const tel = (value: unknown) => readWaitingSummary({ sentence: 'x', tel: value })?.tel;
    expect(tel('tel:+972501234567')).toBe('tel:+972501234567');
    expect(tel('tel:0501234567')).toBe('tel:0501234567');
    expect(tel('javascript:alert(1)')).toBe('');
    expect(tel('https://elsewhere.example')).toBe('');
    expect(tel('tel:abc')).toBe('');
    expect(tel(null)).toBe('');
  });

  test('a lesson that no longer takes place is said to be gone', () => {
    const gone = readWaitingSummary({ sentence: 'רצו ג׳ודו', wanted: { course: 'ג׳ודו', exists: false }, seats: { seats_label: '' }, alternatives: [] });
    expect(gone?.wanted.exists).toBe(false);
    expect(gone?.alternatives).toEqual([]);
  });

  test('never more than six lessons to offer, nor four other entries', () => {
    const offers = Array.from({ length: 9 }, (_, index) => ({ lesson_id: String(index), label: `שיעור ${index}`, seats_label: 'נשארו 2' }));
    const others = Array.from({ length: 7 }, (_, index) => ({ sentence: `רצו ${index}`, entry_id: 20 + index }));
    const summary = readWaitingSummary({ ...SUMMARY, alternatives: offers, others });
    expect(summary?.alternatives).toHaveLength(6);
    expect(summary?.others).toHaveLength(4);
  });

  test('somebody who waits for two lessons: each entry has its own summary — with the same number to call', () => {
    const summary = readWaitingSummary(SUMMARY);
    expect(summaryOfEntry(summary, 7)).toBe(summary);
    const second = summaryOfEntry(summary, 9);
    expect(second).toMatchObject({ entry_id: 9, state: 'waiting', tel: 'tel:+972501234567', phone_display: '050-1234567' });
    expect(second?.customer).toEqual(summary?.customer);
    expect(summaryOfEntry(summary, 404)).toBeNull();
    expect(summaryOfEntry(null, 7)).toBeNull();
  });
});

describe('the words of "מה רצו"', () => {
  test('the class\'s name is the bold piece of the sentence', () => {
    expect(sentenceParts('רצו *קפוארה גן חובה* ביום שלישי')).toEqual([
      { text: 'רצו ', hit: false },
      { text: 'קפוארה גן חובה', hit: true },
      { text: ' ביום שלישי', hit: false },
    ]);
    expect(sentenceParts('רצו קפוארה')).toEqual([{ text: 'רצו קפוארה', hit: false }]);
    // A lone star was not a mark.
    expect(sentenceParts('5 * 3').map((part) => part.text).join('')).toBe('5 * 3');
  });

  test('the short lines: only what is known, a small label each', () => {
    const facts = wantedFacts(readWaitingSummary(SUMMARY)!);
    expect(facts).toEqual([
      { label: 'חוג', value: 'קפוארה גן חובה' },
      { label: 'מתי', value: 'יום שלישי · 17:00–17:45' },
      { label: 'סניף', value: 'מינץ · פתח תקווה' },
      { label: 'מדריך', value: 'יוסי כהן' },
      { label: 'גילים', value: 'גיל 4.5-6' },
      { label: 'על מי', value: 'בת 5' },
      { label: 'ממתינים מ-', value: '11.10' },
      { label: 'בתור', value: 'ראשונים בתור · 3 ממתינים' },
    ]);
    expect(wantedFacts(readWaitingSummary({ sentence: 'x', wanted: { course: 'קפוארה' } })!)).toEqual([{ label: 'חוג', value: 'קפוארה' }]);
  });

  test('the number to call, for a reader of the screen', () => {
    expect(callLabel({ phone_display: '050-1234567' })).toBe('להתקשר ל-050-1234567');
    expect(callLabel({ phone_display: '' })).toBe('להתקשר');
  });

  test('who calls on the office now', () => {
    expect(waitingActText(0)).toBe('');
    expect(waitingActText(null)).toBe('');
    expect(waitingActText(1)).toBe('אחד דורש אותך');
    expect(waitingActText(3)).toBe('3 דורשים אותך');
  });

  test('a state the screen does not know is no state', () => {
    expect(readWaitingState('told')).toBe('told');
    expect(readWaitingState('something')).toBe('');
  });
});

describe('the lists, with the waiting list apart', () => {
  const ROW = { contact_id: 12, name: 'דנה לוי', phone: '972501234567', stage: 'waiting_list', owner: 'office', summary: 'התפנה מקום', next: { who: 'office', what: 'להציע', when: null, state: 'none' } };

  test('a server that knows ח counts the waiting list apart — and that is its sign', () => {
    const page = readLeadsPage({ counts: { office: 3, bot: 41, closed: 25, waiting: 6, waiting_act: 2 }, results: [] });
    expect(page.counts).toEqual({ office: 3, bot: 41, closed: 25, waiting: 6, waiting_act: 2 });
    expect(knowsListsApart(page.counts)).toBe(true);
    const before = readLeadsPage({ counts: { office: 3, bot: 41, closed: 25 }, results: [] });
    expect(before.counts).toEqual({ office: 3, bot: 41, closed: 25 });
    expect(knowsListsApart(before.counts)).toBe(false);
    expect(knowsListsApart(null)).toBe(false);
  });

  test('a row says which of the four lists it stands in, the way to the card, and why a search found it', () => {
    const row = readLeadRow({ ...ROW, list: 'waiting', list_label: 'מחכים שיתפנה מקום', customer: { family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' }, found_by: { kind: 'parent', label: 'הורה', value: 'שירן לוי' } });
    expect(row).toMatchObject({ list: 'waiting', list_label: 'מחכים שיתפנה מקום', found_by: { kind: 'parent', label: 'הורה', value: 'שירן לוי' } });
    expect(customerCardFor(row)).toBe('/customers?child=c1');
    // The label falls back on the screen's own words.
    expect(readLeadRow({ ...ROW, list: 'bot' })?.list_label).toBe('הבוט מטפל');
    // Nobody Kogo knows: the key is there, and says so.
    expect(customerCardFor(readLeadRow({ ...ROW, customer: null }))).toBeNull();
    // A server built before ח sends none of it, and the row is what it was.
    const before = readLeadRow(ROW)!;
    expect('list' in before || 'customer' in before || 'found_by' in before).toBe(false);
  });

  test('the waiting list on a row: where it stands of four, whether it calls on the office, and the line', () => {
    const mark = readWaitingMark({ status: 'freed', entry_id: 7, lesson_id: 'l', label: 'קפוארה · יום שלישי · 17:00 · מינץ', title: 'התפנה מקום בקפוארה', state: 'answered', state_label: 'הלקוח ענה', needs_office: true, position: 1, queue: 3 });
    expect(mark).toMatchObject({ state: 'answered', state_label: 'הלקוח ענה', needs_office: true, position: 1, queue: 3 });
    // On a contact the line is not said.
    expect(readWaitingMark({ status: 'waiting', label: 'x', title: 'y', state: 'waiting', position: null, queue: null })).toMatchObject({ state: 'waiting', state_label: 'ממתין', needs_office: false, position: null, queue: null });
    // A server built before ח: no state at all.
    expect(readWaitingMark({ status: 'waiting', label: 'x', title: 'y' })?.state).toBeUndefined();
  });

  test('an entry of the full list carries the card of the child it is about', () => {
    const entry = readWaitingEntry({ id: 7, status: 'freed', lesson: { id: 'l', label: 'קפוארה' }, contact_id: 12, customer: { family_id: 'f1', child_id: 'c2', link: '/customers?child=c2' } });
    expect(customerCardFor(entry)).toBe('/customers?child=c2');
    expect(customerCardFor(readWaitingEntry({ id: 7, status: 'freed', customer: null }))).toBeNull();
    // A server that does not say: no key, and — an entry carries no `kogo` to fall back on — no button.
    const before = readWaitingEntry({ id: 7, status: 'freed' })!;
    expect('customer' in before).toBe(false);
    expect(customerCardFor(before)).toBeNull();
  });

  test('the details carry the summary — null for somebody who waits for nothing', () => {
    expect(readLeadDetail({ ...ROW, details: { waiting_summary: SUMMARY } })?.details.waiting_summary?.entry_id).toBe(7);
    expect(readLeadDetail({ ...ROW, details: { waiting_summary: null } })?.details.waiting_summary).toBeNull();
    expect('waiting_summary' in (readLeadDetail({ ...ROW, details: {} })?.details ?? {})).toBe(false);
  });

  test('a search brings, beside its rows, people who are no leads and customers with no conversation', () => {
    const page = readLeadsPage({ counts: { office: 0, bot: 0, closed: 0, waiting: 0, waiting_act: 0 }, results: [], found: { total: 0 }, contacts: [{ id: 5, name: 'רון', box_label: 'הבוט עונה' }], customers: [{ family_id: 'f9', name: 'הילה ברק', link: '/customers?child=c9' }], customers_more: false });
    expect(page.contacts?.map((contact) => contact.id)).toEqual([5]);
    expect(page.customers?.map((customer) => customer.name)).toEqual(['הילה ברק']);
    expect(readLeadsPage({ counts: {}, results: [] }).customers).toBeUndefined();
  });

  test('a change to a lead among a search\'s results rewrites its row in place — it is not taken out', () => {
    const lead = readLeadRow({ ...ROW, stage: 'needs_reply', owner: 'office' })!;
    const pages = [readLeadsPage({ counts: { office: 1, bot: 0, closed: 0 }, results: [{ ...ROW, stage: 'needs_reply' }] })];
    const everywhere = applyLeadChange(pages, 'all', lead, { kind: 'owner', owner: 'bot' });
    expect(everywhere[0]?.results.map((row) => [row.contact_id, row.owner])).toEqual([[12, 'bot']]);
    // In the list of the office itself the same change takes the row out.
    expect(applyLeadChange(pages, 'office', lead, { kind: 'owner', owner: 'bot' })[0]?.results).toEqual([]);
  });
});

describe('"לכרטיס הלקוח": the server\'s own word first', () => {
  test('`customer` is what is read when the server sends it; `kogo` is the fallback for a server that does not', () => {
    const kogo = { family_id: 'f1', child_ids: ['old-1'] };
    expect(customerCardFor({ customer: { family_id: 'f1', child_id: 'new-2', link: '/customers?child=new-2' }, kogo })).toBe('/customers?child=new-2');
    expect(customerCardFor({ customer: null, kogo })).toBeNull();
    expect(customerCardFor({ customer: { family_id: 'f1', child_id: null, link: null }, kogo })).toBeNull();
    expect(customerCardFor({ kogo })).toBe('/customers?child=old-1');
    expect(customerCardFor(null)).toBeNull();
  });
});
