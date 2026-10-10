import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { groupKnowledgeByKind } from '@/lib/wahub/bot';
import { makeContact, makeKnowledgeItem, makeMessage, makeProposal, makeShadowReply } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubMessage, WahubShadowReply } from '@/types/wahub';
import ChatThread from '../chats/ChatThread';
import ContactPanel from '../chats/ContactPanel';
import ContactStatusBlock from '../chats/ContactStatusBlock';
import ShadowRow from '../chats/ShadowRow';
import { botKeys } from '../hooks/useBotQueries';
import type { ContactThread } from '../hooks/useContactThread';
import s from '../wahub.module.css';
import BotTab from './BotTab';
import { NowBox } from './hours/HoursTab';
import AddWizard from './knowledge/AddWizard';
import { FromKogoBody } from './knowledge/FromKogoBlock';
import KnowledgeCard from './knowledge/KnowledgeCard';
import KnowledgeList from './knowledge/KnowledgeList';
import ProposalCard from './review/ProposalCard';
import ProposalsFab from './review/ProposalsFab';
import ShadowReplyCard from './shadow/ShadowReplyCard';
import TryTab from './try/TryTab';
import DemoTab from './demo/DemoTab';
import ChatList from '../chats/ChatList';
import LeadCard from '../leads/LeadCard';
import NewLeadForm from '../leads/NewLeadForm';
import { officeOpenNow, DEFAULT_WEEKLY } from '@/lib/wahub/bot';

(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-08T12:00:00+03:00');
const TODAY = '2026-10-08';
const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
}

