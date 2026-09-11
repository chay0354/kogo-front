/**
 * The missing-receipts panel's rules: the confirmation states every fact the
 * server acts on, the buttons open only when they should, and a refusal
 * reaches the screen in the server's words.
 */
import { describe, expect, it } from 'vitest';
import type { SeriesRunCheck } from '@/lib/documentsApi';
import {
  canConfirmIssue,
  canStartIssue,
  continuityGaps,
  isConfirmWord,
  issueButtonLabel,
  issueConfirmationLines,
  issueSummary,
  serverErrorText,
  yearOptions,
} from './missingReceipts';

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

  it('counts the receipts, and words a single one', () => {
    expect(issueConfirmationLines(3)[0]).toContain('יופקו 3 קבלות');
    expect(issueConfirmationLines(1)[0]).toContain('קבלה אחת');
  });

  it('still names the IR run without a number to start from', () => {
    const lines = issueConfirmationLines(2);
    expect(lines.join('\n')).toContain('סדרת IR');
    expect(lines.join('\n')).not.toContain('החל מ-');
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

  it('says what was skipped and why, and what failed', () => {
    const lines = issueSummary({
      issued: [{ payment_id: 'a', number: 'IR-2026-000003' }],
      skipped: [
        { payment_id: 'b', reason: 'has_receipt', message: 'כבר הופקה לו קבלה' },
        { payment_id: 'c', reason: 'has_receipt', message: 'כבר הופקה לו קבלה' },
      ],
      failed: [{ payment_id: 'd', error: 'boom' }],
    });
    expect(lines).toEqual([
      'הופקה קבלה אחת: IR-2026-000003',
      '2 דולגו (כבר הופקה לו קבלה).',
      'נכשל תשלום d: boom',
    ]);
  });

  it('says so when nothing was issued', () => {
    expect(issueSummary({ issued: [], skipped: [], failed: [] })).toEqual(['לא הופקו קבלות.']);
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
