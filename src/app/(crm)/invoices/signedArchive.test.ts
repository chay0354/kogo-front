/**
 * ארכיון חתום: when the tab is there, what a row and its badges say, how the
 * filter becomes the query, and the two loops — the archive run (batch after
 * batch, stopped only between batches) and the export (ZIP part after part,
 * cancelled at once, the saved parts kept).
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ArchiveRunResult,
  ArchiveStatus,
  SignedExportPart,
  SignedOriginalRow,
  SigningStatus,
} from '@/lib/signingApi';
import { MANUAL_DELIVERY_TAB } from './manualDelivery';
import {
  applyArchiveBatch,
  archiveExtraActiveCount,
  archiveFilterQuery,
  archivePageCount,
  archivePageOffset,
  archiveProgressPercent,
  archiveRunCounts,
  archiveRunEndText,
  archiveTotals,
  canRunArchive,
  deliveryView,
  DOWNLOAD_FAILED_MESSAGE,
  DOWNLOAD_MISMATCH_MESSAGE,
  downloadFailureMessage,
  driveArchiveRun,
  driveSignedExport,
  exportEndText,
  exportPartsFor,
  exportPercent,
  exportProgressText,
  formatFileSize,
  invoicePageTabs,
  kindArchivedLine,
  kindLabel,
  kindPercent,
  NO_OWN_FILTERS,
  pageSpanLabel,
  purposeLabel,
  showsSignedArchive,
  SIGNED_ARCHIVE_TAB,
  signedExportFilename,
  startArchiveProgress,
} from './signedArchive';
import type { ActiveTab } from './types';

const BASE: ReadonlyArray<{ key: ActiveTab; label: string; subtitle: string }> = [
  { key: 'מסמכים', label: 'מסמכים', subtitle: '' },
  { key: 'קישורי אשראי', label: 'קישורי אשראי', subtitle: '' },
];

function signing(enabled: boolean, lastSignedAt: string | null = null): SigningStatus {
  return {
    enabled,
    consent_enforced: false,
    backend: 'gcp_kms',
    key_id: 'k/1',
    cert_fingerprint: null,
    cert_subject: null,
    last_signed_at: lastSignedAt,
    counts: { held: 0, paper_pending: 0, signed_today: 0 },
  };
}

function row(overrides: Partial<SignedOriginalRow> = {}): SignedOriginalRow {
  return {
    id: 'o-1',
    number: 'IR-2026-000123',
    purpose: 'original',
    kind: 'ir',
    document_type_label: 'חשבונית מס/קבלה',
    customer_name: 'דנה לוי',
    document_date: '2026-09-20',
    total: 250,
    sha256: 'ab'.repeat(32),
    size: 84211,
    delivery: 'email',
    delivery_reason: '',
    signed_at: '2026-09-20T10:00:00+03:00',
    sent_at: '2026-09-20T10:01:00+03:00',
    paper_original_printed_at: null,
    ...overrides,
  };
}

function archiveStatus(overrides: Partial<ArchiveStatus> = {}): ArchiveStatus {
  return {
    enabled: true,
    kinds: [
      { kind: 'ir', label: 'קבלות חוג', eligible: 300, archived: 120, originals: 45, remaining: 180 },
      { kind: 'store', label: '', eligible: 40, archived: 40, originals: 12, remaining: 0 },
    ],
    last_signed_at: null,
    blocked: '',
    issued_before: null,
    backup: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------- the tab

describe('the archive tab — when it is there', () => {
  it('leaves the page as it was while nothing was ever signed, or there is no status', () => {
    expect(invoicePageTabs(BASE, { isManager: true, signing: signing(false) })).toBe(BASE);
    expect(invoicePageTabs(BASE, { isManager: true, signing: null })).toBe(BASE);
    expect(invoicePageTabs(BASE, { isManager: true, signing: undefined })).toBe(BASE);
  });

  it('never shows it to anyone but a manager', () => {
    expect(invoicePageTabs(BASE, { isManager: false, signing: signing(true, '2026-09-24T09:00:00+03:00') })).toBe(BASE);
  });

  it('comes last, after the manual-delivery tab, while signing is on', () => {
    const tabs = invoicePageTabs(BASE, { isManager: true, signing: signing(true) });
    expect(tabs.map((tab) => tab.key)).toEqual(['מסמכים', 'קישורי אשראי', 'למסירה ידנית', 'ארכיון חתום']);
    expect(tabs[2]).toBe(MANUAL_DELIVERY_TAB);
    expect(tabs[3]).toBe(SIGNED_ARCHIVE_TAB);
  });

  it('stays once anything was signed, after the switch is turned off — the files are kept for seven years', () => {
    const tabs = invoicePageTabs(BASE, { isManager: true, signing: signing(false, '2026-09-20T10:00:00+03:00') });
    expect(tabs.map((tab) => tab.key)).toEqual(['מסמכים', 'קישורי אשראי', 'ארכיון חתום']);
    expect(showsSignedArchive(signing(false, '2026-09-20T10:00:00+03:00'))).toBe(true);
    expect(showsSignedArchive(signing(false))).toBe(false);
  });
});

// ---------------------------------------------------------------- labels

describe('labels', () => {
  it('names the two kinds of file', () => {
    expect(purposeLabel('original')).toBe('מקור');
    expect(purposeLabel('archive')).toBe('העתק לארכיון');
  });

  it('prefers the server’s name for a kind, then ours, then the kind as it came', () => {
    expect(kindLabel('ir', 'קבלות חוג')).toBe('קבלות חוג');
    expect(kindLabel('store', '  ')).toBe('חנות');
    expect(kindLabel('rent')).toBe('rent');
  });

  it('writes a file size the office can read', () => {
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(84211)).toBe('82 KB');
    expect(formatFileSize(1_300_000)).toBe('1.2 MB');
  });
});

describe('deliveryView — how an original reached the customer', () => {
  it('says nothing for an archive copy: it is never delivered', () => {
    expect(deliveryView(row({ purpose: 'archive', delivery: 'none' }))).toBeNull();
  });

  it('an email original: sent, with when — or not yet', () => {
    expect(deliveryView(row())).toEqual({ label: 'נשלח במייל', tone: 'done', note: '20.9.2026 10:01' });
    expect(deliveryView(row({ sent_at: null }))).toMatchObject({ label: 'במייל — טרם נשלח', tone: 'waiting' });
  });

  it('a paper original, in the manual-delivery tab’s words', () => {
    expect(deliveryView(row({ delivery: 'paper', sent_at: null }))).toEqual({
      label: 'למסירה על נייר',
      tone: 'waiting',
      note: 'המקור טרם הודפס',
    });
    expect(deliveryView(row({ delivery: 'paper', paper_original_printed_at: '2026-09-21T09:00:00+03:00' }))).toEqual({
      label: 'נמסר על נייר',
      tone: 'done',
      note: 'המקור הודפס ב-21.9.2026 09:00',
    });
  });

  it('a held original says what it waits for', () => {
    expect(deliveryView(row({ delivery: 'held', signed_at: null, delivery_reason: '' }))).toMatchObject({
      label: 'ממתין לחתימה',
      tone: 'waiting',
    });
    expect(deliveryView(row({ delivery: 'held', delivery_reason: 'אין הסכמה רשומה' }))).toEqual({
      label: 'ממתין להסכמה',
      tone: 'waiting',
      note: 'אין הסכמה רשומה',
    });
  });

  it('a document the system does not send', () => {
    expect(deliveryView(row({ delivery: 'none', delivery_reason: 'מכירה בקופה' }))).toEqual({
      label: 'לא נשלח',
      tone: 'quiet',
      note: 'מכירה בקופה',
    });
  });
});

// ---------------------------------------------------------------- the filter and pages

describe('the filter', () => {
  const none = { search: '', dateFrom: '', dateTo: '' };

  it('sends only what narrows, so equal filters make equal queries', () => {
    expect(archiveFilterQuery(none, NO_OWN_FILTERS)).toEqual({});
    expect(archiveFilterQuery({ search: '  דנה ', dateFrom: '2019-01-01', dateTo: '' }, { purpose: 'archive', kind: '' }))
      .toEqual({ purpose: 'archive', q: 'דנה', date_from: '2019-01-01' });
    expect(JSON.stringify(archiveFilterQuery({ ...none, search: 'x' }, NO_OWN_FILTERS)))
      .toBe(JSON.stringify(archiveFilterQuery({ ...none, search: ' x ' }, NO_OWN_FILTERS)));
  });

  it('counts the dates as filters here — nothing is dated by default', () => {
    expect(archiveExtraActiveCount(none, NO_OWN_FILTERS)).toBe(0);
    expect(archiveExtraActiveCount({ dateFrom: '2019-01-01', dateTo: '2019-12-31' }, { purpose: 'original', kind: 'ir' }))
      .toBe(4);
  });
});

describe('pages', () => {
  it('counts pages, never fewer than one', () => {
    expect(archivePageCount(0)).toBe(1);
    expect(archivePageCount(50)).toBe(1);
    expect(archivePageCount(51)).toBe(2);
  });

  it('turns a page into an offset', () => {
    expect(archivePageOffset(1)).toBe(0);
    expect(archivePageOffset(3)).toBe(100);
    expect(archivePageOffset(0)).toBe(0);
  });

  it('says which rows a page holds', () => {
    expect(pageSpanLabel(2, 50)).toBe('51–100');
    expect(pageSpanLabel(3, 7)).toBe('101–107');
    expect(pageSpanLabel(1, 0)).toBe('');
  });
});

// ---------------------------------------------------------------- the archive status

describe('the archive status', () => {
  it('adds the kinds up', () => {
    expect(archiveTotals(archiveStatus())).toEqual({ eligible: 340, archived: 160, originals: 57, remaining: 180 });
    expect(archiveTotals(null)).toEqual({ eligible: 0, archived: 0, originals: 0, remaining: 0 });
  });

  it('writes a kind as "X מתוך Y בארכיון", its meter floored and full only when all is archived', () => {
    expect(kindArchivedLine({ archived: 1200, eligible: 3000 })).toBe('1,200 מתוך 3,000 בארכיון');
    expect(kindPercent({ archived: 299, eligible: 300 })).toBe(99);
    expect(kindPercent({ archived: 300, eligible: 300 })).toBe(100);
    expect(kindPercent({ archived: 0, eligible: 0 })).toBe(100);
  });

  it('offers the run only with the switch on, something left, and nothing running', () => {
    expect(canRunArchive(archiveStatus(), false)).toBe(true);
    expect(canRunArchive(archiveStatus(), true)).toBe(false);
    expect(canRunArchive(archiveStatus({ enabled: false }), false)).toBe(false);
    expect(canRunArchive(archiveStatus({ kinds: [] }), false)).toBe(false);
    expect(canRunArchive(null, false)).toBe(false);
    expect(canRunArchive(archiveStatus({ blocked: 'DOCUMENT_SIGNING_ENABLED is on and no cutoff' }), false)).toBe(false);
  });
});

// ---------------------------------------------------------------- the archive run

const batch = (signed: number, remaining: number, extra: Partial<{ skipped: number; failed: Array<{ number: string; error: string }>; done: boolean }> = {}): ArchiveRunResult => ({
  outcome: 'ran',
  batch: { signed, skipped: extra.skipped ?? 0, failed: extra.failed ?? [], remaining, done: extra.done ?? remaining === 0 },
});

describe('the run’s progress', () => {
  it('adds each batch up, one failure line per document number with its latest error', () => {
    let progress = startArchiveProgress(60);
    progress = applyArchiveBatch(progress, { signed: 24, skipped: 1, failed: [{ number: 'IR-1', error: 'א' }], remaining: 35, done: false });
    progress = applyArchiveBatch(progress, { signed: 20, skipped: 0, failed: [{ number: 'IR-1', error: 'ב' }, { number: 'IR-2', error: 'ג' }], remaining: 14, done: false });
    expect(progress).toEqual({
      signed: 44,
      skipped: 1,
      failed: [{ number: 'IR-1', error: 'ב' }, { number: 'IR-2', error: 'ג' }],
      remaining: 14,
      rounds: 2,
    });
    expect(archiveRunCounts(progress)).toBe('נחתמו 44 · דולגו 1 · נכשלו 2 · נותרו 14');
  });

  it('is at 100% only when nothing is left', () => {
    expect(archiveProgressPercent(startArchiveProgress(10))).toBe(0);
    expect(archiveProgressPercent({ signed: 99, skipped: 0, failed: [], remaining: 1, rounds: 4 })).toBe(99);
    expect(archiveProgressPercent({ signed: 5, skipped: 0, failed: [], remaining: 0, rounds: 1 })).toBe(100);
    expect(archiveRunCounts(startArchiveProgress(7))).toBe('נחתמו 0 · נותרו 7');
  });
});

describe('driveArchiveRun', () => {
  it('asks batch after batch until the server says done', async () => {
    const runBatch = vi.fn<() => Promise<ArchiveRunResult>>()
      .mockResolvedValueOnce(batch(25, 35))
      .mockResolvedValueOnce(batch(25, 10))
      .mockResolvedValueOnce(batch(10, 0));
    const seen: number[] = [];
    const outcome = await driveArchiveRun({
      runBatch,
      shouldStop: () => false,
      startRemaining: 60,
      onProgress: (progress) => seen.push(progress.remaining),
    });
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([35, 10, 0]);
    expect(outcome).toMatchObject({ end: 'done', progress: { signed: 60, remaining: 0 } });
  });

  it('stops between batches: the batch already sent is waited for and counted, no new one is asked for', async () => {
    let stop = false;
    const runBatch = vi.fn(async () => {
      stop = true; // pressed while this batch was signing
      return batch(25, 35);
    });
    const outcome = await driveArchiveRun({ runBatch, shouldStop: () => stop, startRemaining: 60 });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ end: 'stopped', progress: { signed: 25, remaining: 35 } });
  });

  it('never starts when stopped before the first batch', async () => {
    const runBatch = vi.fn(async () => batch(25, 0));
    const outcome = await driveArchiveRun({ runBatch, shouldStop: () => true, startRemaining: 10 });
    expect(runBatch).not.toHaveBeenCalled();
    expect(outcome.end).toBe('stopped');
  });

  it('ends on 409 and 503 with the server’s words, keeping what was signed before', async () => {
    const off = await driveArchiveRun({
      runBatch: vi.fn<() => Promise<ArchiveRunResult>>()
        .mockResolvedValueOnce(batch(25, 35))
        .mockResolvedValueOnce({ outcome: 'off', message: 'הארכיון כבוי' }),
      shouldStop: () => false,
      startRemaining: 60,
    });
    expect(off).toEqual({ end: 'off', progress: expect.objectContaining({ signed: 25 }), detail: 'הארכיון כבוי' });

    const unavailable = await driveArchiveRun({
      runBatch: async () => ({ outcome: 'unavailable', message: '' }),
      shouldStop: () => false,
      startRemaining: 60,
    });
    expect(unavailable.end).toBe('unavailable');
  });

  it('tells a refusal from a request that got no answer', async () => {
    const refused = await driveArchiveRun({
      runBatch: async () => { throw { response: { status: 500, data: { error: 'שגיאה' } } }; },
      shouldStop: () => false,
      startRemaining: 5,
    });
    expect(refused).toMatchObject({ end: 'failed', detail: 'שגיאה' });
    const silent = await driveArchiveRun({
      runBatch: async () => { throw { code: 'ECONNABORTED' }; },
      shouldStop: () => false,
      startRemaining: 5,
    });
    expect(silent.end).toBe('no_answer');
  });

  it('stops a batch that signs nothing and leaves as much as before, rather than repeat it forever', async () => {
    const runBatch = vi.fn<() => Promise<ArchiveRunResult>>()
      .mockResolvedValueOnce(batch(20, 5))
      .mockResolvedValue(batch(0, 5, { failed: [{ number: 'IR-9', error: 'PDF פגום' }] }));
    const outcome = await driveArchiveRun({ runBatch, shouldStop: () => false, startRemaining: 25 });
    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ end: 'stalled', progress: { signed: 20, remaining: 5 } });
    expect(outcome.progress.failed).toEqual([{ number: 'IR-9', error: 'PDF פגום' }]);
  });

  it('gives up after the most rounds it may ask', async () => {
    let remaining = 1000;
    const runBatch = vi.fn(async () => {
      remaining -= 1;
      return batch(1, remaining);
    });
    const outcome = await driveArchiveRun({ runBatch, shouldStop: () => false, startRemaining: 1000, maxRounds: 3 });
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(outcome.end).toBe('stalled');
  });

  it('says how it ended in words the office can act on', () => {
    const clean = startArchiveProgress(0);
    expect(archiveRunEndText({ end: 'done', progress: clean }).tone).toBe('done');
    expect(archiveRunEndText({ end: 'done', progress: { ...clean, failed: [{ number: 'IR-1', error: 'x' }] } }).tone).toBe('error');
    expect(archiveRunEndText({ end: 'stopped', progress: clean })).toMatchObject({ tone: 'info' });
    expect(archiveRunEndText({ end: 'off', progress: clean }).text).toContain('לא מופעלת בשרת');
    expect(archiveRunEndText({ end: 'unavailable', progress: clean }).text).toContain('מפתח החתימה אינו זמין');
    expect(archiveRunEndText({ end: 'no_answer', progress: clean }).text).toContain('לא ייחתם שוב');
    expect(archiveRunEndText({ end: 'failed', progress: clean }).tone).toBe('error');
  });
});

// ---------------------------------------------------------------- the export

const zip = (label: string) => new Blob([label]);
const part = (label: string, total: number | null, nextOffset: number | null): SignedExportPart => ({
  zip: zip(label),
  total,
  nextOffset,
});

describe('driveSignedExport', () => {
  it('saves every part in turn, numbered among the parts, until there is no next one', async () => {
    const fetchPart = vi.fn<(offset: number) => Promise<SignedExportPart>>()
      .mockResolvedValueOnce(part('1', 87, 40))
      .mockResolvedValueOnce(part('2', 87, 80))
      .mockResolvedValueOnce(part('3', 87, null));
    const savePart = vi.fn();
    const seen: number[] = [];
    const outcome = await driveSignedExport({
      knownTotal: 87,
      fetchPart,
      savePart,
      shouldStop: () => false,
      onProgress: (progress) => seen.push(progress.filesSaved),
    });
    expect(fetchPart.mock.calls.map(([offset]) => offset)).toEqual([0, 40, 80]);
    expect(savePart.mock.calls.map(([, index, parts]) => [index, parts])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(seen).toEqual([0, 40, 80, 87]);
    expect(outcome).toEqual({ end: 'done', progress: { partsSaved: 3, parts: 3, filesSaved: 87, total: 87 } });
  });

  it('on cancel, drops the part on its way and keeps the ones already saved', async () => {
    let cancelled = false;
    const fetchPart = vi.fn(async (offset: number) => {
      if (offset === 40) cancelled = true; // pressed while the second part was on its way
      return part(String(offset), 120, offset + 40);
    });
    const savePart = vi.fn();
    const outcome = await driveSignedExport({ knownTotal: 120, fetchPart, savePart, shouldStop: () => cancelled });
    expect(savePart).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ end: 'stopped', progress: { partsSaved: 1, filesSaved: 40 } });
  });

  it('reads an aborted request after a cancel as stopped, not failed', async () => {
    let cancelled = false;
    const outcome = await driveSignedExport({
      knownTotal: 80,
      fetchPart: async () => {
        cancelled = true;
        throw { name: 'CanceledError' };
      },
      savePart: vi.fn(),
      shouldStop: () => cancelled,
    });
    expect(outcome.end).toBe('stopped');
  });

  it('fails on a part that does not arrive, keeping the count of what was saved', async () => {
    const error = { response: { status: 500, data: { error: 'שגיאה בשרת' } } };
    const fetchPart = vi.fn<(offset: number) => Promise<SignedExportPart>>()
      .mockResolvedValueOnce(part('1', 80, 40))
      .mockRejectedValueOnce(error);
    const outcome = await driveSignedExport({ knownTotal: 80, fetchPart, savePart: vi.fn(), shouldStop: () => false });
    expect(outcome).toEqual({ end: 'failed', progress: { partsSaved: 1, parts: 2, filesSaved: 40, total: 80 }, error });
    expect(exportEndText(outcome)).toEqual({
      text: 'שגיאה בשרת. החלק שכבר נשמר שלם. אפשר לייצא שוב.',
      tone: 'error',
    });
  });

  it('gives up after the most parts it may ask for', async () => {
    const fetchPart = vi.fn(async (offset: number) => part('x', null, offset + 40));
    const outcome = await driveSignedExport({
      knownTotal: null,
      fetchPart,
      savePart: vi.fn(),
      shouldStop: () => false,
      maxParts: 2,
    });
    expect(fetchPart).toHaveBeenCalledTimes(2);
    expect(outcome.end).toBe('failed');
  });
});

describe('the export’s words and names', () => {
  it('counts the parts', () => {
    expect(exportPartsFor(87)).toBe(3);
    expect(exportPartsFor(40)).toBe(1);
    expect(exportPartsFor(0)).toBe(1);
    expect(exportPartsFor(null)).toBeNull();
  });

  it('names each ZIP by what it holds and its place among the parts, padded so they sort', () => {
    expect(signedExportFilename({}, 1, 1)).toBe('signed-files.zip');
    expect(signedExportFilename({ purpose: 'archive', date_from: '2019-01-01', date_to: '2019-12-31' }, 2, 3))
      .toBe('archive-copies_2019-01-01_2019-12-31_part-2-of-3.zip');
    expect(signedExportFilename({ purpose: 'original', kind: 'store', date_to: '2026-09-24' }, 3, 12))
      .toBe('signed-originals_store_start_2026-09-24_part-03-of-12.zip');
    expect(signedExportFilename({}, 4, null)).toBe('signed-files_part-4.zip');
  });

  it('says where it stands', () => {
    expect(exportProgressText({ partsSaved: 1, parts: 3, filesSaved: 40, total: 87 }))
      .toBe('מכין חלק 2 מתוך 3 · 40 מתוך 87 קבצים נשמרו');
    expect(exportProgressText({ partsSaved: 0, parts: null, filesSaved: 0, total: null }))
      .toBe('מכין חלק 1 · 0 קבצים נשמרו');
    expect(exportPercent({ partsSaved: 1, parts: 3, filesSaved: 40, total: 87 }, false)).toBe(33);
    expect(exportPercent({ partsSaved: 3, parts: 3, filesSaved: 87, total: 87 }, false)).toBe(99);
    expect(exportPercent({ partsSaved: 3, parts: 3, filesSaved: 87, total: 87 }, true)).toBe(100);
  });

  it('says how it ended', () => {
    expect(exportEndText({ end: 'done', progress: { partsSaved: 3, parts: 3, filesSaved: 87, total: 87 } }).text)
      .toBe('הייצוא הסתיים: 87 קבצים חתומים ב-3 קבצי ZIP.');
    expect(exportEndText({ end: 'done', progress: { partsSaved: 1, parts: 1, filesSaved: 12, total: 12 } }).text)
      .toBe('הייצוא הסתיים: 12 קבצים חתומים בקובץ ZIP אחד.');
    expect(exportEndText({ end: 'stopped', progress: { partsSaved: 0, parts: 3, filesSaved: 0, total: 87 } }))
      .toEqual({ text: 'הייצוא בוטל — לא נשמר דבר.', tone: 'info' });
    expect(exportEndText({ end: 'stopped', progress: { partsSaved: 2, parts: 3, filesSaved: 80, total: 87 } }).text)
      .toBe('הייצוא בוטל. 2 חלקים כבר נשמרו, וכל אחד מהם שלם (80 קבצים).');
    expect(exportEndText({ end: 'stopped', progress: { partsSaved: 1, parts: 3, filesSaved: 40, total: 87 } }).text)
      .toBe('הייצוא בוטל. חלק אחד כבר נשמר, והוא שלם (40 קבצים).');
    expect(exportEndText({ end: 'failed', progress: { partsSaved: 2, parts: 3, filesSaved: 80, total: 87 }, error: {} }).text)
      .toBe('לא התקבלה תשובה מהשרת. 2 החלקים שכבר נשמרו שלמים. אפשר לייצא שוב.');
    expect(exportEndText({ end: 'failed', progress: { partsSaved: 0, parts: 3, filesSaved: 0, total: 87 }, error: {} }).text)
      .toBe('לא התקבלה תשובה מהשרת. אפשר לייצא שוב.');
  });
});

// ---------------------------------------------------------------- one download

describe('downloadFailureMessage', () => {
  it('says a file that did not match was not saved', () => {
    expect(downloadFailureMessage({ name: 'SignedFileMismatchError' })).toBe(DOWNLOAD_MISMATCH_MESSAGE);
  });

  it('tells no answer from a refusal, in the server’s words when it gave some', () => {
    expect(downloadFailureMessage({ code: 'ECONNABORTED' })).toBe('לא התקבלה תשובה מהשרת — נסו שוב');
    expect(downloadFailureMessage({ response: { status: 404, data: {} } })).toBe('הקובץ לא נמצא');
    expect(downloadFailureMessage({ response: { status: 403, data: { detail: 'אין הרשאה' } } })).toBe('אין הרשאה');
    expect(downloadFailureMessage({ response: { status: 500, data: '<html>' } })).toBe(DOWNLOAD_FAILED_MESSAGE);
  });
});