function render(node: React.ReactElement, queryClient = client()): string {
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

const fact = makeKnowledgeItem(1, {
  title: 'אפשר להישאר עם הילד בשיעור?',
  body: 'לא. אפשר להיכנס קצת, והמדריך אומר מתי ללכת.',
  example_good: 'אפשר להיכנס לכמה דקות, והמדריך יגיד מתי לצאת',
  example_bad: 'בטח, תישארו כמה שתרצו',
  source_note: 'עדכונים דינמיים, שורה 791',
  version: 3,
});
const phrasing = makeKnowledgeItem(2, {
  kind: 'phrasing',
  kind_label: 'נוסח',
  title: 'הודעה קולית',
  key: 'voice_note',
  body: 'לא ניתן לשמוע הודעות קוליות, אפשר לכתוב?',
  when_to_say: 'proactive',
  when_to_say_label: 'מיוזמה',
});
const expired = makeKnowledgeItem(3, { title: 'רישום מוקדם', valid_until: '2026-08-31', is_active: false, scope: { level: 'branch', id: 'b1', label: 'מינץ' } });

describe('the knowledge list', () => {
  const groups = groupKnowledgeByKind([fact, phrasing, expired]).filter((group) => group.items.length > 0);
  const html = render(
    <KnowledgeList groups={groups} openId={null} today={TODAY} now={NOW} onOpen={noop} onAdd={noop} renderOpen={() => <p>פתוח</p>} />,
  );

  it('groups by kind with a heading, a count and an "add" per group', () => {
    expect(html).toContain('עובדות');
    expect(html).toContain('נוסחים');
    expect(html).toContain('(2)');
    expect((html.match(/>הוסף</g) ?? []).length).toBe(2);
  });

  it('a row is the title, with pills for scope, "internal", validity and inactive — the body a press away', () => {
    expect(html).toContain('אפשר להישאר עם הילד בשיעור?');
    expect(html).toContain('מינץ');
    expect(html).toContain('לא פעיל');
    expect(html).toContain('פג תוקף ב-31.8');
    expect(html).toContain('מיוזמה');
    expect(html).not.toContain('פתוח</p>');
    expect(html).not.toContain('aria-expanded="true"');
  });

  it('the open row shows what the screen puts under it', () => {
    const open = render(
      <KnowledgeList groups={groups} openId={1} today={TODAY} now={NOW} onOpen={noop} onAdd={noop} renderOpen={(item) => <p>פתוח: {item.title}</p>} />,
    );
    expect(open).toContain('פתוח: אפשר להישאר עם הילד בשיעור?');
    expect(open.match(/aria-expanded="true"/g)).toHaveLength(1);
  });
});

describe('an open knowledge item', () => {
  it('shows the body, the fields, the two examples, edit and switch-off, and a folded history', () => {
    const html = render(<KnowledgeCard item={fact} today={TODAY} now={NOW} busy={false} onEdit={noop} onToggleActive={noop} onRestore={noop} />);
    expect(html).toContain('לא. אפשר להיכנס קצת');
    expect(html).toContain('אפשר להיכנס לכמה דקות');
    expect(html).toContain('בטח, תישארו כמה שתרצו');
    expect(html).toContain('רק אם שואלים');
    expect(html).toContain('כל העסק');
    expect(html).toContain('עדכונים דינמיים, שורה 791');
    expect(html).toContain('ערוך');
    expect(html).toContain('השבת');
    expect(html).toContain('היסטוריה');
    expect(html).toContain('3 גרסאות');
    expect(html).toContain('aria-expanded="false"');
  });

  it('a phrasing shows its key; an inactive item offers to switch it back on', () => {
    expect(render(<KnowledgeCard item={phrasing} today={TODAY} now={NOW} busy={false} onEdit={noop} onToggleActive={noop} onRestore={noop} />)).toContain('voice_note');
    expect(render(<KnowledgeCard item={expired} today={TODAY} now={NOW} busy={false} onEdit={noop} onToggleActive={noop} onRestore={noop} />)).toContain('הפעל מחדש');
  });
});

describe('"איפה זה שייך"', () => {
  it('opens on the first question with its five answers, and nothing else yet', () => {
    const html = render(<AddWizard onPick={noop} onClose={noop} onShowFromKogo={noop} />);
    expect(html).toContain('איפה זה שייך?');
    expect(html).toContain('מה זה?');
    for (const label of ['איך הבוט מתנהג', 'איך הבוט כותב', 'משפט שנאמר מילה במילה', 'שיחה עם כמה שלבים', 'מידע על העסק']) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('על מי זה חל?');
    expect(html).not.toContain('זה כבר ב-Kogo');
  });
});

describe('what comes from Kogo', () => {
  it('lists the branches with what is missing on each, and a link to its card', () => {
    const html = render(
      <FromKogoBody
        data={{
          branches: [
            { id: 'b1', name: 'פסגות אפק', city: 'ראש העין', is_external: false, address: 'קרל וגרטי קורי 8', phone: '', directions: '', missing: ['phone', 'directions'] },
            { id: 'b2', name: 'מקפת', city: 'פתח תקווה', is_external: true, address: '', phone: '', directions: '', missing: [] },
          ],
          course_types: [{ id: 't1', name: 'קפוארה', trial_bring_note: '', description: 'אמנות לחימה ברזילאית', missing: ['trial_bring_note'] }],
          pricing_summary: {
            courses: [
              { id: 'c1', name: 'קפוארה 5-6', branch: 'פסגות אפק', course_type: 'קפוארה', price: null, trial_is_paid: true, trial_price: '30', missing: ['price'] },
              { id: 'c2', name: 'מחול', branch: 'דמרי סנטר', course_type: 'מחול', price: '260', trial_is_paid: false, trial_price: null, missing: [] },
            ],
            courses_total: 2,
            courses_without_price: 1,
            paid_trials: 1,
          },
          registration_fee: 120,
          discounts: [
            { id: 'd1', name: 'הנחת אח', type: 'sibling', type_label: 'אח שני', value: '0', start_date: null, end_date: null, is_built_in: true, is_active: true, configured: false },
          ],
          blocked_dates: [{ date: '2026-10-20', reason: 'חג', is_past: false }],
        }}
      />,
    );
    expect(html).toContain('פסגות אפק');
    expect(html).toContain('קרל וגרטי קורי 8');
    expect(html).toContain('חסר: טלפון');
    expect(html).toContain('חסר: הוראות הגעה');
    expect(html).toContain('href="/branches/b1"');
    expect(html).toContain('חיצוני');
    expect(html).toContain('קפוארה');
    expect(html).toContain('חסר: מה להביא');
    expect(html).toContain('₪120');
    expect(html).toContain('חסר מחיר ב-1');
    expect(html).toContain('1 עם ניסיון בתשלום');
    expect(html).toContain('הנחת אח');
    expect(html).toContain('לא הוגדרה (0)');
    expect(html).toContain('2026-10-20');
    // The course list itself is a press away.
    expect(html).toContain('הצג את כל החוגים');
    expect(html).not.toContain('קפוארה 5-6');
  });
});

describe('open right now', () => {
  it('says open with the hours on screen, or closed with the message the customer would get', () => {
    const open = officeOpenNow(DEFAULT_WEEKLY, [], new Date('2026-10-07T14:00:00+03:00'), 'סגור עכשיו');
    expect(render(<NowBox server={undefined} local={open} serverFailed={false} />)).toContain('פתוח');
    const closed = officeOpenNow(DEFAULT_WEEKLY, [], new Date('2026-10-09T14:00:00+03:00'), 'ראינו את הפנייה, נחזור בשעות הפעילות');
    const html = render(<NowBox server={undefined} local={closed} serverFailed />);
    expect(html).toContain('סגור');
    expect(html).toContain('סגור היום');
    expect(html).toContain('ראינו את הפנייה, נחזור בשעות הפעילות');
    expect(html).toContain('השרת לא ענה');
  });

  it('the server\'s word wins over the screen\'s', () => {
    const local = officeOpenNow(DEFAULT_WEEKLY, [], new Date('2026-10-07T14:00:00+03:00'));
    const html = render(
      <NowBox
        server={{ open: false, today: { day: 'wed', day_label: 'רביעי', open: true, from: '10:30', to: '18:00', message: '' }, special: null, message_if_closed: 'סגור לרגל חג', configured: true }}
        local={local}
        serverFailed={false}
      />,
    );
    expect(html).toContain('עכשיו: <strong>סגור</strong>');
    expect(html).toContain('סגור לרגל חג');
    expect(html).toContain('היום: רביעי 10:30–18:00');
  });
});

const reply: WahubShadowReply = makeShadowReply(33, {
  after_message_id: 1,
  text: 'היי! בראש העין שיעור הניסיון בקפוארה הוא ₪30 שחוזרים בהרשמה.',
  reasoning: 'הלקוח שאל על ראש העין; find_courses החזיר קפוארה בפסגות אפק.',
  tools_used: ['find_courses', { name: 'office_hours_now' }],
  knowledge_used: [{ id: 7, kind_label: 'נוסח', title: 'הפניה לאתר לניסיון' }],
  old_bot_reply: { text: 'שיעור ניסיון בחינם בכל הסניפים', sent_at: '2026-10-08T11:01:00+03:00' },
  model: 'stub',
  took_ms: 1800,
  request_human: true,
  request_human_reason: 'שאלה על תשלום',
  contact_id: 12,
  contact_name: 'דנה כהן',
  customer_text: 'כמה עולה ניסיון בראש העין?',
});

describe('a shadow reply', () => {
  it('shows old beside new, the stand-in mark, who, and 👍/👎 — with "why" folded', () => {
    const html = render(<ShadowReplyCard reply={reply} now={NOW} busy={false} showContact onVerdict={noop} onOpenItem={noop} onOpenChat={noop} />);
    expect(html).toContain('הישן ענה');
    expect(html).toContain('שיעור ניסיון בחינם בכל הסניפים');
    expect(html).toContain('החדש היה עונה');
    expect(html).toContain('₪30 שחוזרים בהרשמה');
    expect(html).toContain('דמה');
    expect(html).toContain('דנה כהן');
    expect(html).toContain('כמה עולה ניסיון בראש העין?');
    expect(html).toContain('היה מבקש נציג · שאלה על תשלום');
    expect(html).toContain('פתח שיחה');
    expect(html).toContain('תשובה טובה');
    expect(html).toContain('לתקן');
    expect(html).toContain('למה');
    expect(html).not.toContain('find_courses החזיר');
    expect(html).toContain('1.8 שנ׳');
  });

  it('a reply with no old answer says so; a verdict already set is pressed', () => {
    const html = render(<ShadowReplyCard reply={{ ...reply, old_bot_reply: null, verdict: 'bad', verdict_note: 'המחיר לא נכון' }} now={NOW} busy={false} onVerdict={noop} />);
    expect(html).toContain('לא ענה');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('המחיר לא נכון');
  });

  it('under a message in the conversation it is one folded line with the start of the answer', () => {
    const html = render(<ShadowRow reply={reply} busy={false} onVerdict={noop} onOpenItem={noop} />);
    expect(html).toContain('הבוט החדש היה עונה…');
    expect(html).toContain('₪30 שחוזרים בהרשמה');
    expect(html).not.toContain('find_courses החזיר');
    expect(html).not.toContain('תשובה טובה');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('the conversation with shadow replies', () => {
  const messages: WahubMessage[] = [
    makeMessage(1, { text: 'כמה עולה ניסיון בראש העין?' }),
    makeMessage(2, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'שיעור ניסיון בחינם בכל הסניפים', status: 'sent' }),
    makeMessage(3, { text: 'תודה' }),
  ];
  const contact: WahubContactDetail = { ...makeContact(12, { name: 'דנה כהן' }), messages: [], has_older: false, events: [] };
  const thread: ContactThread = {
    contactId: 12,
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
  };
  const props = {
    thread,
    now: NOW,
    visible: true,
    simulated: false,
    sendingOff: false,
    handoverBusy: false,
    resolveBusy: false,
    showBack: false,
    showDetailsButton: false,
    onBack: noop,
    onDetails: noop,
    onTakeover: noop,
    onRelease: noop,
    onResolveNeedsHuman: noop,
    onOpenSettings: noop,
  };

  it('hangs the folded line under the customer message it answers, and nowhere else', () => {
    const html = render(<ChatThread {...props} shadowByMessage={new Map([[1, reply]])} />);
    expect((html.match(/הבוט החדש היה עונה…/g) ?? []).length).toBe(1);
    const row = html.indexOf('הבוט החדש היה עונה…');
    expect(row).toBeGreaterThan(html.indexOf('כמה עולה ניסיון בראש העין?'));
    expect(row).toBeLessThan(html.indexOf('שיעור ניסיון בחינם בכל הסניפים'));
  });

  it('without replies the conversation reads as before', () => {
    expect(render(<ChatThread {...props} />)).not.toContain('הבוט החדש היה עונה');
  });
});

describe('the statuses of a conversation', () => {
  const contact = makeContact(12, {
    chat: { waiting_since: '2026-10-08T11:40:00+03:00', unread_count: 1, can_free_text: true, window_closes_at: '2026-10-09T09:00:00+03:00' },
    kogo: { outcome: 'trial_only', outcome_label: 'עשה ניסיון ולא נרשם' },
  });

  it('is a button first; open, it is the main state and three groups', () => {
    const folded = render(<ContactStatusBlock contact={contact} now={NOW} />);
    expect(folded).toContain('הצג סטטוסים');
    expect(folded).not.toContain('מי עונה');
    const open = render(<ContactStatusBlock contact={contact} now={NOW} shadow={{ count: 2, lastAt: '2026-10-08T11:50:00+03:00' }} defaultOpen />);
    expect(open).toContain('מי עונה');
    expect(open).toContain('>בוט<');
    for (const title of ['הבוט', 'הנציג', 'השיחה']) expect(open).toContain(title);
    expect(open).toContain('הלקוח מחכה 20 דק׳');
    expect(open).toContain('2 הצעות · האחרונה לפני 10 דק׳');
    expect(open).toContain('פתוח עד 09:00');
    expect(open).toContain('עשה ניסיון ולא נרשם');
  });

  it('the contact panel offers the statuses and "הבוט טעה כאן", each a press away', () => {
    const detail: WahubContactDetail = { ...contact, messages: [], has_older: false, events: [] };
    const html = render(
      <ContactPanel
        contact={detail}
        now={NOW}
        today={TODAY}
        allTags={[]}
        analyzing={false}
        rechecking={false}
        showBack={false}
        onBack={noop}
        onFollowup={noop}
        onTags={noop}
        onRename={noop}
        onRecheck={noop}
        onAnalyze={noop}
        shadow={{ count: 0, lastAt: null }}
      />,
    );
    expect(html).toContain('הצג סטטוסים');
    expect(html).toContain('הבוט טעה כאן');
    // The note box opens on a press; the panel's own "מידע חדש" field is not it.
    expect(html).not.toContain('מה הבוט עשה');
    expect(html).not.toContain('מי עונה');
  });
});

const proposal = makeProposal(7, {
  source: 'human_override',
  source_label: 'נציג ענה מעל הבוט',
  contact_id: 12,
  title: 'להוסיף נוסח: אין קבוצת וואטסאפ לגיל הרך',
  explanation: 'הבוט ענה שיש קבוצה; הנציגה ענתה שאין. ההבדל: הקבוצות הן של המדריכה בלבד.',
  contact_name: 'דנה כהן',
  change: { action: 'update', item_id: 4, kind: 'phrasing', before: { title: 'קבוצת וואטסאפ', body: 'יש קבוצה לכל חוג' }, after: { title: 'קבוצת וואטסאפ', body: 'הקבוצה אצל המדריכה; נעביר לנציג' } },
  evidence: [
    { message_id: 501, who: 'customer', text: 'יש קבוצת וואטסאפ?' },
    { message_id: 502, who: 'bot', text: 'יש קבוצה לכל חוג' },
    { message_id: 503, who: 'office', text: 'אין קבוצה להורים, המדריכה פותחת' },
  ],
});

describe('a proposal to change the bot', () => {
  it('pending: the title, why, before/after of what changed only, folded evidence, approve and reject', () => {
    const html = render(<ProposalCard proposal={proposal} now={NOW} busy={false} onApprove={noop} onReject={noop} onOpenChat={noop} onOpenItem={noop} />);
    expect(html).toContain('להוסיף נוסח: אין קבוצת וואטסאפ לגיל הרך');
    expect(html).toContain('נציג ענה מעל הבוט');
    expect(html).toContain('ממתין לאישור');
    expect(html).toContain('ההבדל: הקבוצות הן של המדריכה בלבד');
    expect(html).toContain('עדכון רשומה #4 · נוסחים');
    expect(html).toContain('יש קבוצה לכל חוג');
    expect(html).toContain('הקבוצה אצל המדריכה; נעביר לנציג');
    // The title did not change, so it is not a row.
    expect(html).not.toContain('>כותרת<');
    expect(html).toContain('הראיות');
    expect(html).toContain('(3)');
    expect(html).not.toContain('אין קבוצה להורים, המדריכה פותחת');
    expect(html).toContain('>אשר<');
    expect(html).toContain('>דחה<');
    expect(html).toContain('לשיחה');
    expect(html).toContain('דנה כהן');
  });

  it('decided and compact: the title and pills alone, no buttons', () => {
    const html = render(
      <ProposalCard
        proposal={{ ...proposal, status: 'applied', status_label: 'הוחל על הידע', decided_at: '2026-10-08T10:00:00+03:00', decided_by_name: 'דור' }}
        now={NOW}
        busy={false}
        compact
      />,
    );
    expect(html).toContain('הוחל על הידע');
    expect(html).not.toContain('>אשר<');
    expect(html).not.toContain('ההבדל: הקבוצות');
  });
});

describe('the floating button', () => {
  it('is not there while nothing waits', () => {
    expect(render(<ProposalsFab onOpenChat={noop} onOpenItem={noop} onOpenReview={noop} />)).toBe('');
  });

  it('says how many proposals wait, from the summary, before the list is read', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 3, applied_7d: 0, rejected_7d: 0, auto_mode: false });
    const html = render(<ProposalsFab onOpenChat={noop} onOpenItem={noop} onOpenReview={noop} />, queryClient);
    expect(html).toContain('יש הצעות לעדכון הבוט');
    expect(html).toContain('>3<');
    expect(html).toContain(s.fab);
    expect(html).not.toContain('role="dialog"');
  });

  it('counts the pending list when it is in hand', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 5, applied_7d: 0, rejected_7d: 0, auto_mode: false });
    queryClient.setQueryData(botKeys.proposals('pending'), [makeProposal(1), makeProposal(2, { status: 'applied' })]);
    expect(render(<ProposalsFab onOpenChat={noop} onOpenItem={noop} onOpenReview={noop} />, queryClient)).toContain('>1<');
  });
});

