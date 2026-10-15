/**
 * The contact's card beside a conversation on a desktop: put away and brought
 * back, and pulled wider or narrower (docs/WAHUB-CONTRACT-POLISH-1.md, א).
 *
 * The screens are drawn on the server, as everywhere in the section. What the
 * browser keeps (whether the card is put away, and its width) is handed in
 * through a stand-in for the hook, so both states can be drawn.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(() => ({
  pane: { hidden: false, width: null as number | null },
  hide: vi.fn(),
  show: vi.fn(),
  resize: vi.fn(),
  reset: vi.fn(),
  thread: null as unknown,
  tablet: false,
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', first_name: 'דור', role: 'manager' } }),
}));
vi.mock('../hooks/useCardPane', () => ({
  useCardPane: () => ({ ...held.pane, hide: held.hide, show: held.show, resize: held.resize, reset: held.reset }),
}));
vi.mock('../hooks/useContactThread', () => ({
  useContactThread: () => held.thread,
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  // '(max-width: 767px)' is a phone; '(max-width: 1023px)' is anything under a desktop.
  useMediaQuery: (query: string) => held.tablet && query.includes('1023'),
}));

import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail } from '@/types/wahub';
import type { ContactThread } from '../hooks/useContactThread';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { RefineContext, type RefineTarget, type RefineValue } from '../refine/RefineContext';
import r from '../refine/refine.module.css';
import s from '../wahub.module.css';
import CardGrip from './CardGrip';
import ChatsTab from './ChatsTab';
import ChatThread from './ChatThread';
import ContactPanel from './ContactPanel';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-11T16:00:00+03:00');
const noop = () => {};
type Props = Record<string, unknown>;

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** Every element made while the screen is drawn, with its props — so a button deep inside can be found and pressed. */
function drawn(node: React.ReactElement): Array<{ type: unknown; props: Props }> {
  const original = React.createElement;
  const seen: Array<{ type: unknown; props: Props }> = [];
  (React as { createElement: unknown }).createElement = (type: unknown, props: Props | null, ...children: unknown[]) => {
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

const words = (props: Props) => renderToStaticMarkup(<span>{props.children as React.ReactNode}</span>).replace(/<[^>]+>/g, '').trim();
const buttonSaying = (made: ReturnType<typeof drawn>, word: string) =>
  made.filter((element) => element.type === 'button' && words(element.props) === word);

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, { name: 'נועה לוי', ...overrides }), messages: [], has_older: false, events: [] };
}

const MESSAGES = [
  makeMessage(101, { text: 'כמה עולה חוג קפוארה?' }),
  makeMessage(102, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'החוג עולה 250 ₪ לחודש.', status: 'sent' }),
];

