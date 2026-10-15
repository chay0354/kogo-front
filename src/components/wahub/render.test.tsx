import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubMessage, WahubStatus } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread from './chats/ChatThread';
import ContactPanel, { type CardFold } from './chats/ContactPanel';
import type { ContactThread } from './hooks/useContactThread';
import LeadCard from './leads/LeadCard';
import NewLeadForm from './leads/NewLeadForm';
import s from './wahub.module.css';
import { FollowupMarks, KnownBox, KogoBox } from './shared/ContactParts';
import SettingsTab from './settings/SettingsTab';
import SystemStatusCard from './settings/SystemStatusCard';
import WahubHead from './WahubHead';

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
    putMessages: noop,
    settleMessage: noop,
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
    // The second group's names say what they mean (15.10.2026): "לא נענו" and "לא נפתחו".
    for (const label of ['הכול', 'לא נענו', 'מבקשים נציג', 'לא נפתחו', 'בטיפול נציג', 'מצב השיחה']) {
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
    expect(html).toContain('נסה שוב');
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

  const panel = (defaultOpen?: CardFold[]) =>
    render(
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
        defaultOpen={defaultOpen}
      />,
    );
  // As it opens: every folded section shut.
  const html = panel();

  it('says what is known in short at the top, and keeps the whole of it a press away', () => {
    // On a server with no lead state yet, "מה עכשיו" is the summary and the day he asked to be called back.
    expect(html).toContain('מה ידוע');
    expect(html).toContain('שאלה על קפוארה לבן 5.');
    expect(html).toContain('הגיע הזמן לחזור');
    // The rest — the subject, the branch, the flags, "סכם מחדש" — is in the folded section.
    expect(html).not.toContain('פסגות אפק · ראש העין');
    expect(html).not.toContain('המחיר עצר אותו');
    expect(html).not.toContain('סכם מחדש');
    const open = panel(['known']);
    expect(open).toContain('שיעור ניסיון');
    expect(open).toContain('פסגות אפק · ראש העין');
    expect(open).toContain('מתעניין');
    expect(open).toContain('המחיר עצר אותו');
    expect(open).toContain('סכם מחדש');
  });

  it('shows what was found in Kogo — the answer, each child with its own link — and a re-check', () => {
    const kids = html.slice(html.indexOf('aria-label="ילדים וחוגים"'), html.indexOf('aria-label="מה ידוע"'));
    // No lead state: "מה עכשיו" says nothing of Kogo, so the answer and its sentence are said here.
    expect(kids).toContain('עשה ניסיון ולא נרשם');
    expect(kids).toContain('ניסיון ב-2.10, הגיע');
    expect(kids).toContain('נועם כהן');
    expect(kids).toContain('ביצע ניסיון');
    expect(kids).toContain('href="/customers?child=31"');
    expect(kids).toContain('aria-label="לכרטיס הלקוח של נועם כהן"');
    expect(kids).toContain('בדוק שוב');
  });

  it('keeps the six marks a press away: the title says the one that is set and its day', () => {
    expect(html).toMatch(/מעקב<\/span><span[^>]*>בזמן אחר · לחזור ב-24\.10<\/span>/);
    expect(html).not.toContain('aria-pressed="true"');
    const open = panel(['followup']);
    for (const label of ['לחזור אליו', 'לא ענה', 'ענה', 'בזמן אחר', 'נרשם', 'לא רלוונטי']) {
      expect(open).toContain(label);
    }
    expect(open.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(open).toContain('value="2026-10-24"');
    expect(open).toContain('לחזור ב-24.10');
  });

  it('has the note, the tags and the history as titles, each open on a press', () => {
    // Folded: the title and a number, or the first words of the note — the content itself is a press away.
    expect(html).toContain('הערות');
    expect(html).toContain('לחזור אחרי החגים');
    expect(html).not.toContain('<textarea');
    expect(html).toMatch(/תגיות<span[^>]*>\(1\)<\/span>/);
    expect(html).not.toContain('הוסף תגית');
    expect(html).toMatch(/היסטוריה<span[^>]*>\(1\)<\/span>/);
    expect(html).not.toContain('סימון מעקב</span>');
    expect(html).not.toContain('aria-expanded="true"');

    const open = panel(['notes', 'tags', 'history']);
    expect(open).toContain('<textarea');
    expect(open).toContain('מידע חדש');
    expect(open).toContain('קפוארה');
    expect(open).toContain('הוסף תגית');
    // The log's own entry: what happened and who did it.
    expect(open).toContain('דור · ');
    expect(open.match(/aria-expanded="true"/g)).toHaveLength(3);
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

// docs/WAHUB-CONTRACT-POLISH-1.md (ג): the two status chips left the title row; what they said is a card of the settings.
describe('the title row', () => {
  const head = (over: Partial<Parameters<typeof WahubHead>[0]> = {}) =>
    render(<WahubHead active="chats" live needsHuman={0} onSelect={noop} {...over} />);

  it('holds the title, "חי" and the five tabs', () => {
    const html = head();
    expect(html).toContain('<h1');
    expect(html).toContain('וואטסאפ ולידים');
    expect(html).toContain('>חי<');
    expect([...html.matchAll(/role="tab"[^>]*>.*?<span>([^<]+)<\/span>/g)].map((match) => match[1])).toEqual([
      'שיחות',
      'היום',
      'לידים',
      'הבוט',
      'הגדרות',
    ]);
  });

  it('and nothing else: no status chip, no bubble, no way to the connection\'s settings', () => {
    const html = head();
    for (const gone of ['חיבור הוואטסאפ', 'סיכום אוטומטי', 'להגדרות החיבור', 'תקין', 'חלקי', 'aria-expanded']) {
      expect(html).not.toContain(gone);
    }
    // The only buttons of the row are the five tabs.
    expect((html.match(/<button/g) ?? []).length).toBe(5);
  });

  it('"חי" shows only while the screen is updating by itself', () => {
    expect(head({ live: false })).not.toContain('>חי<');
  });

  it('the red mark on "שיחות" is as it was: only who asks for a person', () => {
    expect(head({ needsHuman: 3 })).toContain('aria-label="3 מבקשים נציג"');
    expect(head({ needsHuman: 0 })).not.toContain('מבקשים נציג');
  });
});

describe('"מצב המערכת" in the settings', () => {
  const FULL: WahubStatus = { ...STATUS, shadow_configured: true, shadow_model: 'claude-sonnet-4-5', live_test_contacts: 0 };

  it('says what the two chips said, and more: a title and a word a row', () => {
    const html = render(<SystemStatusCard status={FULL} />);
    expect(html).toContain('מצב המערכת');
    const rows = [...html.matchAll(new RegExp(`<span class="${s.statusTitle}">([^<]+)</span>`, 'g'))].map((match) => match[1]);
    expect(rows).toEqual(['חיבור הוואטסאפ', 'סיכום אוטומטי', 'הבוט בצל', 'שליחה ללקוחות', 'בדיקה חיה']);
    for (const word of ['תקין', 'פעיל', 'claude-sonnet-4-5', 'פעילה', 'כבויה']) expect(html).toContain(`>${word}<`);
  });

  it('titles first: every row is folded, and its details are a press away', () => {
    const html = render(<SystemStatusCard status={FULL} />);
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(5);
    expect(html).not.toContain('aria-expanded="true"');
    for (const detail of ['הודעות נכנסות', 'תשובות הבוט', 'מה ידוע', 'בסך הכול', 'ולא שולח אותה']) expect(html).not.toContain(detail);
  });

  it('a pressed row opens under its title: the connection says what comes in, and the totals', () => {
    const html = render(<SystemStatusCard status={FULL} defaultOpen={['connection']} />);
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('הודעות נכנסות');
    expect(html).toContain('תשובות הבוט');
    expect(html).toContain('40 אנשי קשר');
    expect(html).toContain('120 הודעות ב-24 השעות האחרונות');
    // Nothing is missing, so nothing is listed as missing.
    expect(html).not.toContain('חסר:');
  });

  it('a partial connection says so in its word, and what it is short of in its details', () => {
    const partial = { ...FULL, bot_replies_seen: false, simulate_send: true };
    const folded = render(<SystemStatusCard status={partial} />);
    expect(folded).toContain('>חלקי<');
    expect(folded).toContain(s.pWarn);
    const html = render(<SystemStatusCard status={partial} defaultOpen={['connection']} />);
    expect(html).toContain('חסר:');
    expect(html).toContain('העתק של תשובות הבוט · שליחה אמיתית ללקוחות (כרגע הדמיה)');
  });

  it('nothing connected reads as such', () => {
    const html = render(<SystemStatusCard status={{ ...FULL, inbound_configured: false, last_inbound_at: null }} defaultOpen={['connection']} />);
    expect(html).toContain('>לא מחובר<');
    expect(html).toContain(s.pBad);
    expect(html).toContain('מפתח חיבור ל-ManyChat');
  });

  it('the automatic summary: on, or off without its key — with what fills "מה ידוע" meanwhile', () => {
    const on = render(<SystemStatusCard status={FULL} defaultOpen={['summary']} />);
    expect(on).toContain('המערכת מסכמת אותה');
    const off = render(<SystemStatusCard status={{ ...FULL, ai_configured: false }} defaultOpen={['summary']} />);
    expect(off).toContain('>כבוי<');
    expect(off).toContain('חסר מפתח לשירות הסיכום');
    expect(off).toContain('לפי מילים בשיחה');
  });

  it('the shadow bot: its model, or "דמה" without a key', () => {
    expect(render(<SystemStatusCard status={FULL} defaultOpen={['shadow']} />)).toContain('ולא שולח אותה');
    const stub = render(<SystemStatusCard status={{ ...FULL, shadow_configured: false, shadow_model: 'stub' }} defaultOpen={['shadow']} />);
    expect(stub).toContain('>דמה<');
    expect(stub).toContain('חסר מפתח למודל');
  });

  it('sending to customers: simulated, off, or on', () => {
    const simulated = render(<SystemStatusCard status={{ ...FULL, simulate_send: true }} defaultOpen={['sending']} />);
    expect(simulated).toContain('>הדמיה<');
    expect(simulated).toContain('הודעות נרשמות ולא נשלחות');
    const off = render(<SystemStatusCard status={{ ...FULL, sending_enabled: false }} defaultOpen={['sending']} />);
    expect(off).toContain('שום הודעה לא יוצאת ללקוחות');
    expect(off).toContain('WAHUB_SENDING_ENABLED');
    expect(render(<SystemStatusCard status={FULL} defaultOpen={['sending']} />)).toContain('דרך ManyChat');
  });

  it('the live test: how many people, and where the list is', () => {
    const html = render(<SystemStatusCard status={{ ...FULL, live_test_contacts: 2 }} defaultOpen={['liveTest']} />);
    expect(html).toContain('>2 אנשי קשר<');
    expect(html).toContain('עונה באמת');
  });

  it('an older server (no shadow bot, no live test): three rows, nothing guessed', () => {
    const html = render(<SystemStatusCard status={STATUS} />);
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('הבוט בצל');
    expect(html).not.toContain('בדיקה חיה');
  });

  it('is the first card of the settings, above the ManyChat connection — and each thing is said once', () => {
    const html = render(<SettingsTab status={FULL} statusLoading={false} statusError={false} onRetryStatus={noop} onOpenChat={noop} />);
    expect(html.indexOf('מצב המערכת')).toBeGreaterThan(-1);
    expect(html.indexOf('מצב המערכת')).toBeLessThan(html.indexOf('החיבור ל-ManyChat'));
    expect(html.indexOf('מצב המערכת')).toBeLessThan(html.indexOf('אישור אוטומטי של תיקונים'));
    // The ManyChat card keeps the address and the key; how things stand is said in "מצב המערכת" alone.
    expect(html).toContain('העתק כתובת');
    expect(html).toContain('צור מפתח חדש');
    expect((html.match(/סיכום אוטומטי/g) ?? []).length).toBe(1);
    expect((html.match(/חיבור הוואטסאפ/g) ?? []).length).toBe(1);
  });

  it('while the status is not in hand the settings say so, and show no card of a state they do not know', () => {
    const failed = render(<SettingsTab status={undefined} statusLoading={false} statusError onRetryStatus={noop} onOpenChat={noop} />);
    expect(failed).toContain('לא הצלחנו לטעון את מצב החיבור');
    expect(failed).not.toContain('מצב המערכת');
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
