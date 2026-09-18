import { describe, expect, it } from 'vitest';
import { normalizeOverview, type NumberRun, type SeriesOverview } from '@/lib/numberingApi';
import {
  canConfirmOpening,
  confirmationText,
  defaultTypeFor,
  editDraft,
  firstNumberPreview,
  formatRunNumber,
  legacyLastNumbers,
  mappingRows,
  openingPayload,
  openingProblems,
  parseLastNumber,
  runStatus,
  runsOf,
  typeChoices,
  type OpeningDraft,
} from './numbering';

function run(over: Partial<NumberRun>): NumberRun {
  const series = over.series ?? 'TI';
  const year = over.year ?? 2026;
  return {
    series,
    year,
    name: `${series}-${year}`,
    label: 'חשבונית מס · ידני',
    document_type: 'tax_invoice',
    issued: 0,
    first: '',
    last: '',
    next_number: `${series}-${year}-000001`,
    start: 1,
    can_open: true,
    reason: '',
    opening: null,
    ...over,
  };
}

const COMBINED = ['IR', 'ST', 'RT', 'IRM'];

function overview(over: Partial<SeriesOverview> = {}, continued: Record<string, Record<string, string>> = {}): SeriesOverview {
  return {
    current_year: 2026,
    years: [2026, 2027],
    runs: [],
    previous_types: [
      { label: 'חשבונית מס', document_type: 'tax_invoice', series_options: ['TI'], suggested: { 2026: 'TI', 2027: 'TI' }, continued_by: continued['חשבונית מס'] ?? {} },
      { label: 'קבלה', document_type: 'receipt', series_options: ['RC'], suggested: { 2026: 'RC', 2027: 'RC' }, continued_by: continued['קבלה'] ?? {} },
      { label: 'חשבונית מס זיכוי', document_type: 'credit_invoice', series_options: ['CR'], suggested: { 2026: 'CR', 2027: 'CR' }, continued_by: continued['חשבונית מס זיכוי'] ?? {} },
      { label: 'חשבון עיסקה', document_type: 'transaction_invoice', series_options: ['SD', 'TX'], suggested: { 2026: 'TX', 2027: 'TX' }, continued_by: continued['חשבון עיסקה'] ?? {} },
      { label: 'חשבונית מס קבלה', document_type: 'combined', series_options: COMBINED, suggested: { 2026: 'IRM', 2027: 'IR' }, continued_by: continued['חשבונית מס קבלה'] ?? {} },
    ],
    ...over,
  };
}

const ready: OpeningDraft = { typeLabel: 'חשבונית מס', lastText: '40413', checked: true, submitting: false };

describe('numbers', () => {
  it('pads to six digits and keeps every digit past them', () => {
    expect(formatRunNumber('TI', 2026, 40414)).toBe('TI-2026-040414');
    expect(formatRunNumber('IRM', 2026, 1_000_000)).toBe('IRM-2026-1000000');
    expect(formatRunNumber('RC', 2027, 7)).toBe('RC-2027-000007');
  });

  it('reads the last number as the office types it', () => {
    expect(parseLastNumber('40413')).toBe(40413);
    expect(parseLastNumber(' 121,882 ')).toBe(121882);
    expect(parseLastNumber('999999')).toBe(999999);
  });

  it('refuses what is not a last number', () => {
    for (const text of ['', '   ', '0', '-5', '40413.5', '4O413', 'abc', '999999999']) {
      expect(parseLastNumber(text), text).toBeNull();
    }
  });

  it('shows the first number the run will take before anything is confirmed', () => {
    expect(firstNumberPreview('TI', 2026, '40413')).toBe('TI-2026-040414');
    expect(firstNumberPreview('IRM', 2026, '121882')).toBe('IRM-2026-121883');
    expect(firstNumberPreview('CR', 2026, '999999')).toBe('CR-2026-1000000');
    expect(firstNumberPreview('TI', 2026, '')).toBe('');
  });
});

describe('runStatus', () => {
  it('a continued run says what it continues', () => {
    const status = runStatus(run({
      can_open: false,
      reason: 'הסדרה כבר ממשיכה…',
      start: 40414,
      opening: {
        series: 'TI', year: 2026, start: 40414, previous_last_number: 40413, previous_type_label: 'חשבונית מס',
        note: '', created_by: 'דור', created_at: null, continues: 'ממשיך את הסדרה של התוכנה הקודמת (אחרון 40413)',
      },
    }));
    expect(status.tone).toBe('continued');
    expect(status.detail).toBe('ממשיך את הסדרה של התוכנה הקודמת (אחרון 40413)');
  });

  it('a run that issued nothing can still be continued', () => {
    const status = runStatus(run({}));
    expect(status.tone).toBe('open');
    expect(status.detail).toBe('לא הונפקו מסמכים בסדרה ב-2026.');
  });

  it('a run that already issued this year says so and when it can be continued', () => {
    const reason = 'בסדרה כבר הונפקו 250 מסמכים ב-2026, ומספר שהונפק לא משתנה. אפשר להמשיך בה את הסדרה של התוכנה הקודמת החל משנת המס 2027.';
    const status = runStatus(run({ series: 'IR', issued: 250, can_open: false, reason }));
    expect(status.tone).toBe('issued');
    expect(status.detail).toBe(reason);
  });

  it('a run closed for another reason says the server\'s reason', () => {
    const status = runStatus(run({ series: 'IR', can_open: false, reason: 'חשבונית מס קבלה של התוכנה הקודמת כבר ממשיכה ב-IRM-2026.' }));
    expect(status.tone).toBe('closed');
    expect(status.detail).toContain('IRM-2026');
  });
});

