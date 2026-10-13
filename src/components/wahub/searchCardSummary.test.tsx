import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { shownBox } from '@/lib/wahub/boxes';
import { readWaitingEntry } from '@/lib/wahub/futureLeads';
import { readLeadRow, readLeadsPage } from '@/lib/wahub/leadsV2';
import { DEFAULT_CHAT_BOX } from '@/lib/wahub/params';
import { readSearchExtras } from '@/lib/wahub/search';
import { readTeachPage, readTeachThread } from '@/lib/wahub/teach';
import { rawTeachRow, rawTeachSaved, rawTeachThread } from '@/lib/wahub/teachFixtures';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import { readWaitingListPage } from '@/lib/wahub/waitingList';
import { readWaitingSummary } from '@/lib/wahub/waitingSummary';
import type { WahubBoxCounts, WahubContactDetail, WahubLeadDetails, WahubLeadRow, WahubMessage, WahubWaitingListPage } from '@/types/wahub';
import type { WahubWaitingSummary } from '@/types/wahubSearch';
import { TeachCardView, type TeachCardViewProps } from './bot/teach/TeachCard';
import TeachHistory from './bot/teach/TeachHistory';
import t from './bot/teach/teach.module.css';
import ChatList from './chats/ChatList';
import ChatThread, { type ThreadFutureActions } from './chats/ChatThread';
import ContactPanel from './chats/ContactPanel';
import type { ContactThread } from './hooks/useContactThread';
import LeadDetails, { type LeadDetailsProps } from './leads/v2/LeadDetails';
import LeadsList, { type LeadsListProps } from './leads/v2/LeadsList';
import TodayLeadsCard from './leads/v2/TodayLeadsCard';
import { WaitingActionsView, WaitingWay } from './leads/v2/WaitingBits';
import { WaitingListView } from './leads/v2/WaitingListScreen';
import WantedBlock from './leads/v2/WantedBlock';
import l from './leads/v2/leads.module.css';
import { RefineProvider, opensTeachFlow } from './refine/RefineContext';
import { TeachDrawerView, type TeachDrawerViewProps } from './refine/TeachDrawer';
import x from './search.module.css';
import s from './wahub.module.css';

// Nothing here may reach a server.
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'מיכל', branch_ids: [] }, loading: false }),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * The owner's requests of 13.10.2026, afternoon (docs/WAHUB-MASTER-PLAN-2026-10-12.md, יא), as the screens show
 * them: "דיוק" small and quiet; the conversations open on "פתוחות"; "לכרטיס הלקוח" a press away; a search that
 * looks everywhere; "מחכים שיתפנה מקום" with a clear summary of what was asked for. Beside each: that a server
 * built before it is shown what it was shown before. Every name and number here is invented.
 */

/** Tuesday, 13.10.2026, 15:00 in Israel. */
const NOW = new Date('2026-10-13T12:00:00Z');
const TODAY = '2026-10-13';
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** Every element a draw makes, with its props — so a press can be made without a browser. */
function drawn(node: React.ReactElement): Array<{ type: unknown; props: Record<string, unknown> }> {
  const original = React.createElement;
  const seen: Array<{ type: unknown; props: Record<string, unknown> }> = [];
  (React as { createElement: unknown }).createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
    if (props) seen.push({ type, props: children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props });
    return (original as (...args: unknown[]) => React.ReactElement)(type, props, ...children);
  };
  try {
    render(node);
  } finally {
    (React as { createElement: unknown }).createElement = original;
  }
  return seen;
}

function words(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(words).join('');
  if (React.isValidElement(node)) return words((node as React.ReactElement<{ children?: unknown }>).props.children);
  return '';
}

const pressable = (made: ReturnType<typeof drawn>, say: string) =>
  made.filter((element) => element.type === 'button' && (element.props['aria-label'] === say || words(element.props.children).trim() === say));

/** A contact from a server that knows ✓ and the clock (`chat.open`), and one from a server built before them. */
function knowing(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  const { chat, ...rest } = overrides;
  return {
    ...makeContact(12, { name: 'דנה לוי', ...rest, chat: { open: false, open_reason: '', open_label: '', ...chat } }),
    messages: [],
    has_older: false,
    events: [],
    notes: [],
  };
}

function old(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, { name: 'דנה לוי', ...overrides }), messages: [], has_older: false, events: [] };
}

/** Somebody Kogo knows: a family, and its children. */
const KNOWN = { family_id: 'fam-1', child_ids: ['child-7', 'child-8'], outcome: 'customer_before' as const, outcome_label: 'לקוח מלפני הפנייה', is_customer: true };

function thread(contact: WahubContactDetail, messages: WahubMessage[] = []): ContactThread {
  return {
    contactId: contact.id,
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
  };
}

const ACTIONS: ThreadFutureActions = {
  today: TODAY,
  closeBusy: false,
  onClose: noop,
  onHandToBot: async () => ({ error: '' }),
  onFuture: async () => ({ error: '' }),
  onNote: async () => '',
};

const MESSAGES = [makeMessage(101, { text: 'כמה עולה חוג קפוארה?' })];

function conversationNode(contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ChatThread>> = {}): React.ReactElement {
  return (
    <RefineProvider>
      <ChatThread
        thread={thread(contact, MESSAGES)}
        now={NOW}
        visible
        simulated={false}
        sendingOff
        handoverBusy={false}
        resolveBusy={false}
        showBack={false}
        showDetailsButton
        onBack={noop}
        onDetails={noop}
        onTakeover={noop}
        onRelease={noop}
        onResolveNeedsHuman={noop}
        onOpenSettings={noop}
        future={ACTIONS}
        {...over}
      />
    </RefineProvider>
  );
}

const conversation = (contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ChatThread>> = {}) => render(conversationNode(contact, over));

/** The conversation's title row alone. */
const titleRow = (html: string) => html.slice(html.indexOf(`class="${s.threadHead}"`), html.indexOf('</header>'));

function card(contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ContactPanel>> = {}): string {
  return render(
    <ContactPanel
      contact={contact}
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
      actions={{ handoverBusy: false, resolveBusy: false, onTakeover: noop, onRelease: noop, onResolveNeedsHuman: noop }}
      {...over}
    />,
  );
}

const COUNTS: WahubBoxCounts = { all: 128, waiting: 3, needs_human: 2, unread: 5, human: 4, bot: 120, open: 0, future: 9 };
const OLD_COUNTS: WahubBoxCounts = { all: 128, waiting: 3, needs_human: 2, unread: 5, human: 4, bot: 120 };

function chatListNode(over: Partial<React.ComponentProps<typeof ChatList>> = {}): React.ReactElement {
  return (
    <ChatList
      items={[]}
      status="ready"
      error=""
      hasMore={false}
      loadingMore={false}
      box="open"
      counts={COUNTS}
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
      {...over}
    />
  );
}

const chatList = (over: Partial<React.ComponentProps<typeof ChatList>> = {}) => render(chatListNode(over));

// ---------------------------------------------------------------------------
// א. "דיוק" — small and quiet
// ---------------------------------------------------------------------------

