/**
 * The client of the leads tab, version 2, against the contract
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, ד): which door each call knocks on, what it
 * sends, and how the answer is read — above all, that a server which has no
 * `leads/` yet is told apart from one that failed. The axios instance is
 * mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import {
  closeWahubLead,
  fetchWahubLead,
  fetchWahubLeads,
  isLeadGone,
  leadsParams,
  reopenWahubLead,
  setWahubLeadOwner,
  snoozeWahubLead,
} from './leadsV2Api';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

const ROW = {
  contact_id: 12,
  name: 'תמר אוחיון',
  phone: '972500000012',
  is_demo: false,
  stage: 'link_sent',
  stage_label: 'קיבל קישור ועוד לא נרשם',
  owner: 'bot',
  summary: 'שאלה על קפוארה, קיבלה קישור ולא נרשמה',
  chips: { branch: 'ראש העין', course_type: 'קפוארה', child: 'בן 5' },
  since: '2026-10-10T09:12:00Z',
  next: { who: 'bot', what: 'הבוט יזכיר את הקישור', when: '2026-10-13T07:30:00Z', state: 'planned' },
  last_message_at: '2026-10-10T09:12:00Z',
};

function refusal(status: number) {
  return Object.assign(new Error(`status ${status}`), { response: { status, data: {} } });
}

describe('the query of GET leads/', () => {
  it('the list alone when nothing is chosen', () => {
    expect(leadsParams({ owner: 'office' })).toEqual({ owner: 'office' });
    expect(leadsParams({ owner: 'bot', stage: null, q: '   ', cursor: null })).toEqual({ owner: 'bot' });
  });

  it('a state, a search and a cursor under the contract\'s names', () => {
    expect(leadsParams({ owner: 'closed', stage: 'deleted', q: ' תמר ', cursor: 'abc' })).toEqual({
      owner: 'closed',
      stage: 'deleted',
      q: 'תמר',
      cursor: 'abc',
    });
  });
});

describe('GET leads/', () => {
  it('asks the leads door with the query, and reads the page', async () => {
    api.get.mockResolvedValue({ data: { counts: { office: 7, bot: 41, closed: 212 }, results: [ROW], next_cursor: 'c2' } });

    const page = await fetchWahubLeads({ owner: 'bot', stage: 'link_sent' });

    expect(api.get).toHaveBeenCalledWith('/wahub/leads/', { params: { owner: 'bot', stage: 'link_sent' } });
    expect(page?.counts).toEqual({ office: 7, bot: 41, closed: 212 });
    expect(page?.results[0].contact_id).toBe(12);
    expect(page?.next_cursor).toBe('c2');
  });

  it('a server that has no such door yet (404 / 405) answers null — the tab shows the board from before', async () => {
    api.get.mockRejectedValueOnce(refusal(404));
    expect(await fetchWahubLeads({ owner: 'office' })).toBeNull();
    api.get.mockRejectedValueOnce(refusal(405));
    expect(await fetchWahubLeads({ owner: 'office' })).toBeNull();
  });

  it('any other failure is a failure: a server that broke, a refusal, a dropped line', async () => {
    api.get.mockRejectedValueOnce(refusal(500));
    await expect(fetchWahubLeads({ owner: 'office' })).rejects.toThrow();
    api.get.mockRejectedValueOnce(refusal(403));
    await expect(fetchWahubLeads({ owner: 'office' })).rejects.toThrow();
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(fetchWahubLeads({ owner: 'office' })).rejects.toThrow('Network Error');
  });
});

describe('GET leads/{id}/', () => {
  it('reads the row with its details', async () => {
    api.get.mockResolvedValue({ data: { ...ROW, details: { reason: 'קיבלה קישור ולא נרשמה', followups: [], timeline: [] } } });

    const lead = await fetchWahubLead(12);

    expect(api.get).toHaveBeenCalledWith('/wahub/leads/12/');
    expect(lead.name).toBe('תמר אוחיון');
    expect(lead.details.reason).toBe('קיבלה קישור ולא נרשמה');
  });

  it('an answer that names no lead is a failure, never an empty card', async () => {
    api.get.mockResolvedValue({ data: { detail: 'ok' } });
    await expect(fetchWahubLead(12)).rejects.toThrow();
  });

  it('a 404 here means the lead is gone — not that the server is behind', async () => {
    const gone = refusal(404);
    api.get.mockRejectedValue(gone);
    await expect(fetchWahubLead(12)).rejects.toBe(gone);
    expect(isLeadGone(gone)).toBe(true);
    expect(isLeadGone(refusal(500))).toBe(false);
    expect(isLeadGone(new Error('Network Error'))).toBe(false);
  });
});

describe('the four changes', () => {
  it('"לא רלוונטי" closes with `deleted`; a note goes only when there is one', async () => {
    api.post.mockResolvedValue({ data: { ok: true } });

    expect(await closeWahubLead(12, 'deleted')).toBeNull();
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/close/', { reason: 'deleted' });

    await closeWahubLead(12, 'not_interested', ' מצאו מקום אחר ');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/close/', { reason: 'not_interested', note: 'מצאו מקום אחר' });
  });

  it('"החזר לרשימה" reopens, with no body', async () => {
    api.post.mockResolvedValue({ data: ROW });

    const lead = await reopenWahubLead(12);

    expect(api.post).toHaveBeenCalledWith('/wahub/leads/12/reopen/');
    expect(lead?.contact_id).toBe(12);
  });

  it('"דחה למועד" sends the day as YYYY-MM-DD, and the note when there is one', async () => {
    api.post.mockResolvedValue({ data: {} });

    await snoozeWahubLead(12, '2026-11-01');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/snooze/', { until: '2026-11-01' });

    await snoozeWahubLead(12, '2026-11-01', 'אחרי החגים');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/snooze/', { until: '2026-11-01', note: 'אחרי החגים' });
  });

  it('"קח אליי" / "החזר לבוט" set the owner', async () => {
    api.post.mockResolvedValue({ data: { ...ROW, owner: 'office' } });

    const lead = await setWahubLeadOwner(12, 'office');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/owner/', { owner: 'office' });
    expect(lead?.owner).toBe('office');

    await setWahubLeadOwner(12, 'bot');
    expect(api.post).toHaveBeenLastCalledWith('/wahub/leads/12/owner/', { owner: 'bot' });
  });

  it('a refusal is thrown to the caller, which takes the change back', async () => {
    api.post.mockRejectedValue(refusal(400));
    await expect(setWahubLeadOwner(12, 'office')).rejects.toThrow();
  });
});
