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
  put: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import {
  closeWahubLead,
  fetchWahubLead,
  fetchWahubLeadTemplateOptions,
  fetchWahubLeadTemplates,
  fetchWahubLeads,
  fetchWahubLeadsAutomation,
  isLeadGone,
  leadsParams,
  reopenWahubLead,
  setWahubLeadOwner,
  setWahubLeadTemplateTarget,
  snoozeWahubLead,
} from './leadsV2Api';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
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
  // `waiting=apart` rides on every read (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.1): the leads of the waiting
  // list stand under their own title. A server built before it ignores the word.
  it('the list alone when nothing is chosen — with the waiting list asked for apart', () => {
    expect(leadsParams({ owner: 'office' })).toEqual({ owner: 'office', waiting: 'apart' });
    expect(leadsParams({ owner: 'bot', stage: null, q: '   ', cursor: null })).toEqual({ owner: 'bot', waiting: 'apart' });
  });

  it('a search through every list asks for all of them at once (ח.1.3)', () => {
    expect(leadsParams({ owner: 'all', q: ' 050-123 ' })).toEqual({ owner: 'all', waiting: 'apart', q: '050-123' });
  });

  it('a state, a search and a cursor under the contract\'s names', () => {
    expect(leadsParams({ owner: 'closed', stage: 'deleted', q: ' תמר ', cursor: 'abc' })).toEqual({
      owner: 'closed',
      waiting: 'apart',
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

    expect(api.get).toHaveBeenCalledWith('/wahub/leads/', { params: { owner: 'bot', waiting: 'apart', stage: 'link_sent' } });
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

// ---------------------------------------------------------------------------
// "הכול אוטומטי" (the contract, י)
// ---------------------------------------------------------------------------

describe('GET leads/automation/', () => {
  const ANSWER = {
    ready: false,
    lines: [
      { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים' },
      { key: 'sending', ok: false, title: 'שליחה ללקוחות', detail: 'כבויה', how: 'מדליקים בהגדרות המערכת (WAHUB_SENDING_ENABLED)' },
    ],
    today: { planned: 12, due: 3, sent: 0, skipped: 4 },
    upcoming: [],
  };

  it('asks the automation door, and reads the answer', async () => {
    api.get.mockResolvedValue({ data: ANSWER });

    const automation = await fetchWahubLeadsAutomation();

    expect(api.get).toHaveBeenCalledWith('/wahub/leads/automation/');
    expect(automation?.ready).toBe(false);
    expect(automation?.lines).toHaveLength(2);
    expect(automation?.today.due).toBe(3);
  });

  it('a server that has no such door yet (404 / 405) answers null — the card and the strip are simply not there', async () => {
    api.get.mockRejectedValueOnce(refusal(404));
    expect(await fetchWahubLeadsAutomation()).toBeNull();
    api.get.mockRejectedValueOnce(refusal(405));
    expect(await fetchWahubLeadsAutomation()).toBeNull();
  });

  it('any other failure is a failure — never "the server is behind"', async () => {
    api.get.mockRejectedValueOnce(refusal(500));
    await expect(fetchWahubLeadsAutomation()).rejects.toThrow();
    api.get.mockRejectedValueOnce(refusal(403));
    await expect(fetchWahubLeadsAutomation()).rejects.toThrow();
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(fetchWahubLeadsAutomation()).rejects.toThrow('Network Error');
  });

  it('an answer that is not the automation at all is a failure, never an empty card', async () => {
    api.get.mockResolvedValueOnce({ data: '<!doctype html><html></html>' });
    await expect(fetchWahubLeadsAutomation()).rejects.toThrow();
    api.get.mockResolvedValueOnce({ data: null });
    await expect(fetchWahubLeadsAutomation()).rejects.toThrow();
  });
});

describe('the templates', () => {
  it('GET leads/templates/ reads every wording with what is connected to it', async () => {
    api.get.mockResolvedValue({
      data: [{ template_key: 'link_reminder_1', kind_label: 'תזכורת קישור', when_label: 'יום אחרי', text: 'היי', stage: 1, mapped: true, target: 'content1' }],
    });

    const templates = await fetchWahubLeadTemplates();

    expect(api.get).toHaveBeenCalledWith('/wahub/leads/templates/');
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ template_key: 'link_reminder_1', stage: 1, mapped: true, target: 'content1' });
  });

  it('GET leads/templates/options/ reads the account\'s templates', async () => {
    api.get.mockResolvedValue({ data: { options: [{ id: 'content1', name: 'kogo_lead_link_1' }] } });

    expect(await fetchWahubLeadTemplateOptions()).toEqual({ options: [{ id: 'content1', name: 'kogo_lead_link_1' }], reason: '' });
    expect(api.get).toHaveBeenCalledWith('/wahub/leads/templates/options/');
  });

  it('an account that cannot be listed (with why), and a server without that door: no list — a name is typed in instead', async () => {
    api.get.mockResolvedValueOnce({ data: { options: null, reason: 'ManyChat לא ענה' } });
    expect(await fetchWahubLeadTemplateOptions()).toEqual({ options: null, reason: 'ManyChat לא ענה' });
    api.get.mockRejectedValueOnce(refusal(404));
    expect(await fetchWahubLeadTemplateOptions()).toEqual({ options: null, reason: '' });
    api.get.mockRejectedValueOnce(refusal(405));
    expect(await fetchWahubLeadTemplateOptions()).toEqual({ options: null, reason: '' });
  });

  it('a list that failed to arrive is a failure of its own', async () => {
    api.get.mockRejectedValueOnce(refusal(502));
    await expect(fetchWahubLeadTemplateOptions()).rejects.toThrow();
  });

  it('PUT leads/templates/{key}/ connects with `{target}`, and cuts off with `{target: null}`', async () => {
    api.put.mockResolvedValue({ data: {} });

    expect(await setWahubLeadTemplateTarget('link_reminder_1', 'content1')).toBeNull();
    expect(api.put).toHaveBeenLastCalledWith('/wahub/leads/templates/link_reminder_1/', { target: 'content1' });

    await setWahubLeadTemplateTarget('date_arrived_age_2', null);
    expect(api.put).toHaveBeenLastCalledWith('/wahub/leads/templates/date_arrived_age_2/', { target: null });
  });

  it('the answer is the wording as the server now has it — a typed name comes back as the template it was matched to', async () => {
    api.put.mockResolvedValue({
      data: { template_key: 'link_reminder_1', kind_label: 'קיבל קישור ועוד לא נרשם', stage: 1, mapped: true, target: 'content1', target_name: 'kogo_lead_link_1' },
    });
    const row = await setWahubLeadTemplateTarget('link_reminder_1', 'KOGO_lead_link_1');
    expect(row).toMatchObject({ template_key: 'link_reminder_1', mapped: true, target: 'content1', target_name: 'kogo_lead_link_1' });
  });

  it('an answer about another wording is not taken for this one', async () => {
    api.put.mockResolvedValue({ data: { template_key: 'will_check_1', mapped: true, target: 'content2' } });
    expect(await setWahubLeadTemplateTarget('link_reminder_1', 'content1')).toBeNull();
  });

  it('a key is written into the address safely', async () => {
    api.put.mockResolvedValue({ data: {} });
    await setWahubLeadTemplateTarget('a/b c', 'x');
    expect(api.put).toHaveBeenLastCalledWith('/wahub/leads/templates/a%2Fb%20c/', { target: 'x' });
  });

  it('a refusal is thrown to the caller, which takes the change back', async () => {
    api.put.mockRejectedValue(refusal(400));
    await expect(setWahubLeadTemplateTarget('link_reminder_1', 'content1')).rejects.toThrow();
  });
});
