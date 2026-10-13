import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { shownBox } from '@/lib/wahub/boxes';
import { DEFAULT_CHAT_BOX } from '@/lib/wahub/params';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubBoxCounts, WahubContactDetail, WahubMessage } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread, { type ThreadFutureActions } from './chats/ChatThread';
import ContactPanel from './chats/ContactPanel';
import type { ContactThread } from './hooks/useContactThread';
import { RefineProvider } from './refine/RefineContext';
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