describe('the bot tab', () => {
  it('has the six sub-tabs, the chosen one selected', () => {
    const html = render(
      <BotTab sub="hours" status={undefined} openItemId={null} tryQuestion="" onSub={noop} onOpenItem={noop} onTryQuestion={noop} onOpenChat={noop} onDemoChanged={noop} />,
    );
    for (const label of ['ידע', 'שעות ומועדים', 'נסה שאלה', 'תשובות בצל', 'ביקורת', 'דמו']) expect(html).toContain(label);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('id="wahub-bot-tab-hours" aria-selected="true"');
  });

  it('"נסה שאלה" takes a question, a contact, a pretend time and the last outbound; says when answers are stand-ins', () => {
    const html = render(
      <TryTab
        status={{
          inbound_configured: true,
          inbound_key_set_at: null,
          bot_replies_seen: false,
          ai_configured: false,
          send_configured: false,
          sending_enabled: false,
          simulate_send: false,
          shadow_configured: false,
          last_inbound_at: null,
          contacts_total: 0,
          messages_last_24h: 0,
          inbound_url: '',
        }}
        initialQuestion="כמה עולה?"
        onOpenItem={noop}
      />,
    );
    expect(html).toContain('כמה עולה?');
    expect(html).toContain('העמד פנים שהתאריך והשעה הם');
    expect(html).toContain('ההודעה האחרונה שיצאה ללקוח');
    expect(html).toContain('מה הבוט היה עונה?');
    expect(html).toContain('דמה');
    expect(html).toContain('חסר מפתח למודל');
  });
});

