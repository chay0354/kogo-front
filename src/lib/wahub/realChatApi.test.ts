/**
 * The client of the real demo conversation and of the live test, against the
 * contracts (docs/WAHUB-CONTRACT-REAL-DEMO.md, docs/WAHUB-CONTRACT-LIVE-TEST.md):
 * which URL each call reaches, what it sends, and how the answer is read. The
 * axios instance is mocked, so nothing here reaches a server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import {
  fetchWahubContacts,
  fetchWahubMessageMedia,
  replyWahubDemo,
  setWahubLiveTest,
  simulateWahubInbound,
} from '../wahubApi';
import { makeContact, makeMessage, makeShadowReply } from './testFixtures';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('simulate-inbound', () => {
  it('words go as JSON to the contact\'s own door, and the kept message comes back with the contact', async () => {
    const contact = makeContact(7, { is_demo: true });
    const message = makeMessage(101, { text: 'היי' });
    api.post.mockResolvedValue({ data: { ...contact, stored: true, stored_message_id: 101, message } });

    const result = await simulateWahubInbound(7, { kind: 'text', text: ' היי ', sender: 'customer' });

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/contacts/7/simulate-inbound/');
    expect(body).toEqual({ text: 'היי', sender: 'customer' });
    expect(config.headers).toBeUndefined();
    expect(result.stored).toBe(true);
    expect(result.stored_message_id).toBe(101);
    expect(result.message).toEqual(message);
    expect(result.contact?.id).toBe(7);
  });

  it('a recording goes as multipart — a form, and the header that stops it being turned into JSON', async () => {
    api.post.mockResolvedValue({ data: { ...makeContact(7), stored: true, stored_message_id: 102, message: makeMessage(102, { message_type: 'voice', text: '', has_media: true, media_url: 'demo/7/a.webm' }) } });
    const blob = new Blob(['voice-bytes'], { type: 'audio/webm' });

    const result = await simulateWahubInbound(7, { kind: 'voice', file: blob, mimeType: 'audio/webm', durationMs: 3000 });

    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/contacts/7/simulate-inbound/');
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('message_type')).toBe('voice');
    expect(form.get('sender')).toBe('customer');
    expect((form.get('file') as File).name).toBe('recording.webm');
    expect((form.get('file') as File).size).toBe(blob.size);
    expect(config.headers).toEqual({ 'Content-Type': 'multipart/form-data' });
    // An upload gets more time than a line of text.
    expect(config.timeout).toBeGreaterThan(30_000);
    expect(result.message).toMatchObject({ id: 102, message_type: 'voice', has_media: true });
  });

  it('a picture goes as multipart with its caption', async () => {
    api.post.mockResolvedValue({ data: { ...makeContact(7), stored: true, stored_message_id: 103 } });
    const file = new File(['image-bytes'], 'gate.png', { type: 'image/png' });

    const result = await simulateWahubInbound(7, { kind: 'image', file, caption: 'זה השער?' });

    const form = api.post.mock.calls[0][1] as FormData;
    expect(form.get('message_type')).toBe('image');
    expect(form.get('text')).toBe('זה השער?');
    expect((form.get('file') as File).name).toBe('gate.png');
    // An older server that hands no message back: the caller reads the conversation instead.
    expect(result.message).toBeNull();
    expect(result.stored).toBe(true);
  });

  it('a line dropped as a repeat is said as not stored', async () => {
    api.post.mockResolvedValue({ data: { ...makeContact(7), stored: false, stored_message_id: null } });
    const result = await simulateWahubInbound(7, { kind: 'text', text: 'היי', sender: 'customer' });
    expect(result.stored).toBe(false);
    expect(result.message).toBeNull();
  });

  it('nothing to send never reaches the server', async () => {
    await expect(simulateWahubInbound(7, { kind: 'text', text: '  ', sender: 'customer' })).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('the new bot answering a demo conversation', () => {
  it('POST demo/contacts/{id}/reply/ with post: true, given the server\'s fifty seconds and a little more', async () => {
    const shadow = makeShadowReply(31, { text: 'בטח, יש ניסיון בחינם.' });
    const message = makeMessage(201, { direction: 'out', sender: 'bot', sender_label: 'בוט', new_bot: true, status: 'simulated', text: shadow.text });
    api.post.mockResolvedValue({ data: { shadow, message, contact: makeContact(7, { is_demo: true }) } });

    const result = await replyWahubDemo(7);

    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/demo/contacts/7/reply/');
    expect(body).toEqual({ post: true });
    expect(config.timeout).toBeGreaterThanOrEqual(50_000);
    expect(result.error).toBe('');
    expect(result.shadow).toMatchObject({ id: 31, contact_id: 7 });
    expect(result.message).toMatchObject({ id: 201, new_bot: true });
    expect(result.contact?.id).toBe(7);
  });

  it('nothing left to answer: no shadow, no message, no error', async () => {
    api.post.mockResolvedValue({ data: { shadow: null, message: null, contact: makeContact(7) } });
    const result = await replyWahubDemo(7);
    expect(result).toMatchObject({ shadow: null, message: null, error: '' });
  });

  it('a failure of the model comes back as a 200 with the reason in Hebrew, and nothing kept', async () => {
    api.post.mockResolvedValue({ data: { shadow: { error: 'הבוט לא ענה בזמן.' }, message: null, contact: makeContact(7) } });
    const result = await replyWahubDemo(7);
    expect(result.shadow).toBeNull();
    expect(result.message).toBeNull();
    expect(result.error).toBe('הבוט לא ענה בזמן.');
  });
});

describe('a message\'s file', () => {
  it('GET messages/{id}/media/ gives the short-lived address', async () => {
    api.get.mockResolvedValue({ data: { url: 'https://storage.example.test/signed/a.webm?token=x', expires_in: 3600 } });
    const media = await fetchWahubMessageMedia(102);
    expect(api.get.mock.calls[0][0]).toBe('/wahub/messages/102/media/');
    expect(media).toEqual({ url: 'https://storage.example.test/signed/a.webm?token=x', expires_in: 3600 });
  });

  it('an answer without an address is a failure, not an empty player', async () => {
    api.get.mockResolvedValue({ data: {} });
    await expect(fetchWahubMessageMedia(102)).rejects.toThrow();
  });
});

describe('the live test', () => {
  it('POST contacts/{id}/live-test/ {on} — and the contact comes back with live_test', async () => {
    api.post.mockResolvedValue({ data: makeContact(9, { live_test: true }) });

    const contact = await setWahubLiveTest(9, true);

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/wahub/contacts/9/live-test/');
    expect(body).toEqual({ on: true });
    expect(contact.live_test).toBe(true);
  });

  it('turning it off sends on: false', async () => {
    api.post.mockResolvedValue({ data: makeContact(9, { live_test: false }) });
    const contact = await setWahubLiveTest(9, false);
    expect(api.post.mock.calls[0][1]).toEqual({ on: false });
    expect(contact.live_test).toBe(false);
  });

  it('the settings list asks the conversations for live_test=1', async () => {
    api.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [makeContact(9, { live_test: true })] } });
    const page = await fetchWahubContacts({ view: 'chats', liveTest: true, pageSize: 100 });
    const [url, config] = api.get.mock.calls[0];
    expect(url).toBe('/wahub/contacts/');
    expect(config.params).toMatchObject({ view: 'chats', live_test: '1' });
    expect(page.results).toHaveLength(1);
  });
});
