/**
 * The client of the ✓, the clock, the note and the waiting list, against the
 * contract (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.3–ג.6, ד.4): which door each
 * call knocks on, what it sends, how long it waits, and how the answer is read.
 * The axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { actOnWahubWaitingEntry, addWahubNote, closeWahubConversation, handWahubToBot, setWahubFuture } from './futureLeadsApi';
import { makeContact } from './testFixtures';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

const CONTACT = makeContact(12, { chat: { open: false, open_reason: '', open_label: '' } });

describe('✓ — closing a conversation', () => {
  it('POST contacts/{id}/close/ with no body, given a minute (it may reach ManyChat); answers with the contact', async () => {
    api.post.mockResolvedValueOnce({ data: CONTACT });
    const contact = await closeWahubConversation(12);
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/close/', undefined, { timeout: 60_000 });
    expect(contact.id).toBe(12);
  });

  it('an answer that names no contact is a failure, never a silent success', async () => {
    api.post.mockResolvedValueOnce({ data: { detail: 'ok' } });
    await expect(closeWahubConversation(12)).rejects.toThrow();
  });
});

describe('the clock — "הבוט ימשיך לטפל"', () => {
  it('POST contacts/{id}/hand-to-bot/ with a minute to answer: the bot reads the conversation with the model', async () => {
    api.post.mockResolvedValueOnce({
      data: { contact: CONTACT, understood: { ok: true, text: 'הילד יהיה בן 3 — הבוט יחזור אליהם ב-1.12.2026', sending_enabled: false } },
    });
    const result = await handWahubToBot(12);
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/hand-to-bot/', undefined, { timeout: 60_000 });
    expect(result.contact?.id).toBe(12);
    expect(result.understood).toMatchObject({ ok: true, text: 'הילד יהיה בן 3 — הבוט יחזור אליהם ב-1.12.2026', sending_enabled: false });
  });

  it('`ok: false` is an answer, not a failure: nothing changed, and the sentence says why', async () => {
    api.post.mockResolvedValueOnce({ data: { contact: CONTACT, understood: { ok: false, text: 'הלקוח כבר רשום — אין מה לתזמן', next: null } } });
    const result = await handWahubToBot(12);
    expect(result.understood).toMatchObject({ ok: false, text: 'הלקוח כבר רשום — אין מה לתזמן', next_when: null });
  });
});

describe('the clock — "ליד עתידי שלי"', () => {
  it('POST contacts/{id}/future/ {due, reason}; `mute` says whether the bot was silenced', async () => {
    api.post.mockResolvedValueOnce({ data: { contact: CONTACT, mute: { muted: false, detail: 'השליחה ללקוחות כבויה' } } });
    const result = await setWahubFuture(12, '2026-12-01', '  הילד יהיה בן 3 ');
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/future/', { due: '2026-12-01', reason: 'הילד יהיה בן 3' }, { timeout: 60_000 });
    expect(result.mute).toEqual({ muted: false, detail: 'השליחה ללקוחות כבויה' });
  });

  it('putting an existing lead off: the reason is left out, so the one that was there stays', async () => {
    api.post.mockResolvedValueOnce({ data: { contact: CONTACT, mute: { muted: true, detail: '' } } });
    await setWahubFuture(12, '2027-01-10', '   ');
    expect(api.post.mock.calls[0][1]).toEqual({ due: '2027-01-10' });
  });
});

describe('a note about the customer', () => {
  it('POST contacts/{id}/notes/ {text}: the note comes back, with the contact', async () => {
    api.post.mockResolvedValueOnce({
      data: { note: { id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+00:00' }, contact: CONTACT },
    });
    const result = await addWahubNote(12, ' אמא ביקשה שנחזור אחרי החגים ');
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/notes/', { text: 'אמא ביקשה שנחזור אחרי החגים' });
    expect(result.note).toEqual({ id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+00:00' });
    expect(result.contact?.id).toBe(12);
  });

  it('an answer without the note is a failure — a note that was not kept must never look kept', async () => {
    api.post.mockResolvedValueOnce({ data: { contact: CONTACT } });
    await expect(addWahubNote(12, 'פתק')).rejects.toThrow();
  });
});

describe('a waiting-list entry whose place was freed', () => {
  it('"טופל" and "להסיר מהרשימה" each have their own door', async () => {
    api.post.mockResolvedValue({ data: { entry: { id: 7, status: 'handled', status_label: 'טופל' }, contact: CONTACT } });
    const handled = await actOnWahubWaitingEntry(7, 'handled');
    await actOnWahubWaitingEntry(7, 'remove');
    expect(api.post.mock.calls.map((call) => call[0])).toEqual(['/wahub/waiting-list/7/handled/', '/wahub/waiting-list/7/remove/']);
    expect(handled.entry).toMatchObject({ id: 7, status: 'handled' });
    expect(handled.contact?.id).toBe(12);
  });
});
