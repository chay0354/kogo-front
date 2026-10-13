/**
 * "דיוק" inside a conversation, as the very same teaching as "ללמד"
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.4): the door it knocks on, what it sends, how a thread that was born
 * of a conversation is read — and how a server built before it is told apart. The axios instance is mocked, so
 * nothing here reaches a server. Every name and sentence is made up.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../api', () => ({ default: api }));

import { knowsChatBox } from './boxes';
import { readTeachOrigin, readTeachPage, readTeachThread, rowOfThread } from './teach';
import { TEACH_TIMEOUT_MS, TeachNotBuilt, fetchWahubTeachPage, startWahubTeachFromChat, teachNotBuilt } from './teachApi';
import { rawTeachRow, rawTeachThread } from './teachFixtures';
import { makeContact } from './testFixtures';

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

const ORIGIN = { kind: 'conversation', label: 'מתוך שיחה עם דנה לוי', contact_id: 12, contact_name: 'דנה לוי', link: '/wahub?tab=chats&contact=12' };
const CONTEXT = {
  contact_id: 12,
  message_ids: [501, 502],
  shadow_ids: [],
  quotes: [
    { kind: 'message', id: 501, who: 'customer', who_label: 'לקוח', text: 'כמה עולה?', at: '2026-10-13T09:12:00+00:00' },
    { kind: 'message', id: 502, who: 'bot', who_label: 'הבוט הישן', text: 'החוג עולה 290 ₪.', at: '2026-10-13T09:12:30+00:00' },
  ],
};

describe('the door', () => {
  it('marked messages with no words: POST refine/ with mode "teach", the conversation and the messages — and the long wait', async () => {
    api.post.mockResolvedValue({ data: rawTeachThread({ origin: ORIGIN, context: CONTEXT }) });
    const thread = await startWahubTeachFromChat({ contactId: 12, messageIds: [501, 502] });
    expect(api.post).toHaveBeenCalledWith('/wahub/refine/', { mode: 'teach', contact: 12, message_ids: [501, 502] }, { timeout: TEACH_TIMEOUT_MS });
    expect(thread.origin?.label).toBe('מתוך שיחה עם דנה לוי');
  });

  it('with her words — and on an answer of the bot in the shadow', async () => {
    api.post.mockResolvedValue({ data: rawTeachThread() });
    await startWahubTeachFromChat({ contactId: 12, messageIds: [501], shadowId: 77, text: '  ענה מחיר בלי לשאול איזה חוג  ' });
    expect(api.post).toHaveBeenCalledWith(
      '/wahub/refine/',
      { mode: 'teach', contact: 12, message_ids: [501], shadow_ids: [77], text: 'ענה מחיר בלי לשאול איזה חוג' },
      { timeout: TEACH_TIMEOUT_MS },
    );
    // A shadow answer alone, with nothing marked beside it.
    api.post.mockClear();
    await startWahubTeachFromChat({ contactId: 12, messageIds: [], shadowId: 77 });
    expect(api.post.mock.calls[0][1]).toEqual({ mode: 'teach', contact: 12, shadow_ids: [77] });
  });

  it('a server built before it drops `mode` and answers in the shape of "דיוק": told as "not built", never as a failure', async () => {
    api.post.mockResolvedValue({ data: { thread: 9, status: 'open', reply: 'הבנתי.', needs_answer: true, changes: [], turns: [] } });
    const failure = await startWahubTeachFromChat({ contactId: 12, messageIds: [501] }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(TeachNotBuilt);
    expect(teachNotBuilt(failure)).toBe(true);
  });

  it('one press is one request', async () => {
    api.post.mockResolvedValue({ data: rawTeachThread() });
    await startWahubTeachFromChat({ contactId: 12, messageIds: [501] });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('what was taught from one conversation: the same list, narrowed by the contact', async () => {
    api.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [rawTeachRow(41, { origin: ORIGIN })] } });
    const page = await fetchWahubTeachPage(1, 20, 12);
    expect(api.get).toHaveBeenCalledWith('/wahub/refine/', { params: { mode: 'teach', contact: '12' } });
    expect(page.results[0].origin?.contact_id).toBe(12);
    // The whole list asks for no contact.
    api.get.mockClear();
    await fetchWahubTeachPage();
    expect(api.get).toHaveBeenCalledWith('/wahub/refine/', { params: { mode: 'teach' } });
  });
});

describe('a thread that was born of a conversation', () => {
  it('says where it was taught from, with the way back to that conversation — and quotes what it was written about', () => {
    const thread = readTeachThread(rawTeachThread({ origin: ORIGIN, context: CONTEXT }));
    expect(thread?.origin).toEqual({ kind: 'conversation', label: 'מתוך שיחה עם דנה לוי', contact_id: 12, link: '/wahub?tab=chats&contact=12' });
    expect(thread?.quotes).toEqual([
      { id: 501, who: 'customer', who_label: 'לקוח', text: 'כמה עולה?' },
      { id: 502, who: 'bot', who_label: 'הבוט הישן', text: 'החוג עולה 290 ₪.' },
    ]);
  });

  it('a thread that was written freely has no origin worth a word, and quotes nothing', () => {
    const free = readTeachThread(rawTeachThread({ origin: { kind: 'free', label: '', contact_id: null, link: null }, context: null }));
    expect(free?.origin).toBeUndefined();
    expect(free?.quotes).toBeUndefined();
    // …and so does one from a server that says nothing of it.
    expect(readTeachThread(rawTeachThread())?.origin).toBeUndefined();
  });

  it('never a phone: a contact with no name is "מתוך שיחה"; an answer in the shadow says so', () => {
    expect(readTeachOrigin({ kind: 'conversation', label: '', contact_id: 12 })?.label).toBe('מתוך שיחה');
    expect(readTeachOrigin({ kind: 'shadow', label: '', contact_id: 12 })?.label).toBe('על תשובה של הבוט בצל');
    expect(readTeachOrigin({ kind: 'conversation', label: 'מתוך שיחה שנמחקה', contact_id: null, link: null })).toEqual({ kind: 'conversation', label: 'מתוך שיחה שנמחקה', contact_id: null, link: null });
  });

  it('the way back is kept only when it stays inside the section', () => {
    const link = (value: unknown) => readTeachOrigin({ kind: 'conversation', label: 'x', link: value })?.link;
    expect(link('/wahub?tab=chats&contact=12')).toBe('/wahub?tab=chats&contact=12');
    expect(link('https://elsewhere.example/wahub')).toBeNull();
    expect(link('//elsewhere.example')).toBeNull();
    expect(link('/customers')).toBeNull();
    expect(link(null)).toBeNull();
  });

  it('the system speaks first: a summary of the piece, while it is the last thing said', () => {
    const opening = readTeachThread(
      rawTeachThread({ needs_answer: true, needs_approval: false, question: 'מה לא היה טוב כאן?', changes: [], summary: { what_happened: 'שאל על מחיר.', what_was_answered: 'נענה מיד.', suspected_issue: '' } }),
    );
    expect(opening?.summary).toEqual({ what_happened: 'שאל על מחיר.', what_was_answered: 'נענה מיד.', suspected_issue: null });
    expect(opening?.question).toBe('מה לא היה טוב כאן?');
    expect(readTeachThread(rawTeachThread({ summary: null }))?.summary).toBeUndefined();
    expect(readTeachThread(rawTeachThread({ summary: {} }))?.summary).toBeUndefined();
  });

  it('never more than eight quotes, and an empty one is not quoted', () => {
    const quotes = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, who: 'customer', who_label: 'לקוח', text: index === 3 ? '' : `הודעה ${index}` }));
    expect(readTeachThread(rawTeachThread({ origin: ORIGIN, context: { quotes } }))?.quotes).toHaveLength(8);
  });

  it('"מה לימדת עד היום" carries the origin on its row — and keeps it when the thread changes', () => {
    const page = readTeachPage({ count: 2, next: null, results: [rawTeachRow(41, { origin: ORIGIN }), rawTeachRow(40)] });
    expect(page?.results.map((row) => row.origin?.label)).toEqual(['מתוך שיחה עם דנה לוי', undefined]);
    const thread = readTeachThread(rawTeachThread({ origin: ORIGIN }))!;
    expect(rowOfThread(thread).origin?.label).toBe('מתוך שיחה עם דנה לוי');
    // A thread read back without its origin keeps the one its row had.
    const bare = readTeachThread(rawTeachThread())!;
    expect(rowOfThread(bare, page?.results[0]).origin?.label).toBe('מתוך שיחה עם דנה לוי');
  });
});

describe('does the server offer it?', () => {
  it('the same server that says in which box a conversation stands (ח.1.2) lets "דיוק" work with "ללמד" (ח.4)', () => {
    expect(knowsChatBox(makeContact(1, { chat: { box: 'all', box_label: 'הבוט עונה' } }))).toBe(true);
    expect(knowsChatBox(makeContact(1))).toBe(false);
    expect(knowsChatBox(null)).toBe(false);
  });
});
