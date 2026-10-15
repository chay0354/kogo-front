/**
 * The writing box's calls (15.10.2026): an opener, a file in three steps, and ✓ with its goodbye — which door
 * each knocks on, what it sends, and how the answer is read. The axios instance and `fetch` are mocked, so
 * nothing here reaches a server or the storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { prepareWahubAttachment, sendWahubMedia, sendWahubOpening, uploadWahubAttachment } from '../wahubApi';
import { AttachmentSendError, attachmentFailure, sendAttachment, type AttachmentSendApi } from './attachmentSend';
import type { WahubAttachmentTicket } from './composer';
import { closeWahubConversation, closeWahubConversationSaying } from './futureLeadsApi';
import { makeContact, makeMessage } from './testFixtures';

const TICKET: WahubAttachmentTicket = {
  path: 'office/12/0b5a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg',
  kind: 'image',
  content_type: 'image/jpeg',
  upload_url: 'https://storage.test/storage/v1/object/upload/sign/wahub-media/office/12/0b5a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg?token=up',
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the openers', () => {
  it('POST contacts/{id}/send-opening/ with the kind, given a minute (it reaches ManyChat)', async () => {
    const answer = { message: makeMessage(9, { message_type: 'template' }), contact: makeContact(12) };
    api.post.mockResolvedValueOnce({ data: answer });
    await expect(sendWahubOpening(12, 'continue')).resolves.toEqual(answer);
    expect(api.post).toHaveBeenCalledWith('/wahub/contacts/12/send-opening/', { kind: 'continue' }, { timeout: 60_000 });
  });
});

describe('a file, in three steps', () => {
  it('step one: the name, the type and the size — never the file itself', async () => {
    api.post.mockResolvedValueOnce({ data: TICKET });
    const file = new File([new Uint8Array(10)], 'מערך.docx', { type: '' });
    await expect(prepareWahubAttachment(12, file)).resolves.toEqual(TICKET);
    expect(api.post).toHaveBeenCalledWith(
      '/wahub/contacts/12/attachments/',
      { name: 'מערך.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 },
      { timeout: 30_000 },
    );
  });

  it('an answer with no upload address is a failure', async () => {
    api.post.mockResolvedValueOnce({ data: { path: 'x' } });
    await expect(prepareWahubAttachment(12, new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).rejects.toThrow();
  });

  it('step two: the browser PUTs the file to the signed address itself, with none of Kogo\'s headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array(3)], 'a.jpg', { type: 'image/jpeg' });
    await uploadWahubAttachment(TICKET, file);
    expect(fetchMock).toHaveBeenCalledWith(TICKET.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file,
      credentials: 'omit',
    });
    expect(api.post).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(uploadWahubAttachment(TICKET, file)).rejects.toThrow();
  });

  it('step three: the path, the kind, the caption and the file\'s name', async () => {
    const answer = { message: makeMessage(9, { message_type: 'image' }), contact: makeContact(12) };
    api.post.mockResolvedValueOnce({ data: answer });
    await sendWahubMedia(12, { path: TICKET.path, kind: 'image', caption: 'שלום', name: 'a.jpg' });
    expect(api.post).toHaveBeenCalledWith(
      '/wahub/contacts/12/send-media/',
      { path: TICKET.path, kind: 'image', caption: 'שלום', name: 'a.jpg' },
      { timeout: 60_000 },
    );
  });

  it('the steps in order, saying which is on', async () => {
    const order: string[] = [];
    const result = { message: makeMessage(9), contact: makeContact(12) };
    const fake: AttachmentSendApi = {
      prepare: async () => {
        order.push('prepare');
        return TICKET;
      },
      upload: async () => {
        order.push('upload');
      },
      send: async (_id, body) => {
        order.push(`send:${body.path}:${body.caption}`);
        return result;
      },
    };
    const phases: string[] = [];
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await expect(sendAttachment(12, file, 'כיתוב', (phase) => phases.push(phase), fake)).resolves.toBe(result);
    expect(order).toEqual(['prepare', 'upload', `send:${TICKET.path}:כיתוב`]);
    expect(phases).toEqual(['upload', 'send']);
  });

  it('a step that failed is named, and nothing after it runs', async () => {
    const send = vi.fn();
    const fake: AttachmentSendApi = {
      prepare: async () => TICKET,
      upload: async () => {
        throw new TypeError('Failed to fetch');
      },
      send,
    };
    const failure = await sendAttachment(12, new File(['x'], 'a.jpg'), '', undefined, fake).catch((error) => error);
    expect(failure).toBeInstanceOf(AttachmentSendError);
    expect((failure as AttachmentSendError).step).toBe('upload');
    expect(send).not.toHaveBeenCalled();
  });

  it('what each failure says', () => {
    const answered = (status: number, data: unknown) => ({ response: { status, data } });
    expect(attachmentFailure(new AttachmentSendError('upload', new TypeError('x')))).toEqual({
      text: 'הקובץ לא הועלה. בדקו את החיבור ונסו שוב.',
      windowClosed: false,
      unknown: false,
    });
    expect(attachmentFailure(new AttachmentSendError('send', new Error('timeout')))).toMatchObject({ unknown: true });
    expect(attachmentFailure(new AttachmentSendError('send', new Error('timeout'))).text).toContain('לא ידוע אם הקובץ נשלח');
    expect(attachmentFailure(new AttachmentSendError('prepare', new Error('offline')))).toMatchObject({ unknown: false, text: 'אין חיבור לשרת. הקובץ לא נשלח.' });
    const closed = attachmentFailure(new AttachmentSendError('prepare', answered(409, { code: 'window_closed', detail: 'עברו יותר מ-24 שעות' })));
    expect(closed).toEqual({ text: 'עברו יותר מ-24 שעות', windowClosed: true, unknown: false });
    expect(attachmentFailure(new AttachmentSendError('prepare', answered(400, { code: 'bad_file', detail: 'הקובץ גדול מדי. סרטון עד 16MB.' }))).text).toBe(
      'הקובץ גדול מדי. סרטון עד 16MB.',
    );
  });
});

describe('✓ with its goodbye', () => {
  it('the contact comes back without the goodbye in it, and the goodbye beside it', async () => {
    const contact = makeContact(12);
    api.post.mockResolvedValueOnce({ data: { ...contact, goodbye: 'failed', goodbye_reason: 'ManyChat דחה' } });
    const result = await closeWahubConversationSaying(12);
    expect(result.goodbye).toEqual({ status: 'failed', reason: 'ManyChat דחה' });
    expect(result.contact).toEqual(contact);
    expect('goodbye' in result.contact).toBe(false);
  });

  it('a server that sends no goodbye: the contact, and null', async () => {
    api.post.mockResolvedValueOnce({ data: makeContact(12) });
    await expect(closeWahubConversationSaying(12)).resolves.toMatchObject({ goodbye: null });
    api.post.mockResolvedValueOnce({ data: makeContact(12) });
    await expect(closeWahubConversation(12)).resolves.toMatchObject({ id: 12 });
  });
});
