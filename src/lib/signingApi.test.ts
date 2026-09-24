/**
 * The signing client against the contract: which route each call asks, with
 * which query, how the answer is read, and — above all — that the one print of
 * a paper original is told apart from its refusal (409) and from a failure.
 * The HTTP client and the file save are stand-ins; nothing leaves the test.
 */
import { createHash } from 'node:crypto';
import { AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./documentsApi', () => ({ saveBlob: vi.fn() }));

import api from './api';
import { saveBlob } from './documentsApi';
import {
  ARCHIVE_RUN_MAX_LIMIT,
  downloadCertificatePem,
  downloadSignedOriginal,
  fetchArchiveStatus,
  fetchBusinessCustomerConsent,
  fetchSignedExportPart,
  fetchSignedOriginalFile,
  fetchSignedOriginals,
  fetchSigningCertificate,
  fetchSigningStatus,
  normalizeSha256,
  ORIGINAL_ALREADY_PRINTED_MESSAGE,
  printOriginal,
  readArchiveStatus,
  readExportPartHeaders,
  readSignedOriginal,
  readSigningStatus,
  responseHeader,
  runArchiveBatch,
  setBusinessCustomerConsent,
  SIGNED_EXPORT_PART_SIZE,
  SignedFileMismatchError,
  signedOriginalFilename,
  signedOriginalsFilterParams,
  SIGNING_CERTIFICATE_FILENAME,
} from './signingApi';

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const save = vi.mocked(saveBlob);

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  save.mockReset();
});

const status = {
  enabled: true,
  consent_enforced: false,
  backend: 'gcp_kms',
  key_id: 'projects/p/locations/me-west1/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1',
  cert_fingerprint: 'ab'.repeat(32),
  cert_subject: 'O=קוגומלו גרופ בע"מ, serialNumber=516504412',
  last_signed_at: '2026-09-23T14:05:00+03:00',
  counts: { held: 2, paper_pending: 3, signed_today: 40 },
};

describe('fetchSigningStatus', () => {
  it('asks the status route and reads the answer as sent', async () => {
    get.mockResolvedValue({ data: status } as never);
    const read = await fetchSigningStatus();
    expect(get).toHaveBeenCalledWith('/documents/signing/status/');
    expect(read).toEqual(status);
  });

  it('reads an answer it cannot trust as no status at all — so nothing new is shown', () => {
    expect(readSigningStatus(null)).toBeNull();
    expect(readSigningStatus('<html>')).toBeNull();
    expect(readSigningStatus({ backend: 'gcp_kms' })).toBeNull();
    expect(readSigningStatus({ enabled: 'yes' })).toBeNull();
  });

  it('fills what is missing with the safe side: no backend, no counts, consent not enforced', () => {
    expect(readSigningStatus({ enabled: false })).toEqual({
      enabled: false,
      consent_enforced: false,
      backend: 'none',
      key_id: null,
      cert_fingerprint: null,
      cert_subject: null,
      last_signed_at: null,
      counts: { held: 0, paper_pending: 0, signed_today: 0 },
    });
  });
});

describe('fetchSignedOriginals', () => {
  it('asks for the paper originals not printed yet, a window at a time', async () => {
    get.mockResolvedValue({ data: { count: 0, results: [] } } as never);
    await fetchSignedOriginals({ delivery: 'paper', printed: false, limit: 100, offset: 200 });
    expect(get).toHaveBeenCalledWith('/documents/signing/originals/', {
      params: { delivery: 'paper', printed: 'false', limit: 100, offset: 200 },
    });
  });

  it('sends only what it was given', async () => {
    get.mockResolvedValue({ data: { count: 0, results: [] } } as never);
    await fetchSignedOriginals({ delivery: 'held' });
    expect(get).toHaveBeenCalledWith('/documents/signing/originals/', { params: { delivery: 'held' } });
  });

  it('reads a decimal total as a number and keeps the server’s reason', async () => {
    get.mockResolvedValue({
      data: {
        count: 1,
        results: [{
          id: 7,
          number: 'IRM-2026-000012',
          kind: 'formal',
          document_type_label: 'חשבונית מס/קבלה',
          customer_name: 'דנה לוי',
          document_date: '2026-09-20',
          total: '250.00',
          delivery: 'paper',
          delivery_reason: 'שולם במזומן',
          signed_at: '2026-09-20T10:00:00+03:00',
          sent_at: null,
          paper_original_printed_at: null,
        }],
      },
    } as never);
    const page = await fetchSignedOriginals({ delivery: 'paper' });
    expect(page.count).toBe(1);
    expect(page.results[0]).toMatchObject({ id: '7', total: 250, delivery: 'paper', delivery_reason: 'שולם במזומן' });
  });
});

