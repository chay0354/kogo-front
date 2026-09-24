/**
 * The signing client against the contract: which route each call asks, with
 * which query, how the answer is read, and — above all — that the one print of
 * a paper original is told apart from its refusal (409) and from a failure.
 * The HTTP client and the file save are stand-ins; nothing leaves the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./documentsApi', () => ({ saveBlob: vi.fn() }));

import api from './api';
import { saveBlob } from './documentsApi';
import {
  downloadCertificatePem,
  fetchBusinessCustomerConsent,
  fetchSignedOriginals,
  fetchSigningCertificate,
  fetchSigningStatus,
  ORIGINAL_ALREADY_PRINTED_MESSAGE,
  printOriginal,
  readSigningStatus,
  setBusinessCustomerConsent,
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
