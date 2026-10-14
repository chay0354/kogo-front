/**
 * Every conversation from before the switch (the owner, 14.10.2026: "אני צריך את כל השיחות שהיו שיהיה לי
 * אותם"): the lines pasted in ManyChat read the inbox as its own screen does and make one file; the import page
 * reads only that file, and sends it on in small batches.
 */
import { describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, MAX_LINES, NO_COUNTS, addCounts, batches, many, progressLines, readCounts, readHistoryFile } from './historyFile';
import { HISTORY_FILE_KIND, HISTORY_FILE_NAME, MANYCHAT_SCRIPT } from './historyScript';

/** ManyChat's inbox as it answered on 6.10.2026, in a box: two pages of conversations, a page or two of events. */
function fakeManyChat() {
  const threadPages: Record<string, unknown> = {
    first: {
      threads: [
        { user_id: 111, last_lc_event_channel: 'whatsapp', user: { name: 'הורה א', wa_id: '972505550111' } },
        { user_id: 222, last_lc_event_channel: 'instagram', user: { name: 'אחר', wa_id: '' } },
      ],
      limiter: 'L1',
    },
    L1: { threads: [{ user_id: 333, last_lc_event_channel: 'whatsapp', user: { name: 'הורה ב', wa_id: '972505550333' } }, { user_id: 111, last_lc_event_channel: 'whatsapp', user: {} }], limiter: 'L2' },
    L2: { threads: [] },
  };
  const messagePages: Record<string, unknown> = {
    '111:': {
      messages: [
        { type: 'msgout_lc_whatsapp', timestamp: 1760000300, message_id: 'e3', model: { messages: [{ type: 'text', content: { text: 'היי מהמשרד' } }] } },
        { type: 'user_cuf_set', timestamp: 1760000250, model: {} },
        { type: 'msgout_whatsapp', timestamp: 1760000200, message_id: 'e2', model: { messages: [{ type: 'text', content: { text: 'שלום!' } }, { type: 'text', content: { text: 'איך אפשר לעזור?' } }] } },
      ],
      limiter: 'M1',
    },
    '111:M1': {
      messages: [
        { type: 'msgin_whatsapp', timestamp: 1760000100, message_id: 'e1', model: { type: 'text', text: 'היי' } },
        { type: 'msgin_whatsapp', timestamp: 1760000050, message_id: 'e0', model: { type: 'image', caption: '' } },
        { type: 'msgout_whatsapp', timestamp: 1760000000, message_id: 't0', model: { messages: [{ type: 'template', content: { name: 'welcome', body: 'ברוכים הבאים' } }] } },
      ],
    },
    '333:': { messages: [] },
  };
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string, options: { method?: string; headers: Record<string, string> }) => {
    calls.push(`${options.method} ${url} ${options.headers['X-Csrf-Token']}`);
    const address = new URL(url, 'https://app.manychat.com');
    let body: unknown = null;
    if (address.pathname.endsWith('/im/loadThreads')) body = threadPages[address.searchParams.get('limiter') || 'first'];
    if (address.pathname.endsWith('/im/loadMessages')) body = messagePages[`${address.searchParams.get('user_id')}:${address.searchParams.get('limiter') || ''}`];
    return { ok: body !== null && body !== undefined, status: body ? 200 : 404, json: async () => body };
  });
  return { fetch, calls };
}

async function runScript(origin = 'https://app.manychat.com', pathname = '/fb5259597/inbox') {
  const { fetch, calls } = fakeManyChat();
  const downloads: { name: string; text: string }[] = [];
  const logs: string[] = [];
  const blobs = new Map<string, string>();
  class FakeBlob {
    text: string;
    constructor(parts: string[]) {
      this.text = parts.join('');
    }
  }
  const document = {
    body: { appendChild: () => undefined },
    createElement: () => {
      const link = { href: '', download: '', click: () => downloads.push({ name: link.download, text: blobs.get(link.href) ?? '' }), remove: () => undefined };
      return link;
    },
  };
  const URLish = { createObjectURL: (blob: FakeBlob) => { const key = `blob:${blobs.size}`; blobs.set(key, blob.text); return key; } };
  const window = { __INIT__: { 'app.csrf_token': 'csrf-from-page', 'app.frontend_bundle': '1500' } };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.setRequestHeader = () => undefined;
  const console = { log: (first: string, ...rest: unknown[]) => logs.push([first, ...rest].join(' ')) };
  const setTimeout = (done: () => void) => done();
  const run = new Function(
    'window', 'location', 'XMLHttpRequest', 'fetch', 'document', 'Blob', 'URL', 'console', 'setTimeout',
    `return ${MANYCHAT_SCRIPT}`,
  );
  await run(window, { origin, pathname }, XMLHttpRequest, fetch, document, FakeBlob, URLish, console, setTimeout);
  return { downloads, logs, calls };
}