describe('printOriginal', () => {
  it('prints once: the stored PDF comes back as a blob', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    post.mockResolvedValue({ data: pdf } as never);
    const result = await printOriginal('orig-1');
    expect(post).toHaveBeenCalledWith(
      '/documents/signing/originals/orig-1/print-original/',
      {},
      { responseType: 'blob', timeout: 60000 },
    );
    expect(result).toEqual({ outcome: 'printed', pdf });
  });

  it('reads a 409 as "already printed", in the server’s words out of the blob', async () => {
    post.mockRejectedValue({
      response: { status: 409, data: new Blob([JSON.stringify({ error: 'המקור כבר הודפס ב-20.9 — זו העתק' })]) },
    });
    expect(await printOriginal('orig-1')).toEqual({
      outcome: 'already_printed',
      message: 'המקור כבר הודפס ב-20.9 — זו העתק',
    });
  });

  it('still says so when the 409 carries no sentence', async () => {
    post.mockRejectedValue({ response: { status: 409, data: new Blob(['']) } });
    expect(await printOriginal('orig-1')).toEqual({
      outcome: 'already_printed',
      message: ORIGINAL_ALREADY_PRINTED_MESSAGE,
    });
  });

  it('throws any other refusal, its body readable', async () => {
    post.mockRejectedValue({ response: { status: 500, data: new Blob([JSON.stringify({ error: 'המקור לא נמצא' })]) } });
    await expect(printOriginal('orig-1')).rejects.toMatchObject({
      response: { status: 500, data: { error: 'המקור לא נמצא' } },
    });
  });

  it('throws a request that got no answer as it came', async () => {
    const timeout = { code: 'ECONNABORTED', message: 'timeout of 60000ms exceeded' };
    post.mockRejectedValue(timeout);
    await expect(printOriginal('orig-1')).rejects.toBe(timeout);
  });
});

describe('the public certificate', () => {
  it('asks the public route and reads a configured certificate', async () => {
    get.mockResolvedValue({
      data: {
        configured: true,
        pem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
        fingerprint_sha256: 'ab'.repeat(32),
        subject: 'O=קוגומלו גרופ בע"מ',
        not_before: '2026-09-01T00:00:00Z',
        not_after: '2036-09-01T00:00:00Z',
      },
    } as never);
    const cert = await fetchSigningCertificate();
    expect(get).toHaveBeenCalledWith('/documents/signing/certificate/');
    expect(cert.configured).toBe(true);
    expect(cert.subject).toBe('O=קוגומלו גרופ בע"מ');
  });

  it('is not configured without a certificate to show, whatever the flag says', async () => {
    get.mockResolvedValue({ data: { configured: true, pem: null } } as never);
    expect((await fetchSigningCertificate()).configured).toBe(false);
    get.mockResolvedValue({ data: { configured: false, pem: null } } as never);
    expect((await fetchSigningCertificate()).configured).toBe(false);
  });

  it('hands the PEM over as a file, ending in a newline', () => {
    downloadCertificatePem('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----');
    expect(save).toHaveBeenCalledWith(
      '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
      'application/x-pem-file',
      SIGNING_CERTIFICATE_FILENAME,
    );
  });
});

describe('business customer consent', () => {
  it('reads the consent off the customer’s own record', async () => {
    get.mockResolvedValue({
      data: { id: 'bc-1', accepts_computerized_documents: true, computerized_docs_consent_at: '2026-09-23T09:00:00+03:00' },
    } as never);
    const consent = await fetchBusinessCustomerConsent('bc-1');
    expect(get).toHaveBeenCalledWith('/customers/business-customers/bc-1/');
    expect(consent).toMatchObject({ accepts_computerized_documents: true, computerized_docs_consent_at: '2026-09-23T09:00:00+03:00' });
  });

  it('says nothing for a record without consent fields — a server that keeps none', async () => {
    get.mockResolvedValue({ data: { id: 'bc-1', first_name: 'דנה' } } as never);
    expect(await fetchBusinessCustomerConsent('bc-1')).toBeNull();
  });

  it('records and withdraws with a JSON boolean, and reads the updated customer back', async () => {
    post.mockResolvedValue({
      data: { id: 'bc-1', accepts_computerized_documents: false, computerized_docs_consent_at: null },
    } as never);
    const consent = await setBusinessCustomerConsent('bc-1', false);
    expect(post).toHaveBeenCalledWith('/customers/business-customers/bc-1/computerized-consent/', { consent: false });
    expect(consent?.accepts_computerized_documents).toBe(false);
  });
});

