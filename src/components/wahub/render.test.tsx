import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubMessage, WahubStatus } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread from './chats/ChatThread';
import ContactPanel from './chats/ContactPanel';
import type { ContactThread } from './hooks/useContactThread';
import LeadCard from './leads/LeadCard';
import NewLeadForm from './leads/NewLeadForm';
import s from './wahub.module.css';
import { FollowupMarks, KnownBox, KogoBox } from './shared/ContactParts';
import WahubStatusChips, { connectionLevel } from './WahubStatusChips';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-08T12:00:00+03:00');
const TODAY = '2026-10-08';
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, overrides), messages: [], has_older: false, events: [] };
}

function thread(contact: WahubContactDetail | null, messages: WahubMessage[], extra: Partial<ContactThread> = {}): ContactThread {
  return {
    contactId: contact?.id ?? 12,
    contact,
    messages,
    hasOlder: false,
    status: 'ready',
    error: '',
    loadingOlder: false,
    sending: false,
    olderLoads: 0,
    stateRef: { current: {} as never },
    putContact: noop,
    onLiveContact: noop,
    loadOlder: async () => {},
    send: async () => true,
    sendFlow: async () => true,
    refreshQuietly: async () => {},
    retry: noop,
    ...extra,
  };
}

function renderThread(contact: WahubContactDetail | null, messages: WahubMessage[], extra: Partial<ContactThread> = {}) {
  return render(
    <ChatThread
      thread={thread(contact, messages, extra)}
      now={NOW}
      visible
      simulated={false}
      sendingOff={false}
      handoverBusy={false}
      resolveBusy={false}
      showBack={false}
      showDetailsButton={false}
      onBack={noop}
      onDetails={noop}
      onTakeover={noop}
      onRelease={noop}
      onResolveNeedsHuman={noop}
      onOpenSettings={noop}
    />,
  );
}

const STATUS: WahubStatus = {
  inbound_configured: true,
  inbound_key_set_at: '2026-10-01T10:00:00+03:00',
  bot_replies_seen: true,
  ai_configured: true,
  send_configured: true,
  sending_enabled: true,
  simulate_send: false,
  last_inbound_at: '2026-10-08T11:57:00+03:00',
  contacts_total: 40,
  messages_last_24h: 120,
  inbound_url: 'https://example.test/api/v1/wahub/inbound/manychat/',
};

