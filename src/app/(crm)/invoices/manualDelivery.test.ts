/**
 * למסירה ידנית: the tab is not there until signing is on; a paper row goes
 * ready → printing → printed and never offers a second print; a 409 is read
 * as "already printed", not as a failure; a held row says what it waits for.
 * Since 25.9.2026: "שלח" sends the original once and "שלח שוב" a copy after;
 * a tax invoice held for its allocation number is released by entering it.
 */
import { describe, expect, it } from 'vitest';
import type { SignedOriginalRow, SigningStatus } from '@/lib/signingApi';
import {
  ALLOCATION_FAILED_MESSAGE,
  canSendCopy,
  FOUND_LATE_REASON,
  missingOriginalNotice,
  printedAtLine,
  allocationDigits,
  allocationFailureMessage,
  allocationInputError,
  allocationOriginalMessage,
  allocationResultMessage,
  heldReasonNote,
  heldStatusLabel,
  invoiceTabs,
  MANUAL_DELIVERY_TAB,
  markAfterPrint,
  nextSendEdition,
  NO_EMAIL_REASON,
  originalFilename,
  paperRowCanBeMailed,
  MAIL_FAILED_REASON,
  paperRowView,
  PRINT_FAILED_MESSAGE,
  PRINT_ORIGINAL_LABEL,
  PRINT_UNKNOWN_MESSAGE,
  printFailureMessage,
  rowWithMark,
  SEND_FAILED_MESSAGE,
  sendActionLabel,
  sendConfirmMessage,
  sendEmailError,
  sendFailureMessage,
  sendResultMessage,
  waitingToPrint,
} from './manualDelivery';
import type { ActiveTab } from './types';

const BASE: ReadonlyArray<{ key: ActiveTab; label: string; subtitle: string }> = [
  { key: 'מסמכים', label: 'מסמכים', subtitle: '' },
  { key: 'קישורי אשראי', label: 'קישורי אשראי', subtitle: '' },
];

function status(enabled: boolean): SigningStatus {
  return {
    enabled,
    consent_enforced: false,
    backend: 'gcp_kms',
    key_id: 'k/1',
    cert_fingerprint: null,
    cert_subject: null,
    last_signed_at: null,
    counts: { held: 0, paper_pending: 0, signed_today: 0, awaiting_allocation: 0 },
  };
}

function row(overrides: Partial<SignedOriginalRow> = {}): SignedOriginalRow {
  return {
    id: 'o-1',
    number: 'IRM-2026-000012',
    purpose: 'original',
    kind: 'formal',
    document_type_label: 'קבלה',
    customer_name: 'דנה לוי',
    document_date: '2026-09-20',
    total: 250,
    sha256: '',
    size: 0,
    delivery: 'paper',
    delivery_reason: 'שולם במזומן',
    signed_at: '2026-09-20T10:00:00+03:00',
    sent_at: null,
    paper_original_printed_at: null,
    source_id: '',
    channel: '',
    awaiting_allocation: false,
    ...overrides,
  };
}

describe('invoiceTabs — hidden when signing is disabled', () => {
  it('leaves the page exactly as it was while signing is off, unknown or failed', () => {
    expect(invoiceTabs(BASE, { isManager: true, signing: status(false) })).toBe(BASE);
    expect(invoiceTabs(BASE, { isManager: true, signing: null })).toBe(BASE);
    expect(invoiceTabs(BASE, { isManager: true, signing: undefined })).toBe(BASE);
  });

  it('never shows the tab to anyone but a manager', () => {
    expect(invoiceTabs(BASE, { isManager: false, signing: status(true) })).toBe(BASE);
  });

  it('adds the tab last once signing is on', () => {
    const tabs = invoiceTabs(BASE, { isManager: true, signing: status(true) });
    expect(tabs.map((tab) => tab.key)).toEqual(['מסמכים', 'קישורי אשראי', 'למסירה ידנית']);
    expect(tabs[tabs.length - 1]).toBe(MANUAL_DELIVERY_TAB);
  });
});

