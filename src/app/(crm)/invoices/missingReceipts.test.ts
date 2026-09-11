/**
 * The missing-receipts panel's rules: the confirmation states every fact the
 * server acts on, the buttons open only when they should, a row a hand-issued
 * document may cover starts unticked, only ticked rows are issued, and a
 * refusal or failure reaches the screen in words the office can act on.
 */
import { describe, expect, it } from 'vitest';
import type { MissingReceiptRow, SeriesRunCheck } from '@/lib/documentsApi';
import {
  canConfirmIssue,
  canStartIssue,
  continuityGaps,
  defaultSelection,
  failedLines,
  isAllSelected,
  isConfirmWord,
  ISSUE_FAILED_MESSAGE,
  issueBatch,
  issueButtonLabel,
  issueConfirmationLines,
  issueSummary,
  manualDocumentNote,
  reconcileSelection,
  selectAllLabel,
  selectAllOrClear,
  serverErrorText,
  toggleSelected,
  yearOptions,
} from './missingReceipts';

const row = (id: string, manualNumber?: string): MissingReceiptRow => ({
  payment_id: id,
  paid_at: '2026-03-10T10:00:00+02:00',
  family_name: 'כהן',
  child_name: 'דנה כהן',
  description: 'ג׳ודו מתחילים',
  amount: '236.00',
  channel: 'standing_order',
  channel_label: 'הוראת קבע',
  method: '',
  method_label: 'לא רשום',
  possible_manual_document: manualNumber ? { number: manualNumber, date: '2026-04-20', amount: '236.00' } : null,
});

describe('issueConfirmationLines', () => {
  const text = issueConfirmationLines(3, 'IR-2026-000124').join('\n');

  it('says the receipts are dated today and marked late with the original payment date', () => {
    expect(text).toContain('יתוארכו להיום');
    expect(text).toContain('"הופק באיחור"');
    expect(text).toContain('תאריך התשלום המקורי');
  });

  it('says they are not emailed to customers', () => {
    expect(text).toContain('לא יישלחו במייל ללקוחות');
  });

  it('says they take the next IR numbers and cannot be undone', () => {
    expect(text).toContain('המספרים הבאים בסדרת IR');
    expect(text).toContain('IR-2026-000124');
    expect(text).toContain('אי אפשר לבטל');
  });

  it('says to do this only after the accountant approved', () => {
    expect(text).toContain('רק אחרי שרואה החשבון אישר');
  });

  it('counts the receipts of the ticked charges, and words a single one', () => {
    expect(issueConfirmationLines(3)[0]).toContain('יופקו 3 קבלות');
    expect(issueConfirmationLines(3)[0]).toContain('שנבחר');
    expect(issueConfirmationLines(1)[0]).toContain('קבלה אחת');
  });

  it('still names the IR run without a number to start from', () => {
    const lines = issueConfirmationLines(2);
    expect(lines.join('\n')).toContain('סדרת IR');
    expect(lines.join('\n')).not.toContain('החל מ-');
  });

  it('warns when a ticked charge may already have a hand-issued document', () => {
    expect(issueConfirmationLines(3, undefined, 0).join('\n')).not.toContain('מסמך ידני');
    expect(issueConfirmationLines(3, undefined, 1).join('\n')).toContain('לחיוב אחד שנבחר ייתכן שכבר הופק מסמך ידני');
    expect(issueConfirmationLines(3, undefined, 2).join('\n')).toContain('ל-2 מהחיובים שנבחרו');
  });
});

describe('issueButtonLabel', () => {
  it('names how many receipts', () => {
    expect(issueButtonLabel(12)).toBe('הפקת 12 קבלות');
    expect(issueButtonLabel(1)).toBe('הפקת קבלה אחת');
    expect(issueButtonLabel(0)).toBe('הפקת 0 קבלות');
  });
});

describe('the confirm word', () => {
  it('accepts the word, with stray spaces', () => {
    expect(isConfirmWord('הפק')).toBe(true);
    expect(isConfirmWord('  הפק ')).toBe(true);
  });

  it('refuses anything else', () => {
    for (const typed of ['', 'הפקה', 'כן', 'הפ', 'הפק!']) expect(isConfirmWord(typed)).toBe(false);
  });
});

