/**
 * The tenant's signing client against the contract: which URL each call
 * reaches, what it sends, and how the answer is read. The axios instance is
 * mocked — the backend is built in parallel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getUri: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import {
  fetchSigningContract,
  readSigningContract,
  signingPdfUrl,
  submitContractSignature,
} from './rentalSigningApi';

const SERVER_CONTRACT = {
  state: 'open',
  version: 3,
  tenant: { name: 'דנה לוי', id_number: '123456782', phone: '050-1234567', email: 'dana@example.com' },
  branch_name: 'רמת גן',
  studio: { name: 'קוגומלו', company_number: '516504412', phone: '050-9424755', email: 'office@example.com' },
  slots: [{ label: 'סטודיו 2', weekday_or_date: 'ימי ג׳', hours: '17:00–19:00', rate: '120.00', monthly: '480.00' }],
  monthly_amount: '480.00',
  vat_rate: '0.18',
  vat_amount: '86.40',
  monthly_total: '566.40',
  billing_day: 1,
  start_date: '2026-10-01',
  end_date: '2027-09-30',
  document: ['1. הצדדים', '2. המושכר'],
  signed_at: null,
  signer_name: null,
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.getUri.mockReset();
});

describe('fetchSigningContract', () => {
  it('reads the version at the token’s own path, the token kept inside it', async () => {
    api.get.mockResolvedValue({ data: SERVER_CONTRACT });
    const contract = await fetchSigningContract('ab/c d');
    expect(api.get).toHaveBeenCalledWith('/rentals/sign/ab%2Fc%20d/');
    expect(contract.version).toBe(3);
    expect(contract.slots).toHaveLength(1);
    expect(contract.document).toEqual(['1. הצדדים', '2. המושכר']);
    expect(contract.signer_name).toBe('');
  });

  it('passes a refusal through as it came', async () => {
    const refusal = { response: { status: 404, data: { error: 'הקישור לא נמצא' } } };
    api.get.mockRejectedValue(refusal);
    await expect(fetchSigningContract('x')).rejects.toBe(refusal);
  });
});

describe('readSigningContract', () => {
  it('keeps what the server sent', () => {
    const contract = readSigningContract(SERVER_CONTRACT);
    expect(contract).toMatchObject({
      state: 'open',
      tenant: { name: 'דנה לוי', id_number: '123456782' },
      studio: { phone: '050-9424755' },
      monthly_total: '566.40',
      billing_day: 1,
      start_date: '2026-10-01',
    });
  });

  it('makes every list safe to iterate and every text a string when fields are missing', () => {
    expect(readSigningContract({ state: 'expired' })).toEqual({
      state: 'expired',
      version: 0,
      tenant: { name: '', id_number: '', phone: '', email: '' },
      branch_name: '',
      studio: { name: '', company_number: '', phone: '', email: '' },
      slots: [],
      monthly_amount: '',
      vat_rate: '',
      vat_amount: '',
      monthly_total: '',
      billing_day: null,
      start_date: null,
      end_date: null,
      document: [],
      signed_at: null,
      signer_name: '',
    });
    expect(readSigningContract(null).state).toBe('');
    expect(readSigningContract({ slots: 'nope', document: 42 })).toMatchObject({ slots: [], document: [] });
  });

  it('keeps the text as text, dropping what is not', () => {
    expect(readSigningContract({ document: ['  סעיף 1 ', '', { html: '<b>' }, 'סעיף 2'] }).document).toEqual([
      'סעיף 1',
      'סעיף 2',
    ]);
  });
});

describe('submitContractSignature', () => {
  const payload = {
    signer_name: 'דנה לוי',
    signer_id_number: '123456782',
    signature: 'data:image/png;base64,AAAA',
    accept: true as const,
  };

  it('posts the signature with a longer wait, and reads the answer', async () => {
    api.post.mockResolvedValue({
      data: { state: 'signed', signed_at: '2026-09-11T18:05:00+03:00', pdf_url: '/rentals/sign/t/pdf/' },
    });
    expect(await submitContractSignature('t', payload)).toEqual({
      state: 'signed',
      signed_at: '2026-09-11T18:05:00+03:00',
      pdf_url: '/rentals/sign/t/pdf/',
    });
    expect(api.post).toHaveBeenCalledWith('/rentals/sign/t/', payload, { timeout: 60000 });
  });

  it('passes the server’s refusal through to the page', async () => {
    const refusal = { response: { status: 409, data: { error: 'החוזה כבר נחתם' } } };
    api.post.mockRejectedValue(refusal);
    await expect(submitContractSignature('t', payload)).rejects.toBe(refusal);
  });
});

describe('signingPdfUrl', () => {
  it('builds the PDF’s address on the API, not on the page', () => {
    api.getUri.mockReturnValue('https://api.example/api/v1/rentals/sign/t/pdf/');
    expect(signingPdfUrl('t')).toBe('https://api.example/api/v1/rentals/sign/t/pdf/');
    expect(api.getUri).toHaveBeenCalledWith({ url: '/rentals/sign/t/pdf/', params: undefined });
  });

  it('gives the signed copy an address of its own', () => {
    signingPdfUrl('a/b', { signed: true });
    expect(api.getUri).toHaveBeenCalledWith({ url: '/rentals/sign/a%2Fb/pdf/', params: { copy: 'signed' } });
  });
});