describe('paperRowView — the one print', () => {
  it('offers the print while nothing was printed', () => {
    expect(paperRowView(row())).toEqual({ state: 'ready', action: PRINT_ORIGINAL_LABEL, note: '' });
  });

  it('says it is printing and offers nothing else meanwhile', () => {
    expect(paperRowView(row(), { state: 'printing' })).toMatchObject({ state: 'printing', note: '' });
  });

  it('is printed, with no button, once printed here', () => {
    expect(paperRowView(row(), { state: 'printed', at: '2026-09-23T11:30:00+03:00', note: '' })).toEqual({
      state: 'printed',
      action: '',
      note: 'המקור הודפס ב-23.9.2026 11:30',
    });
  });

  it('is printed, with no button, when the server already recorded a print', () => {
    expect(paperRowView(row({ paper_original_printed_at: '2026-09-21T09:00:00+03:00' }))).toEqual({
      state: 'printed',
      action: '',
      note: 'המקור הודפס ב-21.9.2026 09:00',
    });
  });

  it('shows the server’s refusal on a row a 409 marked printed', () => {
    const mark = markAfterPrint({ outcome: 'already_printed', message: 'המקור כבר הודפס — כל הדפסה נוספת היא העתק' }, '2026-09-23T11:30:00Z');
    expect(paperRowView(row(), mark)).toEqual({
      state: 'printed',
      action: '',
      note: 'המקור כבר הודפס — כל הדפסה נוספת היא העתק',
    });
  });
});

describe('markAfterPrint — the 409 handling', () => {
  it('marks a print that went through printed now', () => {
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    expect(markAfterPrint({ outcome: 'printed', pdf }, '2026-09-23T11:30:00+03:00')).toEqual({
      state: 'printed',
      at: '2026-09-23T11:30:00+03:00',
      note: '',
    });
  });

  it('marks a refused second print printed too, in the server’s words, with no time of its own', () => {
    expect(markAfterPrint({ outcome: 'already_printed', message: 'כבר הודפס' }, '2026-09-23T11:30:00+03:00')).toEqual({
      state: 'printed',
      at: null,
      note: 'כבר הודפס',
    });
  });
});

describe('printFailureMessage', () => {
  it('does not call a lost answer a failure — the print may have been recorded', () => {
    expect(printFailureMessage({ code: 'ECONNABORTED' })).toBe(PRINT_UNKNOWN_MESSAGE);
    expect(printFailureMessage(new Error('Network Error'))).toBe(PRINT_UNKNOWN_MESSAGE);
  });

  it('passes the server’s sentence on, or says it failed', () => {
    expect(printFailureMessage({ response: { status: 500, data: { error: 'המקור לא נמצא' } } })).toBe('המקור לא נמצא');
    expect(printFailureMessage({ response: { status: 403, data: { detail: 'אין הרשאה' } } })).toBe('אין הרשאה');
    expect(printFailureMessage({ response: { status: 502, data: '<html>' } })).toBe(PRINT_FAILED_MESSAGE);
  });
});

describe('waitingToPrint', () => {
  it('counts the rows still to print after what was done on this screen', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c', paper_original_printed_at: '2026-09-21' })];
    expect(waitingToPrint(rows, {})).toBe(2);
    expect(waitingToPrint(rows, { a: { state: 'printing' } })).toBe(2);
    expect(waitingToPrint(rows, { a: { state: 'printed', at: null, note: '' } })).toBe(1);
  });
});

describe('heldStatusLabel', () => {
  it('waits for the signature while none was saved, and for consent once signed', () => {
    expect(heldStatusLabel({ signed_at: null })).toBe('ממתין לחתימה');
    expect(heldStatusLabel({ signed_at: '2026-09-23T10:00:00+03:00' })).toBe('ממתין להסכמה');
  });

  it('waits for the allocation number before anything else', () => {
    expect(heldStatusLabel({ signed_at: null, awaiting_allocation: true })).toBe('ממתין למספר הקצאה');
  });
});

