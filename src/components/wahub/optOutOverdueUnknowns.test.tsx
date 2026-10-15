import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import BroadcastWhatsAppDialog from '@/components/dialogs/BroadcastWhatsAppDialog';
import { BroadcastRun, type ChunkReply, type ChunkRequest } from '@/lib/broadcastRun';
import { readLeadRow } from '@/lib/wahub/leadsV2';
import { sortChats } from '@/lib/wahub/live';
import { OPT_OUT_TEXT } from '@/lib/wahub/optOut';
import { applyOverdue } from '@/lib/wahub/overdue';
import { readTeachPage, readTeachThread } from '@/lib/wahub/teach';
import { makeContact } from '@/lib/wahub/testFixtures';
import { readUnknowns } from '@/lib/wahub/unknowns';
import { readWaitingEntry } from '@/lib/wahub/futureLeads';
import type { BroadcastRow } from '@/lib/whatsappApi';
import type { WahubBoxCounts, WahubContact, WahubContactDetail, WahubLeadDetails, WahubLeadRow } from '@/types/wahub';
import type { WahubUnknowns } from '@/types/wahubUnknowns';
import BotTab from './bot/BotTab';
import { TeachCardView } from './bot/teach/TeachCard';
import TeachHistory from './bot/teach/TeachHistory';
import { UnknownsView, type UnknownsViewProps } from './bot/teach/Unknowns';
import u from './bot/teach/unknowns.module.css';
import ChatList from './chats/ChatList';
import ChatThread, { type ThreadFutureActions } from './chats/ChatThread';
import ContactPanel from './chats/ContactPanel';
import type { ContactThread } from './hooks/useContactThread';
import { LeadActionsView } from './leads/v2/LeadActions';
import LeadDetails from './leads/v2/LeadDetails';
import LeadRow from './leads/v2/LeadRow';
import { WaitingActionsView } from './leads/v2/WaitingBits';
import k from './marks.module.css';
import { RefineProvider } from './refine/RefineContext';
import { OptOutCard, OptOutMarkLink } from './shared/MarkParts';
import s from './wahub.module.css';

// Nothing here may reach a server.
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'מיכל', branch_ids: [] }, loading: false }),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * The owner's requests of 13.10.2026, evening (docs/WAHUB-MASTER-PLAN-2026-10-12.md, יב;
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט), as the screens show them:
 *
 *   1. "ביקש הסר" — a quiet mark, its details a press away, the way back that asks first, and every press that
 *      would send something by itself locked, with the reason;
 *   2. whoever waits for a person more than three office hours — pinned to the head of the conversations, the
 *      mark of the wait breathing softly;
 *   3. "מה הבוט לא ידע השבוע" — at the head of "ללמד".
 *
 * Beside each: that a server built before it is shown exactly what it was shown before. Every name here is invented.
 */

/** Tuesday, 13.10.2026, 14:30 in Israel. */
const NOW = new Date('2026-10-13T11:30:00Z');
const TODAY = '2026-10-13';
const noop = () => {};

