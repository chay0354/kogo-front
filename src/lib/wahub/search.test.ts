import { describe, expect, test } from 'vitest';

import {
  chatPlace,
  fold,
  foundByLine,
  hasHit,
  markPhone,
  markWords,
  notFoundWords,
  phoneTokens,
  readCustomerRef,
  readFoundBy,
  readSearchExtras,
  resultsWord,
  searchKind,
  wordTokens,
} from './search';

/**
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1 — the screen's side of a search that looks everywhere: what was typed,
 * what is marked on a row, what is read beside the rows, and what is said when nothing was found. Every name and
 * number here is invented.
 */

const hits = (parts: ReturnType<typeof markWords> | null) => (parts ?? []).filter((part) => part.hit).map((part) => part.text);

describe('what was typed', () => {
  test('a number is four digits or more, whatever stands between them', () => {
    expect(phoneTokens('0501234567')).toEqual(['0501234567']);
    expect(phoneTokens('050-123-4567')).toEqual(['0501234567']);
    expect(phoneTokens('+972 50 123 4567')).toEqual(['972501234567']);
    expect(phoneTokens('(050) 123.4567')).toEqual(['0501234567']);
    expect(phoneTokens('1234')).toEqual(['1234']);
  });

  test('fewer than four digits is a word, not a number', () => {
    expect(phoneTokens('050')).toEqual([]);
    expect(wordTokens('050')).toEqual(['050']);
    expect(searchKind('050')).toBe('words');
  });

  test('words and a number may be mixed', () => {
    expect(phoneTokens('דנה 0501234')).toEqual(['0501234']);
    expect(wordTokens('דנה 0501234')).toEqual(['דנה']);
    expect(searchKind('דנה 0501234')).toBe('mixed');
    expect(searchKind('0501234')).toBe('phone');
    expect(searchKind('דנ לו')).toBe('words');
    expect(searchKind('   ')).toBe('');
  });

  test('a word is compared without vowel points, a geresh, a hyphen or a final letter', () => {
    expect(fold('כהן').folded).toBe('כהנ');
    expect(fold("ג'ני").folded).toBe('גני');
    expect(fold('גֶ׳ני').folded).toBe('גני');
    expect(fold('בן-דוד').folded).toBe('בנ דוד');
    expect(fold('Dana').folded).toBe('dana');
    expect(wordTokens('בן-דוד')).toEqual(['בנ', 'דוד']);
  });
});

describe('marking what matched', () => {
  test('a name is marked wherever a typed word stands in it — in any order, by a part of a word', () => {
    expect(hits(markWords('דנה לוי', 'לו דנ'))).toEqual(['דנ', 'לו']);
    expect(hits(markWords('לוי דנה', 'דנה לוי'))).toEqual(['לוי', 'דנה']);
    expect(markWords('דנה לוי', 'דנ').map((part) => part.text).join('')).toBe('דנה לוי');
  });

  test('the mark stands on the letters as they are written — a final letter, a geresh, a hyphen', () => {
    expect(hits(markWords('משפחת כהן', 'כהנ'))).toEqual(['כהן']);
    expect(hits(markWords("ג'ני לוי", 'גני'))).toEqual(["ג'ני"]);
    expect(hits(markWords('רון בן-דוד', 'בן דוד'))).toEqual(['בן', 'דוד']);
  });

  test('a word of one letter marks nothing; nor does a search of numbers alone', () => {
    expect(hasHit(markWords('דנה לוי', 'ד'))).toBe(false);
    expect(hasHit(markWords('דנה לוי', '0501234567'))).toBe(false);
    expect(markWords('דנה לוי', '')).toEqual([{ text: 'דנה לוי', hit: false }]);
  });

  test('a phone is marked on the digits that matched, hyphens between them and all', () => {
    expect(hits(markPhone('050-123-4567', '0501234567'))).toEqual(['050-123-4567']);
    expect(hits(markPhone('050-123-4567', '1234'))).toEqual(['123-4']);
    expect(hits(markPhone('050-123-4567', '4567'))).toEqual(['4567']);
  });

  test('the same number in any spelling: with 972, with a plus and spaces, without the leading zero', () => {
    for (const typed of ['972501234567', '+972 50-123 4567', '501234567', '050 123 4567']) {
      expect(hits(markPhone('050-123-4567', typed))).toEqual(['050-123-4567'].map((whole) => (typed === '501234567' ? '50-123-4567' : whole)));
    }
  });

  test('a phone the typed number is not in is not marked: the row was found by something else', () => {
    expect(markPhone('050-123-4567', '9999')).toBeNull();
    expect(markPhone('050-123-4567', 'דנה')).toBeNull();
    expect(markPhone('', '1234')).toBeNull();
  });
});