describe('which old run a kogo run continues', () => {
  it('offers only the old runs of the same document type', () => {
    expect(typeChoices(overview(), run({ series: 'TI' })).map((choice) => choice.label)).toEqual(['חשבונית מס']);
    expect(typeChoices(overview(), run({ series: 'IRM', document_type: 'combined' })).map((choice) => choice.label))
      .toEqual(['חשבונית מס קבלה']);
    expect(typeChoices(overview(), run({ series: 'SD', document_type: 'transaction_invoice' })).map((choice) => choice.label))
      .toEqual(['חשבון עיסקה']);
  });

  it('suggests the invoice-receipt run to IRM this year and IR next year, as the server does', () => {
    const data = overview();
    expect(defaultTypeFor(data, run({ series: 'IRM' }))).toBe('חשבונית מס קבלה');
    expect(typeChoices(data, run({ series: 'IRM', year: 2026 }))[0].suggested).toBe(true);
    expect(typeChoices(data, run({ series: 'IR', year: 2026 }))[0].suggested).toBe(false);
    expect(typeChoices(data, run({ series: 'IR', year: 2027 }))[0].suggested).toBe(true);
  });

  it('an old run already continued this year is taken for every other run of its type', () => {
    const data = overview({}, { 'חשבונית מס קבלה': { 2026: 'IRM' } });
    const choice = typeChoices(data, run({ series: 'IR', year: 2026 }))[0];
    expect(choice.takenBy).toBe('IRM-2026');
    expect(defaultTypeFor(data, run({ series: 'IR', year: 2026 }))).toBe('');
    // Not taken next year, and not "taken" from the run that holds it.
    expect(typeChoices(data, run({ series: 'IR', year: 2027 }))[0].takenBy).toBe('');
    expect(typeChoices(data, run({ series: 'IRM', year: 2026 }))[0].takenBy).toBe('');
  });

  it('lists the suggested mapping of a year, and whether each suggestion can still be taken', () => {
    const runs = [
      run({ series: 'TI', can_open: false, opening: null, issued: 3, reason: 'כבר הונפקו' }),
      run({ series: 'RC' }),
      run({ series: 'CR' }),
      run({ series: 'TX' }),
      run({ series: 'IRM' }),
    ];
    const rows = mappingRows(overview({ runs }, { 'חשבונית מס זיכוי': { 2026: 'CR' } }), 2026);
    expect(rows.map((row) => [row.label, row.suggested, row.continuedBy, row.available])).toEqual([
      ['חשבונית מס', 'TI', '', false],
      ['קבלה', 'RC', '', true],
      ['חשבונית מס זיכוי', 'CR', 'CR', true],
      ['חשבון עיסקה', 'TX', '', true],
      ['חשבונית מס קבלה', 'IRM', '', true],
    ]);
  });
});