describe('demo contacts (§ה)', () => {
  const demo = makeContact(21, { name: 'הדס מלמד', is_demo: true, source: 'demo', source_label: 'דמו', phone: '972505550201', phone_display: '050-5550201' });
  const real = makeContact(22, { name: 'דנה כהן' });

  it('wear a small gold "דמו" in the conversations list, on the lead card and in the conversation header — real ones do not', () => {
    const list = render(
      <ChatList
        items={[demo, real]}
        status="ready"
        error=""
        hasMore={false}
        loadingMore={false}
        box="all"
        counts={null}
        search=""
        selectedId={null}
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
    expect((list.match(/>דמו</g) ?? []).length).toBe(1);
    expect(render(<LeadCard contact={demo} today={TODAY} now={NOW} allTags={[]} onFollowup={noop} onTags={noop} onOpenChat={noop} />)).toContain('>דמו<');
    expect(render(<LeadCard contact={real} today={TODAY} now={NOW} allTags={[]} onFollowup={noop} onTags={noop} onOpenChat={noop} />)).not.toContain('>דמו<');
  });

  it('a demo conversation has the "write as the customer / as the old bot" box under the writing box; a real one does not', () => {
    const detailOf = (contact: typeof demo): WahubContactDetail => ({ ...contact, messages: [], has_older: false, events: [] });
    const threadOf = (contact: typeof demo): ContactThread => ({
      contactId: contact.id,
      contact: detailOf(contact),
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
      loadOlder: async () => {},
      send: async () => true,
      sendFlow: async () => true,
      refreshQuietly: async () => {},
      retry: noop,
    });
    const props = {
      now: NOW,
      visible: true,
      simulated: false,
      sendingOff: true,
      handoverBusy: false,
      resolveBusy: false,
      showBack: false,
      showDetailsButton: false,
      onBack: noop,
      onDetails: noop,
      onTakeover: noop,
      onRelease: noop,
      onResolveNeedsHuman: noop,
      onOpenSettings: noop,
      onSimulate: async () => true,
    };
    const html = render(<ChatThread {...props} thread={threadOf(demo)} />);
    expect(html).toContain('כתוב כלקוח');
    expect(html).toContain('הלקוח שלח');
    expect(html).toContain('כתוב כבוט הישן');
    expect(html).toContain('הבוט הישן ענה');
    expect(html).toContain('שום דבר לא נשלח בוואטסאפ');
    expect(html).toContain('>דמו<');
    // The regular box is locked, as sending is off; the demo box is still there.
    expect(html).toContain('השליחה ללקוחות כבויה');
    const realHtml = render(<ChatThread {...props} thread={threadOf(real)} />);
    expect(realHtml).not.toContain('כתוב כלקוח');
    expect(realHtml).not.toContain('>דמו<');
  });

  it('the new-lead form offers a "לקוח דמו" switch, off by default', () => {
    const html = render(<NewLeadForm onClose={noop} onCreated={noop} onOpenExisting={noop} />);
    expect(html).toContain('לקוח דמו');
    expect(html).toContain('role="switch" aria-checked="false"');
  });

  it('the demo sub-tab says demo contacts get no message, and offers a new contact, the scenarios and the clean-up', () => {
    const html = render(<DemoTab onOpenChat={noop} onDemoChanged={noop} />);
    expect(html).toContain('לקוחות דמו לא מקבלים שום הודעה, גם כשהשליחה דלוקה');
    expect(html).toContain('לקוח דמו חדש');
    expect(html).toContain('תרחישים מוכנים');
    expect(html).toContain('מחק את כל הדמו');
    // The confirmation is a press away, inside the page.
    expect(html).not.toContain('כן, מחק את כל הדמו');
  });
});
