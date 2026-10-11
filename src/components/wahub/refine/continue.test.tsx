/**
 * "דיוק" → marking → "המשך" (docs/WAHUB-CONTRACT-POLISH-1.md, ב): the small chat
 * is opened on the marked messages and told that the system speaks first.
 *
 * Marking is a state of the screen, and the screens are drawn on the server
 * here — so the state is handed in through a stand-in for its hook: the
 * conversation as it is right after "דיוק" was pressed and two bubbles were marked.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const picking = vi.hoisted(() => ({
  active: true,
  picked: [101, 102] as number[],
  start: vi.fn(),
  cancel: vi.fn(),
  press: vi.fn(),
}));

vi.mock('./useRefineSelection', () => ({
  useRefineSelection: () => ({
    active: picking.active,
    ids: new Set(picking.active ? picking.picked : []),
    picked: picking.active ? picking.picked : [],
    start: picking.start,
    cancel: picking.cancel,
    press: picking.press,
  }),
}));

import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail } from '@/types/wahub';
import ChatThread from '../chats/ChatThread';
import type { ContactThread } from '../hooks/useContactThread';
import { RefineContext, type RefineTarget, type RefineValue } from './RefineContext';
import r from './refine.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-11T16:00:00+03:00');
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

const words = (props: Props) => renderToStaticMarkup(<span>{props.children as React.ReactNode}</span>).replace(/<[^>]+>/g, '').trim();
const buttonSaying = (made: ReturnType<typeof drawn>, word: string) =>
  made.filter((element) => element.type === 'button' && words(element.props) === word);

const MESSAGES = [
  makeMessage(101, { text: 'כמה עולה חוג קפוארה?' }),
  makeMessage(102, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'החוג עולה 250 ₪ לחודש.', status: 'sent' }),
  makeMessage(103, { text: 'ויש הנחה לאחים?' }),
];

function conversation(): ContactThread {
  const contact: WahubContactDetail = { ...makeContact(12, { name: 'נועה לוי' }), messages: [], has_older: false, events: [] };
  return {
    contactId: 12,
    contact,
    messages: MESSAGES,
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

function standIn(): RefineValue {
  return { available: true, target: null, seq: 0, open: vi.fn(), close: vi.fn(), dock: null, setDock: noop };
}

function screen(value: RefineValue) {
  return (
    <RefineContext.Provider value={value}>
      <ChatThread
        thread={conversation()}
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
      />
    </RefineContext.Provider>
  );
}

beforeEach(() => {
  picking.active = true;
  picking.picked = [101, 102];
  for (const spy of [picking.start, picking.cancel, picking.press]) spy.mockReset();
});

describe('after "דיוק" at the top of the conversation', () => {
  it('every bubble the server knows is a mark to set, the marked ones are marked, and the bar counts them', () => {
    const html = render(screen(standIn()));
    expect((html.match(/role="checkbox"/g) ?? []).length).toBe(3);
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(2);
    expect((html.match(new RegExp(r.checkOn, 'g')) ?? []).length).toBe(2);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('נבחרו 2 הודעות');
    // The button of the title row says that marking is on.
    expect(html).toContain('aria-pressed="true"');
  });

  it('a press on a bubble marks it — as many as she likes', () => {
    const made = drawn(screen(standIn()));
    const rows = made.filter((element) => element.props.role === 'checkbox');
    (rows[2].props.onClick as (event: unknown) => void)({ shiftKey: false });
    expect(picking.press).toHaveBeenCalledWith(103, false);
  });

  it('"המשך" opens the small chat on the marked messages, in their order — and the system is to speak first', () => {
    const value = standIn();
    const made = drawn(screen(value));
    const go = buttonSaying(made, 'המשך');
    expect(go).toHaveLength(1);
    expect(go[0].props.disabled).toBe(false);

    (go[0].props.onClick as () => void)();

    expect(value.open).toHaveBeenCalledTimes(1);
    const target = (value.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as RefineTarget;
    expect(target).toMatchObject({ contactId: 12, contactName: 'נועה לוי', messageIds: [101, 102], summarize: true });
    expect(target.excerpt.map((line) => line.id)).toEqual([101, 102]);
    expect(target.shadowId ?? null).toBeNull();
    expect(target.proposalId ?? null).toBeNull();
    // Marking ends: the conversation is itself again behind the chat.
    expect(picking.cancel).toHaveBeenCalledTimes(1);
  });

  it('with nothing marked "המשך" waits', () => {
    picking.picked = [];
    const value = standIn();
    const go = buttonSaying(drawn(screen(value)), 'המשך');
    expect(go[0].props.disabled).toBe(true);
  });

  it('"ביטול" ends the marking and opens nothing', () => {
    const value = standIn();
    const cancel = buttonSaying(drawn(screen(value)), 'ביטול');
    (cancel[0].props.onClick as () => void)();
    expect(picking.cancel).toHaveBeenCalledTimes(1);
    expect(value.open).not.toHaveBeenCalled();
  });
});

describe('before "דיוק" is pressed', () => {
  it('there are no marks at all — the circles come up only from the button at the top', () => {
    picking.active = false;
    const html = render(screen(standIn()));
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain(r.check);
    expect(html).not.toContain('role="toolbar"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('the button of the title row is what starts it', () => {
    picking.active = false;
    const made = drawn(screen(standIn()));
    const button = buttonSaying(made, 'דיוק');
    expect(button).toHaveLength(1);
    (button[0].props.onClick as () => void)();
    expect(picking.start).toHaveBeenCalledTimes(1);
    expect(picking.cancel).not.toHaveBeenCalled();
  });
});
