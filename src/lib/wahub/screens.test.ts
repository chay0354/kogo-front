import { describe, expect, it } from 'vitest';
import { buildWahubUrl, parseWahubUrl } from './params';
import { chatColumns, chatLayout, chatPanes, conversationOpen, phoneStatusLine } from './screens';

describe('which screen of the conversations is on show', () => {
  it('a frame is wide, medium or narrow by the room it has; unmeasured counts as wide', () => {
    expect(chatLayout(null)).toBe('wide');
    // A 1024px window with the menu folded leaves the frame 960: three columns from there.
    expect(chatLayout(960)).toBe('wide');
    expect(chatLayout(959)).toBe('medium');
    expect(chatLayout(680)).toBe('medium');
    expect(chatLayout(679)).toBe('narrow');
  });

  it('a phone is narrow whatever the frame measures', () => {
    expect(chatLayout(1200, true)).toBe('narrow');
    expect(chatLayout(null, true)).toBe('narrow');
  });

  it('a window under a desktop\'s width never gets three columns, however much room the frame has', () => {
    expect(chatLayout(1000, false, true)).toBe('medium');
    expect(chatLayout(null, false, true)).toBe('medium');
    expect(chatLayout(700, false, true)).toBe('medium');
    expect(chatLayout(600, false, true)).toBe('narrow');
  });

  it('the side columns: 340 / 380 as a rule, 380 / 420 where there is room, a step narrower where the menu leaves little', () => {
    expect(chatColumns(null)).toEqual({ list: 340, details: 380 });
    // 1280 with the menu folded.
    expect(chatColumns(1216)).toEqual({ list: 340, details: 380 });
    // 1440 with the menu folded, and anything wider.
    expect(chatColumns(1376)).toEqual({ list: 380, details: 420 });
    expect(chatColumns(1664)).toEqual({ list: 380, details: 420 });
    // 1280 with the menu open: the frame is 1024.
    expect(chatColumns(1024)).toEqual({ list: 280, details: 320 });
  });

  it('the conversation always keeps at least a phone\'s width between the two side columns', () => {
    for (const width of [960, 1024, 1159, 1160, 1216, 1359, 1360, 1376, 1664]) {
      const { list, details } = chatColumns(width);
      expect(width - list - details).toBeGreaterThanOrEqual(360);
    }
  });

  it('wide: all three at once — the card is always open — or the list with "בחרו שיחה"', () => {
    expect(chatPanes('wide', null, false)).toEqual({ list: true, thread: false, details: false, drawer: false, placeholder: true });
    expect(chatPanes('wide', 12, false)).toEqual({ list: true, thread: true, details: true, drawer: false, placeholder: false });
    // Asking for the details changes nothing: they are already beside the conversation.
    expect(chatPanes('wide', 12, true)).toEqual({ list: true, thread: true, details: true, drawer: false, placeholder: false });
  });

  it('medium: the list beside the conversation, and the card as a drawer over it when asked for', () => {
    expect(chatPanes('medium', 12, false)).toEqual({ list: true, thread: true, details: false, drawer: false, placeholder: false });
    // The conversation stays where it is, under the drawer.
    expect(chatPanes('medium', 12, true)).toEqual({ list: true, thread: true, details: true, drawer: true, placeholder: false });
    expect(chatPanes('medium', null, true)).toEqual({ list: true, thread: false, details: false, drawer: false, placeholder: true });
  });

  it('a phone: the list, then the conversation, then the details — one at a time', () => {
    expect(chatPanes('narrow', null, false)).toEqual({ list: true, thread: false, details: false, drawer: false, placeholder: false });
    expect(chatPanes('narrow', 12, false)).toEqual({ list: false, thread: true, details: false, drawer: false, placeholder: false });
    expect(chatPanes('narrow', 12, true)).toEqual({ list: false, thread: false, details: true, drawer: false, placeholder: false });
  });

  it('a conversation is open only on the chats tab with a contact in the address', () => {
    expect(conversationOpen({ tab: 'chats', contact: 12 })).toBe(true);
    expect(conversationOpen({ tab: 'chats', contact: null })).toBe(false);
    expect(conversationOpen({ tab: 'leads', contact: 12 })).toBe(false);
    expect(conversationOpen({ tab: 'today', contact: null })).toBe(false);
  });

  it('going back from a conversation removes the contact from the address and keeps the box', () => {
    const open = parseWahubUrl(new URLSearchParams('tab=chats&box=needs_human&contact=12'));
    expect(open.contact).toBe(12);
    // What the back arrow does: the same address without the contact.
    const back = buildWahubUrl({ ...open, contact: null });
    expect(back).toBe('/wahub?tab=chats&box=needs_human');
    expect(parseWahubUrl(new URLSearchParams(back.split('?')[1])).contact).toBeNull();
    expect(conversationOpen(parseWahubUrl(new URLSearchParams(back.split('?')[1])))).toBe(false);
  });
});

describe('the state line under the name on a phone', () => {
  it('says who answers', () => {
    expect(phoneStatusLine({ handled_by: 'bot', handled_by_label: 'הבוט עונה', needs_human: false })).toBe('הבוט עונה');
    expect(phoneStatusLine({ handled_by: 'bot', handled_by_label: '', needs_human: false })).toBe('הבוט עונה');
    expect(phoneStatusLine({ handled_by: 'human', handled_by_label: 'בטיפול נציג', needs_human: false })).toBe('נציג עונה');
  });

  it('adds the request for a person, and the demo mark first', () => {
    expect(phoneStatusLine({ handled_by: 'bot', handled_by_label: '', needs_human: true })).toBe('הבוט עונה · מבקש נציג');
    expect(phoneStatusLine({ handled_by: 'human', handled_by_label: '', needs_human: true }, true)).toBe(
      'דמו · נציג עונה · מבקש נציג',
    );
  });
});