describe('heldReasonNote', () => {
  it('keeps the server’s reason when it says more than the badge', () => {
    const reason = 'ממתין לחתימה — שירות החתימה לא זמין כרגע; המסמך ייחתם ויישלח אוטומטית';
    expect(heldReasonNote({ signed_at: null, delivery_reason: reason })).toBe(reason);
  });

  it('does not write the badge twice', () => {
    expect(heldReasonNote({ signed_at: null, delivery_reason: 'ממתין למספר הקצאה', awaiting_allocation: true })).toBe('');
    expect(heldReasonNote({ signed_at: null, delivery_reason: 'ממתין לחתימה' })).toBe('');
    expect(heldReasonNote({ signed_at: null, delivery_reason: '' })).toBe('');
  });
});

describe('originalFilename', () => {
  it('names the saved original by its number, safe for a file system', () => {
    expect(originalFilename({ number: 'IRM-2026-000012' })).toBe('IRM-2026-000012 - מקור.pdf');
    expect(originalFilename({ number: 'A/B:1' })).toBe('A-B-1 - מקור.pdf');
    expect(originalFilename({ number: '' })).toBe('מסמך - מקור.pdf');
  });
});

describe('"שלח / שלח שוב" — the original once, then a copy', () => {
  it('offers the mail only to a paper row that is there for want of an address, before its print', () => {
    expect(paperRowCanBeMailed(row({ delivery_reason: NO_EMAIL_REASON }))).toBe(true);
    expect(paperRowCanBeMailed(row({ delivery_reason: MAIL_FAILED_REASON }))).toBe(true);
    expect(paperRowCanBeMailed(row({ delivery_reason: 'שולם במזומן' }))).toBe(false);
    expect(paperRowCanBeMailed(row({ delivery_reason: NO_EMAIL_REASON, paper_original_printed_at: '2026-09-21' }))).toBe(false);
    expect(paperRowCanBeMailed(row({ delivery: 'held', delivery_reason: NO_EMAIL_REASON }))).toBe(false);
  });

  it('sends the original while it has not left, and a copy once mailed, printed, or for an archive copy', () => {
    expect(nextSendEdition(row())).toBe('original');
    expect(sendActionLabel(row())).toBe('שלח');
    expect(nextSendEdition(row({ sent_at: '2026-09-20T10:01:00+03:00' }))).toBe('copy');
    expect(nextSendEdition(row({ paper_original_printed_at: '2026-09-21' }))).toBe('copy');
    expect(nextSendEdition(row({ purpose: 'archive' }))).toBe('copy');
    expect(sendActionLabel(row({ sent_at: '2026-09-20T10:01:00+03:00' }))).toBe('שלח שוב');
  });

  it('says in the dialog which one will go', () => {
    expect(sendConfirmMessage(row())).toContain('המקור החתום של IRM-2026-000012');
    expect(sendConfirmMessage(row())).toContain('פעם אחת בלבד');
    expect(sendConfirmMessage(row({ paper_original_printed_at: '2026-09-21' }))).toContain('העתק של IRM-2026-000012');
  });

  it('reads a row printed on this screen as printed, so its next send is a copy', () => {
    const printedHere = rowWithMark(row(), { state: 'printed', at: '2026-09-23T11:30:00+03:00', note: '' });
    expect(printedHere.paper_original_printed_at).toBe('2026-09-23T11:30:00+03:00');
    expect(sendActionLabel(printedHere)).toBe('שלח שוב');
    // A 409 carries no time; the row still reads as printed.
    expect(nextSendEdition(rowWithMark(row(), { state: 'printed', at: null, note: 'כבר הודפס' }))).toBe('copy');
  });

  it('leaves a row alone when nothing was printed here, or the server already knows', () => {
    const plain = row();
    expect(rowWithMark(plain)).toBe(plain);
    expect(rowWithMark(plain, { state: 'printing' })).toBe(plain);
    const known = row({ paper_original_printed_at: '2026-09-21T09:00:00+03:00' });
    expect(rowWithMark(known, { state: 'printed', at: '2026-09-23T11:30:00+03:00', note: '' })).toBe(known);
  });
});

