/**
 * The calls of the evening of 13.10.2026 (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט): "ביקש הסר", who is past
 * three office hours, and "מה הבוט לא ידע השבוע" — which door each knocks on, what it sends, and how the answer
 * is read. The axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));
vi.mock('@/lib/api', () => ({ default: api }));

import { fetchWahubReviewSummary, fetchWahubUpdates } from '../wahubApi';
import { optInWahubContact, optOutWahubContact } from './optOutApi';
import { TEACH_TIMEOUT_MS, TeachNotBuilt } from './teachApi';
import { makeContact } from './testFixtures';
import {
  UnknownsNotBuilt,
  dismissWahubUnknown,
  fetchWahubUnknowns,
  restoreWahubUnknown,
  startWahubTeachFromUnknown,
  unknownsNotBuilt,
} from './unknownsApi';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

const OPTED = { at: '2026-10-13T18:02:00+00:00', source: 'office', source_label: 'סומן על ידי נציג', by_name: 'מיכל כהן', text: '', label: 'ביקש הסר' };

describe('"ביקש הסר" (ט.1.4)', () => {
  it('POST contacts/{id}/opt-out/ with no body; answers with the contact as it now stands', async () => {
    api.post.mockResolvedValueOnce({ data: { ...makeContact(12), opted_out: OPTED } });
    const contact = await optOutWahubContact(12);
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/opt-out/');
    expect(contact.id).toBe(12);
    expect(contact.opted_out).toMatchObject({ source: 'office' });
  });

  it('POST contacts/{id}/opt-in/ — "ביקש לחזור": `opted_out` is null again', async () => {
    api.post.mockResolvedValueOnce({ data: { ...makeContact(12), opted_out: null } });
    const contact = await optInWahubContact(12);
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/opt-in/');
    expect(contact.opted_out).toBeNull();
  });

  it('an answer that names no contact is a failure, never a silent success', async () => {
    api.post.mockResolvedValueOnce({ data: { detail: 'ok' } });
    await expect(optOutWahubContact(12)).rejects.toThrow();
  });
});

describe('the live update names who is past three office hours (ט.2.5)', () => {
  it('`overdue` is read with every poll, beside the contacts and the counts', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        cursor: 'c2',
        contacts: [],
        boxes: { all: 9, waiting: 1, needs_human: 1, unread: 0, human: 2, bot: 7, open: 3, future: 0, overdue: 2 },
        overdue: [
          { id: 12, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' },
          { id: 40, waited_office_minutes: 183, waiting_label: 'מחכה 3:03 שע׳', waiting_from: '2026-10-13T08:42:00+00:00' },
        ],
      },
    });
    const updates = await fetchWahubUpdates('c1');
    expect(api.get).toHaveBeenCalledWith('/wahub/contacts/updates/', { params: { since: 'c1' }, timeout: 10_000 });
    expect(updates.boxes.overdue).toBe(2);
    expect(updates.overdue?.map((row) => row.id)).toEqual([12, 40]);
    expect(updates.overdue?.[0]).toEqual({ id: 12, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T08:10:00+00:00' });
  });

  it('nobody is past the line: an empty list is an answer', async () => {
    api.get.mockResolvedValueOnce({ data: { cursor: 'c2', contacts: [], boxes: {}, overdue: [] } });
    expect((await fetchWahubUpdates('c1')).overdue).toEqual([]);
  });

  it('a server built before it sends no list, and the screen is told so — nothing is un-marked on its silence', async () => {
    api.get.mockResolvedValueOnce({ data: { cursor: 'c2', contacts: [], boxes: { all: 9 } } });
    const updates = await fetchWahubUpdates('c1');
    expect('overdue' in updates).toBe(false);
    expect(updates.boxes.overdue).toBeUndefined();
  });
});

describe('"מה הבוט לא ידע השבוע" (ט.3.3–ט.3.4)', () => {
  const LIST = { week: { key: 'this', from: '2026-10-11', to: '2026-10-17', label: 'השבוע' }, counts: { topics: 1, questions: 4, unsorted: 0 }, sorted_at: null, results: [{ id: 12, title: 'חניה בסניף', count: 4 }], unsorted: { count: 0, examples: [] } };

  it('GET bot/unknowns/ — this week and the open topics are the server\'s defaults, and are not sent', async () => {
    api.get.mockResolvedValueOnce({ data: LIST });
    const read = await fetchWahubUnknowns();
    expect(api.get).toHaveBeenCalledWith('/wahub/bot/unknowns/', { params: {} });
    expect(read.results[0]).toMatchObject({ id: 12, title: 'חניה בסניף', count: 4 });
  });

  it('last week, and the topics that were taken off', async () => {
    api.get.mockResolvedValue({ data: LIST });
    await fetchWahubUnknowns('last');
    expect(api.get).toHaveBeenLastCalledWith('/wahub/bot/unknowns/', { params: { week: 'last' } });
    await fetchWahubUnknowns('this', 'dismissed');
    expect(api.get).toHaveBeenLastCalledWith('/wahub/bot/unknowns/', { params: { status: 'dismissed' } });
  });

  it('a server built before it: 404 — or an answer in another shape — is told as "not built", never as an error to show', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const missing = await fetchWahubUnknowns().catch((error: unknown) => error);
    expect(unknownsNotBuilt(missing)).toBe(true);
    api.get.mockResolvedValueOnce({ data: { detail: 'Not found.' } });
    const odd = await fetchWahubUnknowns().catch((error: unknown) => error);
    expect(odd).toBeInstanceOf(UnknownsNotBuilt);
    expect(unknownsNotBuilt(odd)).toBe(true);
    expect(unknownsNotBuilt({ response: { status: 500 } })).toBe(false);
    expect(unknownsNotBuilt(new Error('timeout'))).toBe(false);
  });

  it('"לא רלוונטי" — POST bot/unknowns/{id}/dismiss/; "להחזיר" — …/restore/; each answers with the topic', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 12, title: 'חניה בסניף', status: 'dismissed', dismissed: { at: '2026-10-13T17:00:00+00:00', by_name: 'דור' } } });
    const gone = await dismissWahubUnknown(12);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/bot/unknowns/12/dismiss/');
    expect(gone).toMatchObject({ status: 'dismissed', dismissed: { by_name: 'דור' } });
    api.post.mockResolvedValueOnce({ data: { id: 12, title: 'חניה בסניף', status: 'open' } });
    const back = await restoreWahubUnknown(12);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/bot/unknowns/12/restore/');
    expect(back?.status).toBe('open');
  });

  it('"ללמד" — POST refine/ {mode: "teach", unknown_topic}: the door of "ללמד", and nothing of a conversation in the body', async () => {
    api.post.mockResolvedValueOnce({
      data: { mode: 'teach', thread: 31, needs_answer: true, question: 'מה התשובה הנכונה?', origin: { kind: 'unknown', label: 'מתוך מה שהבוט לא ידע: חניה בסניף', topic_id: 12 }, changes: [] },
    });
    const thread = await startWahubTeachFromUnknown(12);
    expect(api.post).toHaveBeenCalledWith('/wahub/refine/', { mode: 'teach', unknown_topic: 12 }, { timeout: TEACH_TIMEOUT_MS });
    expect(thread.id).toBe(31);
    expect(thread.origin?.kind).toBe('unknown');
    expect(thread.needs_answer).toBe(true);
  });

  it('an answer in the shape of "דיוק" is not a thread of "ללמד": it is told, and no card is opened on it', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 5, messages: [] } });
    await expect(startWahubTeachFromUnknown(12)).rejects.toBeInstanceOf(TeachNotBuilt);
  });

  it('the small number beside "ללמד": `unknowns` of GET review/summary/ — left out when the server does not send it', async () => {
    api.get.mockResolvedValueOnce({ data: { pending: 2, applied_7d: 1, rejected_7d: 0, auto_mode: false, unknowns: { topics: 4, questions: 11 } } });
    expect((await fetchWahubReviewSummary()).unknowns).toEqual({ topics: 4, questions: 11 });
    api.get.mockResolvedValueOnce({ data: { pending: 2, applied_7d: 1, rejected_7d: 0, auto_mode: false } });
    expect((await fetchWahubReviewSummary()).unknowns).toBeUndefined();
  });
});