function render(node: React.ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })): string {
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

/** The text a person reads, without the markup. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------

const BY_MESSAGE = { at: '2026-10-13T08:02:00+00:00', source: 'message' as const, source_label: 'ביקש בהודעה', by_name: '', text: 'הסר', label: 'ביקש הסר' };
const BY_OFFICE = { at: '2026-10-12T09:15:00+00:00', source: 'office' as const, source_label: 'סומן על ידי נציג', by_name: 'מיכל כהן', text: '', label: 'ביקש הסר' };

type Over = Parameters<typeof makeContact>[1];

/** A conversation of a server that knows the evening of 13.10: `chat.overdue` and `opted_out` on every contact. */
function knowing(id: number, over: Over = {}): WahubContact {
  const { chat, ...rest } = over ?? {};
  return makeContact(id, {
    opted_out: null,
    ...rest,
    chat: { open: true, open_reason: 'human', open_label: 'בטיפול נציג', box: 'human', box_label: 'בטיפול נציג', handled_by: 'human', overdue: false, waited_office_minutes: null, waiting_label: '', waiting_from: null, ...chat },
  });
}

const late = (id: number, name: string, from: string, label: string, last: string) =>
  knowing(id, { name, last_message_at: last, chat: { overdue: true, waited_office_minutes: 200, waiting_label: label, waiting_from: from, waiting_since: from } });

const SHIRA = late(19, 'שירה גולן', '2026-10-13T07:55:00+00:00', 'מחכה 3:35 שע׳', '2026-10-13T07:55:00+00:00');
const ALON = late(20, 'אלון ביטון', '2026-10-13T08:20:00+00:00', 'מחכה 3:10 שע׳', '2026-10-13T08:22:00+00:00');
const DANA = knowing(11, { name: 'דנה לוי', last_message_at: '2026-10-13T11:16:00+00:00', chat: { waiting_label: 'מחכה 14 דק׳', waited_office_minutes: 14, waiting_from: '2026-10-13T11:16:00+00:00' } });
const NOA = knowing(18, { name: 'נועה פרידמן', last_message_at: '2026-10-13T10:10:00+00:00' });
const IDO = knowing(22, { name: 'עידו שמש', last_message_at: '2026-10-13T08:03:00+00:00', opted_out: BY_MESSAGE, chat: { open: false, open_reason: '', handled_by: 'bot', box: 'all', box_label: 'הבוט עונה' } });

const COUNTS: WahubBoxCounts = { all: 13, waiting: 5, needs_human: 2, unread: 6, human: 5, bot: 7, open: 8, future: 1, overdue: 2 };

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

/** The rows of the list, in the order they are drawn: what each `<li>` says. */
function listItems(html: string): string[] {
  const list = html.slice(html.indexOf('<ul'), html.lastIndexOf('</ul>'));
  return list.split('<li').slice(1).map((item) => text(`<li${item}`));
}

function detail(contact: WahubContact): WahubContactDetail {
  return { ...contact, messages: [], has_older: false, events: [], notes: [] };
}

function thread(contact: WahubContactDetail): ContactThread {
  return {
    contactId: contact.id,
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

const ACTIONS: ThreadFutureActions = {
  today: TODAY,
  closeBusy: false,
  onClose: noop,
  onHandToBot: async () => ({ error: '' }),
  onFuture: async () => ({ error: '' }),
  onNote: async () => '',
};

function conversation(contact: WahubContact, over: Partial<React.ComponentProps<typeof ChatThread>> = {}): string {
  return render(
    <RefineProvider>
      <ChatThread
        thread={thread(detail(contact))}
        now={NOW}
        visible
        simulated={false}
        sendingOff
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
        future={ACTIONS}
        {...over}
      />
    </RefineProvider>,
  );
}

/** The conversation's title row alone. */
const titleRow = (html: string) => html.slice(html.indexOf(`class="${s.threadHead}"`), html.indexOf('</header>'));

function cardNode(contact: WahubContact, over: Partial<React.ComponentProps<typeof ContactPanel>> = {}): React.ReactElement {
  return (
    <ContactPanel
      contact={detail(contact)}
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
      optOut={{ onMark: async () => '', onBack: async () => '' }}
      {...over}
    />
  );
}

const card = (contact: WahubContact, over: Partial<React.ComponentProps<typeof ContactPanel>> = {}) => render(cardNode(contact, over));

// ---------------------------------------------------------------------------
// 2. Waiting for a person more than three office hours
// ---------------------------------------------------------------------------

describe('whoever waits for a person more than three office hours is pinned to the head of the conversations', () => {
  // The list as the screen holds it: in the server's own order.
  const LIST = sortChats([DANA, NOA, ALON, SHIRA], true);

  it('one quiet line stands over them, with how many — and the longest wait is first', () => {
    const html = chatList({ items: LIST });
    const items = listItems(html);
    expect(items[0]).toBe('מחכים יותר מ-3 שעות (2)');
    expect(items[1]).toContain('שירה גולן');
    expect(items[2]).toContain('אלון ביטון');
    // A thin line, and then the rest by the last message.
    expect(html).toContain(`<li class="${k.pinEnd}" role="separator"`);
    expect(items[3]).toBe('');
    expect(items[4]).toContain('דנה לוי');
    expect(items[5]).toContain('נועה פרידמן');
  });

  it('the mark of the wait carries the server\'s words, and breathes: marked for the stylesheet, and said in words too', () => {
    const html = chatList({ items: LIST });
    const mark = html.match(new RegExp(`<span class="[^"]*${k.late}[^"]*"[^>]*>.*?</span></span>`))?.[0] ?? '';
    expect(mark).toContain('data-overdue=""');
    expect(mark).toContain('מחכה 3:35 שע׳');
    expect(mark).toContain(s.pWarn);
    // Never by the motion alone: a reader that does not see the page is told it is late.
    expect(mark).toContain('<span class="sr-only"> – יותר משלוש שעות</span>');
    expect(mark).toContain('נספרות שעות המשרד בלבד');
    // Amber — red stays for "מבקש נציג".
    expect(mark).not.toContain(s.pBad);
  });

  it('somebody who waits less than three hours carries the words, and no pulse; who does not wait for a person carries nothing', () => {
    const items = chatList({ items: LIST });
    const dana = items.slice(items.indexOf('דנה לוי'), items.indexOf('נועה פרידמן'));
    expect(dana).toContain('מחכה 14 דק׳');
    expect(dana).not.toContain(k.late);
    expect(dana).not.toContain('data-overdue');
    const noa = items.slice(items.indexOf('נועה פרידמן'));
    expect(noa).not.toContain('מחכה');
  });

  it('a conversation crosses the three hours with nobody touching it: the poll names it, and it rises under the line — no reload', () => {
    const before = sortChats([DANA, NOA, SHIRA], true);
    expect(listItems(chatList({ items: before }))[0]).toBe('מחכים יותר מ-3 שעות (1)');
    // What `updates/` says a moment later: דנה is past the line now too.
    const laid = applyOverdue(before, [
      { id: 19, waited_office_minutes: 216, waiting_label: 'מחכה 3:36 שע׳', waiting_from: '2026-10-13T07:55:00+00:00' },
      { id: 11, waited_office_minutes: 180, waiting_label: 'מחכה 3:00 שע׳', waiting_from: '2026-10-13T08:30:00+00:00' },
    ]);
    const items = listItems(chatList({ items: sortChats(laid, true) }));
    expect(items[0]).toBe('מחכים יותר מ-3 שעות (2)');
    expect(items[1]).toContain('שירה גולן');
    expect(items[1]).toContain('מחכה 3:36 שע׳');
    expect(items[2]).toContain('דנה לוי');
    expect(items[2]).toContain('מחכה 3:00 שע׳');
  });

  it('…and once the clock stopped — an answer, ✓ — it goes back to its place, and the line goes with the last of them', () => {
    const laid = applyOverdue(sortChats([DANA, NOA, SHIRA], true), []);
    const html = chatList({ items: sortChats(laid, true) });
    expect(html).not.toContain('מחכים יותר מ-3 שעות');
    expect(html).not.toContain('data-overdue');
    expect(html).not.toContain(k.pinEnd);
  });

  it('a search keeps its own order and pins nobody — but who is late still says so', () => {
    const html = chatList({ items: [DANA, SHIRA], search: 'גולן', found: 'גולן' });
    expect(html).not.toContain('מחכים יותר מ-3 שעות');
    expect(html).not.toContain('data-pinned-head');
    expect(html).toContain('data-overdue');
  });

  it('with more of them a "load more" away, the line says the server\'s own count', () => {
    const html = chatList({ items: LIST, hasMore: true, counts: { ...COUNTS, overdue: 52 } });
    expect(listItems(html)[0]).toBe('מחכים יותר מ-3 שעות (52)');
    // A box that holds only some of them says how many it holds.
    expect(listItems(chatList({ items: LIST, hasMore: true, box: 'needs_human', counts: { ...COUNTS, overdue: 52 } }))[0]).toBe('מחכים יותר מ-3 שעות (2)');
  });

  it('the head of the open conversation carries the same mark, on a line of its own under the name', () => {
    const row = titleRow(conversation(ALON));
    expect(row).toContain(`<p class="${k.headMarks}">`);
    expect(row).toContain('data-overdue=""');
    expect(row).toContain('מחכה 3:10 שע׳');
    expect(row).toContain(k.late);
    // A phone has one line under the name: how long they wait leads it.
    const status = row.slice(row.indexOf(`class="${s.threadStatus}"`));
    expect(text(status.slice(0, status.indexOf('</button>')))).toMatch(/^[^<]*מחכה 3:10 שע׳ · /);
    expect(status).toContain(k.lateText);
  });

  it('a conversation that does not wait for a person has no such line at its head', () => {
    const row = titleRow(conversation(NOA));
    expect(row).not.toContain(k.headMarks);
    expect(row).not.toContain('מחכה');
  });

  it('the red mark of the menu is not this: `overdue` is a count of its own, and no box of the screen', () => {
    const html = chatList({ items: LIST });
    expect(html).not.toMatch(/<button[^>]*>[^<]*מחכים יותר/);
    // The boxes are the ones there were.
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(7);
  });

  it('the stylesheet: a slow breath of opacity — never a flash — and with "reduce motion" none at all, only emphasis', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, 'marks.module.css'), 'utf8');
    expect(css).toMatch(/\.late\s*\{[^}]*animation:\s*waitBreathe 2\.8s ease-in-out infinite/);
    expect(css).toMatch(/@keyframes waitBreathe\s*\{[^@]*50%\s*\{\s*opacity:\s*0\.62/);
    // Only opacity moves, and nothing here is red.
    const breath = css.slice(css.indexOf('@keyframes waitBreathe'), css.indexOf('/* The same words inside'));
    expect(breath).not.toMatch(/transform|background|color/);
    expect(css).not.toMatch(/var\(--bad\)/);
    const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(still).toMatch(/\.late,\s*\.late::after,\s*\.lateText\s*\{\s*animation:\s*none/);
    expect(still).toMatch(/\.late\s*\{[^}]*box-shadow:\s*inset 0 0 0 1\.5px var\(--warn\);[^}]*font-weight:\s*800/);
  });

  it('a lead that waits for a person says for how long beside its name — breathing past three hours', () => {
    const lead = (over: Record<string, unknown>) =>
      readLeadRow({ contact_id: 19, name: 'שירה גולן', phone: '972505550119', stage: 'needs_reply', owner: 'office', summary: 'מבקשת החזר', chips: {}, next: { who: 'office', what: 'לענות על השאלה' }, opted_out: null, ...over })!;
    const row = (item: WahubLeadRow) => render(<ul><LeadRow lead={item} now={NOW} sendingOn={false} selected={false} onOpen={noop} /></ul>);
    const waiting = row(lead({ overdue: true, waited_office_minutes: 215, waiting_label: 'מחכה 3:35 שע׳', waiting_from: '2026-10-13T07:55:00+00:00' }));
    expect(waiting).toContain('data-overdue=""');
    expect(waiting).toContain(k.late);
    expect(waiting).toContain('מחכה 3:35 שע׳');
    const soon = row(lead({ overdue: false, waited_office_minutes: 14, waiting_label: 'מחכה 14 דק׳', waiting_from: null }));
    expect(soon).toContain('מחכה 14 דק׳');
    expect(soon).toContain(k.rowWait);
    expect(soon).not.toContain(k.late);
    // A lead that does not wait for a person, and a closed one, carry no mark.
    expect(row(lead({ overdue: false, waited_office_minutes: null, waiting_label: '', waiting_from: null }))).not.toContain(k.rowWait);
    const closed = render(<ul><LeadRow lead={lead({ overdue: true, waiting_label: 'מחכה 3:35 שע׳' })} now={NOW} sendingOn={false} selected={false} closed onOpen={noop} /></ul>);
    expect(closed).not.toContain('data-overdue');
  });
});

// ---------------------------------------------------------------------------
// 1. "ביקש הסר"
// ---------------------------------------------------------------------------

describe('"ביקש הסר": a quiet mark in the card — not on the row, nor at the head of the conversation', () => {
  // The owner, 15.10.2026: "הסר" is not said in the list of conversations nor at the head of one — the card and
  // the leads keep it.
  it('the row does not say it', () => {
    const html = chatList({ items: [IDO], box: 'all' });
    expect(html).not.toContain('data-opted-out');
    expect(text(html)).not.toContain('ביקש הסר');
  });

  it('nor does the head of the conversation — not under the name, not in a phone\'s one line', () => {
    const row = titleRow(conversation(IDO));
    expect(text(row)).not.toContain('ביקש הסר');
    expect(row).not.toContain('data-opted-out');
    const status = row.slice(row.indexOf(`class="${s.threadStatus}"`));
    expect(text(status.slice(0, status.indexOf('</button>')))).not.toContain('ביקש הסר');
  });

  it('the card: the mark is a press, folded — a title first, the details behind it', () => {
    const html = card(IDO);
    const chip = html.match(/<button[^>]*aria-expanded="false"[^>]*class="[^"]*"[^>]*>.*?<\/button>/g)?.find((button) => button.includes('ביקש הסר')) ?? '';
    expect(text(chip)).toBe('ביקש הסר · 13.10');
    expect(chip).toContain(k.outChip);
    expect(html).not.toContain('מאיפה');
    expect(html).not.toContain(OPT_OUT_TEXT.back);
    // Not a switch, and not a second way to mark somebody who is already marked.
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain(OPT_OUT_TEXT.mark);
  });

  it('a press opens when, where from and what they wrote; that service messages go on; and the one way back', () => {
    const html = text(render(<OptOutCard opted={BY_MESSAGE} now={NOW} onBack={async () => ''} defaultOpen />));
    expect(html).toContain('מתי 13.10 11:02');
    expect(html).toContain('מאיפה ביקש בהודעה');
    expect(html).toContain('מה נכתב הסר');
    expect(html).toContain(OPT_OUT_TEXT.still);
    expect(html).toContain('להחזיר לתפוצה');
  });

  it('marked by a person: who marked it, and no quote', () => {
    const html = text(render(<OptOutCard opted={BY_OFFICE} now={NOW} onBack={async () => ''} defaultOpen />));
    expect(html).toContain('מאיפה סומן על ידי נציג · מיכל כהן');
    expect(html).not.toContain('מה נכתב');
  });

  it('"להחזיר לתפוצה" asks first — "הלקוח ביקש לחזור?" — and only "כן, להחזיר" asks the server', async () => {
    const onBack = vi.fn(async () => '');
    const folded = drawn(<OptOutCard opted={BY_MESSAGE} now={NOW} onBack={onBack} defaultOpen />);
    expect(pressable(folded, 'להחזיר לתפוצה')).toHaveLength(1);
    expect(pressable(folded, 'כן, להחזיר')).toHaveLength(0);
    const asking = drawn(<OptOutCard opted={BY_MESSAGE} now={NOW} onBack={onBack} defaultAsking />);
    expect(text(render(<OptOutCard opted={BY_MESSAGE} now={NOW} onBack={onBack} defaultAsking />))).toContain('הלקוח ביקש לחזור? מעכשיו יצאו למספר הזה שוב הודעות תפוצה.');
    expect(onBack).not.toHaveBeenCalled();
    (pressable(asking, 'כן, להחזיר')[0].props.onClick as () => void)();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('without a way to save it the details are read, and nothing can be pressed', () => {
    const html = render(<OptOutCard opted={BY_MESSAGE} now={NOW} defaultOpen />);
    expect(html).toContain('מאיפה');
    expect(html).not.toContain(OPT_OUT_TEXT.back);
  });

  it('marking by hand: one quiet line under the actions — it says what stops and what goes on before anything changes', () => {
    const html = card(NOA);
    expect(html).toContain('data-opt-out-mark=""');
    expect(text(html)).toContain('לסמן "ביקש הסר"');
    // A line, not a button among the actions.
    const link = html.match(/<button[^>]*data-opt-out-mark=""[^>]*>/)?.[0] ?? '';
    expect(link).not.toContain(s.btn);
    const onMark = vi.fn(async () => '');
    const asking = <OptOutMarkLink name="נועה פרידמן" onMark={onMark} defaultAsking />;
    const said = text(render(asking));
    expect(said).toContain('לסמן "ביקש הסר" על נועה פרידמן ?');
    expect(said).toContain('למספר הזה לא יצאו יותר הודעות תפוצה');
    expect(said).toContain('אישור הרשמה, תשלום ותזכורת לשיעור ימשיכו להגיע');
    expect(onMark).not.toHaveBeenCalled();
    (pressable(drawn(asking), 'כן, לסמן')[0].props.onClick as () => void)();
    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it('the card of somebody with nothing else to press still offers the quiet line — and only it', () => {
    const html = card(knowing(30, { name: 'רותם שלו', chat: { handled_by: 'bot' } }), { actions: undefined });
    expect(html).toContain('data-opt-out-mark=""');
    expect(html).not.toContain('aria-label="פעולות על השיחה"');
  });
});

describe('"ביקש הסר" locks what would send something by itself — and says why', () => {
  const lead = (over: Record<string, unknown> = {}) =>
    readLeadRow({ contact_id: 17, name: 'גלית מור', phone: '972505550117', stage: 'signup_started', stage_label: 'התחיל הרשמה', owner: 'office', summary: 'התחילה הרשמה ולא סיימה', chips: {}, next: { who: 'office', what: 'להתקשר ולסיים את ההרשמה' }, opted_out: BY_OFFICE, overdue: false, waiting_label: '', ...over })!;
  const actions = (item: WahubLeadRow) =>
    <LeadActionsView lead={item} now={NOW} busy={null} mode="idle" until="" note="" onMode={noop} onUntil={noop} onNote={noop} onOpenChat={noop} onChange={noop} />;

  it('a lead: "החזר לבוט" is locked, and one plain line under the buttons says why and what can be done', () => {
    const made = drawn(actions(lead()));
    const [toBot] = pressable(made, 'החזר לבוט');
    expect(toBot.props.disabled).toBe(true);
    const html = render(actions(lead()));
    expect(html).toContain('data-blocked="opted_out"');
    expect(text(html)).toContain('ביקש הסר — הבוט לא חוזר אליו. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
    // "דחה למועד" is the office's own mark, and "לא רלוונטי" closes the lead: both stay open.
    expect(pressable(made, 'לא רלוונטי')[0].props.disabled).toBe(false);
    expect(made.find((element) => element.type === 'button' && words(element.props.children).includes('דחה למועד'))?.props.disabled).toBe(false);
  });

  it('where the screen already says "ביקש הסר" in its own words, the line under the locked press does not say it again', () => {
    const said = <LeadActionsView lead={lead()} now={NOW} busy={null} mode="idle" until="" note="" onMode={noop} onUntil={noop} onNote={noop} onOpenChat={noop} onChange={noop} optOutSaid />;
    expect(text(render(said))).toContain('"החזר לבוט" נעול. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
    // On the page, that is: the locked press itself still names the reason for whoever hovers over it.
    expect(text(render(said))).not.toContain('ביקש הסר');
    expect(pressable(drawn(said), 'החזר לבוט')[0].props.title).toBe('ביקש הסר — הבוט לא חוזר אליו');
    expect(pressable(drawn(said), 'החזר לבוט')[0].props.disabled).toBe(true);
  });

  it('nothing is locked for a lead who did not ask out, or for one the office can only take ("קח אליי")', () => {
    const free = render(actions(lead({ opted_out: null })));
    expect(free).not.toContain('data-blocked');
    expect(pressable(drawn(actions(lead({ opted_out: null }))), 'החזר לבוט')[0].props.disabled).toBe(false);
    const unowned = lead({ owner: '', next: { who: 'none', what: 'ביקש הסר — הבוט לא חוזר אליו' } });
    expect(render(actions(unowned))).not.toContain('data-blocked');
    expect(pressable(drawn(actions(unowned)), 'קח אליי')[0].props.disabled).toBe(false);
  });

  it('the lead\'s row says it once: by its own words when they say it, by the mark when they do not', () => {
    const row = (item: WahubLeadRow) => render(<ul><LeadRow lead={item} now={NOW} sendingOn={false} selected={false} onOpen={noop} /></ul>);
    // A hot lead that went to the office: its step is the office's usual one, so the mark says it.
    const hot = row(lead());
    expect(hot).toContain('data-opted-out=""');
    // The bot's own lead: the next step already says "ביקש הסר — הבוט לא חוזר אליו".
    const quiet = row(lead({ owner: '', next: { who: 'none', what: 'ביקש הסר — הבוט לא חוזר אליו' } }));
    expect(quiet).not.toContain('data-opted-out');
    expect((text(quiet).match(/ביקש הסר/g) ?? []).length).toBe(1);
  });

  const FREED = { status: 'freed', status_label: 'התפנה מקום', entry_id: 7, lesson_id: 'l1', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', branch: 'מינץ', child: 'בת 5', since: '2026-10-11T08:40:00+00:00', freed_at: '2026-10-13T07:05:00+00:00', title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00', more: 0, notified_at: null };
  const ENTRY = readWaitingEntry({ id: 7, status: 'freed', status_label: 'התפנה מקום', lesson: { id: 'l1', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ' }, child: 'בת 5', created_at: '2026-10-11T08:40:00+00:00', freed_at: '2026-10-13T07:05:00+00:00', position: 1, notified_at: null })!;
  const DETAILS: WahubLeadDetails = { reason: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00 (מינץ)', blocker_text: '', child: null, come_back_on: null, come_back_why: '', trial: null, followups: [], timeline: [], in_system: null, waiting_list_entries: [ENTRY] };

  function waitingLead(optedOut: unknown, details: WahubLeadDetails = DETAILS): React.ReactElement {
    const item = lead({ contact_id: 16, name: 'אורי נחום', stage: 'waiting_list', stage_label: 'ברשימת המתנה', summary: DETAILS.reason, next: { who: 'office', what: 'להציע ללקוח את המקום שהתפנה' }, waiting_list: FREED, opted_out: optedOut });
    return (
      <LeadDetails
        lead={item}
        details={details}
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
      />
    );
  }

  it('a place was freed for somebody who asked out: "להודיע ללקוח" is locked from the start, the reason beside it — and "טופל" leads', () => {
    const made = drawn(waitingLead(BY_MESSAGE));
    const [tell] = pressable(made, 'להודיע ללקוח');
    expect(tell.props.disabled).toBe(true);
    expect(String(tell.props.className)).not.toContain(s.btnP);
    expect(String(pressable(made, 'טופל')[0].props.className)).toContain(s.btnP);
    const said = text(render(waitingLead(BY_MESSAGE)));
    // The lead's own locked "החזר לבוט" says why; the line beside "להודיע ללקוח" then only says it is locked.
    expect(said).toContain('ביקש הסר — הבוט לא חוזר אליו. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
    expect(said).toContain('"להודיע ללקוח" נעול. אפשר להתקשר.');
    expect((said.match(/ביקש הסר/g) ?? []).length).toBe(1);
  });

  it('…and where the lead\'s own sentence says it (as the server writes it), it is said there — once — and both lines are short', () => {
    const reason = `${DETAILS.reason}. ביקש הסר — הבוט לא חוזר אליו`;
    const said = text(render(waitingLead(BY_MESSAGE, { ...DETAILS, reason })));
    expect((said.match(/ביקש הסר/g) ?? []).length).toBe(1);
    expect(said).toContain('"החזר לבוט" נעול. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
    expect(said).toContain('"להודיע ללקוח" נעול. אפשר להתקשר.');
    // No mark beside the name either: the sentence is the one place.
    expect(render(waitingLead(BY_MESSAGE, { ...DETAILS, reason }))).not.toContain('data-opted-out');
  });

  it('a locked "להודיע ללקוח" with nothing around it that says why carries the whole reason', () => {
    const alone = <WaitingActionsView name="אורי נחום" lesson="קפוארה גן חובה" busy={null} asking={false} onAsk={noop} onAct={noop} onNotify={noop} notifyBlocked now={NOW} />;
    expect(text(render(alone))).toContain('ביקש הסר — לא שולחים הודעה יזומה. אפשר להתקשר.');
    expect(pressable(drawn(alone), 'להודיע ללקוח')[0].props.disabled).toBe(true);
  });

  it('…and for whoever did not ask out it is the press that leads, as it was', () => {
    const made = drawn(waitingLead(null));
    const [tell] = pressable(made, 'להודיע ללקוח');
    expect(tell.props.disabled).toBe(false);
    expect(String(tell.props.className)).toContain(s.btnP);
    expect(render(waitingLead(null))).not.toContain('data-blocked');
  });

  it('where the screen does not know the person up front, the press opens what the server says: why, and the send locked', () => {
    const blocked = (
      <WaitingActionsView
        name="אורי נחום"
        lesson="קפוארה גן חובה"
        busy={null}
        asking={false}
        onAsk={noop}
        onAct={noop}
        onNotify={noop}
        notify={{
          step: 'ready',
          sending: false,
          preview: { can: false, how: '', how_label: '', text: 'היי, התפנה מקום…', blocked: 'opted_out', detail: 'הלקוח ביקש הסר — לא שולחים לו הודעה יזומה.', needs_again: false, already_notified_at: null, already_notified_by_name: '' },
        }}
        now={NOW}
      />
    );
    expect(text(render(blocked))).toContain('הלקוח ביקש הסר — לא שולחים הודעה יזומה. אפשר להתקשר, או להחזיר לתפוצה מתוך השיחה.');
    expect(pressable(drawn(blocked), 'לשלוח ללקוח')[0].props.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The broadcast of the customers page
// ---------------------------------------------------------------------------

describe('the broadcast says how many will not get it because they asked out — apart from every other reason', () => {
  const row = (id: string, status: BroadcastRow['status'], over: Partial<BroadcastRow> = {}): BroadcastRow => ({ child_id: id, child_name: `ילד ${id}`, parent_name: 'הורה', phone: `97250555${id.padStart(4, '0')}`, status, ...over });

  /** A run as far as its preview — or, with `send`, to its end. The server here skips who asked out, as the real one does. */
  async function runOf(rows: (dry: boolean) => BroadcastRow[], send = false): Promise<BroadcastRun> {
    const sendChunk = async (req: ChunkRequest): Promise<ChunkReply> => ({ results: rows(req.dry_run).filter((r) => req.child_ids.includes(r.child_id)), phones: [] });
    const run = new BroadcastRun({ ids: rows(true).map((r) => r.child_id), names: {}, automation: { automation_type: 'flow', automation_id: 'x', label: 'עדכון להורים' }, chunkSize: 8, sendChunk, holdMs: 0, wait: async () => {} });
    await run.check();
    if (send) await run.start();
    return run;
  }

  const dialog = (run: BroadcastRun) =>
    render(
      <BroadcastWhatsAppDialog
        open
        draft={{ childIds: run.ids, childNames: {} }}
        run={run}
        snapshot={run.snapshot}
        onClose={noop}
        onMinimize={noop}
        onCheck={noop}
        onBack={noop}
        onCancel={noop}
        onStart={noop}
        onDismiss={noop}
      />,
    );

  const ROWS = (dry: boolean): BroadcastRow[] => [
    row('1', dry ? 'preview' : 'sent'),
    row('2', dry ? 'preview' : 'sent', { extra_phones: [{ parent_name: 'אבא', phone: '972528880002', status: 'skipped', reason: 'opted_out' }] }),
    row('3', 'skipped', { reason: 'duplicate_phone' }),
    row('5', 'skipped', { reason: 'opted_out' }),
    row('6', 'skipped', { reason: 'opted_out' }),
  ];

  it('the preview: a line of its own, and each such row says so in words — never the code', async () => {
    const html = dialog(await runOf(ROWS));
    expect(html).toContain('2. תצוגה מקדימה');
    const line = html.match(/<p[^>]*data-opted-out=""[^>]*>(.*?)<\/p>/)?.[1] ?? '';
    expect(line).toBe('3 לא יקבלו: ביקשו הסר');
    expect((text(html).match(/ידולג · ביקש הסר/g) ?? []).length).toBe(3);
    expect(html).not.toContain('opted_out');
    // It is not said a second time among the reasons; the other reasons are what they were.
    const chips = html.slice(html.indexOf('aria-live="polite"'), html.indexOf('data-opted-out'));
    expect(chips).not.toContain('ביקש הסר');
    expect(text(chips)).toContain('כפול (אותו טלפון) 1');
    expect(text(chips)).toContain('ידולגו 3');
  });

  it('after the send: the same line in the summary', async () => {
    const html = dialog(await runOf(ROWS, true));
    expect(html).not.toContain('2. תצוגה מקדימה');
    expect(html.match(/<p[^>]*data-opted-out=""[^>]*>(.*?)<\/p>/)?.[1]).toBe('3 לא יקבלו: ביקשו הסר');
  });

  it('nobody asked out — and a server built before the list — no line, and the screen is what it was', async () => {
    const old = (dry: boolean): BroadcastRow[] => [row('1', dry ? 'preview' : 'sent'), row('3', 'skipped', { reason: 'duplicate_phone' })];
    for (const html of [dialog(await runOf(old)), dialog(await runOf(old, true))]) {
      expect(html).not.toContain('data-opted-out');
      expect(html).not.toContain('ביקש הסר');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. "מה הבוט לא ידע השבוע"
// ---------------------------------------------------------------------------

const TOPIC = {
  id: 12, title: 'חניה בסניף', status: 'open', status_label: 'פתוח', count: 4, count_before: 1, trend: 'up', total: 9, last_asked_at: '2026-10-13T08:20:00+00:00',
  examples: [{ question: 'יש חניה ליד הסניף?', at: '2026-10-13T08:20:00+00:00' }, { question: 'איפה אפשר לחנות כשמביאים את [שם]?', at: '2026-10-12T09:02:00+00:00' }, { question: 'החניה בתשלום?', at: '2026-10-11T16:40:00+00:00' }],
  bot_said: 'את זה אני בודקת מול המשרד, ונחזור אליכם עם תשובה', still_asked: false, taught: null, dismissed: null,
};

function unknowns(over: Record<string, unknown> = {}): WahubUnknowns {
  return readUnknowns({
    week: { key: 'this', from: '2026-10-11', to: '2026-10-17', label: 'השבוע · 11.10–17.10' },
    counts: { topics: 5, questions: 13, unsorted: 2 },
    sorted_at: '2026-10-13T05:05:00+00:00',
    results: [
      TOPIC,
      { ...TOPIC, id: 13, title: 'שיעורים בחגים', count: 3, count_before: 3, trend: 'same', status: 'taught', still_asked: true, taught: { at: '2026-10-09T08:00:00+00:00', by_name: 'דור', thread: 31 } },
      { ...TOPIC, id: 14, title: 'מחיר תלבושת', count: 2, count_before: 0, trend: 'new' },
      { ...TOPIC, id: 15, title: 'הנחה לחיילים משוחררים', count: 1, count_before: 4, trend: 'down' },
      { ...TOPIC, id: 16, title: 'שיעור השלמה', count: 1, count_before: 1, trend: 'same' },
    ],
    unsorted: { count: 2, examples: [{ question: 'אפשר לשלם בביט?', at: '2026-10-13T10:45:00+00:00' }] },
    ...over,
  })!;
}

const GONE = readUnknowns({ results: [{ ...TOPIC, id: 18, title: 'חוג לסבים וסבתות', status: 'dismissed', dismissed: { at: '2026-10-12T10:00:00+00:00', by_name: 'דור' } }] })!.results;

function unknownsNode(over: Partial<UnknownsViewProps> = {}): React.ReactElement {
  return (
    <UnknownsView
      week="this"
      data={unknowns()}
      reading={false}
      folded={false}
      openId={null}
      showAll={false}
      teachingId={null}
      busy={null}
      rowError={null}
      dismissed={GONE}
      panel={null}
      now={NOW}
      onWeek={noop}
      onFold={noop}
      onOpen={noop}
      onShowAll={noop}
      onPanel={noop}
      onTeach={noop}
      onDismiss={noop}
      onRestore={noop}
      {...over}
    />
  );
}

const block = (over: Partial<UnknownsViewProps> = {}) => render(unknownsNode(over));

describe('"מה הבוט לא ידע השבוע" — at the head of "ללמד"', () => {
  it('its title says how many; titles first — the three most asked, and the rest behind "הצג עוד"', () => {
    const html = block();
    expect(text(html.slice(html.indexOf('<h3'), html.indexOf('</h3>')))).toBe('מה הבוט לא ידע השבוע (5)');
    expect((html.match(/data-topic=/g) ?? []).length).toBe(3);
    expect(text(html)).toContain('הצג עוד (2)');
    // Nothing of a topic is open before a press.
    expect(html).not.toContain('הבוט ענה');
    expect(html).not.toContain('יש חניה ליד הסניף?');
  });

  it('one topic more than the few is simply shown — never "הצג עוד (1)"', () => {
    const four = unknowns({ results: unknowns().results.slice(0, 4), counts: { topics: 4, questions: 10, unsorted: 0 }, unsorted: { count: 0, examples: [] } });
    const html = block({ data: four });
    expect((html.match(/data-topic=/g) ?? []).length).toBe(4);
    expect(html).not.toContain('הצג עוד');
  });

  it('a topic: its name, how often this week, the trend — small, and in words too — and "ללמד"', () => {
    const html = block();
    const first = html.slice(html.indexOf('data-topic="12"'), html.indexOf('data-topic="13"'));
    expect(text(first)).toContain('חניה בסניף 4 פעמים השבוע');
    expect(first).toContain('data-trend="up"');
    expect(first).toContain('title="יותר מהשבוע שלפני: 4 לעומת 1"');
    expect(text(first)).toContain('עלה מ-1');
    expect(first).toContain('aria-label="ללמד: חניה בסניף"');
    // A count that did not move says nothing of a trend.
    const second = html.slice(html.indexOf('data-topic="13"'), html.indexOf('data-topic="14"'));
    expect(second).not.toContain('data-trend');
  });

  it('a topic that was taught and is still asked is back on the list, and says so', () => {
    const html = block();
    const second = html.slice(html.indexOf('data-topic="13"'), html.indexOf('data-topic="14"'));
    expect(second).toContain(`<span class="${u.still}">עדיין נשאל</span>`);
    expect(html.slice(html.indexOf('data-topic="12"'), html.indexOf('data-topic="13"'))).not.toContain('עדיין נשאל');
  });

  it('a press on a topic: up to three questions in the customers\' own words, what the bot said, when last — and "לא רלוונטי", quietly', () => {
    const html = block({ openId: 12 });
    const open = html.slice(html.indexOf('data-topic="12"'), html.indexOf('data-topic="13"'));
    expect((open.match(/<q /g) ?? []).length).toBe(3);
    expect(text(open)).toContain('איפה אפשר לחנות כשמביאים את [שם]?');
    expect(text(open)).toContain('הבוט ענה את זה אני בודקת מול המשרד, ונחזור אליכם עם תשובה');
    expect(text(open)).toContain('פעם אחרונה: היום 11:20');
    const dismiss = open.match(/<button[^>]*>(?:(?!<\/button>).)*לא רלוונטי<\/button>/)?.[0] ?? '';
    expect(dismiss).toContain(u.footLink);
    expect(dismiss).not.toContain(s.btn);
    // No name and no phone of a customer is anywhere in it.
    expect(open).not.toMatch(/05\d[- ]?\d{3}/);
  });

  it('the two presses of a topic — and no more — reach whoever holds the block', () => {
    const onTeach = vi.fn();
    const onDismiss = vi.fn();
    const made = drawn(unknownsNode({ openId: 12, onTeach, onDismiss }));
    (pressable(made, 'ללמד: חניה בסניף')[0].props.onClick as () => void)();
    expect(onTeach).toHaveBeenCalledWith(expect.objectContaining({ id: 12, title: 'חניה בסניף' }));
    (pressable(made, 'לא רלוונטי')[0].props.onClick as () => void)();
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
  });

  it('while one press is on its way nothing else is pressed', () => {
    const made = drawn(unknownsNode({ teachingId: 12 }));
    for (const title of ['חניה בסניף', 'שיעורים בחגים', 'מחיר תלבושת']) expect(pressable(made, `ללמד: ${title}`)[0].props.disabled).toBe(true);
  });

  it('a press that did not happen is said on its own row', () => {
    const html = block({ rowError: { id: 13, text: 'לא הצלחתי לפתוח את הנושא כרגע. אפשר לנסות שוב' } });
    const second = html.slice(html.indexOf('data-topic="13"'), html.indexOf('data-topic="14"'));
    expect(second).toContain('role="alert"');
    expect(html.slice(html.indexOf('data-topic="12"'), html.indexOf('data-topic="13"'))).not.toContain('role="alert"');
  });

  it('under the topics, quietly: what was not sorted yet, and what was taken off — with "להחזיר"', () => {
    const html = block();
    expect(text(html)).toContain('עוד 2 שאלות שעוד לא מוינו לנושא');
    expect(text(html)).toContain('הוסרו (1)');
    expect(html).not.toContain('חוג לסבים וסבתות');
    const onRestore = vi.fn();
    const open = block({ panel: 'dismissed' });
    expect(open).toContain('חוג לסבים וסבתות');
    (pressable(drawn(unknownsNode({ panel: 'dismissed', onRestore })), 'להחזיר')[0].props.onClick as () => void)();
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 18 }));
    expect(text(block({ panel: 'unsorted' }))).toContain('אפשר לשלם בביט?');
  });

  it('nothing was ever taken off: no "הוסרו" to press', () => {
    expect(block({ dismissed: [] })).not.toContain('הוסרו');
    expect(block({ dismissed: null })).not.toContain('הוסרו');
  });

  it('a week with nothing: one glad line — not an empty frame — with the way to the week before', () => {
    const none = unknowns({ results: [], counts: { topics: 0, questions: 0, unsorted: 0 }, unsorted: { count: 0, examples: [] } });
    const html = block({ data: none, dismissed: [] });
    expect(html).toContain('data-unknowns="none"');
    expect(text(html)).toBe('השבוע הבוט ידע לענות על הכול שבוע שעבר');
    expect(html).not.toContain(u.block);
    expect(html).not.toContain('<h3');
  });

  it('nothing sorted yet, but questions wait: that is not "ידע לענות על הכול"', () => {
    const waiting = unknowns({ results: [], counts: { topics: 0, questions: 2, unsorted: 2 } });
    const html = block({ data: waiting });
    expect(html).not.toContain('ידע לענות על הכול');
    expect(text(html)).toContain('מה הבוט לא ידע השבוע (0)');
    expect(text(html)).toContain('עוד 2 שאלות שעוד לא מוינו לנושא');
  });

  it('the week before: the same block under its own title, with the way back', () => {
    const onWeek = vi.fn();
    const html = block({ week: 'last' });
    expect(text(html)).toContain('מה הבוט לא ידע בשבוע שעבר (5)');
    expect(text(html)).toContain('4 פעמים בשבוע שעבר');
    (pressable(drawn(unknownsNode({ week: 'last', onWeek })), 'חזרה לשבוע הזה')[0].props.onClick as () => void)();
    expect(onWeek).toHaveBeenCalledWith('this');
    (pressable(drawn(unknownsNode({ onWeek })), 'שבוע שעבר')[0].props.onClick as () => void)();
    expect(onWeek).toHaveBeenLastCalledWith('last');
  });

  it('while a card of "ללמד" stands under it the block is its title alone — one thing to do at a time', () => {
    const html = block({ folded: true });
    expect(text(html)).toContain('מה הבוט לא ידע השבוע (5)');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).not.toContain('data-topic=');
  });
});

describe('"ללמד" on a topic opens the very card of "ללמד", with the context ready', () => {
  const THREAD = readTeachThread({
    mode: 'teach', thread: 31, state: 'nothing', needs_answer: true, question: 'מה התשובה הנכונה?',
    summary: { what_happened: 'לקוחות שאלו על חניה בסניף 4 פעמים השבוע, והבוט לא ידע לענות', what_was_answered: 'את זה אני בודקת מול המשרד, ונחזור אליכם עם תשובה', suspected_issue: 'המידע הזה חסר לבוט' },
    origin: { kind: 'unknown', label: 'מתוך מה שהבוט לא ידע: חניה בסניף', contact_id: null, contact_name: null, link: '/wahub?tab=bot&sub=unknowns', topic_id: 12 },
    context: { contact_id: null, message_ids: [], shadow_ids: [], quotes: [{ kind: 'unknown', id: 88, who: 'customer', who_label: 'לקוח', text: 'יש חניה ליד הסניף?', at: '2026-10-13T08:20:00+00:00' }] },
    changes: [],
  })!;

  const cardOf = (thread = THREAD) =>
    render(
      <TeachCardView thread={thread} busy={null} said="" saidAt={0} error="" unsent="" previewStalled={false} checkStalled={false} fixing={false} confirmingUndo={false} onApprove={noop} onSay={noop} onUndo={noop} onFixing={noop} onConfirmingUndo={noop} onClose={noop} />,
    );

  it('where it came from, the summary, one question — and one field to write the answer in', () => {
    const html = cardOf();
    expect(text(html)).toContain('מתוך מה שהבוט לא ידע: חניה בסניף');
    expect(text(html)).toContain('לקוחות שאלו על חניה בסניף 4 פעמים השבוע, והבוט לא ידע לענות');
    expect(text(html)).toContain('מה התשובה הנכונה?');
    expect(html).toContain('placeholder="התשובה הנכונה, במילים שלך"');
    expect((html.match(/<textarea/g) ?? []).length).toBe(1);
    // The questions it was opened on are quoted, folded.
    expect(text(html)).toContain('על מה זה נכתב');
    expect(html).toContain('יש חניה ליד הסניף?');
  });

  it('a topic has no conversation behind it — and so no way "to a conversation"', () => {
    const html = cardOf();
    expect(html).not.toContain('>לשיחה<');
    expect(html).not.toContain('href="/wahub');
  });

  it('nothing is applied by opening it: no "מאשר" until he has written and the bot has proposed', () => {
    expect(cardOf()).not.toContain('>מאשר<');
  });

  it('once taught it is listed in "מה לימדת עד היום" with where it was taught from', () => {
    const page = readTeachPage({ count: 1, results: [{ thread: 31, at: '2026-10-13T09:00:00+00:00', understood: 'יש חניה חינם ברחוב הסמוך', state: 'applied', state_label: 'נשמר', origin: { kind: 'unknown', label: 'מתוך מה שהבוט לא ידע: חניה בסניף', topic_id: 12 } }] })!;
    const html = render(
      <TeachHistory rows={page.results} count={1} openId={null} askingId={null} undoingId={null} rowError={null} more={false} loadingMore={false} now={NOW} onOpen={noop} onAskUndo={noop} onUndo={noop} onMore={noop} />,
    );
    expect(text(html)).toContain('יש חניה חינם ברחוב הסמוך מתוך מה שהבוט לא ידע: חניה בסניף');
  });
});

describe('the small number beside "ללמד", in the bot\'s sub-tabs', () => {
  function botTab(summary: Record<string, unknown> | null): string {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    if (summary) client.setQueryData(['wahub', 'review', 'summary'], summary);
    return render(
      <BotTab sub="hours" status={undefined} openItemId={null} tryQuestion="" onSub={noop} onOpenItem={noop} onTryQuestion={noop} onOpenChat={noop} onDemoChanged={noop} />,
      client,
    );
  }
  const BASE = { pending: 0, applied_7d: 0, rejected_7d: 0, auto_mode: true };
  const teachTab = (html: string) => html.match(/<button[^>]*id="wahub-bot-tab-teach"[^>]*>.*?<\/button>/)?.[0] ?? '';

  it('how many topics wait to be taught — quiet, never the red of "מבקש נציג"', () => {
    const tab = teachTab(botTab({ ...BASE, unknowns: { topics: 4, questions: 11 } }));
    expect(text(tab)).toBe('ללמד 4');
    expect(tab).toContain(u.subCount);
    expect(tab).not.toContain(s.cntHot);
    expect(tab).not.toContain(s.segBadge);
  });

  it('nothing to teach — no number; and there is no ninth sub-tab', () => {
    const html = botTab({ ...BASE, unknowns: { topics: 0, questions: 0 } });
    expect(text(teachTab(html))).toBe('ללמד');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(8);
  });

  it('a server built before it sends no `unknowns`: no number, and nothing else changes', () => {
    expect(text(teachTab(botTab(BASE)))).toBe('ללמד');
    expect(text(teachTab(botTab(null)))).toBe('ללמד');
  });
});

// ---------------------------------------------------------------------------
// A server built before the evening of 13.10
// ---------------------------------------------------------------------------

describe('a server built before all three: the screens are what they were', () => {
  /** A contact as the afternoon's server sends it: `chat.open` and `chat.box`, and nothing of ט. */
  const before = (id: number, over: Over = {}) => {
    const { chat, ...rest } = over ?? {};
    return makeContact(id, { ...rest, chat: { open: true, open_reason: 'human', open_label: 'בטיפול נציג', box: 'human', box_label: 'בטיפול נציג', handled_by: 'human', ...chat } });
  };
  const OLD_WAITS = before(19, { name: 'שירה גולן', last_message_at: '2026-10-13T07:55:00+00:00', chat: { waiting_since: '2026-10-13T07:55:00+00:00' } });
  const OLD_NEW = before(11, { name: 'דנה לוי', last_message_at: '2026-10-13T11:16:00+00:00' });

  it('the conversations: nobody is pinned, nothing breathes, and the mark of the wait is the one it always was', () => {
    const html = chatList({ items: sortChats([OLD_WAITS, OLD_NEW], true), counts: { all: 13, waiting: 5, needs_human: 2, unread: 6, human: 5, bot: 7, open: 8, future: 1 } });
    expect(html).not.toContain('data-pinned-head');
    expect(html).not.toContain('data-overdue');
    expect(html).not.toContain(k.late);
    const items = listItems(html);
    // The last message first, as always.
    expect(items[0]).toContain('דנה לוי');
    expect(items[1]).toContain('שירה גולן');
    // The screen's own count, by the clock on the wall.
    expect(items[1]).toContain('מחכה 3 שעות');
  });

  it('the head of a conversation and the card: no line of marks, no "ביקש הסר", and nothing to mark it with', () => {
    const row = titleRow(conversation(OLD_WAITS));
    expect(row).not.toContain(k.headMarks);
    expect(row).not.toContain('data-overdue');
    const html = card(OLD_WAITS);
    expect(html).not.toContain('data-opted-out');
    expect(html).not.toContain('data-opt-out-mark');
    expect(html).not.toContain('ביקש הסר');
  });

  it('a lead: no mark of the wait, no "ביקש הסר", and "החזר לבוט" is open', () => {
    const lead = readLeadRow({ contact_id: 17, name: 'גלית מור', phone: '972505550117', stage: 'signup_started', owner: 'office', summary: 'התחילה הרשמה', chips: {}, next: { who: 'office', what: 'להתקשר' } })!;
    const row = render(<ul><LeadRow lead={lead} now={NOW} sendingOn={false} selected={false} onOpen={noop} /></ul>);
    expect(row).not.toContain('data-overdue');
    expect(row).not.toContain('data-opted-out');
    const made = drawn(<LeadActionsView lead={lead} now={NOW} busy={null} mode="idle" until="" note="" onMode={noop} onUntil={noop} onNote={noop} onOpenChat={noop} onChange={noop} />);
    expect(pressable(made, 'החזר לבוט')[0].props.disabled).toBe(false);
  });
});