describe('the send’s address and answer', () => {
  it('lets an empty address through (the card’s own) and stops one that is not an address', () => {
    expect(sendEmailError('')).toBe('');
    expect(sendEmailError('  dana@example.com ')).toBe('');
    expect(sendEmailError('dana@example')).toBe('כתובת המייל אינה תקינה');
    expect(sendEmailError('dana example.com')).toBe('כתובת המייל אינה תקינה');
  });

  it('says what went and where', () => {
    const sent = { outcome: 'sent', number: 'IRM-1', email: 'dana@example.com', delivery: 'email', delivery_reason: '' } as const;
    expect(sendResultMessage({ ...sent, sent: 'original' })).toEqual({ ok: true, text: 'המקור החתום של IRM-1 נשלח אל dana@example.com' });
    expect(sendResultMessage({ ...sent, sent: 'copy', email: '' })).toEqual({ ok: true, text: 'העתק של IRM-1 נשלח' });
  });

  it('keeps a refusal in the server’s words', () => {
    expect(sendResultMessage({ outcome: 'refused', status: 409, message: 'שולם במזומן' })).toEqual({ ok: false, text: 'שולם במזומן' });
  });

  it('does not call a lost answer a failure — the mail may have gone', () => {
    expect(sendFailureMessage({ code: 'ECONNABORTED' })).toContain('בדקו ברשימה');
    expect(sendFailureMessage({ response: { status: 502, data: { error: 'השליחה נכשלה' } } })).toBe('השליחה נכשלה');
    expect(sendFailureMessage({ response: { status: 500, data: '<html>' } })).toBe(SEND_FAILED_MESSAGE);
  });
});

describe('the allocation number', () => {
  it('takes the nine digits out of what was pasted', () => {
    expect(allocationDigits(' 123-456 789 ')).toBe('123456789');
    expect(allocationInputError('123 456 789')).toBe('');
    expect(allocationInputError('')).toBe('יש להזין את מספר ההקצאה');
    expect(allocationInputError('12345678')).toBe('מספר הקצאה הוא 9 ספרות');
    expect(allocationInputError('1234567890')).toBe('מספר הקצאה הוא 9 ספרות');
  });

  it('says what happened to the original once the number was saved', () => {
    const base = { allocation_number: '123456789', allocation_entered_at: '2026-09-30T09:00:00+03:00' };
    expect(allocationResultMessage({ ...base, signed: true, delivery: 'email' }, 'IR-7')).toBe('מספר ההקצאה נשמר — המקור של IR-7 נחתם ונשלח ללקוח');
    expect(allocationResultMessage({ ...base, signed: true, delivery: 'paper' }, 'IR-7')).toContain('למסירה על נייר');
    expect(allocationResultMessage({ ...base, signed: true, delivery: 'held' }, 'IR-7')).toBe('מספר ההקצאה נשמר — המקור של IR-7 נחתם');
    expect(allocationResultMessage({ ...base, signed: false, delivery: 'held' }, 'IR-7')).toContain('בדקות הקרובות');
  });

  it('says so when the number goes on copies only', () => {
    const base = { allocation_number: '123456789', allocation_entered_at: null, copy_only: true, signed: true };
    expect(allocationResultMessage({ ...base, message: 'המספר יופיע על העתקים' }, 'IR-7')).toBe('המספר יופיע על העתקים');
    expect(allocationResultMessage(base, 'IR-7')).toBe('המספר נשמר ויופיע על העתקים בלבד');
  });

  it('passes the server’s refusal on, and does not call a lost answer a failure', () => {
    const conflict = { response: { status: 409, data: { error: 'המקור כבר נחתם עם מספר הקצאה 111111111' } } };
    expect(allocationFailureMessage(conflict)).toBe('המקור כבר נחתם עם מספר הקצאה 111111111');
    expect(allocationFailureMessage({ response: { status: 500, data: '<html>' } })).toBe(ALLOCATION_FAILED_MESSAGE);
    expect(allocationFailureMessage({ code: 'ECONNABORTED' })).toContain('בדקו ברשימה');
  });
});