// ── The signed archive ───────────────────────────────────────────────────────

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('the signed files list — the archive filter', () => {
  it('asks with the archive filter, only what narrows', async () => {
    get.mockResolvedValue({ data: { count: 0, results: [] } } as never);
    await fetchSignedOriginals({
      purpose: 'archive',
      kind: 'ir',
      q: '  IR-2019  ',
      date_from: '2019-01-01',
      date_to: '2019-12-31',
      limit: 50,
      offset: 100,
    });
    expect(get).toHaveBeenCalledWith('/documents/signing/originals/', {
      params: {
        purpose: 'archive',
        kind: 'ir',
        q: 'IR-2019',
        date_from: '2019-01-01',
        date_to: '2019-12-31',
        limit: 50,
        offset: 100,
      },
    });
  });

  it('leaves out empty, unknown and malformed fields', () => {
    expect(signedOriginalsFilterParams({ purpose: '', kind: '', q: '   ', date_from: '', date_to: '' })).toEqual({});
    expect(signedOriginalsFilterParams({
      purpose: 'copy' as never,
      kind: 'rent' as never,
      date_from: '1.1.2020',
      date_to: '2020-13',
    })).toEqual({});
    expect(signedOriginalsFilterParams()).toEqual({});
  });

  it('reads the new fields, and a row from a server that lists none of them as an original', () => {
    expect(readSignedOriginal({
      id: 'a-1',
      number: 'IR-2019-000044',
      purpose: 'archive',
      kind: 'ir',
      document_date: '2019-03-02',
      total: '180.00',
      sha256: 'AB'.repeat(32),
      size: 84211,
      delivery: 'none',
      signed_at: '2026-09-24T10:00:00+03:00',
    })).toMatchObject({ purpose: 'archive', total: 180, sha256: 'ab'.repeat(32), size: 84211 });

    expect(readSignedOriginal({ id: 'o-1', number: 'IR-2026-000001', total: '90.00' })).toMatchObject({
      purpose: 'original',
      sha256: '',
      size: 0,
      total: 90,
    });
  });

  it('reads a missing total as none, not as zero', () => {
    expect(readSignedOriginal({ id: 'o-1', total: null })?.total).toBeNull();
    expect(readSignedOriginal({ id: 'o-1' })?.total).toBeNull();
    expect(readSignedOriginal({ id: 'o-1', total: '' })?.total).toBeNull();
    expect(readSignedOriginal({ id: 'o-1', total: '-40.00' })?.total).toBe(-40);
  });
});

describe('responseHeader', () => {
  it('reads axios headers and plain records alike, whatever the case', () => {
    const axiosHeaders = new AxiosHeaders({ 'X-Export-Total': '87' });
    expect(responseHeader(axiosHeaders, 'x-export-total')).toBe('87');
    expect(responseHeader({ 'x-content-sha256': 'ab' }, 'X-Content-SHA256')).toBe('ab');
  });

  it('is undefined for a header that is not there — or that the browser was not allowed to read', () => {
    expect(responseHeader(new AxiosHeaders({}), 'X-Export-Total')).toBeUndefined();
    expect(responseHeader({}, 'X-Export-Total')).toBeUndefined();
    expect(responseHeader(undefined, 'X-Export-Total')).toBeUndefined();
  });

  it('keeps an empty header apart from a missing one', () => {
    expect(responseHeader({ 'x-export-next-offset': '' }, 'X-Export-Next-Offset')).toBe('');
  });
});

