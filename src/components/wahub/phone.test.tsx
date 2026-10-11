import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { menuBadgeCount } from '@/lib/wahub/boxes';
import { makeContact } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread from './chats/ChatThread';
import Composer from './chats/Composer';
import ContactPanel from './chats/ContactPanel';
import DemoComposer from './chats/DemoComposer';
import type { ContactThread } from './hooks/useContactThread';
import s from './wahub.module.css';
import WahubNav from './WahubNav';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-11T12:00:00+03:00');
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, overrides), messages: [], has_older: false, events: [] };
}

function thread(contact: WahubContactDetail | null): ContactThread {
  return {
    contactId: 12,
    contact,
    messages: [],
    hasOlder: false,
    status: 'ready',
    error: '',
    loadingOlder: false,
    sending: false,
    olderLoads: 0,
    stateRef: { current: {} as never },
    putContact: noop,
    onLiveContact: noop,
    putMessages: noop,
    settleMessage: noop,
    loadOlder: async () => {},
    send: async () => true,
    sendFlow: async () => true,
    refreshQuietly: async () => {},
    retry: noop,
  };
}

function renderThread(contact: WahubContactDetail | null, showBack: boolean) {
  return render(
    <ChatThread
      thread={thread(contact)}
      now={NOW}
      visible
      simulated={false}
      sendingOff={false}
      handoverBusy={false}
      resolveBusy={false}
      showBack={showBack}
      showDetailsButton={showBack}
      onBack={noop}
      onDetails={noop}
      onTakeover={noop}
      onRelease={noop}
      onResolveNeedsHuman={noop}
      onOpenSettings={noop}
    />,
  );
}

describe('the five tabs (the bar at the bottom of a phone)', () => {
  it('names the five, in order, and marks the one in front', () => {
    const html = render(<WahubNav active="leads" needsHuman={0} onSelect={noop} />);
    const order = ['שיחות', 'היום', 'לידים', 'הבוט', 'הגדרות'].map((label) => html.indexOf(label));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('id="wahub-tab-leads" aria-selected="true"');
    expect(html).toContain(s.nav);
  });

  it('the red mark counts only who asks for a person — the rule of the menu', () => {
    // Twelve waiting for the bot, nobody asking for a person: no mark.
    expect(menuBadgeCount({ waiting: 12, needs_human: 0 })).toBe(0);
    expect(render(<WahubNav active="chats" needsHuman={menuBadgeCount({ waiting: 12, needs_human: 0 })} onSelect={noop} />)).not.toContain(
      s.segBadge,
    );
    // Three asking: the mark says 3, on "שיחות" only.
    const html = render(<WahubNav active="today" needsHuman={menuBadgeCount({ waiting: 12, needs_human: 3 })} onSelect={noop} />);
    expect(html.match(new RegExp(s.segBadge, 'g'))).toHaveLength(1);
    expect(html).toContain('aria-label="3 מבקשים נציג"');
    expect(html).toContain('>3</span>');
  });

  it('more than 99 is "99+": a nudge, not a report', () => {
    expect(render(<WahubNav active="chats" needsHuman={120} onSelect={noop} />)).toContain('99+');
  });
});