describe('allocationOriginalMessage — the documents list', () => {
  const base = { allocation_number: '123456789', allocation_entered_at: '2026-09-30T09:00:00+03:00' };

  it('says what became of the original when the number touched one', () => {
    expect(allocationOriginalMessage({ ...base, signed: true, delivery: 'email' }, 'IR-7')).toContain('נחתם ונשלח ללקוח');
    expect(allocationOriginalMessage({ ...base, copy_only: true, signed: true, delivery: 'email' }, 'IR-7')).toContain('העתקים');
  });

  it('says nothing when there is no original, the number was cleared, or the server is older', () => {
    expect(allocationOriginalMessage({ ...base, signed: false, delivery: null }, 'IR-7')).toBe('');
    expect(allocationOriginalMessage(base, 'IR-7')).toBe('');
    expect(allocationOriginalMessage({ ...base, allocation_number: '', signed: true, delivery: 'email' }, 'IR-7')).toBe('');
  });
});

describe('an original the signing cron found late (audit M1, 30.9.2026)', () => {
  const late = { delivery: 'paper' as const, delivery_reason: FOUND_LATE_REASON, paper_original_printed_at: null };

  it('may be sent from the paper list — the office decides, the cron never mails it', () => {
    expect(paperRowCanBeMailed(late)).toBe(true);
    expect(paperRowCanBeMailed({ ...late, paper_original_printed_at: '2026-09-30T10:00:00+03:00' })).toBe(false);
  });

  it('matches the server’s own words', () => {
    expect(FOUND_LATE_REASON).toContain('המקור נוצר באיחור');
  });
});

describe('canSendCopy — "שלח העתק" once the original left (audit M12)', () => {
  const base = { purpose: 'original' as const, signed_at: '2026-09-30T09:00:00+03:00', sent_at: null, paper_original_printed_at: null };

  it('offers a copy of an original that was mailed or printed', () => {
    expect(canSendCopy({ ...base, sent_at: '2026-09-30T09:01:00+03:00' })).toBe(true);
    expect(canSendCopy({ ...base, paper_original_printed_at: '2026-09-30T09:05:00+03:00' })).toBe(true);
  });

  it('offers a copy of a signed archive copy', () => {
    expect(canSendCopy({ ...base, purpose: 'archive' })).toBe(true);
  });

  it('offers nothing while the original has not left, or nothing is signed yet', () => {
    expect(canSendCopy(base)).toBe(false);
    expect(canSendCopy({ ...base, signed_at: null, sent_at: '2026-09-30T09:01:00+03:00' })).toBe(false);
  });
});

describe('printed recently', () => {
  it('says when the original was printed', () => {
    expect(printedAtLine({ paper_original_printed_at: '2026-09-30T14:05:00+03:00' })).toMatch(/^הודפס ב-/);
    expect(printedAtLine({ paper_original_printed_at: null })).toBe('');
  });
});

describe('missingOriginalNotice', () => {
  const withCounts = (counts: Partial<SigningStatus['counts']>) => ({
    counts: { held: 0, paper_pending: 0, signed_today: 0, awaiting_allocation: 0, ...counts },
  });

  it('warns only when documents were issued with no original', () => {
    expect(missingOriginalNotice(withCounts({ missing_original: 0 }))).toBe('');
    expect(missingOriginalNotice(withCounts({}))).toBe('');
    expect(missingOriginalNotice(null)).toBe('');
    expect(missingOriginalNotice(withCounts({ missing_original: 1 }))).toContain('מסמך אחד הונפק בלי מקור חתום');
    expect(missingOriginalNotice(withCounts({ missing_original: 3 }))).toContain('3 מסמכים הונפקו');
  });
});