describe('"דיוק" in a conversation\'s title row: small, quiet, and after the conversation\'s own actions', () => {
  it('one icon — no frame, no word — named for a reader of the screen and on hover', () => {
    const row = titleRow(conversation(knowing()));
    const button = row.match(/<button[^>]*aria-label="דיוק"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('title="דיוק: לתקן את הבוט מתוך השיחה"');
    expect(button).toContain(s.ibQuiet);
    expect(button).toContain(s.ibSm);
    // Not the framed button it was.
    expect(button).not.toMatch(new RegExp(`"[^"]*\\b${s.btn}\\b`));
    expect(row).not.toContain('>דיוק</button>');
    expect((row.match(/aria-label="דיוק"/g) ?? []).length).toBe(1);
  });

  it('it stands after ✓ and the clock — the two that are pressed all day keep their place beside the name', () => {
    const row = titleRow(conversation(knowing()));
    const at = (label: string) => row.indexOf(`aria-label="${label}"`);
    expect(at('סגירת שיחה')).toBeGreaterThan(-1);
    expect(at('סגירת שיחה')).toBeLessThan(at('לטפל בהמשך'));
    expect(at('לטפל בהמשך')).toBeLessThan(at('דיוק'));
  });

  it('a phone: the same quiet icon; ✓, the clock and it are the three of the title row — "קח שיחה" stays in the card', () => {
    const row = titleRow(conversation(knowing(), { showBack: true }));
    expect((row.match(/aria-label="דיוק"/g) ?? []).length).toBe(1);
    expect(row).toContain('aria-label="סגירת שיחה"');
    expect(row).toContain('aria-label="לטפל בהמשך"');
    // The name keeps its room: no fourth round button was put back beside it.
    expect(row).not.toContain('aria-label="קח שיחה"');
    expect(row).not.toContain('aria-label="החזר לבוט"');
  });

  it('pressed, it is on — in the colour of a thing that is on, so marking is never a surprise', () => {
    const made = drawn(conversationNode(knowing()));
    const [button] = pressable(made, 'דיוק');
    expect(button.props['aria-pressed']).toBe(false);
    expect(String(button.props.className)).not.toContain(s.ibNavy);
  });

  it('a server built before ✓ and the clock: the quiet icon all the same, beside the phone\'s own "קח שיחה"', () => {
    const row = titleRow(conversation(old(), { showBack: true }));
    expect(row).toContain('aria-label="קח שיחה"');
    expect(row.indexOf('aria-label="קח שיחה"')).toBeLessThan(row.indexOf('aria-label="דיוק"'));
    expect(row).not.toContain('>דיוק</button>');
  });

  it('the stylesheet: quiet until the pointer is on it, and a finger\'s width on a phone whatever its mark measures', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, 'wahub.module.css'), 'utf8');
    expect(css).toMatch(/\.ibQuiet\s*\{[^}]*color:\s*var\(--muted\)/);
    expect(css).toMatch(/\.ibQuiet:not\(\.ibNavy\):hover\s*\{[^}]*color:\s*var\(--navy-ink\)/);
    const phone = css.slice(css.indexOf('@media (max-width: 767px)'));
    // Every round button of the title row is 44px there — the quiet one among them; only its mark is smaller.
    expect(phone).toMatch(/\.threadHead \.ib\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
    expect(phone).toMatch(/\.threadHead \.ibQuiet svg\s*\{[^}]*width:\s*17px/);
  });
});

// ---------------------------------------------------------------------------
// ב. The conversations open on "פתוחות"
// ---------------------------------------------------------------------------

describe('the conversations open on "פתוחות"', () => {
  it('an address that names no box is "פתוחות"; on a server that does not count it — "הכול", as it always was', () => {
    expect(DEFAULT_CHAT_BOX).toBe('open');
    expect(shownBox(DEFAULT_CHAT_BOX, COUNTS)).toBe('open');
    expect(shownBox(DEFAULT_CHAT_BOX, OLD_COUNTS)).toBe('all');
    // Until the first counts are in hand nothing is known, and nothing is changed.
    expect(shownBox(DEFAULT_CHAT_BOX, null)).toBe('open');
    // A box the address names is the one shown.
    expect(shownBox('all', COUNTS)).toBe('all');
    expect(shownBox('needs_human', OLD_COUNTS)).toBe('needs_human');
  });

  it('"פתוחות" is the box that is on', () => {
    const html = chatList({ items: [makeContact(1, { chat: { open: true, open_reason: 'needs_human', needs_human: true } })] });
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>פתוחות/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>הכול/);
  });

  it('nobody waits: a friendly word — and a clear way to every conversation, so it never reads as if they were gone', () => {
    const html = chatList();
    expect(html).toContain('<h3>אין שיחות שמחכות לכם כרגע</h3>');
    expect(html).toContain('כל שאר השיחות נמצאות ב״הכול״');
    expect(html).toContain('>לכל השיחות (128)</button>');
    // Not the words of a search that found nothing.
    expect(html).not.toContain('אין שיחות שמתאימות');
    const onBox = vi.fn();
    const made = drawn(chatListNode({ onBox }));
    const [go] = pressable(made, 'לכל השיחות (128)');
    (go.props.onClick as () => void)();
    expect(onBox).toHaveBeenCalledWith('all');
  });

  it('the number is said only when it is known', () => {
    expect(chatList({ counts: { ...COUNTS, all: 0 } })).toContain('>לכל השיחות</button>');
  });

  it('another empty box says what it always said; a search that found nothing in "פתוחות" too', () => {
    expect(chatList({ box: 'unread' })).toContain('אין שיחות שמתאימות');
    const searched = chatList({ search: 'דנה' });
    expect(searched).not.toContain('אין שיחות שמחכות לכם כרגע');
  });

  it('WhatsApp not connected yet: that is the reason nothing is here, and it is the one said', () => {
    const html = chatList({ notConnected: true });
    expect(html).toContain('הוואטסאפ עוד לא מחובר');
    expect(html).not.toContain('אין שיחות שמחכות לכם כרגע');
  });

  it('with conversations in it there is no empty word at all', () => {
    const html = chatList({ items: [makeContact(1, { chat: { open: true } })] });
    expect(html).not.toContain('אין שיחות שמחכות לכם כרגע');
    expect(html).not.toContain('לכל השיחות');
  });
});

// ---------------------------------------------------------------------------
// ג. "לכרטיס הלקוח"
// ---------------------------------------------------------------------------

