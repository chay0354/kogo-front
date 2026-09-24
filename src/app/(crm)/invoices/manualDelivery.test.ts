/**
 * למסירה ידנית: the tab is not there until signing is on; a paper row goes
 * ready → printing → printed and never offers a second print; a 409 is read
 * as "already printed", not as a failure; a held row says what it waits for.
 */
import { describe, expect, it } from 'vitest';
import type { SignedOriginalRow, SigningStatus } from '@/lib/signingApi';
import {
  heldStatusLabel,
  invoiceTabs,
  MANUAL_DELIVERY_TAB,
  markAfterPrint,
  originalFilename,
  paperRowView,
  PRINT_FAILED_MESSAGE,
  PRINT_ORIGINAL_LABEL,
  PRINT_UNKNOWN_MESSAGE,
  printFailureMessage,
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
    counts: { held: 0, paper_pending: 0, signed_today: 0 },
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
});

describe('originalFilename', () => {
  it('names the saved original by its number, safe for a file system', () => {
    expect(originalFilename({ number: 'IRM-2026-000012' })).toBe('IRM-2026-000012 - מקור.pdf');
    expect(originalFilename({ number: 'A/B:1' })).toBe('A-B-1 - מקור.pdf');
    expect(originalFilename({ number: '' })).toBe('מסמך - מקור.pdf');
  });
});
