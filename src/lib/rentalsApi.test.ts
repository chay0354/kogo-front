/**
 * The tenancy client against the contract: which URL each call reaches, what
 * it sends, and how the answer comes back. The axios instance is mocked — the
 * backend is built in parallel, so nothing here depends on it existing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import {
  createTenancy,
  deleteTenancy,
  fetchTenancies,
  fetchTenancy,
  fetchTenancySuggestions,
  importTenancies,
  linkTenancySlots,
  tenancyQueryParams,
  unlinkTenancySlot,
  updateTenancy,
  type TenancyCreatePayload,
} from './rentalsApi';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.delete.mockReset();
});

describe('tenancyQueryParams', () => {
  it('sends only the filters that are set', () => {
    expect(tenancyQueryParams({ branch: 'b-1', status: '', search: '   ' })).toEqual({ branch: 'b-1' });
  });

  it('trims the search and keeps every set filter', () => {
    expect(tenancyQueryParams({ branch: 'b-1', status: 'active', search: ' דנה ' })).toEqual({
      branch: 'b-1',
      status: 'active',
      search: 'דנה',
    });
  });

  it('is empty with no filters', () => {
    expect(tenancyQueryParams()).toEqual({});
  });
});

describe('fetchTenancies', () => {
  it('reads the list with the filters on the query string', async () => {
    api.get.mockResolvedValue({ data: [{ id: 't-1' }] });
    const list = await fetchTenancies({ branch: 'b-1', status: '' });
    expect(api.get).toHaveBeenCalledWith('/rentals/tenancies/', { params: { branch: 'b-1' } });
    expect(list).toEqual([{ id: 't-1' }]);
  });

  it('unwraps a paginated answer', async () => {
    api.get.mockResolvedValue({ data: { count: 1, results: [{ id: 't-2' }] } });
    expect(await fetchTenancies()).toEqual([{ id: 't-2' }]);
  });

  it('treats an unexpected body as an empty list', async () => {
    api.get.mockResolvedValue({ data: null });
    expect(await fetchTenancies()).toEqual([]);
  });
});

describe('one tenancy', () => {
  it('reads it by id', async () => {
    api.get.mockResolvedValue({ data: { id: 't-1' } });
    expect(await fetchTenancy('t-1')).toEqual({ id: 't-1' });
    expect(api.get).toHaveBeenCalledWith('/rentals/tenancies/t-1/');
  });

  it('creates it with the payload as given', async () => {
    const payload: TenancyCreatePayload = {
      tenant_id: 'c-1',
      branch: 'b-1',
      status: 'draft',
      monthly_amount: '1200.00',
      billing_day: 1,
      start_date: '2026-09-01',
      end_date: null,
      notes: '',
    };
    api.post.mockResolvedValue({ data: { id: 't-9' } });
    expect(await createTenancy(payload)).toEqual({ id: 't-9' });
    expect(api.post).toHaveBeenCalledWith('/rentals/tenancies/', payload);
  });

  it('patches only what it is given', async () => {
    api.patch.mockResolvedValue({ data: { id: 't-1', status: 'active' } });
    await updateTenancy('t-1', { status: 'active' });
    expect(api.patch).toHaveBeenCalledWith('/rentals/tenancies/t-1/', { status: 'active' });
  });

  it('deletes it', async () => {
    api.delete.mockResolvedValue({ data: null });
    await deleteTenancy('t-1');
    expect(api.delete).toHaveBeenCalledWith('/rentals/tenancies/t-1/');
  });

  it("passes the server's refusal to delete through to the caller", async () => {
    const refusal = { response: { status: 400, data: { error: 'אפשר למחוק רק טיוטה בלי משבצות' } } };
    api.delete.mockRejectedValue(refusal);
    await expect(deleteTenancy('t-1')).rejects.toBe(refusal);
  });
});

describe('slots', () => {
  it('links several slots in one request', async () => {
    api.post.mockResolvedValue({ data: {} });
    await linkTenancySlots('t-1', ['s-1', 's-2']);
    expect(api.post).toHaveBeenCalledWith('/rentals/tenancies/t-1/link-slots/', { slot_ids: ['s-1', 's-2'] });
  });

  it('unlinks one slot', async () => {
    api.post.mockResolvedValue({ data: {} });
    await unlinkTenancySlot('t-1', 's-1');
    expect(api.post).toHaveBeenCalledWith('/rentals/tenancies/t-1/unlink-slot/', { slot_id: 's-1' });
  });
});

describe('suggestions and import', () => {
  it('reads the unlinked rentals', async () => {
    api.get.mockResolvedValue({ data: [{ key: 'g-1', slots: [] }] });
    expect(await fetchTenancySuggestions()).toEqual([{ key: 'g-1', slots: [] }]);
    expect(api.get).toHaveBeenCalledWith('/rentals/tenancies/suggestions/');
  });

  it('imports every confirmed group in one request, with a longer wait', async () => {
    const payload = {
      groups: [
        {
          slot_ids: ['s-1'],
          tenant: {
            first_name: 'דנה',
            last_name: 'לוי',
            company_number: '',
            id_number: '012345678',
            phone: '',
            email: '',
            address: '',
          },
          monthly_amount: '480.00',
          billing_day: 1,
          start_date: '2026-09-01',
          end_date: '2027-08-31',
          status: 'active' as const,
        },
      ],
    };
    api.post.mockResolvedValue({ data: [{ id: 't-1' }] });
    expect(await importTenancies(payload)).toEqual([{ id: 't-1' }]);
    expect(api.post).toHaveBeenCalledWith('/rentals/tenancies/import/', payload, { timeout: 60000 });
  });
});
