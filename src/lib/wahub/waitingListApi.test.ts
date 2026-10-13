/**
 * The client of the full waiting list, of adding to it by hand, of telling a
 * customer that a place was freed, and of editing or deleting a note, against
 * the contract (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.4, ז): which door each
 * call knocks on, what it sends, and how a server that does not have the door
 * is read. The axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { makeContact } from './testFixtures';
import {
  addWahubWaitingEntry,
  deleteWahubNote,
  editWahubNote,
  fetchWahubNotifyPreview,
  fetchWahubWaitingLessons,
  fetchWahubWaitingList,
  lessonsParams,
  sendWahubNotify,
} from './waitingListApi';

beforeEach(() => {
  for (const call of Object.values(api)) call.mockReset();
});

const CONTACT = makeContact(12, { chat: { open: false, open_reason: '', open_label: '' } });
const gone = (status: number) => ({ response: { status, data: { detail: 'Not found.' } } });

describe('the full list', () => {
  it('GET waiting-list/ — everybody who still stands on it', async () => {
    api.get.mockResolvedValueOnce({ data: { counts: { waiting: 1, freed: 0 }, lessons: [], results: [] } });
    const page = await fetchWahubWaitingList();
    expect(api.get).toHaveBeenCalledWith('/wahub/waiting-list/', { params: { status: 'active' } });
    expect(page).toMatchObject({ counts: { waiting: 1, freed: 0 }, counted: true });
  });

  it('a server with no waiting list (404 / 405): null — the leads tab has no way into it', async () => {
    api.get.mockRejectedValueOnce(gone(404));
    expect(await fetchWahubWaitingList()).toBeNull();
    api.get.mockRejectedValueOnce(gone(405));
    expect(await fetchWahubWaitingList()).toBeNull();
  });

  it('any other failure is a failure, and so is an answer that is not the list', async () => {
    api.get.mockRejectedValueOnce(gone(500));
    await expect(fetchWahubWaitingList()).rejects.toBeTruthy();
    api.get.mockResolvedValueOnce({ data: { detail: 'ok' } });
    await expect(fetchWahubWaitingList()).rejects.toThrow();
  });
});

describe('the lessons to choose from', () => {
  it('only what was chosen is sent', () => {
    expect(lessonsParams({})).toEqual({});
    expect(lessonsParams({ q: '  קפוארה מינץ ', branch: '5c1d', contact: 12 })).toEqual({ q: 'קפוארה מינץ', branch: '5c1d', contact: '12' });
    expect(lessonsParams({ q: '   ', branch: '', contact: null })).toEqual({});
  });

  it('GET waiting-list/lessons/ with whose list is being added to, so their own lessons come back marked', async () => {
    api.get.mockResolvedValueOnce({ data: { branches: [], total: 0, results: [] } });
    const options = await fetchWahubWaitingLessons({ q: 'קפוארה', contact: 12 });
    expect(api.get).toHaveBeenCalledWith('/wahub/waiting-list/lessons/', { params: { q: 'קפוארה', contact: '12' } });
    expect(options).toEqual({ branches: [], total: 0, results: [] });
  });

  it('a server without it (404): null — adding from the screen is not offered', async () => {
    api.get.mockRejectedValueOnce(gone(404));
    expect(await fetchWahubWaitingLessons({})).toBeNull();
  });
});

describe('adding by hand', () => {
  it('POST contacts/{id}/waiting-list/ {lesson_id, child}; what is known of the child is left out when there is nothing', async () => {
    api.post.mockResolvedValue({ data: { entry: { id: 9, status: 'waiting' }, contact: CONTACT } });
    const added = await addWahubWaitingEntry(12, '0b0e', '  בן 5 ');
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/waiting-list/', { lesson_id: '0b0e', child: 'בן 5' });
    expect(added.entry).toMatchObject({ id: 9, status: 'waiting' });
    expect(added.contact?.id).toBe(12);
    await addWahubWaitingEntry(12, '0b0e', '   ');
    expect(api.post.mock.calls[1][1]).toEqual({ lesson_id: '0b0e' });
  });

  it('a refusal (a lesson with room, already on the list) is thrown as it came, for the screen to say', async () => {
    const refusal = { response: { status: 400, data: { detail: 'יש מקום בשיעור הזה — אפשר לרשום', code: 'has_room' } } };
    api.post.mockRejectedValueOnce(refusal);
    await expect(addWahubWaitingEntry(12, '0b0e')).rejects.toBe(refusal);
  });
});

describe('telling the customer', () => {
  const READY = { can: true, how: 'text', how_label: 'תצא כהודעה רגילה', text: 'היי התפנה מקום', blocked: '', detail: '', needs_again: false };

  it('GET waiting-list/{id}/notify/ reads only: what would go out', async () => {
    api.get.mockResolvedValueOnce({ data: { entry: { id: 7 }, notify: READY } });
    const preview = await fetchWahubNotifyPreview(7);
    expect(api.get).toHaveBeenCalledWith('/wahub/waiting-list/7/notify/');
    expect(preview).toMatchObject({ can: true, how: 'text', text: 'היי התפנה מקום' });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a first message: POST with no body, and a minute to answer (it waits for ManyChat)', async () => {
    api.post.mockResolvedValueOnce({ data: { entry: { id: 7, status: 'freed', notified_at: '2026-10-13T08:02:00+00:00' }, contact: CONTACT, notify: { sent: true, code: 'sent_text', detail: 'נשלח כהודעה רגילה' } } });
    const result = await sendWahubNotify(7);
    expect(api.post).toHaveBeenCalledWith('/wahub/waiting-list/7/notify/', undefined, { timeout: 60_000 });
    expect(result).toMatchObject({ sent: true, code: 'sent_text' });
    expect(result.entry?.notified_at).toBe('2026-10-13T08:02:00+00:00');
  });

  it('a second message about the same place says so: {again: true} — and only when asked for', async () => {
    api.post.mockResolvedValue({ data: { entry: { id: 7 }, contact: CONTACT, notify: { sent: true, code: 'sent_text' } } });
    await sendWahubNotify(7, true);
    expect(api.post).toHaveBeenLastCalledWith('/wahub/waiting-list/7/notify/', { again: true }, { timeout: 60_000 });
    await sendWahubNotify(7, false);
    expect(api.post.mock.calls[1][1]).toBeUndefined();
  });

  it('one press is one request: a failure is thrown, never tried again here', async () => {
    api.post.mockRejectedValueOnce({ message: 'Network Error' });
    await expect(sendWahubNotify(7)).rejects.toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('409 is thrown with its code, for the screen to act on; an answer that does not say `sent` is a failure', async () => {
    const taken = { response: { status: 409, data: { code: 'taken', detail: 'המקום נתפס בינתיים' } } };
    api.post.mockRejectedValueOnce(taken);
    await expect(sendWahubNotify(7)).rejects.toBe(taken);
    api.post.mockResolvedValueOnce({ data: { entry: { id: 7 }, notify: {} } });
    await expect(sendWahubNotify(7)).rejects.toThrow();
  });
});

describe('a note: editing and deleting', () => {
  const NOTE = { id: 311, text: 'אמא ביקשה שנחזור אחרי סוכות', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+00:00', edited_at: '2026-10-13T10:02:00+00:00', edited_by_name: 'מיכל כהן' };

  it('PATCH contacts/{id}/notes/{note_id}/ {text}: the note comes back, marked as edited', async () => {
    api.patch.mockResolvedValueOnce({ data: { note: NOTE, contact: CONTACT } });
    const result = await editWahubNote(12, 311, ' אמא ביקשה שנחזור אחרי סוכות ');
    expect(api.patch).toHaveBeenCalledWith('/wahub/contacts/12/notes/311/', { text: 'אמא ביקשה שנחזור אחרי סוכות' });
    expect(result.note).toMatchObject({ id: 311, edited_at: '2026-10-13T10:02:00+00:00', edited_by_name: 'מיכל כהן' });
    expect(result.contact?.id).toBe(12);
  });

  it('an answer without the note is a failure — an edit that was not kept must never look kept', async () => {
    api.patch.mockResolvedValueOnce({ data: { contact: CONTACT } });
    await expect(editWahubNote(12, 311, 'פתק')).rejects.toThrow();
  });

  it('DELETE contacts/{id}/notes/{note_id}/', async () => {
    api.delete.mockResolvedValueOnce({ data: { deleted: 311, contact: CONTACT } });
    const result = await deleteWahubNote(12, 311);
    expect(api.delete).toHaveBeenCalledWith('/wahub/contacts/12/notes/311/');
    expect(result.contact?.id).toBe(12);
  });

  it('a server without the door (404) refuses, and the screen says the note is gone', async () => {
    api.delete.mockRejectedValueOnce(gone(404));
    await expect(deleteWahubNote(12, 311)).rejects.toBeTruthy();
  });
});