describe('the way back on a phone', () => {
  it('a conversation on its own has the arrow back to the list; beside the list it has none', () => {
    const alone = renderThread(detail({ name: 'דנה כהן' }), true);
    expect(alone).toContain('aria-label="חזרה לרשימת השיחות"');
    expect(renderThread(detail({ name: 'דנה כהן' }), false)).not.toContain('חזרה לרשימת השיחות');
  });

  it('the arrow is there even before the conversation has loaded', () => {
    expect(renderThread(null, true)).toContain('aria-label="חזרה לרשימת השיחות"');
  });

  it('the name opens the details, and a short state line sits under it', () => {
    const html = renderThread(detail({ name: 'דנה כהן', chat: { needs_human: true } }), true);
    expect(html).toContain('title="פרטי איש הקשר"');
    expect(html).toContain(s.threadName);
    expect(html).toContain('הבוט עונה · מבקש נציג');
    // The one-icon handover of the phone, beside the desktop's worded button.
    expect(html).toContain(s.phoneIb);
    expect(html.match(/קח שיחה/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the details standing in for the conversation', () => {
  const contact = detail({ name: 'דנה כהן', chat: { needs_human: true } });
  const props = {
    contact,
    now: NOW,
    today: '2026-10-11',
    allTags: [],
    analyzing: false,
    rechecking: false,
    onBack: noop,
    onFollowup: noop,
    onTags: noop,
    onRename: noop,
    onRecheck: noop,
    onAnalyze: noop,
  };
  const actions = { handoverBusy: false, resolveBusy: false, onTakeover: noop, onRelease: noop, onResolveNeedsHuman: noop };

  it('on its own: the arrow back, the conversation\'s actions and the way to WhatsApp', () => {
    const html = render(<ContactPanel {...props} showBack actions={actions} />);
    expect(html).toContain('aria-label="חזרה לשיחה"');
    expect(html).toContain('פרטי איש הקשר');
    expect(html).toContain('קח שיחה');
    expect(html).toContain('טופל');
    expect(html).toContain('https://wa.me/972500000012');
    expect(html).not.toContain('החזר לבוט');
  });

  it('a person answering: the action is to hand back', () => {
    const html = render(
      <ContactPanel {...props} contact={detail({ chat: { handled_by: 'human', needs_human: false } })} showBack actions={actions} />,
    );
    expect(html).toContain('החזר לבוט');
    expect(html).not.toContain('קח שיחה');
    expect(html).not.toContain('טופל');
  });

  it('beside the conversation (a wide screen): no actions of its own, as before', () => {
    const html = render(<ContactPanel {...props} showBack={false} />);
    expect(html).not.toContain('קח שיחה');
    expect(html).not.toContain('חזרה לשיחה');
    expect(html).not.toContain('wa.me');
  });
});

describe('the top of the list on a phone', () => {
  const listProps = {
    status: 'ready' as const,
    error: '',
    hasMore: false,
    loadingMore: false,
    box: 'all' as const,
    counts: { all: 3, waiting: 1, needs_human: 1, unread: 1, human: 0, bot: 3 },
    search: '',
    selectedId: null,
    now: NOW,
    notConnected: false,
    onSearch: noop,
    onBox: noop,
    onOpen: noop,
    onLoadMore: noop,
    onRetry: noop,
    onOpenSettings: noop,
  };

  it('the search folds behind a magnifier until it is pressed', () => {
    const html = render(<ChatList {...listProps} items={[makeContact(1)]} />);
    expect(html).toContain('aria-label="חיפוש"');
    expect(html).toContain(s.searchToggle);
    expect(html).toContain(s.searchFolded);
    // The boxes: one row, with the small group labels.
    expect(html).toContain(s.boxRows);
    expect(html).toContain(s.boxGroupLabel);
  });

  it('a search already typed keeps the field out, and the magnifier turns into "סגור חיפוש"', () => {
    const html = render(<ChatList {...listProps} search="דנה" items={[makeContact(1)]} />);
    expect(html).not.toContain(s.searchFolded);
    expect(html).toContain('aria-label="סגור חיפוש"');
  });

  it('the bot answering is the ordinary state of a row; only a person answering keeps its mark', () => {
    expect(render(<ChatList {...listProps} items={[makeContact(1)]} />)).toContain(s.rowWhoBot);
    const human = render(<ChatList {...listProps} items={[makeContact(1, { chat: { handled_by: 'human' } })]} />);
    expect(human).toContain('נציג עונה');
    expect(human).not.toContain(s.rowWhoBot);
  });
});

describe('the writing box on a phone', () => {
  const contact = makeContact(12, { name: 'דנה כהן' });
  const props = {
    sending: false,
    simulated: false,
    sendingOff: false,
    onSend: async () => true,
    onSendFlow: async () => true,
    onOpenSettings: noop,
  };

  it('the two tools carry their names as labels, so they can stand as icons', () => {
    const html = render(<Composer {...props} contact={contact} />);
    expect(html).toContain('aria-label="תשובות מוכנות"');
    expect(html).toContain('aria-label="שלח תבנית"');
    expect(html).toContain('aria-label="שלח הודעה"');
    expect(html).toContain(s.toolLabel);
    expect(html).toContain(s.composerTools);
    expect(html).toContain(s.composerLine);
  });

  it('a simulated send is said above the box, where the phone keeps the hint line folded', () => {
    expect(render(<Composer {...props} contact={contact} simulated />)).toContain(s.composerSim);
    expect(render(<Composer {...props} contact={contact} />)).not.toContain(s.composerSim);
  });

  it('sending switched off: the lock in one strip, no box and no template', () => {
    const html = render(<Composer {...props} contact={contact} sendingOff />);
    expect(html).toContain(s.lockBox);
    expect(html).toContain('השליחה ללקוחות כבויה');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('שלח תבנית');
  });

  it('outside the 24 hours: the lock says why, and a template is the one way left', () => {
    const html = render(<Composer {...props} contact={makeContact(12, { chat: { can_free_text: false } })} />);
    expect(html).toContain(s.lockBox);
    expect(html).toContain('עברו 24 שעות');
    expect(html).toContain('שלח תבנית');
    expect(html).not.toContain('<textarea');
  });
});

describe('the demo box of an invented customer on a phone', () => {
  const reply = { auto: true, armed: false, inFlight: false, setAuto: noop, replyNow: noop };

  it('the customer\'s line is out — microphone, picture, the box, send — and the old bot\'s box is one press away', () => {
    const html = render(
      <DemoComposer contact={makeContact(12, { name: 'רונית לב', is_demo: true })} onSend={async () => true} reply={reply} />,
    );
    // The title is in the page for a desktop; the phone's stylesheet folds it (the header already says "דמו").
    expect(html).toContain('הדמיה · רונית לב הוא לקוח דמו');
    expect(html).toContain(s.demoTitle);
    // The customer's line, like a messaging app's: the tools, the box, send.
    expect(html).toContain(s.demoLine);
    expect(html).toContain('aria-label="הקלט הודעה קולית"');
    expect(html).toContain('aria-label="צרף תמונה"');
    expect(html).toContain('aria-label="כתוב כלקוח"');
    expect(html).toContain('aria-label="הלקוח שלח"');
    // The new bot's switch is on to begin with, and "ענה עכשיו" is at hand.
    expect(html).toContain('הבוט החדש עונה בשיחה');
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(html).toContain('ענה עכשיו');
    // "כתוב כבוט הישן": behind its arrow, folded.
    expect(html).toContain(s.demoToggle);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="כתוב כבוט הישן"');
    expect(html).toContain('הבוט הישן ענה');
  });
});
