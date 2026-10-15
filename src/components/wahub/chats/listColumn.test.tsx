/**
 * The conversations list beside a conversation on a desktop: pulled wider or narrower with the mouse (the owner,
 * 15.10.2026), the twin of the card's handle (cardColumn.test.tsx). 260–520 wide, the conversation never under
 * 360, kept in the browser (`kogo.wahub.listWidth`), and a tablet or a phone read none of it.
 *
 * The screens are drawn on the server, as everywhere in the section. What the browser keeps is handed in through
 * a stand-in for the hook.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(() => ({
  list: null as number | null,
  card: { hidden: false, width: null as number | null },
  resize: vi.fn(),
  reset: vi.fn(),
  thread: null as unknown,
  tablet: false,
}));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', first_name: 'דור', role: 'manager' } }),
}));
vi.mock('../hooks/useListWidth', () => ({
  useListWidth: () => ({ width: held.list, resize: held.resize, reset: held.reset }),
}));
vi.mock('../hooks/useCardPane', () => ({
  useCardPane: () => ({ ...held.card, hide: vi.fn(), show: vi.fn(), resize: vi.fn(), reset: vi.fn() }),
}));
vi.mock('../hooks/useContactThread', () => ({
  useContactThread: () => held.thread,
}));
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => held.tablet && query.includes('1023'),
}));

import {
  LIST_MAX_WIDTH,
  LIST_MIN_WIDTH,
  LIST_WIDTH_STORAGE_KEY,
  clampListWidth,
  listMaxWidth,
  listWidth,
  listWidthFromKey,
  listWidthFromPull,
  readListWidth,
  writeListWidth,
} from '@/lib/wahub/listPane';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail } from '@/types/wahub';
import type { ContactThread } from '../hooks/useContactThread';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import { RefineContext, type RefineValue } from '../refine/RefineContext';
import g from '../listPane.module.css';
import s from '../wahub.module.css';
import ChatsTab from './ChatsTab';
import ListGrip from './ListGrip';

(globalThis as { React?: typeof React }).React = React;

const noop = () => {};
type Props = Record<string, unknown>;

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

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

function thread(contact: WahubContactDetail): ContactThread {
  return {
    contactId: contact.id,
    contact,
    messages: [makeMessage(101, { text: 'כמה עולה חוג קפוארה?' })],
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
const REFINE: RefineValue = { available: true, target: null, seq: 0, open: vi.fn(), close: vi.fn(), dock: null, setDock: noop };

function screen() {
  return (
    <RefineContext.Provider value={REFINE}>
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

/** The list's column: its opening tag. */
const listTag = (html: string) => html.match(/<aside[^>]*aria-label="רשימת השיחות"[^>]*>/)?.[0] ?? '';
const LIST_GRIP = 'aria-label="רוחב רשימת השיחות"';

beforeEach(() => {
  held.list = null;
  held.card = { hidden: false, width: null };
  held.tablet = false;
  held.thread = thread({ ...makeContact(12, { name: 'נועה לוי' }), messages: [], has_older: false, events: [] });
  held.resize.mockReset();
  held.reset.mockReset();
});

describe('what the screen decides about the list\'s width', () => {
  it('stays between 260 and 520', () => {
    expect([LIST_MIN_WIDTH, LIST_MAX_WIDTH]).toEqual([260, 520]);
    expect(clampListWidth(100)).toBe(260);
    expect(clampListWidth(9000)).toBe(520);
    expect(clampListWidth(333.4)).toBe(333);
    expect(clampListWidth(Number.NaN)).toBe(260);
  });

  it('never leaves the conversation under 360 — beside the card, and without it', () => {
    // A 1376 frame (a 1440 window, the menu folded) with the card at 420: 1376 - 420 - 360 = 596 → the list's own top.
    expect(listMaxWidth(1376, 420)).toBe(520);
    // A 1100 frame with the card at 380: 360 are left for the list.
    expect(listMaxWidth(1100, 380)).toBe(360);
    // The card put away: the conversation has its room.
    expect(listMaxWidth(1100, 0)).toBe(520);
    // Never under the list's own least.
    expect(listMaxWidth(960, 400)).toBe(260);
    expect(listMaxWidth(null, 400)).toBe(520);
  });

  it('is the screen\'s own until it is pulled, and the pulled one inside what the frame allows', () => {
    expect(listWidth(null, 340)).toBe(340);
    expect(listWidth(450, 340)).toBe(450);
    expect(listWidth(450, 340, 360)).toBe(360);
  });

  it('a pull to the left widens a list on the right of the page; a key moves it the way it points', () => {
    expect(listWidthFromPull(340, 900, 860)).toBe(380);
    expect(listWidthFromPull(340, 900, 960)).toBe(280);
    expect(listWidthFromPull(340, 900, 860, false)).toBe(300);
    expect(listWidthFromPull(340, 900, 100)).toBe(520);
    expect(listWidthFromPull(340, 900, 860, true, 360)).toBe(360);
    expect(listWidthFromKey('ArrowLeft', 340)).toBe(356);
    expect(listWidthFromKey('ArrowRight', 340)).toBe(324);
    expect(listWidthFromKey('ArrowRight', 340, false)).toBe(356);
    expect(listWidthFromKey('Home', 340)).toBe(260);
    expect(listWidthFromKey('End', 340, true, 400)).toBe(400);
    expect(listWidthFromKey('Enter', 340)).toBe('default');
    expect(listWidthFromKey('a', 340)).toBeNull();
  });

  it('is kept in the browser under its own name, and read leniently', () => {
    expect(LIST_WIDTH_STORAGE_KEY).toBe('kogo.wahub.listWidth');
    expect(writeListWidth(400)).toBe('400');
    expect(writeListWidth(null)).toBeNull();
    expect(readListWidth('400')).toBe(400);
    expect(readListWidth('9000')).toBe(520);
    for (const raw of [null, undefined, '', 'wide', '-5', '{"width":400}']) expect(readListWidth(raw)).toBeNull();
  });
});