describe('the confirmation', () => {
  it('may be pressed only with a type, a number and the check in the old software', () => {
    const data = overview();
    const ti = run({});
    expect(canConfirmOpening(data, ti, ready)).toBe(true);
    expect(canConfirmOpening(data, ti, { ...ready, checked: false })).toBe(false);
    expect(canConfirmOpening(data, ti, { ...ready, lastText: '' })).toBe(false);
    expect(canConfirmOpening(data, ti, { ...ready, lastText: '0' })).toBe(false);
    expect(canConfirmOpening(data, ti, { ...ready, typeLabel: '' })).toBe(false);
    expect(canConfirmOpening(data, ti, { ...ready, submitting: true })).toBe(false);
  });

  it('names what is missing', () => {
    const problems = openingProblems(overview(), run({}), { typeLabel: '', lastText: 'x', checked: false, submitting: false });
    expect(problems).toEqual([
      'יש לבחור את סוג המסמך בתוכנה הקודמת',
      'יש להקליד את המספר האחרון שהונפק בתוכנה הקודמת',
      'יש לאשר שהמספר נבדק בתוכנה הקודמת עצמה',
    ]);
  });

  it('is refused for a type of another document type, a taken old run, or a run that cannot be opened', () => {
    const data = overview({}, { 'חשבונית מס קבלה': { 2026: 'IRM' } });
    expect(canConfirmOpening(data, run({ series: 'RC' }), ready)).toBe(false);
    expect(canConfirmOpening(data, run({ series: 'IR' }), { ...ready, typeLabel: 'חשבונית מס קבלה' })).toBe(false);
    const issued = run({ issued: 3, can_open: false, reason: 'בסדרה כבר הונפקו 3 מסמכים ב-2026' });
    expect(openingProblems(data, issued, ready)[0]).toContain('כבר הונפקו');
  });

  it('changing the number or the type takes the confirmation back', () => {
    expect(editDraft(ready, { lastText: '40414' }).checked).toBe(false);
    expect(editDraft(ready, { typeLabel: 'קבלה' }).checked).toBe(false);
    expect(editDraft(ready, { lastText: '40413' }).checked).toBe(true);
    expect(editDraft({ ...ready, checked: false }, { checked: true }).checked).toBe(true);
  });

  it('sends the old last number and the start after it', () => {
    expect(openingPayload(overview(), run({}), { ...ready, lastText: '40,413' }, '  בדקתי ב-18.9  ')).toEqual({
      series: 'TI',
      year: 2026,
      start: 40414,
      previous_last_number: 40413,
      previous_type_label: 'חשבונית מס',
      note: 'בדקתי ב-18.9',
    });
    expect(openingPayload(overview(), run({}), { ...ready, checked: false }, '')).toBeNull();
  });

  it('confirms the number and the type by name', () => {
    expect(confirmationText('חשבונית מס', '40413')).toContain('40413 הוא המספר האחרון שהונפק בחשבונית מס');
    expect(confirmationText('', '')).toContain('(לא רק בקובץ הייצוא) שהמספר שהוקלד הוא');
  });
});

describe('prefill from the legacy import', () => {
  it('reads a list under any of the usual keys and keeps the highest number of a type', () => {
    expect(legacyLastNumbers({
      series: [
        { type_label: 'חשבונית מס', last_number: 40413 },
        { type_label: 'חשבונית מס', last_number: '40,100' },
        { label: 'חשבון עסקה', last: '60012' },
        { previous_type_label: 'חשבונית מס/קבלה', previous_last_number: 121882 },
        { type: 'הצעת מחיר', last_number: 5 },
        { type_label: 'קבלה', last_number: 'לא ידוע' },
      ],
    })).toEqual({ 'חשבונית מס': 40413, 'חשבון עיסקה': 60012, 'חשבונית מס קבלה': 121882 });
    expect(legacyLastNumbers([{ name: 'קבלה', max_number: 33403 }])).toEqual({ 'קבלה': 33403 });
  });

  it('reads the legacy import\'s own answer by its document types', () => {
    const answer = {
      series: [
        { doc_type: 'combined', label: 'חשבונית מס/קבלה', original_labels: ['חשבונית מס קבלה'], count: 900, first_number: 100, last_number: 121882, last_date: '2026-09-02' },
        { doc_type: 'tax_invoice', label: 'חשבונית מס', last_number: 40413, last_date: '2026-09-15' },
        { doc_type: 'receipt', label: 'קבלה', last_number: 33403, last_date: '2026-09-16' },
        { doc_type: 'transaction_invoice', label: 'חשבונית עסקה', last_number: 60012, last_date: '2025-04-09' },
        { doc_type: 'credit_invoice', label: 'חשבונית מס זיכוי', last_number: 41047, last_date: '2026-08-09' },
      ],
    };
    expect(legacyLastNumbers(answer)).toEqual({
      'חשבונית מס קבלה': 121882,
      'חשבונית מס': 40413,
      'קבלה': 33403,
      'חשבון עיסקה': 60012,
      'חשבונית מס זיכוי': 41047,
    });
  });

  it('is nothing when the import is not there', () => {
    expect(legacyLastNumbers(null)).toEqual({});
    expect(legacyLastNumbers('<html>')).toEqual({});
    expect(legacyLastNumbers({ detail: 'Not found.' })).toEqual({});
  });
});

describe('normalizeOverview', () => {
  it('fills what a partial answer leaves out and keeps each year\'s runs apart', () => {
    const data = normalizeOverview({
      current_year: 2026,
      years: [2026, 2027],
      runs: [
        { series: 'TI', year: 2026, name: 'TI-2026', issued: '2', start: '40414' },
        { series: 'TI', year: 2027, name: 'TI-2027' },
      ],
      previous_types: [{ label: 'חשבונית מס', series_options: ['TI'], suggested: { 2026: 'TI' } }],
    });
    expect(runsOf(data, 2026).map((item) => [item.issued, item.start, item.opening, item.reason])).toEqual([[2, 40414, null, '']]);
    expect(runsOf(data, 2027)).toHaveLength(1);
    expect(data.previous_types[0].continued_by).toEqual({});
    expect(normalizeOverview(undefined).runs).toEqual([]);
  });
});
