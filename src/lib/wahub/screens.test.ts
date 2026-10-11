import { describe, expect, it } from 'vitest';
import { buildWahubUrl, parseWahubUrl } from './params';
import { chatLayout, chatPanes, conversationOpen, phoneStatusLine } from './screens';

describe('which screen of the conversations is on show', () => {
  it('a frame is wide, medium or narrow by the room it has; unmeasured counts as wide', () => {
    expect(chatLayout(null)).toBe('wide');
    expect(chatLayout(1040)).toBe('wide');
    expect(chatLayout(1039)).toBe('medium');
    expect(chatLayout(680)).toBe('medium');
    expect(chatLayout(679)).toBe('narrow');
  });

  it('a phone is narrow whatever the frame measures', () => {
    expect(chatLayout(1200, true)).toBe('narrow');
    expect(chatLayout(null, true)).toBe('narrow');
  });

  it('wide: all three at once, or the list with "בחרו שיחה"', () => {
    expect(chatPanes('wide', null, false)).toEqual({ list: true, thread: false, details: false, placeholder: true });
    expect(chatPanes('wide', 12, false)).toEqual({ list: true, thread: true, details: true, placeholder: false });
    // Asking for the details changes nothing: they are already beside the conversation.
    expect(chatPanes('wide', 12, true)).toEqual({ list: true, thread: true, details: true, placeholder: false });
  });

  it('medium: the list beside the conversation, or beside the details', () => {
    expect(chatPanes('medium', 12, false)).toEqual({ list: true, thread: true, details: false, placeholder: false });
    expect(chatPanes('medium', 12, true)).toEqual({ list: true, thread: false, details: true, placeholder: false });
  });

  it('a phone: the list, then the conversation, then the details — one at a time', () => {
    expect(chatPanes('narrow', null, false)).toEqual({ list: true, thread: false, details: false, placeholder: false });
    expect(chatPanes('narrow', 12, false)).toEqual({ list: false, thread: true, details: false, placeholder: false });
    expect(chatPanes('narrow', 12, true)).toEqual({ list: false, thread: false, details: true, placeholder: false });
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