describe('enablement', () => {
  it('opens the confirmation only with charges to issue and nothing in flight', () => {
    expect(canStartIssue({ count: 2, loading: false, busy: false })).toBe(true);
    expect(canStartIssue({ count: 0, loading: false, busy: false })).toBe(false);
    expect(canStartIssue({ count: 2, loading: true, busy: false })).toBe(false);
    expect(canStartIssue({ count: 2, loading: false, busy: true })).toBe(false);
  });

  it('issues only once the word is typed, and not twice at once', () => {
    expect(canConfirmIssue({ typed: 'הפק', issuing: false })).toBe(true);
    expect(canConfirmIssue({ typed: '', issuing: false })).toBe(false);
    expect(canConfirmIssue({ typed: 'הפק', issuing: true })).toBe(false);
  });
});

describe('manualDocumentNote', () => {
  it('names the document a row may already have', () => {
    expect(manualDocumentNote(row('a', 'IRM-2026-000007'))).toBe('ייתכן שכבר הופק ידנית: IRM-2026-000007');
  });

  it('says nothing for a row without one', () => {
    expect(manualDocumentNote(row('a'))).toBe('');
    expect(manualDocumentNote({ possible_manual_document: undefined })).toBe('');
  });
});

describe('selection', () => {
  const rows = [row('a'), row('b', 'IRM-2026-000007'), row('c')];

  it('ticks every row by default, except one a hand-issued document may cover', () => {
    expect([...defaultSelection(rows)]).toEqual(['a', 'c']);
  });

  it('keeps the office’s choices across a reload, defaults new rows, and drops rows gone', () => {
    const chosen = new Set(['b', 'c']); // 'a' unticked, flagged 'b' ticked by hand
    const next = [row('b', 'IRM-2026-000007'), row('c'), row('d'), row('e', 'RC-2026-000001')];

    expect([...reconcileSelection(rows, chosen, next)].sort()).toEqual(['b', 'c', 'd']);
  });

  it('starts from the defaults for a list it has not seen (another year)', () => {
    expect([...reconcileSelection([], new Set(), rows)]).toEqual(['a', 'c']);
  });

  it('toggles one row', () => {
    expect([...toggleSelected(new Set(['a']), 'b')].sort()).toEqual(['a', 'b']);
    expect([...toggleSelected(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('selects all, flagged rows included, and clears when all are selected', () => {
    const all = selectAllOrClear(rows, new Set(['a']));
    expect([...all].sort()).toEqual(['a', 'b', 'c']);
    expect(isAllSelected(rows, all)).toBe(true);
    expect(selectAllLabel(rows, all)).toBe('ניקוי הבחירה');
    expect([...selectAllOrClear(rows, all)]).toEqual([]);
    expect(selectAllLabel(rows, new Set(['a']))).toBe('בחירת הכל');
    expect(isAllSelected([], new Set())).toBe(false);
  });
});

describe('issueBatch', () => {
  it('issues only the ticked rows, in the list’s order', () => {
    const rows = [row('a'), row('b'), row('c')];
    expect(issueBatch(rows, new Set(['c', 'a'])).map((r) => r.payment_id)).toEqual(['a', 'c']);
    expect(issueBatch(rows, new Set())).toEqual([]);
  });

  it('stops at what the server takes in one request — a hundred', () => {
    const rows = Array.from({ length: 130 }, (_, i) => row(`p-${i}`));
    const batch = issueBatch(rows, defaultSelection(rows));
    expect(batch).toHaveLength(100);
    expect(batch[0].payment_id).toBe('p-0');
    expect(batch[99].payment_id).toBe('p-99');
  });
});

describe('yearOptions', () => {
  it('lists this year first and the years before it', () => {
    expect(yearOptions(2026, 3)).toEqual([2026, 2025, 2024]);
  });
});

describe('continuityGaps', () => {
  const run = (over: Partial<SeriesRunCheck>): SeriesRunCheck => ({
    series: 'IR', year: 2026, name: 'IR-2026', label: 'lessons', issued: 3,
    first: 'IR-2026-000001', last: 'IR-2026-000003', missing: [], complete: true, ...over,
  });

  it('names only the runs with a missing number', () => {
    expect(continuityGaps([
      run({}),
      run({ series: 'RC', name: 'RC-2026', missing: ['RC-2026-000002'], complete: false }),
    ])).toEqual(['חור בסדרה RC-2026: RC-2026-000002']);
  });

  it('shows the first ten and counts the rest', () => {
    const missing = Array.from({ length: 12 }, (_, i) => `IR-2026-${String(i + 1).padStart(6, '0')}`);
    const [line] = continuityGaps([run({ missing, complete: false })]);
    expect(line).toContain('IR-2026-000010');
    expect(line).not.toContain('IR-2026-000011');
    expect(line).toContain('ועוד 2');
  });

  it('names the closed shared run by its label', () => {
    expect(continuityGaps([run({ series: '', name: '2026', label: 'משותפת', missing: ['2026-0002'], complete: false })]))
      .toEqual(['חור בסדרה משותפת 2026: 2026-0002']);
  });
});

describe('issueSummary', () => {
  it('lists the numbers issued', () => {
    expect(issueSummary({
      issued: [{ payment_id: 'a', number: 'IR-2026-000001' }, { payment_id: 'b', number: 'IR-2026-000002' }],
      skipped: [],
      failed: [],
    })).toEqual(['הופקו 2 קבלות: IR-2026-000001, IR-2026-000002']);
  });

  it('says what was skipped and why', () => {
    const lines = issueSummary({
      issued: [{ payment_id: 'a', number: 'IR-2026-000003' }],
      skipped: [
        { payment_id: 'b', reason: 'has_receipt', message: 'כבר הופקה לו קבלה' },
        { payment_id: 'c', reason: 'has_receipt', message: 'כבר הופקה לו קבלה' },
      ],
      failed: [{ payment_id: 'd', message: ISSUE_FAILED_MESSAGE }],
    });
    expect(lines).toEqual([
      'הופקה קבלה אחת: IR-2026-000003',
      '2 דולגו (כבר הופקה לו קבלה).',
    ]);
  });

  it('says so when nothing was issued', () => {
    expect(issueSummary({ issued: [], skipped: [], failed: [] })).toEqual(['לא הופקו קבלות.']);
  });
});

describe('failedLines', () => {
  it('names each failed charge as the table does, with the Hebrew message', () => {
    const [line] = failedLines(
      { issued: [], skipped: [], failed: [{ payment_id: 'a', message: ISSUE_FAILED_MESSAGE }] },
      [row('a')],
    );
    expect(line).toContain('10.3.2026');
    expect(line).toContain('כהן');
    expect(line).toContain('דנה כהן');
    expect(line).toContain('236');
    expect(line.endsWith(': ההפקה נכשלה — נסו שוב או פנו לתמיכה')).toBe(true);
  });

  it('falls back to the payment id and the standard message', () => {
    expect(failedLines(
      { issued: [], skipped: [], failed: [{ payment_id: 'zz', message: '' }] },
      [],
    )).toEqual(['תשלום zz: ההפקה נכשלה — נסו שוב או פנו לתמיכה']);
  });
});

describe('serverErrorText', () => {
  it("returns the server's error in its own words", async () => {
    const err = { response: { data: { error: 'לא הופקו קבלות: כדי להפיק יש להקליד "הפק" לאישור.' } } };
    expect(await serverErrorText(err, 'fallback')).toBe('לא הופקו קבלות: כדי להפיק יש להקליד "הפק" לאישור.');
  });

  it("reads DRF's permission refusal", async () => {
    expect(await serverErrorText({ response: { data: { detail: 'אין הרשאה. נדרש תפקיד מנהל.' } } }, 'x'))
      .toBe('אין הרשאה. נדרש תפקיד מנהל.');
  });

  it('reads a refusal that came back as a blob', async () => {
    const blob = new Blob([JSON.stringify({ error: 'שנה לא תקינה' })], { type: 'application/json' });
    expect(await serverErrorText({ response: { data: blob } }, 'x')).toBe('שנה לא תקינה');
  });

  it('falls back without a body, or with an HTML error page', async () => {
    expect(await serverErrorText(new Error('Network Error'), 'הפקת הקבלות נכשלה')).toBe('הפקת הקבלות נכשלה');
    expect(await serverErrorText({ response: { data: '<!doctype html><h1>500</h1>' } }, 'fallback')).toBe('fallback');
  });
});
