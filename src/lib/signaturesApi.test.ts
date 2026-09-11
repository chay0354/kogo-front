/**
 * The signatures client against the contract: which route each call asks,
 * with which query, and what reaches the browser as a file. The HTTP client
 * and the file save are stand-ins; nothing leaves the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn() } }));
vi.mock('./documentsApi', () => ({ saveBlob: vi.fn() }));

import api from './api';
import { saveBlob } from './documentsApi';
import { downloadSignaturePdf, fetchSignature, fetchSignatures } from './signaturesApi';

const get = vi.mocked(api.get);
const save = vi.mocked(saveBlob);

const row = {
  id: 'sig-1',
  kind: 'registration_terms',
  kind_label: 'תקנון הרשמה',
  signed_at: '2026-09-11T14:05:00+03:00',
  signer_name: 'רותי ניסן',
  signer_id_number: '123456782',
  family_id: 'fam-1',
  family_name: 'ניסן',
  children: [{ id: 'child-1', full_name: 'נועה ניסן' }],
  branch_name: 'רמת גן',
  document_title: 'תקנון',
  document_sha256: 'ab'.repeat(32),
  consents: { health: true, terms: true, computerized_documents: true },
  pdf_url: '/signatures/sig-1/pdf/',
};

beforeEach(() => {
  get.mockReset();
  save.mockReset();
});

describe('fetchSignatures', () => {
  it('asks one family’s signatures by family id, page one', async () => {
    get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [row] } } as never);
    const page = await fetchSignatures({ family: 'fam-1' });
    expect(get).toHaveBeenCalledWith('/signatures/', { params: { page: 1, family: 'fam-1' } });
    expect(page.count).toBe(1);
    expect(page.results[0].signer_name).toBe('רותי ניסן');
  });

  it('sends the history page’s filters under the contract’s names', async () => {
    get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } } as never);
    await fetchSignatures(
      { kind: 'registration_terms', branch: 'branch-1', search: ' כהן ', dateFrom: '2026-08-12', dateTo: '2026-09-11' },
      3,
    );
    expect(get).toHaveBeenCalledWith('/signatures/', {
      params: {
        page: 3,
        kind: 'registration_terms',
        branch: 'branch-1',
        search: 'כהן',
        date_from: '2026-08-12',
        date_to: '2026-09-11',
      },
    });
  });

  it('lets a failure reach the screen, which says so', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchSignatures({ family: 'fam-1' })).rejects.toThrow('Network Error');
  });
});

describe('fetchSignature', () => {
  it('asks the one signature, its id kept inside its path segment', async () => {
    get.mockResolvedValue({
      data: { ...row, document_text: ['סעיף 1'], signature_image: 'data:image/png;base64,AAAA', ip_address: null, user_agent: '', refs: null },
    } as never);
    const detail = await fetchSignature('sig 1/..');
    expect(get).toHaveBeenCalledWith('/signatures/sig%201%2F../');
    expect(detail.document_text).toEqual(['סעיף 1']);
  });
});

describe('downloadSignaturePdf', () => {
  it('fetches the PDF as a blob behind the token, and saves it under a readable name', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    get.mockResolvedValue({ data: blob } as never);
    await downloadSignaturePdf(row);
    expect(get).toHaveBeenCalledWith('/signatures/sig-1/pdf/', { responseType: 'blob' });
    expect(save).toHaveBeenCalledWith(blob, 'application/pdf', 'תקנון הרשמה - רותי ניסן - 2026-09-11.pdf');
  });

  it('saves nothing when the download fails', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    await expect(downloadSignaturePdf(row)).rejects.toEqual({ response: { status: 404 } });
    expect(save).not.toHaveBeenCalled();
  });
});