describe('the lines pasted in ManyChat', () => {
  it('read every WhatsApp conversation through the inbox\'s own calls and make one file', async () => {
    const { downloads, calls } = await runScript();
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe(HISTORY_FILE_NAME);
    // The page's own session: its token on every call; nothing but reading.
    expect(calls.every((call) => call.endsWith('csrf-from-page'))).toBe(true);
    expect(calls.filter((call) => call.startsWith('POST')).every((call) => call.includes('/im/loadThreads'))).toBe(true);
    const file = JSON.parse(downloads[0].text);
    expect(file.kind).toBe(HISTORY_FILE_KIND);
    expect(file.found).toBe(2);
    // An empty conversation is left out; one read twice in the list is read once.
    expect(file.conversations.map((row: { subscriber_id: string }) => row.subscriber_id)).toEqual(['111']);
    const [one] = file.conversations;
    expect(one).toMatchObject({ phone: '972505550111', name: 'הורה א' });
    expect(one.messages.map((line: { from: string; text: string; type: string }) => [line.from, line.type, line.text])).toEqual([
      ['system', 'template', 'ברוכים הבאים'],
      ['customer', 'image', ''],
      ['customer', 'text', 'היי'],
      ['bot', 'text', 'שלום!'],
      ['bot', 'text', 'איך אפשר לעזור?'],
      ['office', 'text', 'היי מהמשרד'],
    ]);
    // Every line has an id of its own, the same every time the file is made.
    expect(new Set(one.messages.map((line: { id: string }) => line.id)).size).toBe(6);
  });

  it('outside ManyChat they do nothing', async () => {
    const { downloads, calls, logs } = await runScript('https://example.com', '/');
    expect(downloads).toHaveLength(0);
    expect(calls).toHaveLength(0);
    expect(logs.join(' ')).toContain('בתוך ManyChat');
  });
});

describe('the file on the import page', () => {
  it('is read only when it is the file the lines make, and keeps what can be sent', () => {
    expect(readHistoryFile({ kind: 'other', conversations: [] })).toBeNull();
    expect(readHistoryFile(null)).toBeNull();
    const long = Array.from({ length: MAX_LINES + 5 }, (_, index) => ({ id: String(index) }));
    const file = readHistoryFile({
      kind: HISTORY_FILE_KIND,
      found: 3,
      failed: 1,
      conversations: [
        { subscriber_id: '1', phone: '0505550101', name: 'א', messages: long },
        { subscriber_id: 'abc', messages: [{}] },
        { subscriber_id: '2', messages: [] },
      ],
    });
    expect(file?.found).toBe(3);
    expect(file?.conversations).toHaveLength(1);
    expect(file?.conversations[0].messages).toHaveLength(MAX_LINES);
    expect((file?.conversations[0].messages[0] as { id: string }).id).toBe('5');
  });

  it('goes in batches the server takes', () => {
    expect(batches(Array.from({ length: 23 }, (_, index) => index)).map((batch) => batch.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 3]);
  });

  it('says the point first, and the rest only where there is some', () => {
    const one = readCounts({ lines: 40, contacts: 2, created: 1, already_kept: 0, no_phone: 'x' });
    const total = addCounts(addCounts(NO_COUNTS, one), one);
    expect(total.lines).toBe(80);
    const lines = progressLines({ ...total, lines: 41200, contacts: 1180 }, 1400);
    expect(lines.main).toBe('הועתקו 41,200 הודעות ב-1,180 מתוך 1,400 שיחות');
    expect(lines.more).toBe('2 אנשי קשר חדשים');
    expect(progressLines({ ...NO_COUNTS, created: 1, already_kept: 1, no_phone: 3 }, 5).more).toBe(
      'איש קשר חדש אחד · הודעה אחת כבר ב-Kogo · 3 שיחות בלי מספר ישראלי',
    );
    expect(many(1, 'שיחה אחת', 'שיחות')).toBe('שיחה אחת');
    expect(many(1200, 'שיחה אחת', 'שיחות')).toBe('1,200 שיחות');
  });
});