describe('the handle between the list and the conversation', () => {
  function fakeColumn() {
    const style: Record<string, string> = {};
    return { current: { style } as unknown as HTMLElement };
  }

  function grip(over: Partial<Parameters<typeof ListGrip>[0]> = {}) {
    const target = over.target ?? fakeColumn();
    const onResize = vi.fn();
    const onReset = vi.fn();
    const node = <ListGrip target={target} width={340} max={520} onResize={onResize} onReset={onReset} {...over} />;
    const element = drawn(node).find((entry) => entry.props.role === 'separator')!;
    return { html: render(node), props: element.props, target, onResize, onReset };
  }

  const pointer = (clientX: number, button = 0) => ({
    button,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
  });

  beforeEach(() => {
    // The page runs right to left: the list is on the right.
    vi.stubGlobal('getComputedStyle', () => ({ direction: 'rtl' }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a separator the keyboard can reach, drawn on the line as the card\'s is', () => {
    const { html } = grip();
    expect(html).toContain('role="separator"');
    expect(html).toContain(LIST_GRIP);
    expect(html).toContain('aria-valuemin="260"');
    expect(html).toContain('aria-valuemax="520"');
    expect(html).toContain('aria-valuenow="340"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(s.cardGrip);
    expect(html).toContain(g.listGrip);
  });

  it('pulled with the mouse: the column follows, and the width is kept when it is let go', () => {
    const { props, target, onResize } = grip();
    (props.onPointerDown as (event: unknown) => void)(pointer(900));
    (props.onPointerMove as (event: unknown) => void)(pointer(820));
    expect(target.current!.style.width).toBe('420px');
    expect(onResize).not.toHaveBeenCalled();
    (props.onPointerUp as (event: unknown) => void)(pointer(820));
    expect(onResize).toHaveBeenCalledWith(420);
  });

  it('stops at the frame\'s top; an interrupted pull puts the column back', () => {
    const tight = grip({ max: 380 });
    (tight.props.onPointerDown as (event: unknown) => void)(pointer(900));
    (tight.props.onPointerMove as (event: unknown) => void)(pointer(300));
    (tight.props.onPointerUp as (event: unknown) => void)(pointer(300));
    expect(tight.onResize).toHaveBeenCalledWith(380);

    const cut = grip();
    (cut.props.onPointerDown as (event: unknown) => void)(pointer(900));
    (cut.props.onPointerMove as (event: unknown) => void)(pointer(800));
    (cut.props.onPointerCancel as (event: unknown) => void)(pointer(800));
    expect(cut.onResize).not.toHaveBeenCalled();
    expect(cut.target.current!.style.width).toBe('340px');
  });

  it('a double click, or Enter, goes back to the screen\'s own width; the arrows move it a step', () => {
    const { props, onReset, onResize } = grip();
    (props.onDoubleClick as () => void)();
    expect(onReset).toHaveBeenCalledTimes(1);
    const press = (name: string) => (props.onKeyDown as (event: unknown) => void)({ key: name, preventDefault: vi.fn() });
    press('Enter');
    expect(onReset).toHaveBeenCalledTimes(2);
    press('ArrowLeft');
    expect(onResize).toHaveBeenLastCalledWith(356);
    press('Home');
    expect(onResize).toHaveBeenLastCalledWith(260);
  });
});

describe('on the conversations screen', () => {
  it('a desktop has the handle on the line between the list and the conversation', () => {
    const html = render(screen());
    expect(html).toContain(LIST_GRIP);
    expect(html.indexOf('aria-label="רשימת השיחות"')).toBeLessThan(html.indexOf(LIST_GRIP));
    expect(html.indexOf(LIST_GRIP)).toBeLessThan(html.indexOf('aria-label="השיחה"'));
    // Unmeasured (the first draw): the contract's 340.
    expect(listTag(html)).toContain('style="width:340px"');
  });

  it('the list is as wide as it was pulled — inside what the frame allows', () => {
    held.list = 450;
    expect(listTag(render(screen()))).toContain('style="width:450px"');
    held.list = 9000;
    expect(listTag(render(screen()))).toContain('style="width:520px"');
  });

  it('the handle hands a pull and a double click to what remembers them', () => {
    held.list = 400;
    const made = drawn(screen());
    const handle = made.find((element) => element.type === ListGrip)!;
    expect(handle.props).toMatchObject({ width: 400, max: 520 });
    (handle.props.onResize as (width: number) => void)(420);
    expect(held.resize).toHaveBeenCalledWith(420);
    (handle.props.onReset as () => void)();
    expect(held.reset).toHaveBeenCalledTimes(1);
  });

  it('a tablet keeps its list as it was: no handle, whatever the browser kept', () => {
    held.tablet = true;
    held.list = 480;
    const html = render(screen());
    expect(html).toContain('data-layout="medium"');
    expect(html).not.toContain(LIST_GRIP);
    expect(listTag(html)).toContain('style="width:300px"');
  });
});