describe('the conversations list', () => {
  const listProps = {
    status: 'ready' as const,
    error: '',
    hasMore: false,
    loadingMore: false,
    box: 'all' as const,
    counts: { all: 3, waiting: 1, needs_human: 1, unread: 1, human: 0, bot: 3 },
    search: '',
    selectedId: 2,
    now: NOW,
    notConnected: false,
    onSearch: noop,
    onBox: noop,
    onOpen: noop,
    onLoadMore: noop,
    onRetry: noop,
    onOpenSettings: noop,
  };

  it('shows a row per conversation: name, preview with who sent it, unread, waiting and the request for a person', () => {
    const html = render(
      <ChatList
        {...listProps}
        items={[
          makeContact(1, {
            name: 'דנה כהן',
            last_message: { text: 'כמה עולה?', direction: 'in', sender: 'customer', sent_at: '' },
            chat: { unread_count: 2, waiting_since: '2026-10-08T11:48:00+03:00', needs_human: true },
          }),
          makeContact(2, {
            name: '',
            last_message: { text: 'שלום, איך אפשר לעזור?', direction: 'out', sender: 'bot', sent_at: '' },
          }),
          makeContact(3, {
            name: 'יואב',
            last_message: { text: 'חוזרים אלייך', direction: 'out', sender: 'office', sent_at: '' },
            chat: { handled_by: 'human' },
          }),
        ]}
      />,
    );
    expect(html).toContain('דנה כהן');
    expect(html).toContain('כמה עולה?');
    expect(html).toContain('2 הודעות שלא נקראו');
    expect(html).toContain('מחכה 12 דק׳');
    expect(html).toContain('מבקש נציג');
    // No name: the phone stands in for it.
    expect(html).toContain('050-0000002');
    expect(html).toContain('בוט: שלום, איך אפשר לעזור?');
    expect(html).toContain('משרד: חוזרים אלייך');
    expect(html).toContain('בטיפול נציג');
    // The open conversation is marked.
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it('shows the five boxes with their counts', () => {
    const html = render(<ChatList {...listProps} items={[makeContact(1)]} />);
    for (const label of ['הכול', 'מחכים לתשובה', 'מבקשים נציג', 'לא נקראו', 'בטיפול נציג']) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('an empty list says the WhatsApp is not connected yet, and offers the settings', () => {
    const html = render(<ChatList {...listProps} items={[]} notConnected />);
    expect(html).toContain('הוואטסאפ עוד לא מחובר');
    expect(html).toContain('להגדרות החיבור');
  });

  it('an empty list under a search says nothing matches', () => {
    const html = render(<ChatList {...listProps} items={[]} search="דנה" notConnected />);
    expect(html).toContain('אין שיחות שמתאימות');
    expect(html).not.toContain('הוואטסאפ עוד לא מחובר');
  });

  it('a failed load is said in words, with a way to try again', () => {
    const html = render(<ChatList {...listProps} items={[]} status="error" error="אין הרשאה" />);
    expect(html).toContain('לא הצלחנו לטעון את השיחות');
    expect(html).toContain('אין הרשאה');
    expect(html).toContain('נסו שוב');
  });

  it('offers more when the server has more', () => {
    const html = render(<ChatList {...listProps} items={[makeContact(1)]} hasMore />);
    expect(html).toContain('טען עוד שיחות');
  });
});

describe('an open conversation', () => {
  const messages = [
    makeMessage(1, { text: 'היי, יש ניסיון?', sent_at: '2026-10-07T18:00:00+03:00' }),
    makeMessage(2, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'בטח!', status: 'sent', sent_at: '2026-10-07T18:01:00+03:00' }),
    makeMessage(3, {
      direction: 'out',
      sender: 'office',
      sender_label: 'משרד',
      sender_name: 'דור',
      text: 'אני כאן',
      status: 'simulated',
      sent_at: '2026-10-08T09:00:00+03:00',
    }),
    makeMessage(4, {
      direction: 'out',
      sender: 'office',
      sender_label: 'משרד',
      text: 'לא עבר',
      status: 'failed',
      error: 'המספר לא נמצא ב-ManyChat',
      sent_at: '2026-10-08T09:05:00+03:00',
    }),
  ];

  it('shows the messages by day, who sent each, the simulation mark and why a send failed', () => {
    const html = renderThread(detail({ name: 'דנה כהן' }), messages);
    expect(html).toContain('אתמול');
    expect(html).toContain('היום');
    expect(html).toContain('היי, יש ניסיון?');
    expect(html).toContain('בוט');
    expect(html).toContain('משרד · דור');
    expect(html).toContain('הדמיה');
    expect(html).toContain('לא נשלח – המספר לא נמצא ב-ManyChat');
    expect(html).toContain('18:00');
  });

  it('the bot answers: the header offers to take the conversation', () => {
    const html = renderThread(detail(), messages);
    expect(html).toContain('הבוט עונה');
    expect(html).toContain('קח שיחה');
    expect(html).not.toContain('החזר לבוט');
  });

  it('a person answers: the header offers to hand it back to the bot', () => {
    const html = renderThread(detail({ chat: { handled_by: 'human', handled_by_label: 'בטיפול נציג' } }), messages);
    expect(html).toContain('בטיפול שלך');
    expect(html).toContain('החזר לבוט');
    expect(html).not.toContain('קח שיחה');
  });

  it('a request for a person is a strip with the reason and a "handled" button', () => {
    const html = renderThread(
      detail({ chat: { needs_human: true, needs_human_reason: 'ביקש נציג', needs_human_at: '2026-10-08T11:50:00+03:00' } }),
      messages,
    );
    expect(html).toContain('מבקש נציג');
    expect(html).toContain('ביקש נציג');
    expect(html).toContain('טופל');
  });

  it('the phone is text that can be selected, beside a WhatsApp link', () => {
    const html = renderThread(detail({ name: 'דנה' }), messages);
    expect(html).toContain('select-all');
    expect(html).toContain('050-0000012');
    expect(html).toContain('https://wa.me/972500000012');
  });

  it('inside the 24 hours the writing box is open, with ready replies and templates', () => {
    const html = renderThread(detail(), messages);
    expect(html).toContain('<textarea');
    expect(html).toContain('תשובות מוכנות');
    expect(html).toContain('שלח תבנית');
    expect(html).not.toContain('עברו 24 שעות');
  });

  it('outside the 24 hours the box is locked, says why, and offers a template only', () => {
    const html = renderThread(detail({ chat: { can_free_text: false } }), messages);
    expect(html).toContain('עברו 24 שעות מההודעה האחרונה של הלקוח. אפשר לשלוח רק תבנית.');
    expect(html).toContain('שלח תבנית');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('תשובות מוכנות');
  });

  it('a lead who never wrote is not told that 24 hours passed', () => {
    const html = renderThread(detail({ last_inbound_at: null, chat: { can_free_text: false } }), []);
    expect(html).toContain('הלקוח עוד לא כתב לנו. אפשר לשלוח רק תבנית.');
    expect(html).not.toContain('עברו 24 שעות');
  });

  it('offers earlier messages only when there are some', () => {
    expect(renderThread(detail(), messages, { hasOlder: true })).toContain('הודעות קודמות');
    expect(renderThread(detail(), messages)).not.toContain('הודעות קודמות');
  });

  it('a message on its way is shown as being sent', () => {
    const typed = makeMessage(-5, { direction: 'out', sender: 'office', sender_label: 'משרד', text: 'בדרך', status: 'sent', local_state: 'sending' });
    expect(renderThread(detail(), [...messages, typed], { sending: true })).toContain('נשלח…');
  });

  it('a conversation that could not be loaded says so', () => {
    const html = renderThread(null, [], { status: 'error', error: 'לא נמצא' });
    expect(html).toContain('לא הצלחנו לטעון את השיחה');
    expect(html).toContain('לא נמצא');
  });
});

describe('the contact panel', () => {
  const contact: WahubContactDetail = {
    ...detail({
      name: 'דנה כהן',
      known: {
        topic: 'trial',
        topic_label: 'שיעור ניסיון',
        branch_name: 'פסגות אפק',
        city: 'ראש העין',
        child_age: '5',
        interest: 'warm',
        interest_label: 'מתעניין',
        callback_on: '2026-10-08',
        flags: ['price'],
        flag_labels: ['המחיר עצר אותו'],
        summary: 'שאלה על קפוארה לבן 5.',
        analyzed_at: '2026-10-08T10:00:00+03:00',
        analysis_source: 'ai',
      },
      kogo: {
        outcome: 'trial_only',
        outcome_label: 'עשה ניסיון ולא נרשם',
        detail: 'ניסיון ב-2.10, הגיע',
        child_ids: [31],
        children: [{ id: 31, name: 'נועם כהן', status: 'trial_completed', status_label: 'ביצע ניסיון' }],
      },
      followup: { status: 'later', status_label: 'בזמן אחר', due: '2026-10-24', note: 'לחזור אחרי החגים', by_name: 'דור', at: '2026-10-06T14:05:00+03:00' },
      tags: [{ id: 1, name: 'חם', color: '#dc2626' }],
    }),
    events: [{ id: 5, kind: 'followup_changed', kind_label: 'סימון מעקב', text: 'בזמן אחר', actor_name: 'דור', created_at: '2026-10-06T14:05:00+03:00' }],
  };

  const html = render(
    <ContactPanel
      contact={contact}
      now={NOW}
      today={TODAY}
      allTags={[{ id: 1, name: 'חם', color: '#dc2626' }, { id: 2, name: 'קפוארה', color: '#0d9488' }]}
      analyzing={false}
      rechecking={false}
      showBack={false}
      onBack={noop}
      onFollowup={noop}
      onTags={noop}
      onRename={noop}
      onRecheck={noop}
      onAnalyze={noop}
    />,
  );

  it('keeps what the system knows in a box of its own', () => {
    expect(html).toContain('מה ידוע');
    expect(html).toContain('שאלה על קפוארה לבן 5.');
    expect(html).toContain('שיעור ניסיון');
    expect(html).toContain('פסגות אפק · ראש העין');
    expect(html).toContain('מתעניין');
    expect(html).toContain('המחיר עצר אותו');
    expect(html).toContain('הגיע הזמן לחזור');
    expect(html).toContain('סכם מחדש');
  });

  it('shows what was found in Kogo, with a link to each child and a re-check', () => {
    expect(html).toContain('במערכת');
    expect(html).toContain('עשה ניסיון ולא נרשם');
    expect(html).toContain('ניסיון ב-2.10, הגיע');
    expect(html).toContain('נועם כהן');
    expect(html).toContain('href="/customers?child=31"');
    expect(html).toContain('בדוק שוב');
  });

  it('shows the six marks, the one that is set, and its day', () => {
    for (const label of ['לחזור אליו', 'לא ענה', 'ענה', 'בזמן אחר', 'נרשם', 'לא רלוונטי']) {
      expect(html).toContain(label);
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('value="2026-10-24"');
    expect(html).toContain('לחזור ב-24.10');
  });

  it('has the note, the tags and the folded history', () => {
    expect(html).toContain('מידע חדש');
    expect(html).toContain('לחזור אחרי החגים');
    expect(html).toContain('תגיות');
    expect(html).toContain('קפוארה');
    expect(html).toContain('היסטוריה');
    // Folded: the title is there, the entries are a press away.
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('the parts a lead card and the panel share', () => {
  it('"מה ידוע" says when he asked to be called back, while the day is ahead', () => {
    const html = render(<KnownBox contact={makeContact(1, { known: { callback_on: '2026-10-24' } })} today={TODAY} now={NOW} />);
    expect(html).toContain('ביקש שנחזור ב-24.10');
    expect(html).not.toContain('הגיע הזמן לחזור');
  });

  it('"מה ידוע" with nothing known says so, and never offers a mark', () => {
    const html = render(<KnownBox contact={makeContact(1)} today={TODAY} now={NOW} />);
    expect(html).toContain('עוד אין מידע');
    expect(html).not.toContain('aria-pressed');
  });

  it('a contact not checked yet says so', () => {
    expect(render(<KogoBox contact={makeContact(1)} now={NOW} />)).toContain('עוד לא נבדק במערכת');
  });

  it('with no mark set, no button is pressed and no date is asked for', () => {
    const html = render(<FollowupMarks contact={makeContact(1)} today={TODAY} now={NOW} onChange={noop} />);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain('type="date"');
  });

  it('"בזמן אחר" with no day asks for one', () => {
    const html = render(
      <FollowupMarks contact={makeContact(1, { followup: { status: 'later' } })} today={TODAY} now={NOW} onChange={noop} />,
    );
    expect(html).toContain('type="date"');
    expect(html).toContain('לא נקבע תאריך');
  });
});

describe('a lead card', () => {
  const lead = makeContact(7, {
    name: 'מיכל לוי',
    first_inbound_at: '2026-10-02T10:00:00+03:00',
    last_inbound_at: '2026-10-07T16:30:00+03:00',
    last_message: { text: 'תודה, אחשוב על זה', direction: 'in', sender: 'customer', sent_at: '' },
    known: { topic: 'info', topic_label: 'בירור פרטים', branch_name: 'כפר סבא', summary: 'מתלבטת בין שני חוגים.' },
    kogo: { outcome: 'not_found', outcome_label: 'לא נמצא במערכת' },
  });
  const html = render(
    <LeadCard contact={lead} today={TODAY} now={NOW} allTags={[]} onFollowup={noop} onTags={noop} onOpenChat={noop} />,
  );

  it('shows who, when, the small labels, the last message and what is known', () => {
    expect(html).toContain('מיכל לוי');
    expect(html).toContain('050-0000007');
    expect(html).toContain('פנה לראשונה 2.10');
    expect(html).toContain('לאחרונה 7.10 16:30');
    expect(html).toContain('בירור פרטים');
    expect(html).toContain('כפר סבא');
    expect(html).toContain('לא נמצא במערכת');
    expect(html).toContain('תודה, אחשוב על זה');
    expect(html).toContain('מה ידוע');
    expect(html).toContain('מתלבטת בין שני חוגים.');
  });

  it('has the six marks, the note, the tags and a way into the conversation', () => {
    for (const label of ['לחזור אליו', 'לא ענה', 'ענה', 'בזמן אחר', 'נרשם', 'לא רלוונטי']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('מידע חדש');
    expect(html).toContain('תגית חדשה');
    expect(html).toContain('פתח שיחה');
  });

  it('no mark is filled in for him', () => {
    expect(html).not.toContain('aria-pressed="true"');
  });
});

describe('the two status chips', () => {
  it('a working connection reads as fine', () => {
    expect(connectionLevel(STATUS)).toEqual({ level: 'ok', word: 'תקין' });
    const html = render(<WahubStatusChips status={STATUS} failed={false} onOpenSettings={noop} />);
    expect(html).toContain('חיבור הוואטסאפ');
    expect(html).toContain('תקין');
    expect(html).toContain('סיכום אוטומטי');
    expect(html).toContain('פעיל');
    // Titles first: the details are a press away.
    expect(html).not.toContain('תשובות הבוט');
  });

  it('says when nothing is connected', () => {
    expect(connectionLevel({ ...STATUS, inbound_configured: false, last_inbound_at: null })).toEqual({
      level: 'off',
      word: 'לא מחובר',
    });
  });

  it('is only partly fine without the bot\'s replies, without sending, or in simulation', () => {
    expect(connectionLevel({ ...STATUS, bot_replies_seen: false }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, send_configured: false }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, simulate_send: true }).word).toBe('חלקי');
    expect(connectionLevel({ ...STATUS, last_inbound_at: null }).word).toBe('ממתין להודעה ראשונה');
  });

  it('says so when the status could not be read', () => {
    const html = render(<WahubStatusChips status={undefined} failed onOpenSettings={noop} />);
    expect(html).toContain('לא ידוע');
  });

  it('the summary chip reads off without a key', () => {
    const html = render(<WahubStatusChips status={{ ...STATUS, ai_configured: false }} failed={false} onOpenSettings={noop} />);
    expect(html).toContain('כבוי');
  });
});

describe('the section\'s own look', () => {
  function bubbleOf(html: string, text: string): string {
    // The class list of the bubble that holds this text.
    const at = html.indexOf(text);
    const open = html.lastIndexOf('<div class="', html.lastIndexOf(`class="${s.bubble} `, at));
    return html.slice(open, html.indexOf('>', open));
  }

  it('each sender has its own bubble: customer, bot, office, a template, and a failed send', () => {
    const html = renderThread(detail(), [
      makeMessage(1, { text: 'מהלקוח' }),
      makeMessage(2, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'מהבוט', status: 'sent' }),
      makeMessage(3, { direction: 'out', sender: 'office', sender_label: 'משרד', text: 'מהמשרד', status: 'sent' }),
      makeMessage(4, { direction: 'out', sender: 'office', message_type: 'template', text: 'תבנית ברוכים הבאים', status: 'sent' }),
      makeMessage(5, { direction: 'out', sender: 'system', sender_label: 'מערכת', text: 'ממערכת', status: 'sent' }),
      makeMessage(6, { direction: 'out', sender: 'office', text: 'נכשלה', status: 'failed', error: 'שגיאה' }),
    ]);
    expect(bubbleOf(html, 'מהלקוח')).toContain(s.bCustomer);
    expect(bubbleOf(html, 'מהבוט')).toContain(s.bBot);
    expect(bubbleOf(html, 'מהמשרד')).toContain(s.bOffice);
    expect(bubbleOf(html, 'תבנית ברוכים הבאים')).toContain(s.bSystem);
    expect(bubbleOf(html, 'ממערכת')).toContain(s.bSystem);
    expect(bubbleOf(html, 'נכשלה')).toContain(s.bFailed);
  });

  it('the open conversation is the navy row of the list', () => {
    const html = render(
      <ChatList
        items={[makeContact(1), makeContact(2)]}
        status="ready"
        error=""
        hasMore={false}
        loadingMore={false}
        box="all"
        counts={null}
        search=""
        selectedId={2}
        now={NOW}
        notConnected={false}
        onSearch={noop}
        onBox={noop}
        onOpen={noop}
        onLoadMore={noop}
        onRetry={noop}
        onOpenSettings={noop}
      />,
    );
    const mark = html.indexOf('aria-current="true"');
    const selected = html.slice(html.lastIndexOf('<button', mark), html.indexOf('>', mark));
    expect(selected).toContain(`${s.listRow} ${s.on}`);
  });

  it('a new lead is added in a card inside the page, not in a pop-up', () => {
    const html = render(<NewLeadForm onClose={noop} onCreated={noop} onOpenExisting={noop} />);
    expect(html).toContain(s.card);
    expect(html).toContain(s.form);
    expect(html).toContain('טלפון');
    expect(html).toContain('הוסף ליד');
    expect(html).not.toContain('role="dialog"');
  });
});