describe('reading what the server sent', () => {
  test('`customer`: the family, the child the card opens on, and the server\'s own link', () => {
    expect(readCustomerRef({ family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' })).toEqual({ family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' });
    // No link sent: the card of the child that is named.
    expect(readCustomerRef({ family_id: 'f1', child_id: 'c 2' })?.link).toBe('/customers?child=c%202');
    // A family with no child has no card.
    expect(readCustomerRef({ family_id: 'f1', child_id: null, link: null })).toEqual({ family_id: 'f1', child_id: null, link: null });
    // A link that leads out of the customers section is not ours to follow.
    expect(readCustomerRef({ family_id: 'f1', child_id: null, link: 'https://elsewhere.example' })?.link).toBeNull();
    expect(readCustomerRef(null)).toBeNull();
    expect(readCustomerRef({ child_id: 'c1' })).toBeNull();
  });

  test('`found_by`: null when the row was found by what it already shows', () => {
    expect(readFoundBy({ kind: 'child', label: 'ילד/ה', value: 'נועם לוי' })).toEqual({ kind: 'child', label: 'ילד/ה', value: 'נועם לוי' });
    expect(readFoundBy(null)).toBeNull();
    expect(readFoundBy({})).toBeNull();
    expect(foundByLine({ kind: 'child', label: 'ילד/ה', value: 'נועם לוי' })).toBe('נמצא לפי: ילד/ה — נועם לוי');
    expect(foundByLine({ kind: 'text', label: 'מופיע בשיחה', value: '' })).toBe('נמצא לפי: מופיע בשיחה');
    expect(foundByLine(null)).toBe('');
  });

  test('beside the rows: customers in Kogo with no conversation, and people who are not in the list', () => {
    const extras = readSearchExtras({
      results: [],
      customers: [
        { family_id: '8f1c', name: 'דנה לוי', family_name: 'לוי', phone: '0501234567', phone_display: '050-1234567', children: [{ id: 'c1', name: 'נועם לוי', status: 'active', status_label: 'פעיל' }], child_id: 'c1', link: '/customers?child=c1', contact_id: null, found_by: { kind: 'phone', label: 'טלפון', value: '050-1234567' } },
        { family_id: '9a2b', name: '', family_name: 'שלום', phone: '0547000191', children: [], child_id: null, link: null, contact_id: 31 },
        { name: 'no family' },
      ],
      customers_more: true,
      contacts: [{ id: 12, name: 'דנה לוי', phone_display: '050-1234567', is_demo: false, box: 'all', box_label: 'הבוט עונה', found_by: null, customer: { family_id: 'f', child_id: 'c9', link: '/customers?child=c9' }, link: '/wahub?tab=chats&contact=12' }],
    });
    expect(extras?.customers).toHaveLength(2);
    expect(extras?.customers[0]).toMatchObject({ family_id: '8f1c', name: 'דנה לוי', phone_display: '050-1234567', link: '/customers?child=c1', contact_id: null });
    expect(extras?.customers[0].children).toEqual([{ id: 'c1', name: 'נועם לוי', status_label: 'פעיל' }]);
    // A family with no child: shown, with no card to open; the name falls back on the family's.
    expect(extras?.customers[1]).toMatchObject({ name: 'שלום', phone_display: '0547000191', link: null, contact_id: 31 });
    expect(extras?.customers_more).toBe(true);
    expect(extras?.contacts).toEqual([{ id: 12, name: 'דנה לוי', phone_display: '050-1234567', is_demo: false, box_label: 'הבוט עונה', found_by: null, customer_link: '/customers?child=c9' }]);
  });

  test('never more than five of each; and an answer with neither key is not a search\'s answer at all', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ family_id: `f${index}`, name: `משפחה ${index}` }));
    expect(readSearchExtras({ customers: many })?.customers).toHaveLength(5);
    expect(readSearchExtras({ customers: [] })).toEqual({ customers: [], customers_more: false, contacts: [] });
    // A server built before ח, or no search: nothing beside the rows.
    expect(readSearchExtras({ count: 3, results: [] })).toBeNull();
    expect(readSearchExtras(null)).toBeNull();
  });
});

describe('the words of the screen', () => {
  test('nothing found says what was looked for, and what was looked through', () => {
    expect(notFoundWords('050-1234567', 'chats', true)).toEqual({
      title: 'לא נמצאה שיחה עם המספר הזה',
      text: 'חיפשנו בכל השיחות — בכל צורה שבה כותבים מספר, וגם בפרטי המשפחות במערכת.',
    });
    expect(notFoundWords('דנה', 'chats', true).title).toBe('לא נמצאה שיחה שמתאימה לחיפוש');
    expect(notFoundWords('דנה 0501234', 'chats', true).title).toBe('לא נמצאה שיחה עם השם והמספר האלה יחד');
    expect(notFoundWords('0501234567', 'leads', true).title).toBe('לא נמצא ליד עם המספר הזה');
    expect(notFoundWords('דנה', 'leads', true).title).toBe('לא נמצא ליד שמתאים לחיפוש');
    // A server that did not look through the families is not said to have.
    expect(notFoundWords('0501234567', 'chats', false).text).not.toContain('משפחות');
  });

  test('how many were found', () => {
    expect(resultsWord(1)).toBe('תוצאה אחת');
    expect(resultsWord(12)).toBe('12 תוצאות');
  });

  test('where a conversation stands: the server\'s own word, and the colour kept for it — red for "מבקש נציג" alone', () => {
    expect(chatPlace({ box: 'needs_human', box_label: 'מבקש נציג' })).toEqual({ label: 'מבקש נציג', tone: 'danger' });
    expect(chatPlace({ box: 'human', box_label: 'בטיפול נציג' })?.tone).toBe('gold');
    expect(chatPlace({ box: 'open', box_label: 'ליד עתידי — הגיע היום' })?.tone).toBe('gold');
    expect(chatPlace({ box: 'waiting', box_label: 'ממתין למענה' })?.tone).toBe('warning');
    expect(chatPlace({ box: 'future', box_label: 'ליד עתידי' })?.tone).toBe('muted');
    expect(chatPlace({ box: 'all', box_label: 'הבוט עונה' })?.tone).toBe('muted');
    // A server built before ח says nothing, and nothing is drawn.
    expect(chatPlace({})).toBeNull();
  });
});