describe('one signed file', () => {
  const bytes = '%PDF-1.7 signed';

  it('asks the file route for a blob, with the time a big file needs', async () => {
    get.mockResolvedValue({ data: new Blob([bytes]), headers: { 'x-content-sha256': sha(bytes) } } as never);
    const file = await fetchSignedOriginalFile('o 1');
    expect(get).toHaveBeenCalledWith('/documents/signing/originals/o%201/file/', { responseType: 'blob', timeout: 60000 });
    expect(file.sha256).toBe(sha(bytes));
  });

  it('saves the bytes as <number>.pdf once they match the server’s SHA-256', async () => {
    const pdf = new Blob([bytes], { type: 'application/pdf' });
    get.mockResolvedValue({ data: pdf, headers: new AxiosHeaders({ 'X-Content-SHA256': sha(bytes).toUpperCase() }) } as never);
    const result = await downloadSignedOriginal({ id: 'o-1', number: 'IR-2026-000123', sha256: '' });
    expect(result).toEqual({ check: 'verified' });
    expect(save).toHaveBeenCalledWith(pdf, 'application/pdf', 'IR-2026-000123.pdf');
  });

  it('checks against the row’s own SHA-256 when the header cannot be read', async () => {
    get.mockResolvedValue({ data: new Blob([bytes]), headers: {} } as never);
    expect(await downloadSignedOriginal({ id: 'o-1', number: 'IR-1', sha256: sha(bytes) })).toEqual({ check: 'verified' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not save a file whose bytes differ from what is stored', async () => {
    get.mockResolvedValue({ data: new Blob([`${bytes} changed`]), headers: { 'x-content-sha256': sha(bytes) } } as never);
    await expect(downloadSignedOriginal({ id: 'o-1', number: 'IR-1', sha256: '' })).rejects.toBeInstanceOf(SignedFileMismatchError);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves unchecked when there is nothing to check against', async () => {
    get.mockResolvedValue({ data: new Blob([bytes]), headers: {} } as never);
    expect(await downloadSignedOriginal({ id: 'o-1', number: 'IR-1', sha256: 'not-a-digest' })).toEqual({ check: 'unchecked' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('throws a refusal with its body read out of the blob', async () => {
    get.mockRejectedValue({ response: { status: 404, data: new Blob([JSON.stringify({ error: 'המקור לא נמצא' })]) } });
    await expect(fetchSignedOriginalFile('o-1')).rejects.toMatchObject({ response: { status: 404, data: { error: 'המקור לא נמצא' } } });
  });

  it('names a file safely', () => {
    expect(signedOriginalFilename('IR-2026-000123')).toBe('IR-2026-000123.pdf');
    expect(signedOriginalFilename('A/B:C')).toBe('A-B-C.pdf');
    expect(signedOriginalFilename('')).toBe('מסמך.pdf');
  });

  it('reads only a real SHA-256', () => {
    expect(normalizeSha256(` ${'AB'.repeat(32)} `)).toBe('ab'.repeat(32));
    expect(normalizeSha256('abc')).toBe('');
    expect(normalizeSha256(null)).toBe('');
  });
});

describe('the export, a ZIP part at a time', () => {
  it('asks for one part of the filter, as a blob, with a way to cancel', async () => {
    const zip = new Blob(['PK']);
    get.mockResolvedValue({
      data: zip,
      headers: new AxiosHeaders({ 'X-Export-Total': '87', 'X-Export-Next-Offset': '40' }),
    } as never);
    const controller = new AbortController();
    const part = await fetchSignedExportPart({ purpose: 'archive', q: ' ' }, 0, { signal: controller.signal });
    expect(get).toHaveBeenCalledWith('/documents/signing/originals/export/', {
      params: { purpose: 'archive', offset: 0, limit: SIGNED_EXPORT_PART_SIZE },
      responseType: 'blob',
      timeout: 120000,
      signal: controller.signal,
    });
    expect(part).toEqual({ zip, total: 87, nextOffset: 40 });
  });

  it('reads an empty next offset as the last part', () => {
    expect(readExportPartHeaders({ 'x-export-total': '87', 'x-export-next-offset': '' }, { offset: 80, limit: 40 }))
      .toEqual({ total: 87, nextOffset: null });
  });

  it('reads a next offset that does not move forward as the last part, never asking for the same part again', () => {
    expect(readExportPartHeaders({ 'x-export-next-offset': '40' }, { offset: 40, limit: 40 }).nextOffset).toBeNull();
    expect(readExportPartHeaders({ 'x-export-next-offset': 'soon' }, { offset: 0, limit: 40 }).nextOffset).toBeNull();
  });

  it('works the next part out from the count when the headers cannot be read', () => {
    expect(readExportPartHeaders({}, { offset: 0, limit: 40, knownTotal: 87 })).toEqual({ total: 87, nextOffset: 40 });
    expect(readExportPartHeaders({}, { offset: 80, limit: 40, knownTotal: 87 })).toEqual({ total: 87, nextOffset: null });
    expect(readExportPartHeaders({}, { offset: 40, limit: 40, knownTotal: 80 })).toEqual({ total: 80, nextOffset: null });
    // Nothing to go by: one part, and stop.
    expect(readExportPartHeaders({}, { offset: 0, limit: 40 })).toEqual({ total: null, nextOffset: null });
  });

  it('prefers the server’s total to the count the screen had', () => {
    expect(readExportPartHeaders({ 'x-export-total': '90' }, { offset: 0, limit: 40, knownTotal: 87 }).total).toBe(90);
  });

  it('throws a refusal with its body read out of the blob', async () => {
    get.mockRejectedValue({ response: { status: 400, data: new Blob([JSON.stringify({ error: 'טווח לא תקין' })]) } });
    await expect(fetchSignedExportPart({}, 0)).rejects.toMatchObject({ response: { data: { error: 'טווח לא תקין' } } });
  });
});

describe('the archive status', () => {
  const answer = {
    enabled: true,
    kinds: [
      { kind: 'ir', label: 'קבלות חוג', eligible: 300, archived: 120, originals: 45, remaining: 180 },
      { kind: 'store', label: 'חנות', eligible: 40, archived: 40, originals: 12, remaining: 0 },
    ],
    last_signed_at: '2026-09-24T09:15:00+03:00',
  };

  it('asks the status route and reads the answer as sent', async () => {
    get.mockResolvedValue({ data: answer } as never);
    expect(await fetchArchiveStatus()).toEqual(answer);
    expect(get).toHaveBeenCalledWith('/documents/signing/archive/status/');
  });

  it('reads an answer it cannot trust as no status', () => {
    expect(readArchiveStatus(null)).toBeNull();
    expect(readArchiveStatus('<html>')).toBeNull();
    expect(readArchiveStatus({ kinds: [] })).toBeNull();
  });

  it('fills what is missing: counts as 0, remaining as what is left', () => {
    expect(readArchiveStatus({ enabled: false, kinds: [{ kind: 'formal', eligible: '10', archived: 4 }, null] })).toEqual({
      enabled: false,
      kinds: [{ kind: 'formal', label: '', eligible: 10, archived: 4, originals: 0, remaining: 6 }],
      last_signed_at: null,
    });
  });
});

describe('runArchiveBatch', () => {
  it('asks for one batch and reads what it did', async () => {
    post.mockResolvedValue({
      data: { signed: 24, skipped: 0, failed: [{ number: 'IR-2019-000007', error: 'PDF חסר' }], remaining: 156, done: false },
    } as never);
    const result = await runArchiveBatch({ limit: 25 });
    expect(post).toHaveBeenCalledWith('/documents/signing/archive/run/', { limit: 25 }, { timeout: 120000 });
    expect(result).toEqual({
      outcome: 'ran',
      batch: { signed: 24, skipped: 0, failed: [{ number: 'IR-2019-000007', error: 'PDF חסר' }], remaining: 156, done: false },
    });
  });

  it('never asks for more than the server signs at once, and sends a date only as a date', async () => {
    post.mockResolvedValue({ data: { done: true } } as never);
    await runArchiveBatch({ limit: 500, since: '2019-01-01' });
    expect(post).toHaveBeenLastCalledWith(
      '/documents/signing/archive/run/',
      { limit: ARCHIVE_RUN_MAX_LIMIT, since: '2019-01-01' },
      { timeout: 120000 },
    );
    await runArchiveBatch({ limit: 0, since: '1.1.2019' });
    expect(post).toHaveBeenLastCalledWith('/documents/signing/archive/run/', { limit: 1 }, { timeout: 120000 });
    await runArchiveBatch();
    expect(post).toHaveBeenLastCalledWith('/documents/signing/archive/run/', {}, { timeout: 120000 });
  });

  it('reads 409 as "the switch is off" and 503 as "the key is out of reach", with the server’s words', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { error: 'הארכיון כבוי' } } });
    expect(await runArchiveBatch({ limit: 25 })).toEqual({ outcome: 'off', message: 'הארכיון כבוי' });
    post.mockRejectedValue({ response: { status: 503, data: {} } });
    expect(await runArchiveBatch({ limit: 25 })).toEqual({ outcome: 'unavailable', message: '' });
  });

  it('throws any other refusal, and a request that got no answer, as they came', async () => {
    const refusal = { response: { status: 500, data: { error: 'boom' } } };
    post.mockRejectedValue(refusal);
    await expect(runArchiveBatch({ limit: 25 })).rejects.toBe(refusal);
    const timeout = { code: 'ECONNABORTED' };
    post.mockRejectedValue(timeout);
    await expect(runArchiveBatch({ limit: 25 })).rejects.toBe(timeout);
  });
});