describe('"לכרטיס הלקוח" from a conversation', () => {
  it('the contact\'s card carries it, among the actions — one clear button, leading to the customer\'s card', () => {
    const html = card(knowing({ kogo: KNOWN }));
    const actions = html.slice(html.indexOf('aria-label="פעולות"'), html.indexOf('aria-label="במערכת"'));
    expect(actions).toMatch(/<a [^>]*href="\/customers\?child=child-7"[^>]*>.*לכרטיס הלקוח<\/a>/);
    expect(actions).toContain('title="כרטיס הלקוח במדור לקוחות"');
    expect((html.match(/לכרטיס הלקוח/g) ?? []).length).toBe(1);
  });

  it('nobody Kogo knows: no button — not a locked one, not a word about it', () => {
    for (const contact of [knowing(), knowing({ kogo: { family_id: 'fam-1', child_ids: [] } }), old()]) {
      const html = card(contact);
      expect(html).not.toContain('לכרטיס הלקוח');
      expect(html).not.toContain('href="/customers');
    }
  });

  it('it has the row of actions to itself when nothing else is offered there (a future lead a person holds)', () => {
    const held = knowing({
      kogo: KNOWN,
      chat: { handled_by: 'human', open: false },
      future: { due: '2026-12-01', reason: 'אחרי החגים', by_name: 'מיכל', at: null, state: 'parked', label: 'ליד עתידי', days_left: 49, muted: true },
    });
    const html = card(held);
    const actions = html.slice(html.indexOf('aria-label="פעולות"'), html.indexOf('aria-label="במערכת"'));
    expect(actions).toContain('לכרטיס הלקוח');
    expect(actions).not.toContain('החזר לבוט');
    // …and with nothing to offer at all the section is not drawn.
    expect(card({ ...held, kogo: { ...held.kogo, family_id: null, child_ids: [] } })).not.toContain('aria-label="פעולות"');
  });

  it('the title row carries it where the card is a press away, or was put away — and not when the card stands beside it', () => {
    const away = titleRow(conversation(knowing({ kogo: KNOWN }), { showDetailsButton: true }));
    expect(away).toMatch(/<a [^>]*href="\/customers\?child=child-7"[^>]*>.*לכרטיס הלקוח<\/a>/);
    const hidden = titleRow(conversation(knowing({ kogo: KNOWN }), { showDetailsButton: false, onShowCard: noop }));
    expect(hidden).toContain('לכרטיס הלקוח');
    // The card is open beside the conversation and says it: it is not said twice.
    const beside = titleRow(conversation(knowing({ kogo: KNOWN }), { showDetailsButton: false }));
    expect(beside).not.toContain('לכרטיס הלקוח');
  });

  it('a phone\'s title row has no room for it: there it is drawn for a desktop\'s width only, and the card has it', () => {
    const row = titleRow(conversation(knowing({ kogo: KNOWN }), { showBack: true, showDetailsButton: true }));
    const link = row.match(/<a [^>]*href="\/customers[^>]*>/)?.[0] ?? '';
    expect(link).toContain(s.deskOnly);
  });

  it('nobody identified: the title row has no such button either', () => {
    expect(titleRow(conversation(knowing(), { showDetailsButton: true }))).not.toContain('לכרטיס הלקוח');
  });
});

// ---------------------------------------------------------------------------
// ד. A search that looks everywhere
// ---------------------------------------------------------------------------

const BOXED = { box: 'all', box_label: 'הבוט עונה' };
const EXTRAS = readSearchExtras({
  customers: [
    { family_id: 'fam-90', name: 'הילה ברק', family_name: 'ברק', phone: '0547000190', phone_display: '054-7000190', children: [{ id: 'child-901', name: 'נועם ברק', status: 'active', status_label: 'פעיל' }], child_id: 'child-901', link: '/customers?child=child-901', contact_id: null, found_by: { kind: 'phone', label: 'טלפון', value: '054-7000190' } },
    { family_id: 'fam-91', name: 'אבי שלום', phone: '0547000191', phone_display: '054-7000191', children: [], child_id: null, link: null, contact_id: null },
  ],
  customers_more: true,
})!;

describe('a search of the conversations looks through every box', () => {
  const RON = makeContact(13, { name: 'רון אבידן', phone: '972505550113', phone_display: '050-555-0113', chat: { open: true, needs_human: true, box: 'needs_human', box_label: 'מבקש נציג' } });
  const TAMAR = makeContact(15, { name: 'תמר אוחיון', phone: '972505550115', phone_display: '050-555-0115', chat: { open: false, ...BOXED } });

  it('it says so above its results, with how many — and no box is the one in front while it is on', () => {
    const html = chatList({ search: 'אבידן', found: 'אבידן', total: 1, items: [RON] });
    expect(html).toContain('תוצאות בכל השיחות');
    expect(html).toContain('· תוצאה אחת');
    expect(html).not.toMatch(/<button[^>]*aria-pressed="true"[^>]*>(פתוחות|הכול)/);
    expect(html).toContain('aria-label="תוצאות בכל השיחות"');
  });

  it('a press on a box leaves the search for that box', () => {
    const onBox = vi.fn();
    const onSearch = vi.fn();
    const made = drawn(chatListNode({ search: 'אבידן', found: 'אבידן', items: [RON], onBox, onSearch }));
    const all = made.find((element) => element.type === 'button' && words(element.props.children).startsWith('הכול'));
    (all!.props.onClick as () => void)();
    expect(onSearch).toHaveBeenCalledWith('');
    expect(onBox).toHaveBeenCalledWith('all');
    // With no search a box is only chosen.
    const quiet = vi.fn();
    const plain = drawn(chatListNode({ items: [RON], onBox, onSearch: quiet }));
    (plain.find((element) => element.type === 'button' && words(element.props.children).startsWith('הכול'))!.props.onClick as () => void)();
    expect(quiet).not.toHaveBeenCalled();
  });

  it('what matched is marked in the name; each result says in which box it stands', () => {
    const html = chatList({ search: 'רון', found: 'רון', items: [RON, TAMAR] });
    expect(html).toContain(`<mark class="${x.hit}">רון</mark>`);
    expect(html).toMatch(new RegExp(`class="${x.place} ${x.placeAsk}">מבקש נציג<`));
    expect(html).toMatch(new RegExp(`class="${x.place}">הבוט עונה<`));
    // The box's word stands in place of the row's own marks of the same thing: it is not said twice.
    expect(html).not.toContain(s.pBad);
    expect(html).not.toContain(s.pWarn);
    // Without a search the same row carries its own mark.
    expect(chatList({ items: [RON] })).toContain(s.pBad);
  });

  it('a number: the phone is shown on the row, with the digits that matched marked', () => {
    const html = chatList({ search: '+972 50-555 0115', found: '+972 50-555 0115', items: [TAMAR] });
    expect(html).toContain(`<bdi dir="ltr" class="${x.digits}"><mark class="${x.hit}">050-555-0115</mark></bdi>`);
    const part = chatList({ search: '5550', found: '5550', items: [TAMAR] });
    expect(part).toContain(`<span>050-</span><mark class="${x.hit}">555-0</mark><span>115</span>`);
  });

  it('found by the family, not by the name or the phone: said under the row', () => {
    const byChild = makeContact(13, { name: 'רון אבידן', chat: BOXED, found_by: { kind: 'child', label: 'ילד/ה', value: 'נגה אבידן' } });
    const html = chatList({ search: 'נגה', found: 'נגה', items: [byChild] });
    expect(html).toContain(`נמצא לפי: ילד/ה — <mark class="${x.hit}">נגה</mark><span> אבידן</span>`);
    const byPhone = makeContact(13, { name: 'רון אבידן', chat: BOXED, found_by: { kind: 'family_phone', label: 'טלפון נוסף של המשפחה', value: '052-8880113' } });
    expect(chatList({ search: '052-888', found: '052-888', items: [byPhone] })).toContain(`טלפון נוסף של המשפחה — <mark class="${x.hit}">052-888</mark>`);
    const byText = makeContact(13, { name: 'רון אבידן', chat: BOXED, found_by: { kind: 'text', label: 'מופיע בשיחה', value: '' } });
    expect(chatList({ search: 'אקרובטיקה', found: 'אקרובטיקה', items: [byText] })).toContain('נמצא לפי: מופיע בשיחה');
  });

  it('nothing found: what was looked for and what was looked through — never the words of an empty box', () => {
    const html = chatList({ search: '0599999999', found: '0599999999', extras: { customers: [], customers_more: false, contacts: [] } });
    expect(html).toContain('<h3>לא נמצאה שיחה עם המספר הזה</h3>');
    expect(html).toContain('וגם בפרטי המשפחות במערכת');
    expect(html).not.toContain('אין שיחות שמחכות לכם כרגע');
    expect(html).not.toContain('לקוח במערכת');
    expect(chatList({ search: 'בלה', found: 'בלה' })).toContain('לא נמצאה שיחה שמתאימה לחיפוש');
  });

  it('…and a customer Kogo knows, who never wrote on WhatsApp: shown, with "לכרטיס הלקוח"', () => {
    const html = chatList({ search: '054-7000190', found: '054-7000190', extras: EXTRAS });
    expect(html).toContain('לקוח במערכת — אין שיחה בוואטסאפ');
    expect(html).toContain('הילה ברק');
    expect(html).toContain(`<mark class="${x.hit}">054-7000190</mark>`);
    expect(html).toContain('נועם ברק (פעיל)');
    expect(html).toMatch(/<a [^>]*href="\/customers\?child=child-901"[^>]*>.*לכרטיס הלקוח<\/a>/);
    // A family with no child has no card: its row says so, and offers no dead end.
    expect((html.match(/לכרטיס הלקוח/g) ?? []).length).toBe(1);
    expect(html).toContain('אין עדיין כרטיס לפתוח');
    expect(html).toContain('יש עוד לקוחות מתאימים במערכת');
  });

  it('customers stand under the results as well — once the whole of them is on screen', () => {
    const under = chatList({ search: 'ברק', found: 'ברק', items: [RON], extras: EXTRAS });
    expect(under.indexOf('רון אבידן')).toBeLessThan(under.indexOf('לקוח במערכת'));
    expect(chatList({ search: 'ברק', found: 'ברק', items: [RON], extras: EXTRAS, hasMore: true })).not.toContain('לקוח במערכת');
  });

  it('the words typed a moment ago are not passed off as results before their answer has been asked for', () => {
    const html = chatList({ search: 'אב', found: '', items: [RON] });
    expect(html).not.toContain('תוצאות בכל השיחות');
    expect(html).not.toContain('<mark');
  });

  it('a server built before ח: the search still looks through every box — with no box words, and no customers', () => {
    const before = makeContact(13, { name: 'רון אבידן', chat: { open: true } });
    const html = chatList({ search: 'רון', found: 'רון', items: [before], extras: null });
    expect(html).toContain('תוצאות בכל השיחות');
    expect(html).not.toContain(x.place);
    expect(html).not.toContain('לקוח במערכת');
    expect(chatList({ search: '0599', found: '0599', extras: null })).not.toContain('משפחות');
  });

  it('with no search a row is the row it always was', () => {
    const html = chatList({ items: [RON] });
    expect(html).not.toContain('<mark');
    expect(html).not.toContain(x.place);
    expect(html).not.toContain('תוצאות בכל השיחות');
  });
});

function leadRow(id: number, over: Record<string, unknown> = {}): WahubLeadRow {
  return readLeadRow({
    contact_id: id,
    name: 'תמר אוחיון',
    phone: '972505550115',
    stage: 'needs_reply',
    stage_label: 'שאל ולא קיבל מענה',
    owner: 'office',
    summary: 'שאלה על קפוארה לבן 5',
    chips: {},
    next: { who: 'office', what: 'לענות על השאלה', when: null, state: 'none' },
    list: 'office',
    list_label: 'מחכים לך',
    ...over,
  }) as WahubLeadRow;
}

const LEAD_COUNTS = { office: 2, bot: 2, closed: 0, waiting: 4, waiting_act: 3 };

function leadsNode(over: Partial<LeadsListProps> = {}): React.ReactElement {
  return (
    <LeadsList
      view="office"
      counts={LEAD_COUNTS}
      stage={null}
      stages={[]}
      search=""
      status="ready"
      error=""
      rows={[leadRow(15)]}
      stale={false}
      hasMore={false}
      loadingMore={false}
      refreshing={false}
      selectedId={null}
      now={NOW}
      sendingOn={false}
      onView={noop}
      onStage={noop}
      onSearch={noop}
      onOpen={noop}
      onMore={noop}
      onRetry={noop}
      {...over}
    />
  );
}

describe('a search of the leads looks through every list', () => {
  const WAITING_ROW = leadRow(15, { stage: 'waiting_list', stage_label: 'ברשימת המתנה', list: 'waiting', list_label: 'מחכים שיתפנה מקום' });

  it('it says so, no tab is in front, and each result says which list it stands in', () => {
    const html = render(leadsNode({ search: 'תמר', found: 'תמר', everywhere: true, rows: [WAITING_ROW] }));
    expect(html).toContain('תוצאות בכל הלידים');
    expect(html).toContain('· תוצאה אחת');
    expect(html).not.toContain('aria-selected="true"');
    expect(html).toMatch(new RegExp(`class="${x.place}">מחכים שיתפנה מקום<`));
    expect(html).toContain(`<mark class="${x.hit}">תמר</mark>`);
    // The states belong to one list: there is no filter by state among every list's results.
    expect(html).not.toContain('סינון לפי מצב');
  });

  it('a press on a tab leaves the search for that list', () => {
    const onView = vi.fn();
    const onSearch = vi.fn();
    const made = drawn(leadsNode({ search: 'תמר', found: 'תמר', everywhere: true, onView, onSearch }));
    const bot = made.find((element) => element.props.role === 'tab' && words(element.props.children).startsWith('הבוט מטפל'));
    (bot!.props.onClick as () => void)();
    expect(onSearch).toHaveBeenCalledWith('');
    expect(onView).toHaveBeenCalledWith('bot');
  });

  it('a number that matched is shown on the row, marked; and why a row was found by the family', () => {
    const html = render(leadsNode({ search: '0505550115', found: '0505550115', everywhere: true, rows: [leadRow(15, { found_by: null })] }));
    expect(html).toContain(`<mark class="${x.hit}">050-555-0115</mark>`);
    const byParent = render(leadsNode({ search: 'שירן', found: 'שירן', everywhere: true, rows: [leadRow(13, { name: 'רון אבידן', found_by: { kind: 'parent', label: 'הורה', value: 'שירן אבידן' } })] }));
    expect(byParent).toContain('נמצא לפי: הורה — ');
  });

  it('nothing found: what was looked for — and whoever the system does know: a conversation, a customer', () => {
    const onOpenChat = vi.fn();
    const extras = {
      ...EXTRAS,
      contacts: readSearchExtras({ contacts: [{ id: 17, name: 'גלית מור', phone_display: '050-555-0117', box_label: 'הבוט עונה', customer: null }] })!.contacts,
    };
    const node = leadsNode({ search: '054-7000190', found: '054-7000190', everywhere: true, rows: [], extras, onOpenChat });
    const html = render(node);
    expect(html).toContain('<h3>לא נמצא ליד עם המספר הזה</h3>');
    expect(html).toContain('נמצא בשיחות — לא ברשימת הלידים');
    expect(html).toContain('גלית מור');
    expect(html).toContain('לקוח במערכת — אין שיחה בוואטסאפ');
    expect(html).toContain('href="/customers?child=child-901"');
    const [toChat] = pressable(drawn(node), 'לשיחה');
    (toChat.props.onClick as () => void)();
    expect(onOpenChat).toHaveBeenCalledWith(17);
  });

  it('a server built before ח searches in the list in front, as it did: its tab stays on, and nothing is added', () => {
    const html = render(leadsNode({ search: 'תמר', found: 'תמר', everywhere: false }));
    expect(html).not.toContain('תוצאות בכל הלידים');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain('<mark');
    expect(html).not.toContain(x.place);
  });
});

// ---------------------------------------------------------------------------
// ה. "מחכים שיתפנה מקום", and the summary of what was asked for
// ---------------------------------------------------------------------------

const SUMMARY = readWaitingSummary({
  sentence: 'רצו *קפוארה גן חובה* ביום שלישי 17:00 במינץ, לבת 5 · ממתינים מ-11.10, ראשונים בתור',
  entry_id: 7,
  state: 'freed',
  state_label: 'התפנה מקום',
  needs_office: true,
  wanted: { course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', end: '17:45', branch: 'מינץ', city: 'פתח תקווה', instructor: 'יוסי כהן', ages: 'גיל 4.5-6', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ', exists: true },
  child: 'בת 5',
  since: '2026-10-11T08:40:00+00:00',
  since_label: '11.10',
  position: 1,
  queue: 3,
  position_label: 'ראשונים בתור · 3 ממתינים',
  seats: { enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד' },
  phone_display: '050-1234567',
  tel: 'tel:+972501234567',
  customer: { family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' },
  alternatives: [
    { lesson_id: '1c2d', label: 'קפוארה גן חובה · יום חמישי · 17:00 · מינץ', kind: 'same_course', kind_label: 'מועד אחר של אותו חוג', seats_label: 'נשארו 6' },
    { lesson_id: '2d3e', label: 'קפוארה כיתות א׳–ב׳ · יום שני · 16:00 · מינץ', kind: 'same_branch', kind_label: 'חוג אחר באותו סניף', seats_label: 'נשאר מקום אחד' },
  ],
  alternatives_note: '',
}) as WahubWaitingSummary;

describe('"מחכים שיתפנה מקום": a title of its own', () => {
  it('the line above the lists carries the name, how many wait, and — in green — how many call on the office', () => {
    const html = render(<WaitingWay counts={{ waiting: 2, freed: 3 }} people={4} act={3} onOpen={noop} />);
    expect(html).toContain('<strong>מחכים שיתפנה מקום</strong> · 4 ממתינים');
    expect(html).toContain('3 דורשים אותך');
    expect(html).not.toContain('מחכים לך');
    // Nobody calls on the office: quiet, with no news.
    const quiet = render(<WaitingWay counts={{ waiting: 2, freed: 0 }} people={2} act={0} onOpen={noop} />);
    expect(quiet).not.toContain('דורש');
    expect(quiet).toContain('2 ממתינים');
  });

  it('a server that does not say who calls on the office: the freed places are what is counted, as before', () => {
    const html = render(<WaitingWay counts={{ waiting: 5, freed: 2 }} onOpen={noop} />);
    expect(html).toContain('<strong>מחכים שיתפנה מקום</strong> · 7 ממתינים');
    expect(html).toContain('התפנה מקום ל-2');
  });

  it('the screen itself carries the name, and the same two numbers', () => {
    const page = readWaitingListPage({ counts: { waiting: 1, freed: 2 }, lessons: [], results: [] }) as WahubWaitingListPage;
    const html = render(
      <WaitingListView status="ready" error="" page={page} people={4} act={3} now={NOW} refreshing={false} toggledLessons={{}} toggledEntries={{}} busy={null} onBack={noop} onToggleLesson={noop} onToggleEntry={noop} onAct={noop} onOpenChat={noop} onRetry={noop} />,
    );
    expect(html).toContain('>מחכים שיתפנה מקום</h2>');
    expect(html).toContain('4 ממתינים');
    expect(html).toContain('<strong>3 דורשים אותך</strong>');
  });

  it('the day\'s tab: one line of its own at the foot of "מחכים לך" — which no longer holds them', () => {
    const page = readLeadsPage({ counts: LEAD_COUNTS, results: [] });
    const onOpenWaiting = vi.fn();
    const node = <TodayLeadsCard page={page} now={NOW} sendingOn={false} onOpenList={noop} onOpenLead={noop} onOpenWaiting={onOpenWaiting} />;
    const html = render(node);
    expect(html).toContain('<strong>מחכים שיתפנה מקום</strong> · 4 ממתינים');
    expect(html).toContain('3 דורשים אותך');
    const row = drawn(node).find((element) => element.type === 'button' && words(element.props.children).startsWith('מחכים שיתפנה מקום'));
    (row!.props.onClick as () => void)();
    expect(onOpenWaiting).toHaveBeenCalledTimes(1);
  });

  it('…nobody waits, or a server that does not list them apart: no such line', () => {
    const none = readLeadsPage({ counts: { ...LEAD_COUNTS, waiting: 0, waiting_act: 0 }, results: [] });
    expect(render(<TodayLeadsCard page={none} now={NOW} sendingOn={false} onOpenList={noop} onOpenLead={noop} onOpenWaiting={noop} />)).not.toContain('מחכים שיתפנה מקום');
    const before = readLeadsPage({ counts: { office: 2, bot: 2, closed: 0 }, results: [] });
    expect(render(<TodayLeadsCard page={before} now={NOW} sendingOn={false} onOpenList={noop} onOpenLead={noop} onOpenWaiting={noop} />)).not.toContain('מחכים שיתפנה מקום');
  });
});

describe('"מה רצו": the first thing to read about somebody who waits', () => {
  it('the sentence, large, with the class\'s name bold; where the entry stands; the lesson right now', () => {
    const html = render(<WantedBlock summary={SUMMARY} />);
    expect(html).toContain('aria-label="מה רצו"');
    expect(html).toMatch(new RegExp(`class="${x.wantedSentence}"[^>]*><span>רצו </span><strong>קפוארה גן חובה</strong><span> ביום שלישי 17:00 במינץ, לבת 5`));
    expect(html).toContain(x.wantedStateAct);
    expect(html).toContain('התפנה מקום');
    expect(html).toContain('בשיעור עכשיו: <b>19 מתוך 20 · נשאר מקום אחד</b>');
    // A place is free: the block stands out.
    expect(html).toContain(x.wantedAct);
  });

  it('the number to call is one button — a link the phone dials', () => {
    const html = render(<WantedBlock summary={SUMMARY} />);
    expect(html).toMatch(/<a href="tel:\+972501234567"[^>]*aria-label="להתקשר ל-050-1234567"/);
    expect(html).toContain('>050-1234567</span>');
    // No number that can be dialled: no button, rather than one that does nothing.
    expect(render(<WantedBlock summary={{ ...SUMMARY, tel: '' }} />)).not.toContain('href="tel:');
  });

  it('"אפשר להציע במקום": every lesson that has room now, a row each, with how many places are left', () => {
    const html = render(<WantedBlock summary={SUMMARY} />);
    const offer = html.slice(html.indexOf('אפשר להציע במקום'));
    expect(offer).toContain('קפוארה גן חובה · יום חמישי · 17:00 · מינץ');
    expect(offer).toContain('>נשארו 6<');
    expect(offer).toContain('מועד אחר של אותו חוג');
    expect(offer).toContain('>נשאר מקום אחד<');
    expect(offer.split(x.offerRow + '"').length - 1).toBe(2);
  });

  it('nothing to offer: said plainly, in the server\'s words or the screen\'s', () => {
    const note = 'אין כרגע מועד אחר עם מקום — לא באותו חוג ולא בחוג דומה באותה עיר';
    expect(render(<WantedBlock summary={{ ...SUMMARY, alternatives: [], alternatives_note: note }} />)).toContain(note);
    expect(render(<WantedBlock summary={{ ...SUMMARY, alternatives: [] }} />)).toContain('אין כרגע מועד אחר עם מקום');
  });

  it('the short lines wait behind "כל הפרטים" — a title first, the rest on a press', () => {
    const html = render(<WantedBlock summary={SUMMARY} />);
    expect(html).toMatch(/<details class="[^"]*"><summary>כל הפרטים/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('<dt>מדריך</dt><dd dir="auto">יוסי כהן</dd>');
    expect(html).toContain('<dt>בתור</dt><dd dir="auto">ראשונים בתור · 3 ממתינים</dd>');
  });

  it('a lesson that no longer takes place: said, with nothing offered against it', () => {
    const gone = { ...SUMMARY, wanted: { ...SUMMARY.wanted, exists: false }, alternatives: [], alternatives_note: '' };
    const html = render(<WantedBlock summary={gone} />);
    expect(html).toContain('השיעור הזה כבר לא מתקיים');
    expect(html).not.toContain('אפשר להציע במקום');
  });

  it('"לכרטיס הלקוח" stands beside the number only where the screen around the block does not carry it', () => {
    expect(render(<WantedBlock summary={SUMMARY} />)).not.toContain('לכרטיס הלקוח');
    expect(render(<WantedBlock summary={SUMMARY} showCard />)).toContain('href="/customers?child=c1"');
    expect(render(<WantedBlock summary={{ ...SUMMARY, customer: null }} showCard />)).not.toContain('לכרטיס הלקוח');
  });

  it('in the line of its own lesson (the full list) it adds only what is new there: the number, and what to offer', () => {
    const html = render(<WantedBlock summary={SUMMARY} compact bare />);
    expect(html).toContain('href="tel:+972501234567"');
    expect(html).toContain('אפשר להציע במקום');
    expect(html).not.toContain(x.wantedSentence);
    expect(html).not.toContain('בשיעור עכשיו');
    expect(html).not.toContain('כל הפרטים');
    expect(html).not.toContain(x.wantedAct);
  });

  it('whoever still waits: quiet — no green, and the state said in a quiet word', () => {
    const html = render(<WantedBlock summary={{ ...SUMMARY, state: 'waiting', state_label: 'ממתין', needs_office: false }} />);
    expect(html).not.toContain(x.wantedAct);
    expect(html).not.toContain(x.wantedStateAct);
    expect(html).toContain('ממתין');
  });
});

const LEAD_DETAILS: WahubLeadDetails = { reason: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00 (מינץ)', blocker_text: '', child: null, come_back_on: null, come_back_why: '', trial: null, followups: [], timeline: [], in_system: null };
const FREED_MARK = { status: 'freed', status_label: 'התפנה מקום', entry_id: 7, lesson_id: 'l1', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', branch: 'מינץ', child: 'בת 5', since: '2026-10-11T08:40:00+00:00', freed_at: '2026-10-13T07:05:00+00:00', title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00', more: 0, notified_at: null, state: 'freed', state_label: 'התפנה מקום', needs_office: true, position: 1, queue: 3 };
const WAITING_LEAD = leadRow(15, { stage: 'waiting_list', stage_label: 'ברשימת המתנה', summary: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00 (מינץ)', next: { who: 'office', what: 'להציע ללקוח את המקום שהתפנה', when: null, state: 'none' }, list: 'waiting', list_label: 'מחכים שיתפנה מקום', waiting_list: FREED_MARK, customer: { family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' } });
const ENTRY = readWaitingEntry({ id: 7, status: 'freed', status_label: 'התפנה מקום', lesson: { id: 'l1', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ' }, child: 'בת 5', created_at: '2026-10-11T08:40:00+00:00', freed_at: '2026-10-13T07:05:00+00:00', position: 1, notified_at: null, customer: null })!;

function leadDetails(over: Partial<LeadDetailsProps> = {}): string {
  return render(
    <LeadDetails
      lead={WAITING_LEAD}
      details={{ ...LEAD_DETAILS, waiting_summary: SUMMARY, waiting_list_entries: [ENTRY] }}
      status="ready"
      error=""
      now={NOW}
      sendingOn={false}
      cover={false}
      busy={null}
      onClose={noop}
      onRetry={noop}
      onOpenChat={noop}
      onChange={noop}
      onWaiting={noop}
      notify={{ open: null, onStart: noop, onSend: noop, onClose: noop }}
      {...over}
    />,
  );
}

describe('a lead\'s details, for somebody who waits for a place', () => {
  it('"מה רצו" is the first block — before "מה קורה עכשיו" — and carries what can be done with the entry', () => {
    const html = leadDetails();
    const scroll = html.slice(html.indexOf(l.dScroll));
    expect(scroll.indexOf('aria-label="מה רצו"')).toBeGreaterThan(-1);
    expect(scroll.indexOf('aria-label="מה רצו"')).toBeLessThan(scroll.indexOf('aria-label="מה קורה עכשיו"'));
    const block = scroll.slice(scroll.indexOf('aria-label="מה רצו"'), scroll.indexOf('aria-label="מה קורה עכשיו"'));
    for (const action of ['להודיע ללקוח', 'טופל', 'להסיר מהרשימה']) expect(block).toContain(action);
    expect(block).toContain('href="tel:+972501234567"');
  });

  it('the freed place is said once: the block says it, and the old headline is not drawn beside it', () => {
    const html = leadDetails();
    expect(html).not.toContain(l.freedBox);
    expect(html).not.toContain('aria-label="רשימת המתנה"');
    // Its only entry is the block's own: no list of "more" under it.
    expect(html).not.toContain('עוד ברשימת ההמתנה');
  });

  it('"לכרטיס הלקוח" is among the lead\'s actions — at once, from the row — and not again inside the block', () => {
    const html = leadDetails();
    expect((html.match(/לכרטיס הלקוח/g) ?? []).length).toBe(1);
    const actions = html.slice(html.indexOf(`class="${l.actions}"`), html.indexOf(l.dScroll));
    expect(actions).toContain('href="/customers?child=c1"');
    // Before the details have landed the row itself says who the customer is.
    expect(leadDetails({ details: null, status: 'loading' })).toContain('href="/customers?child=c1"');
  });

  it('while the details are on their way the lesson the row names holds the block\'s place', () => {
    const html = leadDetails({ details: null, status: 'loading' });
    expect(html).toContain('aria-label="מה רצו"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('קפוארה גן חובה · יום שלישי · 17:00 · מינץ');
    expect(html).not.toContain('href="tel:');
  });

  it('whoever only waits can be taken off the list from the block — and nothing else', () => {
    const waiting = { ...SUMMARY, state: 'waiting' as const, state_label: 'ממתין', needs_office: false };
    const entry = { ...ENTRY, status: 'waiting', status_label: 'ממתין', freed_at: null };
    const html = leadDetails({ details: { ...LEAD_DETAILS, waiting_summary: waiting, waiting_list_entries: [entry] } });
    const block = html.slice(html.indexOf('aria-label="מה רצו"'), html.indexOf('aria-label="מה קורה עכשיו"'));
    expect(block).toContain('להסיר מהרשימה');
    expect(block).not.toContain('להודיע ללקוח');
    expect(block).not.toContain('טופל');
  });

  it('a closed lead has no such block', () => {
    const closed = leadRow(15, { stage: 'registered', stage_label: 'נרשם', owner: '', list: 'closed' });
    expect(leadDetails({ lead: closed })).not.toContain('aria-label="מה רצו"');
  });

  it('a server built before ח: the freed place stands as it did, with its actions', () => {
    const before = leadRow(15, { stage: 'waiting_list', waiting_list: { ...FREED_MARK, state: undefined, state_label: undefined, needs_office: undefined, position: undefined, queue: undefined } });
    const html = leadDetails({ lead: before, details: { ...LEAD_DETAILS, waiting_list_entries: [ENTRY] } });
    expect(html).not.toContain('aria-label="מה רצו"');
    expect(html).toContain(l.freedBox);
    expect(html).toContain('להודיע ללקוח');
  });
});

describe('the contact\'s card, for somebody who waits for a place', () => {
  const waitingContact = (summary: unknown) => ({ ...knowing({ waiting_list: FREED_MARK as never }), waiting_summary: summary });

  it('a title first: the mark that says they wait, and — a press away — what they asked for and what to offer', () => {
    const html = card(waitingContact(SUMMARY));
    expect(html).toContain('התפנה מקום בקפוארה גן חובה יום שלישי 17:00');
    expect(html).toMatch(/<details class="[^"]*"><summary>מה רצו, ומה אפשר להציע במקום/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('href="tel:+972501234567"');
    expect(html).toContain('אפשר להציע במקום');
    // Inside the card the block has no title and no ground of its own.
    expect(html).toContain(x.wantedBare);
    expect(html).not.toContain(x.wantedTitle);
  });

  it('no summary — nobody waits, or a server built before it: the card is what it was', () => {
    expect(card(waitingContact(null))).not.toContain('מה רצו');
    expect(card(waitingContact(undefined))).not.toContain('מה רצו');
    expect(card({ ...knowing(), waiting_summary: SUMMARY })).not.toContain('מה רצו');
  });
});

describe('a row of the full waiting list: the way to the customer\'s card', () => {
  const view = (over: Partial<React.ComponentProps<typeof WaitingActionsView>> = {}) =>
    render(<WaitingActionsView name="תמר אוחיון" lesson="קפוארה" status="freed" busy={null} asking={false} onAsk={noop} onAct={noop} onOpenChat={noop} {...over} />);

  it('for somebody Kogo knows: "לכרטיס הלקוח", quietly beside "פתח שיחה"', () => {
    const html = view({ customerCard: '/customers?child=c1' });
    expect(html).toMatch(/<a [^>]*href="\/customers\?child=c1"[^>]*>.*לכרטיס הלקוח<\/a>/);
    expect(html.indexOf('פתח שיחה')).toBeLessThan(html.indexOf('לכרטיס הלקוח'));
    // …for whoever only waits, too.
    expect(view({ status: 'waiting', customerCard: '/customers?child=c1' })).toContain('לכרטיס הלקוח');
  });

  it('nobody Kogo knows: no such link', () => {
    expect(view()).not.toContain('לכרטיס הלקוח');
    expect(view({ customerCard: null })).not.toContain('לכרטיס הלקוח');
  });

  it('the number to call and what to offer stand in a person\'s opened row, above the actions', () => {
    const page = readWaitingListPage({
      counts: { waiting: 0, freed: 1 },
      lessons: [{ id: 'l1', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', branch: 'מינץ', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ', exists: true, enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד', waiting: 0, freed: 1, entry_ids: [7] }],
      results: [{ id: 7, contact_id: 15, name: 'תמר אוחיון', status: 'freed', status_label: 'התפנה מקום', lesson: { id: 'l1', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ' }, child: 'בת 5', created_at: '2026-10-11T08:40:00+00:00', freed_at: '2026-10-13T07:05:00+00:00', position: 1, notified_at: null, customer: { family_id: 'f1', child_id: 'c1', link: '/customers?child=c1' } }],
    }) as WahubWaitingListPage;
    const html = render(
      <WaitingListView status="ready" error="" page={page} now={NOW} refreshing={false} toggledLessons={{}} toggledEntries={{}} busy={null} notify={{ open: null, onStart: noop, onSend: noop, onClose: noop }} onBack={noop} onToggleLesson={noop} onToggleEntry={noop} onAct={noop} onOpenChat={noop} onRetry={noop} renderSummary={(entry) => <WantedBlock summary={{ ...SUMMARY, entry_id: entry.id }} compact bare />} />,
    );
    expect(html.indexOf('href="tel:+972501234567"')).toBeGreaterThan(-1);
    expect(html.indexOf('href="tel:+972501234567"')).toBeLessThan(html.indexOf('להודיע ללקוח'));
    expect(html).toContain('href="/customers?child=c1"');
  });
});

// ---------------------------------------------------------------------------
// ו. "דיוק" works together with "ללמד"
// ---------------------------------------------------------------------------

const ORIGIN = { kind: 'conversation', label: 'מתוך שיחה עם דנה לוי', contact_id: 12, contact_name: 'דנה לוי', link: '/wahub?tab=chats&contact=12' };
const QUOTES = { quotes: [{ kind: 'message', id: 501, who: 'customer', who_label: 'לקוח', text: 'כמה עולה?' }] };

function teachCard(raw: unknown, over: Partial<TeachCardViewProps> = {}): React.ReactElement {
  const thread = readTeachThread(raw);
  if (!thread) throw new Error('the fixture is not a teach thread');
  return (
    <TeachCardView thread={thread} busy={null} said="" saidAt={0} error="" unsent="" previewStalled={false} checkStalled={false} fixing={false} confirmingUndo={false} onApprove={noop} onSay={noop} onUndo={noop} onFixing={noop} onConfirmingUndo={noop} onClose={noop} {...over} />
  );
}

function drawer(over: Partial<TeachDrawerViewProps> = {}): React.ReactElement {
  return (
    <TeachDrawerView
      contactName="דנה לוי"
      excerpt={[{ id: 501, who: 'customer', label: 'לקוח', text: 'כמה עולה?' }]}
      excerptCount={1}
      phase={{ kind: 'starting', wrote: '', since: 0 }}
      card={null}
      earlier={[]}
      openId={null}
      now={NOW}
      draft=""
      onDraft={noop}
      onStart={noop}
      onRetry={noop}
      onOpenEarlier={noop}
      onClose={noop}
      {...over}
    />
  );
}

describe('"דיוק" in a conversation opens the very flow of "ללמד"', () => {
  it('it is opened on a conversation where the server offers it — never on a proposal, whose fixing stays what it was', () => {
    expect(opensTeachFlow({ teach: true, contactId: 12 })).toBe(true);
    expect(opensTeachFlow({ teach: true, contactId: 12, proposalId: null })).toBe(true);
    // A proposal — also one that came from a conversation.
    expect(opensTeachFlow({ teach: true, contactId: 12, proposalId: 81 })).toBe(false);
    // A server built before it (nothing says the flow is offered), and an opening with no conversation.
    expect(opensTeachFlow({ contactId: 12 })).toBe(false);
    expect(opensTeachFlow({ teach: false, contactId: 12 })).toBe(false);
    expect(opensTeachFlow({ teach: true, contactId: null })).toBe(false);
  });

  it('the small chat keeps its frame — the marked piece folded at its head, an X, a way back on a phone', () => {
    const html = render(drawer());
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="דיוק"');
    expect(html).toContain('<h2>דיוק</h2>');
    expect(html).toContain('דנה לוי');
    expect(html).toContain('כמה עולה?');
    expect(html).toContain('aria-label="חזרה לשיחה"');
    expect(html).toContain('aria-label="סגור"');
  });

  it('marked messages: the piece is with the bot at once — "קורא את מה שסומן", and nothing to press but the X', () => {
    const node = drawer();
    expect(render(node)).toContain('קורא את מה שסומן');
    expect(drawn(node).filter((element) => element.type === 'textarea')).toHaveLength(0);
  });

  it('"לתקן" on an answer of the bot: she writes first, and an empty box cannot be sent', () => {
    const onStart = vi.fn();
    const node = drawer({ phase: { kind: 'writing', error: '' }, onStart });
    const html = render(node);
    expect(html).toContain('מה לא היה טוב בתשובה הזאת?');
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(render(drawer({ phase: { kind: 'writing', error: '' }, draft: 'ענה בלי לשאול' }))).not.toMatch(/<button type="submit" disabled=""/);
    // What could not be sent is said beside what she wrote, which is still in the box.
    expect(render(drawer({ phase: { kind: 'writing', error: 'לא הצלחתי לפתוח את הדיוק. אפשר לנסות שוב' }, draft: 'ענה בלי לשאול' }))).toContain('role="alert"');
  });

  it('the opening failed: said, with a way to try again — never a blank chat', () => {
    const onRetry = vi.fn();
    const node = drawer({ phase: { kind: 'failed', text: 'לא הצלחתי לפתוח את הדיוק. אפשר לנסות שוב', wrote: '' }, onRetry });
    expect(render(node)).toContain('לא הצלחתי לפתוח את הדיוק');
    const [again] = pressable(drawn(node), 'נסה שוב');
    (again.props.onClick as () => void)();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the system speaks first: a summary of the piece under three small titles, and the question', () => {
    const opening = rawTeachThread({ origin: ORIGIN, context: QUOTES, text: '', understood: '', changes: [], preview: null, needs_approval: false, needs_answer: true, question: 'מה לא היה טוב כאן?', summary: { what_happened: 'הלקוח שאל כמה עולה חוג.', what_was_answered: 'הבוט ענה מחיר מיד.', suspected_issue: 'לא נשאל על איזה חוג.' } });
    const html = render(teachCard(opening, { inChat: true }));
    expect(html).toContain('סיכום חכם');
    for (const title of ['מה קרה', 'מה נענה', 'מה נראה לא טוב']) expect(html).toContain(`<dt>${title}</dt>`);
    expect(html).toContain('מה לא היה טוב כאן?');
    // Not the words of a question asked in the middle of a teaching.
    expect(html).not.toContain('לפני שאני משנה משהו, שאלה אחת');
    expect(html).toContain('<textarea');
  });

  it('then it is "ללמד", part for part: understood, what would change, an example, "מאשר" and "לא בדיוק"', () => {
    const node = teachCard(rawTeachThread({ origin: ORIGIN, context: QUOTES }), { inChat: true });
    const html = render(node);
    for (const part of ['הבנתי כך', 'דוגמה', 'מאשר', 'לא בדיוק']) expect(html).toContain(part);
    expect(html).toContain('aria-label="מה ישתנה"');
    const onApprove = vi.fn();
    const [approve] = pressable(drawn(teachCard(rawTeachThread({ origin: ORIGIN }), { inChat: true, onApprove })), 'מאשר');
    (approve.props.onClick as () => void)();
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('after "מאשר": "נשמר", and the line of the check', () => {
    const html = render(teachCard(rawTeachSaved({ origin: ORIGIN }), { inChat: true }));
    expect(html).toContain('נשמר');
    expect(html).toMatch(/בדקתי .* הבוט עונה נכון/);
  });

  it('inside the chat the card does not say again what the chat already says: no X of its own, no origin, no quotes', () => {
    const html = render(teachCard(rawTeachThread({ origin: ORIGIN, context: QUOTES }), { inChat: true }));
    expect(html).toContain(t.inChat);
    expect(html).not.toContain(t.close);
    expect(html).not.toContain('מתוך שיחה עם דנה לוי');
    expect(html).not.toContain('על מה זה נכתב');
  });

  it('what was taught from this conversation before: a title and how many; the one that is open is not listed', () => {
    const rows = readTeachPage({ count: 2, next: null, results: [rawTeachRow(41, { origin: ORIGIN }), rawTeachRow(40, { origin: ORIGIN, understood: 'שעות המשרד נאמרות מיד' })] })!.results;
    const html = render(drawer({ phase: { kind: 'thread', id: 41 }, openId: 41, earlier: rows }));
    expect(html).toMatch(/מה נלמד מהשיחה הזאת <span[^>]*>\(1\)<\/span>/);
    expect(html).toContain('שעות המשרד נאמרות מיד');
    const onOpenEarlier = vi.fn();
    const made = drawn(drawer({ phase: { kind: 'thread', id: 41 }, openId: 41, earlier: rows, onOpenEarlier }));
    const row = made.find((element) => element.type === 'button' && words(element.props.children).includes('שעות המשרד'));
    (row!.props.onClick as () => void)();
    expect(onOpenEarlier).toHaveBeenCalledWith(40);
    expect(render(drawer())).not.toContain('מה נלמד מהשיחה הזאת');
  });
});

describe('what "דיוק" taught is part of "ללמד"', () => {
  it('"מה לימדת עד היום" says where a line was taught from', () => {
    const rows = readTeachPage({ count: 2, next: null, results: [rawTeachRow(41, { origin: ORIGIN }), rawTeachRow(40)] })!.results;
    const html = render(
      <TeachHistory rows={rows} count={2} openId={null} askingId={null} undoingId={null} rowError={null} more={false} loadingMore={false} now={NOW} onOpen={noop} onAskUndo={noop} onUndo={noop} onMore={noop} />,
    );
    expect((html.match(/מתוך שיחה עם דנה לוי/g) ?? []).length).toBe(1);
    expect(html).toContain(t.rowOrigin);
  });

  it('opened there, the card says where it was born, leads back to that conversation, and quotes what it was written about', () => {
    const html = render(teachCard(rawTeachThread({ origin: ORIGIN, context: QUOTES })));
    expect(html).toContain('מתוך שיחה עם דנה לוי');
    expect(html).toMatch(/<a [^>]*href="\/wahub\?tab=chats&amp;contact=12"[^>]*>לשיחה<\/a>/);
    expect(html).toMatch(/<details class="[^"]*"><summary>על מה זה נכתב/);
    expect(html).toContain('כמה עולה?');
  });

  it('a thread that was written freely says nothing of the kind', () => {
    const html = render(teachCard(rawTeachThread()));
    expect(html).not.toContain('מתוך שיחה');
    expect(html).not.toContain('על מה זה נכתב');
  });
});

describe('the stylesheet of this round keeps to the section\'s rules', () => {
  it('a phone: the number to call and the ways beside it are a finger tall; red is asked for by name only for "מבקש נציג"; "reduce motion" stops what it adds', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, 'search.module.css'), 'utf8');
    expect(css).toMatch(/\.call\s*\{[^}]*min-height:\s*44px/);
    const phone = css.slice(css.indexOf('@media (max-width: 767px)'));
    expect(phone).toMatch(/\.wantedWays > \*\s*\{[^}]*min-height:\s*44px/);
    expect(phone).toMatch(/\.besideActs > \*\s*\{[^}]*min-height:\s*44px/);
    const red = css.split('}').filter((rule) => /var\(--bad/.test(rule));
    expect(red).toHaveLength(1);
    expect(red[0]).toContain('.placeAsk');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.call[^@]*transition:\s*none/);
    // The number stands on navy: the section's own rule for links must not paint it navy as well.
    expect(css).toMatch(/\.wanted a\.call[^{]*\{[^}]*color:\s*#fff/);
  });
});
