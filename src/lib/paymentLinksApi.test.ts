/**
 * The two shapes behind one endpoint.
 *
 * `/customers/card-links/` answers differently depending on whether it is
 * asked about one child: with `child_id` it is the bare list SendCardLinkDialog
 * reads, without it the office's paged screen. These hold both apart.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => ({ default: api }));

import { fetchCardLinks, fetchLinkOverview, type LinkOverviewPage } from './paymentLinksApi';

const page: LinkOverviewPage = {
  results: [
    {
      id: 'l-1',
      source: 'card_update',
      kind: 'card_update',
      kind_label: 'עדכון אשראי',
      mode: 'renew',
      mode_label: 'חידוש הוראת קבע',
      status: 'charged',
      status_label: 'חויב',
      child_id: 'c-1',
      child_name: 'נועה כהן',
      family_name: 'כהן',
      branch_id: 'b-1',
      branch_name: 'מרכז',
      business_id: null,
      business_name: '',
      amount: '500.00',
      description: 'חידוש הוראת קבע · אוגוסט 2026',
      created_at: '2026-09-01T08:00:00+03:00',
      created_by_name: 'מיכל',
      sent_at: null,
      sent_via: 'copy',
      first_opened_at: '2026-09-02T08:00:00+03:00',
      completed_at: '2026-09-02T08:05:00+03:00',
      last_error: '',
      public_url: '',
    },
  ],
  count: 1,
  limit: 100,
  offset: 0,
  has_more: false,
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('fetchLinkOverview', () => {
  it('asks without a child and returns the page as it came', async () => {
    api.get.mockResolvedValue({ data: page });

    expect(await fetchLinkOverview({ limit: 100, offset: 0 })).toEqual(page);
    expect(api.get).toHaveBeenCalledWith('/customers/card-links/', { params: { limit: 100, offset: 0 } });
  });

  it('never sends a child_id — that is the other shape of this endpoint', async () => {
    api.get.mockResolvedValue({ data: page });

    await fetchLinkOverview();

    expect(api.get).toHaveBeenCalledWith('/customers/card-links/', { params: {} });
  });

  it("passes the server's refusal through", async () => {
    const refusal = { response: { status: 403, data: { detail: 'אין הרשאה. נדרש תפקיד מנהל.' } } };
    api.get.mockRejectedValue(refusal);

    await expect(fetchLinkOverview()).rejects.toBe(refusal);
  });
});

describe('fetchCardLinks', () => {
  it('still asks per child and still gets a bare list', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'l-9' }] });

    const rows = await fetchCardLinks('c-1');

    expect(rows).toEqual([{ id: 'l-9' }]);
    expect(api.get).toHaveBeenCalledWith('/customers/card-links/', { params: { child_id: 'c-1' } });
  });
});