function thread(contact: WahubContactDetail): ContactThread {
  return {
    contactId: contact.id,
    contact,
    messages: MESSAGES,
    hasOlder: false,
    status: 'ready',
    error: '',
    loadingOlder: false,
    sending: false,
    olderLoads: 0,
    stateRef: { current: { contact } as never },
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

const LIVE = { subscribe: () => noop, onResync: () => noop, snapshot: () => ({ cursor: null, boxes: null }), rewind: noop, resync: noop } as unknown as WahubLiveHandle;

function standIn(over: Partial<RefineValue> = {}): RefineValue {
  return { available: true, target: null, seq: 0, open: vi.fn(), close: vi.fn(), dock: null, setDock: noop, ...over };
}

function screen(value: RefineValue = standIn()) {
  return (
    <RefineContext.Provider value={value}>
      <ChatsTab
        active
        live={LIVE}
        counts={null}
        box="all"
        contactId={12}
        status={undefined}
        onBox={noop}
        onOpenContact={noop}
        onOpenSettings={noop}
        onOpenKnowledgeItem={noop}
      />
    </RefineContext.Provider>
  );
}

/** The card's column, as it is drawn: its opening tag, and everything inside it. */
function column(html: string): { tag: string; inside: string } | null {
  const at = html.search(/<aside[^>]*aria-label="(פרטי איש הקשר|דיוק)"/);
  if (at === -1) return null;
  const end = html.indexOf('</aside>', at);
  const close = html.indexOf('>', at);
  return { tag: html.slice(at, close + 1), inside: html.slice(close + 1, end) };
}

beforeEach(() => {
  held.pane = { hidden: false, width: null };
  held.tablet = false;
  held.thread = thread(detail());
  for (const spy of [held.hide, held.show, held.resize, held.reset]) spy.mockReset();
});

// ---------------------------------------------------------------------------
// Put away, and brought back
// ---------------------------------------------------------------------------

describe('the card beside the conversation on a desktop', () => {
  it('is open as it always was: the list, the conversation, the handle and the card', () => {
    const html = render(screen());
    expect(html).toContain('aria-label="רשימת השיחות"');
    expect(html).toContain('aria-label="השיחה"');
    expect(column(html)?.tag).toContain('aria-label="פרטי איש הקשר"');
    expect(html).toContain('aria-label="רוחב כרטיס איש הקשר"');
    expect(html).not.toContain('data-card="hidden"');
    // The order on the page: the conversation, the handle between them, the card.
    expect(html.indexOf('aria-label="השיחה"')).toBeLessThan(html.indexOf('aria-label="רוחב כרטיס איש הקשר"'));
    expect(html.indexOf('aria-label="רוחב כרטיס איש הקשר"')).toBeLessThan(html.indexOf('aria-label="פרטי איש הקשר"'));
  });

  it('carries "הסתר כרטיס" at its head, and pressing it puts the card away', () => {
    const made = drawn(screen());
    const hide = made.filter((element) => element.type === 'button' && element.props['aria-label'] === 'הסתר כרטיס');
    expect(hide).toHaveLength(1);
    (hide[0].props.onClick as () => void)();
    expect(held.hide).toHaveBeenCalledTimes(1);
    // The card is on screen, so the title row does not offer it, and does not repeat its action.
    expect(buttonSaying(made, 'הצג כרטיס')).toHaveLength(0);
    expect(buttonSaying(made, 'קח שיחה')).toHaveLength(1);
  });

  it('the button stands in the card\'s first section, before everything else in it', () => {
    const html = render(screen());
    const who = html.slice(html.indexOf('aria-label="מי"'), html.indexOf('aria-label="מה עכשיו"'));
    expect(who).toContain('aria-label="הסתר כרטיס"');
    expect(who).toContain('<span>הסתר כרטיס</span>');
  });

  it('put away: the column is gone, with its handle — the conversation has the room', () => {
    held.pane = { hidden: true, width: null };
    const html = render(screen());
    expect(column(html)).toBeNull();
    expect(html).not.toContain('aria-label="רוחב כרטיס איש הקשר"');
    expect(html).not.toContain('aria-label="הסתר כרטיס"');
    expect(html).toContain('data-card="hidden"');
    // The list and the conversation stay as they were.
    expect(html).toContain('aria-label="רשימת השיחות"');
    expect(html).toMatch(new RegExp(`<section aria-label="השיחה" class="[^"]*flex-1`));
    expect(html).toContain('החוג עולה 250 ₪ לחודש.');
  });

  it('put away: the title row of the conversation offers "הצג כרטיס", and pressing it brings the card back', () => {
    held.pane = { hidden: true, width: null };
    const made = drawn(screen());
    const show = buttonSaying(made, 'הצג כרטיס');
    expect(show).toHaveLength(1);
    (show[0].props.onClick as () => void)();
    expect(held.show).toHaveBeenCalledTimes(1);
  });

  it('put away: the name in the title row brings it back too', () => {
    held.pane = { hidden: true, width: null };
    const made = drawn(screen());
    const name = made.find((element) => element.type === 'button' && element.props.title === 'פרטי איש הקשר')!;
    (name.props.onClick as () => void)();
    expect(held.show).toHaveBeenCalledTimes(1);
  });

  it('put away: "קח שיחה" comes back to the title row, as on a tablet — and "החזר לבוט" when a person is answering', () => {
    held.pane = { hidden: true, width: null };
    const bot = drawn(screen());
    // The worded button of the title row (the phone's icon is a different button, drawn only under a phone's width).
    expect(buttonSaying(bot, 'קח שיחה')).toHaveLength(1);
    expect(String(buttonSaying(bot, 'קח שיחה')[0].props.className)).toContain(s.deskOnly);

    held.thread = thread(detail({ chat: { handled_by: 'human', handled_by_label: 'בטיפול נציג' } }));
    expect(buttonSaying(drawn(screen()), 'החזר לבוט')).toHaveLength(1);
  });

  it('put away: "מבקש נציג · טופל" stays above the messages', () => {
    held.pane = { hidden: true, width: null };
    held.thread = thread(detail({ chat: { needs_human: true, needs_human_reason: 'שאלה על החזר' } }));
    const html = render(screen());
    expect(html).toContain('מבקש נציג');
    expect(buttonSaying(drawn(screen()), 'טופל')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The width
// ---------------------------------------------------------------------------

describe('the width of the card', () => {
  it('is the screen\'s own until it is pulled', () => {
    // Unmeasured (the first draw): the contract's 380.
    expect(column(render(screen()))?.tag).toContain('style="width:380px"');
  });

  it('is the width it was pulled to, from then on', () => {
    held.pane = { hidden: false, width: 300 };
    const html = render(screen());
    expect(column(html)?.tag).toContain('style="width:300px"');
    expect(html).toMatch(/aria-label="רוחב כרטיס איש הקשר"[^>]*aria-valuenow="300"/);
  });

  it('never leaves the limits, whatever the browser kept', () => {
    held.pane = { hidden: false, width: 9000 };
    expect(column(render(screen()))?.tag).toContain('style="width:520px"');
    held.pane = { hidden: false, width: 5 };
    expect(column(render(screen()))?.tag).toContain('style="width:280px"');
  });

  it('the handle hands a pull and a double click to what remembers them', () => {
    held.pane = { hidden: false, width: 400 };
    const made = drawn(screen());
    const grip = made.find((element) => element.type === CardGrip)!;
    expect(grip.props).toMatchObject({ width: 400, max: 520 });
    (grip.props.onResize as (width: number) => void)(344);
    expect(held.resize).toHaveBeenCalledWith(344);
    (grip.props.onReset as () => void)();
    expect(held.reset).toHaveBeenCalledTimes(1);
  });
});

describe('the handle between the conversation and the card', () => {
  /** A stand-in for the card's column: where it stands on the page, and the width written to it. */
  function fakeColumn(left = 0, width = 400) {
    const style: Record<string, string> = {};
    return { current: { style, getBoundingClientRect: () => ({ left, right: left + width, width }) } as unknown as HTMLElement };
  }

  function grip(over: Partial<Parameters<typeof CardGrip>[0]> = {}) {
    const target = over.target ?? fakeColumn();
    const onResize = vi.fn();
    const onReset = vi.fn();
    const node = <CardGrip target={target} width={400} max={520} onResize={onResize} onReset={onReset} {...over} />;
    const made = drawn(node);
    const element = made.find((entry) => entry.props.role === 'separator')!;
    return { html: render(node), props: element.props, target, onResize, onReset };
  }

  const pointer = (clientX: number, button = 0) => ({
    button,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
  });
  const key = (name: string) => ({ key: name, preventDefault: vi.fn() });

  beforeEach(() => {
    // The page runs right to left: the card is on the left, and its left edge does not move.
    vi.stubGlobal('getComputedStyle', () => ({ direction: 'rtl' }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a separator the keyboard can reach, and says where it stands between its limits', () => {
    const { html } = grip();
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuemin="280"');
    expect(html).toContain('aria-valuemax="520"');
    expect(html).toContain('aria-valuenow="400"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="רוחב כרטיס איש הקשר"');
    expect(html).toContain(s.cardGrip);
  });

  it('in a frame short of room its top is the frame\'s', () => {
    expect(grip({ width: 320, max: 320 }).html).toContain('aria-valuemax="320"');
  });

  it('pulled: the column follows the pointer, and the width is kept when it is let go', () => {
    const { props, target, onResize } = grip();
    const down = pointer(400);
    (props.onPointerDown as (event: unknown) => void)(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);

    (props.onPointerMove as (event: unknown) => void)(pointer(350));
    expect(target.current!.style.width).toBe('350px');
    (props.onPointerMove as (event: unknown) => void)(pointer(455));
    expect(target.current!.style.width).toBe('455px');
    // Nothing is kept until it is let go.
    expect(onResize).not.toHaveBeenCalled();

    (props.onPointerUp as (event: unknown) => void)(pointer(455));
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(455);
  });

  it('a pull stops at 280 and at 520 — and at the frame\'s own top', () => {
    const narrow = grip();
    (narrow.props.onPointerDown as (event: unknown) => void)(pointer(400));
    (narrow.props.onPointerMove as (event: unknown) => void)(pointer(90));
    (narrow.props.onPointerUp as (event: unknown) => void)(pointer(90));
    expect(narrow.onResize).toHaveBeenCalledWith(280);

    const wide = grip();
    (wide.props.onPointerDown as (event: unknown) => void)(pointer(400));
    (wide.props.onPointerMove as (event: unknown) => void)(pointer(1200));
    (wide.props.onPointerUp as (event: unknown) => void)(pointer(1200));
    expect(wide.onResize).toHaveBeenCalledWith(520);

    const tight = grip({ max: 340, width: 320 });
    (tight.props.onPointerDown as (event: unknown) => void)(pointer(320));
    (tight.props.onPointerMove as (event: unknown) => void)(pointer(500));
    (tight.props.onPointerUp as (event: unknown) => void)(pointer(500));
    expect(tight.onResize).toHaveBeenCalledWith(340);
  });

  it('wherever the handle is taken, the width changes by how far the pointer went — taking it moves nothing', () => {
    // Taken a few pixels off its line (the handle is a finger wide), on a card that does not start at the screen's edge.
    const { props, target, onResize } = grip({ target: fakeColumn(64, 400) });
    (props.onPointerDown as (event: unknown) => void)(pointer(468.5));
    (props.onPointerMove as (event: unknown) => void)(pointer(468.5));
    expect(target.current!.style.width).toBe('400px');
    (props.onPointerMove as (event: unknown) => void)(pointer(408.5));
    expect(target.current!.style.width).toBe('340px');
    (props.onPointerUp as (event: unknown) => void)(pointer(408.5));
    expect(onResize).toHaveBeenCalledWith(340);
  });

  it('on a page that runs left to right the card is on the other side, and so is the pull', () => {
    vi.stubGlobal('getComputedStyle', () => ({ direction: 'ltr' }));
    const { props, onResize } = grip();
    (props.onPointerDown as (event: unknown) => void)(pointer(1000));
    (props.onPointerMove as (event: unknown) => void)(pointer(960));
    (props.onPointerUp as (event: unknown) => void)(pointer(960));
    expect(onResize).toHaveBeenCalledWith(440);
  });

  it('a press that does not move keeps nothing; a pull that is interrupted puts the column back', () => {
    const still = grip();
    (still.props.onPointerDown as (event: unknown) => void)(pointer(400));
    (still.props.onPointerUp as (event: unknown) => void)(pointer(400));
    expect(still.onResize).not.toHaveBeenCalled();

    const cut = grip();
    (cut.props.onPointerDown as (event: unknown) => void)(pointer(400));
    (cut.props.onPointerMove as (event: unknown) => void)(pointer(300));
    (cut.props.onPointerCancel as (event: unknown) => void)(pointer(300));
    expect(cut.onResize).not.toHaveBeenCalled();
    expect(cut.target.current!.style.width).toBe('400px');
  });

  it('only the main button pulls; a move with nothing held does nothing', () => {
    const { props, target, onResize } = grip();
    (props.onPointerDown as (event: unknown) => void)(pointer(400, 2));
    (props.onPointerMove as (event: unknown) => void)(pointer(300));
    (props.onPointerUp as (event: unknown) => void)(pointer(300));
    expect(target.current!.style.width).toBeUndefined();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('a double click goes back to the width the screen gives by itself', () => {
    const { props, onReset, onResize } = grip();
    (props.onDoubleClick as () => void)();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('the arrows move it the way they point, a step at a time; Home and End go to the limits; Enter is the double click', () => {
    const { props, onResize, onReset } = grip();
    const press = (name: string) => {
      const event = key(name);
      (props.onKeyDown as (event: unknown) => void)(event);
      return event;
    };
    expect(press('ArrowRight').preventDefault).toHaveBeenCalled();
    expect(onResize).toHaveBeenLastCalledWith(416);
    press('ArrowLeft');
    expect(onResize).toHaveBeenLastCalledWith(384);
    press('Home');
    expect(onResize).toHaveBeenLastCalledWith(280);
    press('End');
    expect(onResize).toHaveBeenLastCalledWith(520);
    expect(onReset).not.toHaveBeenCalled();
    press('Enter');
    expect(onReset).toHaveBeenCalledTimes(1);
    // Any other key is left to the page.
    const tab = press('Tab');
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(onResize).toHaveBeenCalledTimes(4);
  });

  it('at a limit an arrow has nowhere to go, and nothing is written', () => {
    const { props, onResize } = grip({ width: 520 });
    (props.onKeyDown as (event: unknown) => void)(key('ArrowRight'));
    expect(onResize).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// "דיוק" while the card is put away
// ---------------------------------------------------------------------------

describe('"דיוק" with the card put away', () => {
  const target: RefineTarget = { contactId: 12, contactName: 'נועה לוי', messageIds: [102], excerpt: [] };

  it('the column comes back for the small chat alone, at the card\'s width — the conversation stays whole beside it', () => {
    held.pane = { hidden: true, width: 340 };
    const html = render(screen(standIn({ target })));
    const found = column(html);
    expect(found?.tag).toContain('aria-label="דיוק"');
    expect(found?.tag).toContain('style="width:340px"');
    // A place for the chat, and nothing of the card under it.
    expect(found?.inside).toContain(r.dock);
    expect(found?.inside).not.toContain('aria-label="מי"');
    expect(html).toContain('aria-label="רוחב כרטיס איש הקשר"');
    // The conversation does not reach the edge of the screen while the chat stands beside it.
    expect(html).not.toContain('data-card="hidden"');
  });

  it('while the chat has the column the title row is as short as beside the card: the name, "דיוק" and who answers', () => {
    held.pane = { hidden: true, width: 340 };
    const made = drawn(screen(standIn({ target })));
    expect(buttonSaying(made, 'הצג כרטיס')).toHaveLength(0);
    expect(buttonSaying(made, 'קח שיחה')).toHaveLength(0);
    expect(made.filter((element) => element.type === 'button' && element.props['aria-label'] === 'דיוק')).toHaveLength(1);
    // Closed, they are back.
    const closed = drawn(screen(standIn({ target: null })));
    expect(buttonSaying(closed, 'הצג כרטיס')).toHaveLength(1);
    expect(buttonSaying(closed, 'קח שיחה')).toHaveLength(1);
  });

  it('and goes again when the chat is closed', () => {
    held.pane = { hidden: true, width: 340 };
    expect(column(render(screen(standIn({ target: null }))))).toBeNull();
  });

  it('with the card open the chat lies over it, as before', () => {
    const html = render(screen(standIn({ target })));
    const found = column(html);
    expect(found?.tag).toContain('aria-label="פרטי איש הקשר"');
    expect(found?.inside).toContain(r.dock);
    expect(found?.inside).toContain('aria-label="מי"');
  });
});

// ---------------------------------------------------------------------------
// A tablet and a phone are as they were
// ---------------------------------------------------------------------------

describe('under a desktop\'s width nothing of this is read', () => {
  it('a tablet: the card is a press away as before, whatever the browser kept — no handle, no "הסתר כרטיס"', () => {
    held.tablet = true;
    held.pane = { hidden: true, width: 300 };
    const html = render(screen());
    expect(html).toContain('data-layout="medium"');
    expect(html).not.toContain('data-card="hidden"');
    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain('הצג כרטיס');
    expect(html).not.toContain('הסתר כרטיס');
    // The title row keeps its own way to the card, and the action.
    expect(html).toContain('aria-label="פרטי איש הקשר"');
    expect(buttonSaying(drawn(screen()), 'קח שיחה')).toHaveLength(1);
  });

  it('the card on a phone or in a tablet\'s drawer has its way back, and no "הסתר כרטיס"', () => {
    const html = render(
      <ContactPanel
        contact={detail()}
        now={NOW}
        today="2026-10-11"
        allTags={[]}
        analyzing={false}
        rechecking={false}
        showBack
        onBack={noop}
        onFollowup={noop}
        onTags={noop}
        onRename={noop}
        onRecheck={noop}
        onAnalyze={noop}
      />,
    );
    expect(html).toContain('aria-label="חזרה לשיחה"');
    expect(html).not.toContain('הסתר כרטיס');
  });

  it('a conversation that is not handed "הצג כרטיס" does not offer it', () => {
    const props = {
      thread: thread(detail()),
      now: NOW,
      visible: true,
      simulated: false,
      sendingOff: false,
      handoverBusy: false,
      resolveBusy: false,
      showBack: false,
      onBack: noop,
      onDetails: noop,
      onTakeover: noop,
      onRelease: noop,
      onResolveNeedsHuman: noop,
      onOpenSettings: noop,
    };
    expect(render(<ChatThread {...props} showDetailsButton={false} />)).not.toContain('הצג כרטיס');
    expect(render(<ChatThread {...props} showDetailsButton />)).not.toContain('הצג כרטיס');
    const offered = render(<ChatThread {...props} showDetailsButton={false} onShowCard={noop} />);
    expect(offered).toContain('הצג כרטיס');
    expect(offered).toContain('קח שיחה</button>');
  });
});
