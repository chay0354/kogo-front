import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  AUTO_APPLIED_NOTE,
  REFINE_START,
  REFINE_TEXT,
  readRefineChange,
  readRefineThread,
  refineReducer,
  type RefineChatState,
} from '@/lib/wahub/refine';
import { makeContact, makeMessage, makeProposal, makeShadowReply } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubMessage } from '@/types/wahub';
import ProposalCard from '../bot/review/ProposalCard';
import ProposalsFab from '../bot/review/ProposalsFab';
import ReviewTab from '../bot/review/ReviewTab';
import ShadowReplyCard from '../bot/shadow/ShadowReplyCard';
import ShadowTab from '../bot/shadow/ShadowTab';
import ChatThread from '../chats/ChatThread';
import ShadowRow from '../chats/ShadowRow';
import { botKeys } from '../hooks/useBotQueries';
import type { ContactThread } from '../hooks/useContactThread';
import s from '../wahub.module.css';
import AutoAppliedSection, { proposalTarget } from './AutoApplied';
import { AUTO_APPLY_LINE, AUTO_APPLY_TITLE, AutoApplyView } from './AutoApplySwitch';
import ChangeCard from './ChangeCard';
import { RefineChatView, type RefineChatViewProps } from './RefineChat';
import { RefineContext, RefineDock, RefineProvider, type RefineTarget, type RefineValue } from './RefineContext';
import { RefineRow, RefineSelectBar } from './RefineRow';
import r from './refine.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-11T14:00:00+03:00');
const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
}

function render(node: React.ReactElement, queryClient: QueryClient = client()): string {
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

/** The elements a component that keeps no state draws: it is called as the function it is, and its tree is walked. */
function elements(node: React.ReactNode): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    try {
      return elements((element.type as (props: unknown) => React.ReactNode)(element.props));
    } catch {
      return [];
    }
  }
  return [element, ...elements(element.props.children)];
}

type Props = Record<string, unknown>;

function find(node: React.ReactNode, match: (props: Props, type: unknown) => boolean): React.ReactElement<Props> {
  const found = elements(node).find((element) => match(element.props as Props, element.type));
  if (!found) throw new Error('element not found');
  return found as React.ReactElement<Props>;
}

const text = (element: React.ReactElement) => renderToStaticMarkup(element).replace(/<[^>]+>/g, '');
const buttonSaying = (word: string) => (props: Props, type: unknown) =>
  type === 'button' && text(React.createElement('span', null, props.children as React.ReactNode)).trim() === word;
const press = (element: React.ReactElement<Props>, event: unknown = {}) => (element.props.onClick as (event: unknown) => void)(event);

/**
 * A component that keeps state cannot be walked; it can still be drawn. While
 * it is, every element made is seen here with its props, so a button deep
 * inside can be found and pressed.
 */
function drawn(node: React.ReactElement, queryClient: QueryClient = client()): Array<{ type: unknown; props: Props }> {
  const original = React.createElement;
  const seen: Array<{ type: unknown; props: Props }> = [];
  (React as { createElement: unknown }).createElement = (type: unknown, props: Props | null, ...children: unknown[]) => {
    // Children arrive beside the props, not in them: kept with them here, so a button can be found by what it says.
    if (props) seen.push({ type, props: children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props });
    return (original as (...args: unknown[]) => React.ReactElement)(type, props, ...children);
  };
  try {
    render(node, queryClient);
  } finally {
    (React as { createElement: unknown }).createElement = original;
  }
  return seen;
}

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, overrides), messages: [], has_older: false, events: [] };
}

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

const threadProps = {
  now: NOW,
  visible: true,
  simulated: false,
  sendingOff: false,
  handoverBusy: false,
  resolveBusy: false,
  showBack: true,
  showDetailsButton: true,
  onBack: noop,
  onDetails: noop,
  onTakeover: noop,
  onRelease: noop,
  onResolveNeedsHuman: noop,
  onOpenSettings: noop,
};

const MESSAGES = [
  makeMessage(101, { text: 'כמה עולה חוג קפוארה?' }),
  makeMessage(102, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'החוג עולה 250 ₪ לחודש.', status: 'sent' }),
  makeMessage(103, { text: 'ויש הנחה לאחים?' }),
];

/** A stand-in for the section's provider: it says "דיוק" can be opened, and keeps what was opened. */
function standIn(over: Partial<RefineValue> = {}): RefineValue {
  return { available: true, target: null, seq: 0, open: vi.fn(), close: vi.fn(), dock: null, setDock: noop, ...over };
}

const within = (value: RefineValue, node: React.ReactElement) => <RefineContext.Provider value={value}>{node}</RefineContext.Provider>;

// ---------------------------------------------------------------------------
// The button at the top of a conversation, and marking messages
// ---------------------------------------------------------------------------

describe('"דיוק" at the top of a conversation', () => {
  it('is in the header of every conversation of the section — one small, quiet icon at every width (owner, 13.10.2026)', () => {
    const html = render(
      <RefineProvider>
        <ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} />
      </RefineProvider>,
    );
    // No worded button with a frame any more: an icon, named for a reader of the screen and on hover.
    expect(html).not.toContain('>דיוק</button>');
    expect((html.match(/aria-label="דיוק"/g) ?? []).length).toBe(1);
    expect(html).toContain('title="דיוק: לתקן את הבוט מתוך השיחה"');
    const button = html.match(/<button[^>]*aria-label="דיוק"[^>]*>/)?.[0] ?? '';
    expect(button).toContain(s.ibQuiet);
    expect(button).toContain(s.ibSm);
    expect(button).toContain('aria-pressed="false"');
    // One button for the desktop and the phone alike — not one hidden from each.
    expect(button).not.toContain(s.deskOnly);
    expect(button).not.toContain(s.phoneIb);
    // It stands after the conversation's own actions, not before them.
    expect(html.indexOf('aria-label="דיוק"')).toBeGreaterThan(html.indexOf('קח שיחה'));
    // Nothing is being marked yet: no bar, and the bubbles are not checkboxes.
    expect(html).not.toContain('role="toolbar"');
    expect(html).not.toContain('role="checkbox"');
  });

  it('on a desktop the card beside the conversation carries "קח שיחה": the title row keeps "דיוק" and does not say it twice', () => {
    const beside = render(
      <RefineProvider>
        <ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} showBack={false} showDetailsButton={false} />
      </RefineProvider>,
    );
    expect(beside).toContain('aria-label="דיוק"');
    // No worded button; the phone's icon (drawn only under a phone's width) is all that names the action.
    expect(beside).not.toContain('קח שיחה</button>');
    expect(beside.match(/קח שיחה/g)!.length).toBe(2);
    // A tablet: the card is a press away, so the action stays in the title row.
    const away = render(
      <RefineProvider>
        <ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} showBack={false} showDetailsButton />
      </RefineProvider>,
    );
    expect(away).toContain('קח שיחה</button>');
  });

  it('"מבקש נציג · טופל" stays at every width', () => {
    const asking = detail({ chat: { needs_human: true, needs_human_reason: 'שאלה על החזר' } });
    for (const showDetailsButton of [true, false]) {
      const html = render(<ChatThread thread={thread(asking, MESSAGES)} {...threadProps} showDetailsButton={showDetailsButton} />);
      expect(html).toContain('מבקש נציג');
      expect(html).toContain('טופל');
    }
  });

  it('where there is no small chat to open (outside the section) it is not offered', () => {
    const html = render(<ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} />);
    expect(html).not.toContain('דיוק');
  });

  it('the messages the small chat is open on stay marked in the conversation behind it', () => {
    const target: RefineTarget = { contactId: 12, contactName: 'איש קשר 12', messageIds: [102], excerpt: [] };
    const html = render(within(standIn({ target }), <ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} />));
    expect((html.match(new RegExp(r.marked, 'g')) ?? []).length).toBe(1);
    // Another conversation's chat marks nothing here.
    const other = render(within(standIn({ target: { ...target, contactId: 99 } }), <ChatThread thread={thread(detail(), MESSAGES)} {...threadProps} />));
    expect(other).not.toContain(r.marked);
  });
});

describe('a message while marking', () => {
  const row = (over: Partial<Parameters<typeof RefineRow>[0]> = {}) => (
    <RefineRow id={102} selecting selected={false} selectable marked={false} onPress={noop} {...over}>
      <p>החוג עולה 250 ₪ לחודש.</p>
    </RefineRow>
  );
  const isBox = (props: Props) => props.role === 'checkbox';

  it('is a checkbox that says whether it is marked', () => {
    expect(render(row())).toMatch(/role="checkbox" aria-checked="false"/);
    const marked = render(row({ selected: true }));
    expect(marked).toMatch(/role="checkbox" aria-checked="true"/);
    expect(marked).toContain(r.pickOn);
    expect(marked).toContain(r.checkOn);
  });

  it('a press marks it; with Shift, the stretch up to it', () => {
    const onPress = vi.fn();
    const box = find(row({ onPress }), isBox);
    press(box, { shiftKey: false });
    expect(onPress).toHaveBeenLastCalledWith(102, false);
    press(box, { shiftKey: true });
    expect(onPress).toHaveBeenLastCalledWith(102, true);
  });

  it('the keyboard marks it too: Space or Enter', () => {
    const onPress = vi.fn();
    const box = find(row({ onPress }), isBox);
    const key = (name: string) => ({ key: name, shiftKey: false, preventDefault: vi.fn() });
    (box.props.onKeyDown as (event: unknown) => void)(key(' '));
    (box.props.onKeyDown as (event: unknown) => void)(key('Enter'));
    (box.props.onKeyDown as (event: unknown) => void)(key('a'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('what is inside does not act while marking — the press belongs to the row', () => {
    expect(render(row())).toContain(r.pickBody);
  });

  it('a bubble still on its way cannot be marked', () => {
    const html = render(row({ selectable: false }));
    expect(html).not.toContain('role="checkbox"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(r.pickOff);
  });

  it('outside the mode it is the message as it always was', () => {
    const html = render(row({ selecting: false }));
    expect(html).not.toContain('role=');
    expect(html).not.toContain(r.pick);
    expect(html).toContain('החוג עולה 250 ₪ לחודש.');
  });
});

describe('the bar at the bottom while marking', () => {
  const bar = (count: number, onContinue = noop, onCancel = noop) => (
    <RefineSelectBar count={count} onContinue={onContinue} onCancel={onCancel} />
  );

  it('says how many are marked, with "המשך" and "ביטול"', () => {
    const html = render(bar(2));
    expect(html).toContain('נבחרו 2 הודעות');
    expect(html).toContain('>המשך</button>');
    expect(html).toContain('>ביטול</button>');
    expect(html).toContain(r.selectBar);
  });

  it('"המשך" waits until something is marked', () => {
    expect(find(bar(0), buttonSaying('המשך')).props.disabled).toBe(true);
    expect(find(bar(1), buttonSaying('המשך')).props.disabled).toBe(false);
    expect(render(bar(1))).toContain('נבחרה הודעה אחת');
  });

  it('each of the two does its own thing', () => {
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    press(find(bar(3, onContinue, onCancel), buttonSaying('המשך')));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    press(find(bar(3, onContinue, onCancel), buttonSaying('ביטול')));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The shortcuts
// ---------------------------------------------------------------------------

// docs/WAHUB-CONTRACT-POLISH-1.md (ב): the marks come up only from the button at the top of the conversation.
describe('a bubble has no "דיוק" of its own', () => {
  const conversation = (messages = MESSAGES) => within(standIn(), <ChatThread thread={thread(detail({ name: 'נועה לוי' }), messages)} {...threadProps} />);

  it('no shortcut beside a bubble — not on hover, not after a long press', () => {
    const made = drawn(conversation());
    expect(made.filter((element) => element.props['aria-label'] === 'דיוק על ההודעה הזו')).toHaveLength(0);
    // Nothing listens for a finger resting on a bubble.
    for (const handler of ['onTouchStart', 'onTouchEnd', 'onTouchMove', 'onTouchCancel', 'onContextMenu']) {
      expect(made.filter((element) => typeof element.props[handler] === 'function')).toHaveLength(0);
    }
  });

  it('the only "דיוק" on screen is the small button of the title row', () => {
    const html = render(conversation());
    expect((html.match(/>דיוק<\/button>/g) ?? []).length).toBe(0);
    expect((html.match(/aria-label="דיוק"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('דיוק על ההודעה');
    expect(html).not.toContain('מה לא היה טוב בהודעה הזו');
  });

  it('until it is pressed no bubble is a mark to set, and there is no bar', () => {
    const html = render(conversation());
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain(r.pick);
    expect(html).not.toContain(r.check);
    expect(html).not.toContain('role="toolbar"');
  });

  it('a bubble is drawn the same with "דיוק" on offer and without it', () => {
    const offered = render(conversation());
    const plain = render(<ChatThread thread={thread(detail({ name: 'נועה לוי' }), MESSAGES)} {...threadProps} />);
    const bubbles = (html: string) => html.slice(html.indexOf('aria-label="הודעות השיחה"'), html.indexOf('placeholder='));
    expect(bubbles(offered)).toBe(bubbles(plain));
  });
});

describe('"לתקן" under a shadow reply', () => {
  const reply = makeShadowReply(31, {
    after_message_id: 101,
    contact_id: 12,
    contact_name: 'נועה לוי',
    customer_text: 'כמה עולה חוג קפוארה?',
    text: 'החוג עולה 250 ₪.',
  });
  const isFix = (element: { type: unknown; props: Props }) =>
    element.type === 'button' && String(element.props.className ?? '').includes(s.thumbBad);

  it('opens the small chat on the answer, in place of the note box; 👍 stays as it was', () => {
    const onFix = vi.fn();
    const onVerdict = vi.fn();
    const made = drawn(<ShadowReplyCard reply={reply} now={NOW} busy={false} onVerdict={onVerdict} onFix={onFix} />);

    (made.find(isFix)!.props.onClick as () => void)();
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onVerdict).not.toHaveBeenCalled();

    const good = made.find((element) => element.type === 'button' && String(element.props.className ?? '').includes(s.thumbGood))!;
    (good.props.onClick as () => void)();
    expect(onVerdict).toHaveBeenCalledWith('good', '');
  });

  it('in "תשובות בצל" it opens on the reply: its contact, the customer\'s message, and the answer being fixed', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.shadowRecent, [reply]);
    const value = standIn();
    const made = drawn(within(value, <ShadowTab status={undefined} onOpenChat={noop} onOpenItem={noop} />), queryClient);

    (made.find(isFix)!.props.onClick as () => void)();

    expect(value.open).toHaveBeenCalledTimes(1);
    const target = (value.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as RefineTarget;
    expect(target).toMatchObject({ contactId: 12, contactName: 'נועה לוי', messageIds: [101], shadowId: 31, heading: 'התשובה שמתקנים' });
    expect(target.excerpt.map((line) => line.who)).toEqual(['customer', 'shadow']);
    expect(target.excerpt[1].text).toBe('החוג עולה 250 ₪.');
    // Once she has written, the answer is marked 👎 — the list "לתקן" keeps its meaning.
    expect(typeof target.onSent).toBe('function');
    // She says what was wrong with the answer: no summary is asked for first.
    expect(target.summarize).toBeFalsy();
  });

  it('inside a conversation it opens on the answer too, and she speaks first — the summary is for marked messages', () => {
    const value = standIn();
    const made = drawn(
      within(
        value,
        <ChatThread thread={thread(detail({ name: 'נועה לוי' }), MESSAGES)} {...threadProps} shadowByMessage={new Map([[101, reply]])} onShadowVerdict={noop} />,
      ),
    );
    // The row under the customer's message is folded until it is pressed; "לתקן" inside it is what it was handed.
    (made.find((element) => element.type === ShadowRow)!.props.onFix as () => void)();
    const target = (value.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as RefineTarget;
    expect(target).toMatchObject({ contactId: 12, messageIds: [101], shadowId: 31, heading: 'התשובה שמתקנים' });
    expect(target.summarize).toBe(false);
  });

  it('an answer already marked 👎 is not marked again', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.shadowRecent, [{ ...reply, verdict: 'bad' }]);
    const value = standIn();
    const made = drawn(within(value, <ShadowTab status={undefined} onOpenChat={noop} onOpenItem={noop} />), queryClient);
    (made.find(isFix)!.props.onClick as () => void)();
    expect(((value.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as RefineTarget).onSent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The small chat
// ---------------------------------------------------------------------------

const CHANGE = {
  proposal_id: 51,
  action: 'update',
  item_id: 7,
  kind_label: 'עובדה',
  title: 'מחיר חוג קפוארה',
  before: { body: 'החוג עולה 250 ₪ לחודש.' },
  after: { body: 'החוג עולה 280 ₪ לחודש.' },
  applied: true,
};

const ANSWER = {
  thread: 9,
  status: 'open',
  reply: 'הבנתי: המחיר שהבוט אמר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪ לחודש.',
  needs_answer: false,
  changes: [CHANGE],
  turns: [
    { role: 'operator', text: 'המחיר לא נכון, זה 280', changes: [] },
    { role: 'system', text: 'הבנתי: המחיר שהבוט אמר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪ לחודש.', changes: [CHANGE] },
  ],
};

const answeredState = (over: Record<string, unknown> = {}): RefineChatState =>
  refineReducer(REFINE_START, { type: 'answered', thread: readRefineThread({ ...ANSWER, ...over })! });

const EXCERPT = [
  { id: 101, who: 'customer' as const, label: 'הלקוח', text: 'כמה עולה חוג קפוארה?' },
  { id: 102, who: 'bot' as const, label: 'הבוט', text: 'החוג עולה 250 ₪ לחודש.' },
];

function chatView(over: Partial<RefineChatViewProps> = {}) {
  return (
    <RefineChatView
      contactName="נועה לוי"
      excerpt={EXCERPT}
      excerptCount={2}
      state={REFINE_START}
      threads={[]}
      checking={false}
      draft=""
      now={NOW}
      onDraft={noop}
      onSend={noop}
      onUndo={noop}
      onOpenThread={noop}
      onNewThread={noop}
      onRetry={noop}
      onClose={noop}
      {...over}
    />
  );
}

const isBox = (_props: Props, type: unknown) => type === 'textarea';

describe('the small chat of "דיוק"', () => {
  it('opens on the marked piece of the conversation, folded, with a box that asks what was wrong', () => {
    const html = render(chatView());
    expect(html).toContain('role="dialog"');
    expect(html).toContain('<h2>דיוק</h2>');
    expect(html).toContain('נועה לוי');
    // The piece: its title and one line always; the messages are inside the fold.
    expect(html).toContain('2 הודעות שנבחרו');
    expect(html).toMatch(/<details class="[^"]*"><summary>/);
    expect(html).not.toContain('<details open');
    expect(html).toContain('הלקוח');
    expect(html).toContain('החוג עולה 250 ₪ לחודש.');
    expect(html).toContain('placeholder="מה לא היה טוב כאן?"');
    expect(html).toContain('מה לא היה טוב ולמה');
  });

  it('nothing typed: nothing to send', () => {
    expect(find(chatView(), (props) => props['aria-label'] === 'שלח').props.disabled).toBe(true);
    expect(find(chatView({ draft: 'המחיר לא נכון' }), (props) => props['aria-label'] === 'שלח').props.disabled).toBe(false);
  });

  it('Enter sends; Shift+Enter is a new line', () => {
    const onSend = vi.fn();
    const box = find(chatView({ draft: 'המחיר לא נכון', onSend }), isBox);
    const key = (shiftKey: boolean) => ({ key: 'Enter', shiftKey, nativeEvent: { isComposing: false }, preventDefault: vi.fn() });
    (box.props.onKeyDown as (event: unknown) => void)(key(true));
    expect(onSend).not.toHaveBeenCalled();
    (box.props.onKeyDown as (event: unknown) => void)(key(false));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('while the server works it out: her line, "המערכת חושבת…", and nothing more can be sent', () => {
    const state = refineReducer(REFINE_START, { type: 'sending', text: 'המחיר לא נכון, זה 280' });
    const view = chatView({ state, draft: 'עוד משהו' });
    const html = render(view);
    expect(html).toContain('המחיר לא נכון, זה 280');
    expect(html).toContain(r.turnPending);
    expect(html).toContain(REFINE_TEXT.thinking);
    expect(html).toContain('המערכת חושבת…');
    expect(find(view, (props) => props['aria-label'] === 'שלח').props.disabled).toBe(true);
  });

  // docs/WAHUB-CONTRACT-POLISH-1.md (ב): after "המשך" the system speaks first.
  describe('the smart summary', () => {
    const SUMMARY = {
      what_happened: 'הלקוחה שאלה כמה עולה חוג קפוארה.',
      what_was_answered: 'הבוט ענה 250 ₪ לחודש.',
      suspected_issue: 'המחיר שהבוט אמר אולי לא מעודכן.',
    };
    const REPLY = 'סיכום: הלקוחה שאלה על מחיר והבוט ענה 250 ₪. מה לא היה טוב כאן?';
    const summarized = (over: Record<string, unknown> = {}): RefineChatState =>
      refineReducer(REFINE_START, {
        type: 'answered',
        thread: readRefineThread({
          thread: 9,
          status: 'open',
          reply: REPLY,
          needs_answer: true,
          summary: SUMMARY,
          changes: [],
          turns: [{ role: 'system', text: REPLY, summary: SUMMARY, changes: [] }],
          ...over,
        })!,
      });

    it('while the server sums up: "המערכת מסכמת…", no intro, and nothing can be sent yet', () => {
      const state = refineReducer(REFINE_START, { type: 'summarizing' });
      const view = chatView({ state, draft: 'המחיר לא נכון' });
      const html = render(view);
      expect(html).toContain('המערכת מסכמת…');
      expect(html).toContain('role="status"');
      expect(html).not.toContain('המערכת חושבת…');
      expect(html).not.toContain('מה לא היה טוב ולמה');
      // She may write meanwhile; sending waits for the summary.
      expect(find(view, isBox).props.disabled).toBeFalsy();
      expect(find(view, (props) => props['aria-label'] === 'שלח').props.disabled).toBe(true);
    });

    it('then one bubble of the system: three short lines, each under its small title, and the question', () => {
      const html = render(chatView({ state: summarized() }));
      expect(html).toContain('סיכום חכם');
      expect(html).toContain(r.turnSummary);
      const titles = [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1]);
      expect(titles).toEqual(['מה קרה', 'מה נענה', 'מה נראה לא טוב']);
      const lines = [...html.matchAll(/<dd[^>]*>([^<]+)<\/dd>/g)].map((match) => match[1]);
      expect(lines).toEqual([SUMMARY.what_happened, SUMMARY.what_was_answered, SUMMARY.suspected_issue]);
      expect(html).toContain(`<p class="${r.summaryAsk}">מה לא היה טוב כאן?</p>`);
      // The three lines say it; the same words as a paragraph are not shown beside them.
      expect(html).not.toContain(REPLY);
      // Nothing was changed, so there is no card — and no intro, the summary took its place.
      expect(html).not.toContain('>עודכן<');
      expect(html).not.toContain('מה לא היה טוב ולמה');
    });

    it('under it the box asks the same — "מה לא היה טוב כאן?" — not "התשובה שלך"', () => {
      const view = chatView({ state: summarized() });
      const box = find(view, isBox);
      expect(box.props.placeholder).toBe('מה לא היה טוב כאן?');
      expect(box.props['aria-label']).toBe('מה לא היה טוב כאן?');
      expect(box.props.disabled).toBeFalsy();
      const html = render(view);
      expect(html.indexOf(r.turnSummary)).toBeLessThan(html.indexOf('<textarea'));
    });

    it('what looked wrong stands out; when nothing did, there are two lines and nothing is made up', () => {
      const withIssue = render(chatView({ state: summarized() }));
      expect(withIssue).toContain(r.summaryIssue);
      const none = { ...SUMMARY, suspected_issue: null };
      const html = render(chatView({ state: summarized({ summary: none, turns: [{ role: 'system', text: REPLY, summary: none, changes: [] }] }) }));
      expect([...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1])).toEqual(['מה קרה', 'מה נענה']);
      expect(html).not.toContain('מה נראה לא טוב');
      expect(html).not.toContain(r.summaryIssue);
      // The question is asked all the same.
      expect(html).toContain(`<p class="${r.summaryAsk}">מה לא היה טוב כאן?</p>`);
    });

    it('a server that sends no summary: its own words are shown, as a question', () => {
      const html = render(chatView({ state: summarized({ summary: undefined, turns: [{ role: 'system', text: REPLY, changes: [] }] }) }));
      expect(html).toContain(REPLY);
      expect(html).toContain('>שאלה<');
      expect(html).not.toContain('סיכום חכם');
      expect(html).not.toContain('<dt>');
      expect(html).toContain('placeholder="מה לא היה טוב כאן?"');
    });

    it('once she has answered, the summary stays above and the question under it is gone', () => {
      const said = 'הבנתי: המחיר לא מעודכן. שיניתי: מחיר חוג הקפוארה הוא 280 ₪ לחודש.';
      const state = refineReducer(summarized(), {
        type: 'answered',
        thread: readRefineThread({
          thread: 9,
          status: 'open',
          reply: said,
          needs_answer: false,
          changes: [CHANGE],
          turns: [
            { role: 'system', text: REPLY, summary: SUMMARY, changes: [] },
            { role: 'operator', text: 'כן, בדיוק – המחיר הוא 280', changes: [] },
            { role: 'system', text: said, changes: [CHANGE] },
          ],
        })!,
      });
      const html = render(chatView({ state }));
      expect(html).toContain('סיכום חכם');
      expect(html).toContain(SUMMARY.what_happened);
      expect(html).not.toContain(r.summaryAsk);
      expect(html).toContain('כן, בדיוק – המחיר הוא 280');
      expect(html).toContain(said);
      expect(html.indexOf(SUMMARY.what_happened)).toBeLessThan(html.indexOf('כן, בדיוק'));
      expect(html.indexOf('כן, בדיוק')).toBeLessThan(html.indexOf(said));
      expect(html).toContain('>עודכן<');
      expect(html).toContain('placeholder="רוצים לדייק עוד? כתבו כאן…"');
    });

    it('an older server (the summary was skipped): the chat is what it always was — the intro and an empty box', () => {
      const state = refineReducer(refineReducer(REFINE_START, { type: 'summarizing' }), { type: 'summarySkipped' });
      const view = chatView({ state });
      const html = render(view);
      expect(html).toContain('מה לא היה טוב ולמה');
      expect(html).toContain('placeholder="מה לא היה טוב כאן?"');
      expect(html).not.toContain('המערכת מסכמת…');
      expect(html).not.toContain('role="alert"');
      expect(find(chatView({ state, draft: 'המחיר לא נכון' }), (props) => props['aria-label'] === 'שלח').props.disabled).toBe(false);
    });

    it('a summary that did not come is said in a line, and the box is hers', () => {
      const state = refineReducer(refineReducer(REFINE_START, { type: 'summarizing' }), { type: 'summarySkipped', note: REFINE_TEXT.summaryFailed });
      const html = render(chatView({ state }));
      expect(html).toContain('role="alert"');
      expect(html).toContain('הסיכום לא הוכן');
      expect(find(chatView({ state, draft: 'המחיר לא נכון' }), (props) => props['aria-label'] === 'שלח').props.disabled).toBe(false);
    });
  });

  it('the answer is a bubble — "הבנתי: … שיניתי: …" — with a card for the change', () => {
    const html = render(chatView({ state: answeredState() }));
    expect(html).toContain('הבנתי: המחיר שהבוט אמר לא נכון. שיניתי: מחיר חוג הקפוארה הוא 280 ₪ לחודש.');
    expect(html).toContain(r.turnSys);
    // The card: what changed, where it stands, and — for an update — "היה" above "עכשיו".
    expect(html).toContain('aria-label="מחיר חוג קפוארה"');
    expect(html).toContain('>עודכן<');
    expect(html).toContain('מה השתנה');
    expect(html).toMatch(/<span>היה<\/span><span>החוג עולה 250 ₪ לחודש\.<\/span>/);
    expect(html).toMatch(/<span>עכשיו<\/span><span>החוג עולה 280 ₪ לחודש\.<\/span>/);
    // The kind is a technical detail: folded, with the rest of them.
    expect(html).toContain('פרטים טכניים');
    expect(html).not.toContain('עדכון רשומה');
    // And she can go on writing.
    expect(html).toContain('placeholder="רוצים לדייק עוד? כתבו כאן…"');
    expect(html).not.toContain('>שאלה<');
  });

  it('"בטל" on the card takes that change back', () => {
    const onUndo = vi.fn();
    const two = answeredState({ changes: [CHANGE, { ...CHANGE, proposal_id: 52, title: 'מחיר חוג אקרובטיקה' }] });
    const buttons = elements(chatView({ state: two, onUndo })).filter((element) => buttonSaying('בטל')(element.props as Props, element.type));
    expect(buttons).toHaveLength(2);
    press(buttons[1] as React.ReactElement<Props>);
    expect(onUndo).toHaveBeenCalledWith(1);
  });

  it('a change that was taken back says "בוטל" and has nothing left to press', () => {
    const undone = refineReducer(answeredState(), { type: 'undone', keys: 'all', thread: null });
    const view = chatView({ state: undone });
    const html = render(view);
    expect(html).toContain('>בוטל<');
    expect(html).toContain(r.changeUndone);
    expect(elements(view).some((element) => buttonSaying('בטל')(element.props as Props, element.type))).toBe(false);
  });

  it('while one card is being taken back, the others wait', () => {
    const two = answeredState({ changes: [CHANGE, { ...CHANGE, proposal_id: 52 }] });
    const during = refineReducer(two, { type: 'undoing', key: 'p52' });
    const buttons = elements(chatView({ state: during })).filter((element) => buttonSaying('בטל')(element.props as Props, element.type));
    expect(buttons.map((button) => (button.props as Props).disabled)).toEqual([true, true]);
  });

  it('a question: the system asks, nothing was changed, and the box asks for the answer', () => {
    const asking = answeredState({
      reply: 'לאיזה סניף הכוונה – רמת גן או יהוד?',
      needs_answer: true,
      changes: [],
      turns: [
        { role: 'operator', text: 'המחיר לא נכון', changes: [] },
        { role: 'system', text: 'לאיזה סניף הכוונה – רמת גן או יהוד?', changes: [] },
      ],
    });
    const view = chatView({ state: asking });
    const html = render(view);
    expect(html).toContain('>שאלה<');
    expect(html).toContain(r.turnAsk);
    expect(html).toContain('לאיזה סניף הכוונה – רמת גן או יהוד?');
    expect(html).toContain('placeholder="התשובה שלך…"');
    expect(html).not.toContain('>עודכן<');
    expect(elements(view).some((element) => buttonSaying('בטל')(element.props as Props, element.type))).toBe(false);
  });

  it('a change that waits for an approval says so, and where it waits', () => {
    const waiting = answeredState({ changes: [{ ...CHANGE, applied: false }] });
    const view = chatView({ state: waiting });
    const html = render(view);
    expect(html).toContain('>מחכה לאישור<');
    expect(html).toContain('יש הצעות לעדכון הבוט');
    expect(elements(view).some((element) => buttonSaying('בטל')(element.props as Props, element.type))).toBe(false);
  });

  it('a server without refine/ (404): "עוד לא זמין", a way to check again, and no raw error', () => {
    const onRetry = vi.fn();
    const state = refineReducer(REFINE_START, { type: 'unavailable' });
    const view = chatView({ state, onRetry });
    const html = render(view);
    expect(html).toContain('הדיוק עוד לא זמין');
    expect(html).toContain(REFINE_TEXT.notBuilt);
    expect(html).not.toContain('404');
    expect(html).not.toContain('Not Found');
    expect(html).not.toContain('role="alert"');
    expect(find(view, isBox).props.disabled).toBe(true);
    press(find(view, buttonSaying('בדקו שוב')));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a failure is said above the box, in words', () => {
    const state = refineReducer(REFINE_START, { type: 'failed', error: REFINE_TEXT.unknown });
    const html = render(chatView({ state }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא התקבלה תשובה מהשרת');
  });

  it('the conversation\'s earlier threads are a title with a count; pressing one opens it', () => {
    const onOpenThread = vi.fn();
    const earlier = [
      readRefineThread({ id: 4, contact: 12, message_ids: [90], status: 'done', created_at: '2026-10-10T09:30:00+03:00', created_by_name: 'שלי', turns: ANSWER.turns })!,
      readRefineThread({ id: 3, contact: 12, message_ids: [80], status: 'open', created_at: '2026-10-09T09:30:00+03:00', needs_answer: true, turns: [{ role: 'operator', text: 'לא לענות ככה על שאלות על מחיר', changes: [] }] })!,
    ];
    const view = chatView({ threads: earlier, onOpenThread });
    const html = render(view);
    expect(html).toContain('דיוקים קודמים בשיחה');
    expect(html).toContain('(2)');
    expect(html).toContain('המחיר לא נכון, זה 280');
    expect(html).toContain('שינוי אחד');
    expect(html).toContain('מחכה לתשובה');
    expect(html).toContain('שלי');
    const rows = elements(view).filter((element) => element.type === 'button' && String((element.props as Props).className ?? '').includes(r.threadRow));
    press(rows[1] as React.ReactElement<Props>);
    expect(onOpenThread).toHaveBeenCalledWith(3);
  });

  it('the thread being written now is not listed among the earlier ones', () => {
    const current = readRefineThread(ANSWER)!;
    const html = render(chatView({ state: answeredState(), threads: [current] }));
    expect(html).not.toContain('דיוקים קודמים בשיחה');
  });

  it('reading an earlier thread: it is marked in the list, with a way back to what was just marked', () => {
    const onNewThread = vi.fn();
    const earlier = readRefineThread({ ...ANSWER, thread: { id: 4, message_ids: [90] } })!;
    const state = refineReducer(REFINE_START, { type: 'opened', thread: earlier });
    const view = chatView({ state, threads: [earlier], onNewThread, excerpt: [], excerptCount: 1 });
    const html = render(view);
    expect(html).toContain('aria-current="true"');
    // Its marked message is not on screen: said, rather than shown empty.
    expect(html).toContain('הודעה אחת מהקטע לא מוצגת כאן.');
    press(find(view, buttonSaying('דיוק חדש על מה שסימנתי')));
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it('over the contact\'s card (a desktop) it is the size of the card, not a drawer of the page', () => {
    expect(render(chatView({ docked: true }))).toContain(r.drawerDocked);
    expect(render(chatView())).not.toContain(r.drawerDocked);
    // The place the conversations screen makes for it.
    expect(render(<RefineDock />)).toBe(`<div class="${r.dock}"></div>`);
  });

  it('an earlier thread on its way is the section\'s loading shape, not a blank', () => {
    const html = render(chatView({ state: refineReducer(REFINE_START, { type: 'loading' }) }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="טוען את הדיוק"');
    expect(find(chatView({ state: refineReducer(REFINE_START, { type: 'loading' }), draft: 'משהו' }), (props) => props['aria-label'] === 'שלח').props.disabled).toBe(true);
  });

  it('closes from the header', () => {
    const onClose = vi.fn();
    press(find(chatView({ onClose }), (props) => props['aria-label'] === 'סגור'));
    press(find(chatView({ onClose }), (props) => props['aria-label'] === 'חזרה לשיחה'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('a change card in the small chat', () => {
  const card = (raw: Record<string, unknown>, over: Partial<Parameters<typeof ChangeCard>[0]> = {}) => (
    <ChangeCard change={readRefineChange(raw)!} busy={false} locked={false} onUndo={noop} {...over} />
  );

  it('a new item: what was written, in a paragraph — no "before", nothing struck out', () => {
    const html = render(
      card({
        action: 'create',
        kind: 'behavior_rule',
        kind_label: 'כלל התנהגות',
        title: 'לא מבטיחים "אבדוק ואחזור"',
        before: null,
        after: { title: 'לא מבטיחים "אבדוק ואחזור"', body: 'כשחסר מידע – מוסרים את טלפון המשרד.', key: 'no_will_check', when_to_say: 'internal', example_bad: 'אבדוק ואחזור אליך' },
        applied: true,
      }),
    );
    expect(html).toContain('מה השתנה');
    expect(html).toContain(r.plainRule);
    expect(html).toContain('כשחסר מידע – מוסרים את טלפון המשרד.');
    expect(html).not.toContain('<span>היה</span>');
    expect(html).not.toContain(r.was);
    // The examples and the code names are folded; a code name is written only there.
    expect(html).toContain('דוגמאות');
    expect(html).toContain('אבדוק ואחזור אליך');
    expect(html).toContain('פרטים טכניים');
    expect(html).toContain('כלל התנהגות');
    expect(html).toContain('הנחיה פנימית');
    expect(html.split('behavior_rule').length - 1).toBe(1);
    expect(html.split('no_will_check').length - 1).toBe(1);
    expect(html.indexOf('behavior_rule')).toBeGreaterThan(html.indexOf('פרטים טכניים'));
    expect(html).not.toContain('<details open');
  });

  it('the server\'s own words are used when it sends them', () => {
    const html = render(card({ ...CHANGE, plain: { headline: 'מעכשיו הבוט אומר שהחוג עולה 280 ₪', kind_label: 'עובדה', is_new: false } }));
    expect(html).toContain('מעכשיו הבוט אומר שהחוג עולה 280 ₪');
    expect(html).toContain('aria-label="מעכשיו הבוט אומר שהחוג עולה 280 ₪"');
  });

  it('an item that was switched off says so', () => {
    const html = render(card({ action: 'deactivate', kind_label: 'עובדה', title: 'רישום מוקדם', before: { title: 'רישום מוקדם' }, after: null, applied: true }));
    expect(html).toContain('הרשומה &quot;רישום מוקדם&quot; כובתה');
    expect(html).not.toContain('<span>היה</span>');
  });

  it('"בטל" waits while it is being taken back', () => {
    expect(find(card(CHANGE, { busy: true }), buttonSaying('בטל')).props.disabled).toBe(true);
  });

  it('a change the server says cannot be taken back has no "בטל"', () => {
    expect(elements(card({ ...CHANGE, can_undo: false })).some((element) => buttonSaying('בטל')(element.props as Props, element.type))).toBe(false);
    expect(elements(card({ ...CHANGE, can_undo: true })).some((element) => buttonSaying('בטל')(element.props as Props, element.type))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The one readable card of a proposal (docs/WAHUB-CONTRACT-REFINE.md, ג)
// ---------------------------------------------------------------------------

/** The card the owner could not read: a new behaviour rule, once drawn as a table of code names with a red column of dashes. */
const NEW_RULE = makeProposal(81, {
  source: 'reviewer',
  source_label: 'סריקה יזומה',
  pattern: 'repeated',
  pattern_label: 'הלקוח חזר על אותה שאלה',
  contact_id: 14,
  contact_name: 'מיכל ברק',
  title: 'לקוח שחוזר על שאלה',
  explanation: 'הלקוחה שאלה פעמיים על המחיר, והבוט ענה פעמיים את אותה תשובה כללית.',
  change: {
    action: 'create',
    item_id: null,
    kind: 'behavior_rule',
    before: null,
    after: {
      kind: 'behavior_rule',
      key: 'repeated_question',
      title: 'לקוח שחוזר על שאלה',
      body: 'אם הלקוח חוזר על אותה שאלה – התשובה הקודמת לא ענתה לו. עונים ישירות על השאלה.',
      when_to_say: 'internal',
      example_bad: 'כפי שציינתי, החוג מתקיים בימי שני.',
      example_good: 'החוג עולה 280 ₪ לחודש.',
    },
  },
  change_kind_label: 'כלל התנהגות',
  evidence: [{ message_id: 1, who: 'customer', text: 'אבל כמה זה עולה?' }],
  plain: {
    headline: 'מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה',
    rule: 'כשלקוח שואל שוב את אותה שאלה, הבוט עונה עליה ישירות ולא חוזר על התשובה הקודמת.',
    why: 'הלקוחה שאלה פעמיים על המחיר ולא קיבלה תשובה.',
    example_bad: 'כפי שציינתי, החוג מתקיים בימי שני.',
    example_good: 'החוג עולה 280 ₪ לחודש.',
    kind_label: 'כלל התנהגות',
    when_label: 'הנחיה פנימית',
    is_new: true,
  },
});

const PRICE_UPDATE = makeProposal(82, {
  title: 'לעדכן את מחיר חוג הקפוארה',
  explanation: 'נציגה ענתה מעל הבוט שהמחיר 280 ₪.',
  contact_id: 13,
  change: {
    action: 'update',
    item_id: 7,
    kind: 'fact',
    before: { title: 'מחיר חוג קפוארה', body: 'החוג עולה 250 ₪ לחודש.', when_to_say: 'if_asked' },
    after: { title: 'מחיר חוג קפוארה', body: 'החוג עולה 280 ₪ לחודש.', when_to_say: 'if_asked' },
  },
  change_kind_label: 'עובדה',
});

describe('a proposal\'s card', () => {
  const card = (proposal = NEW_RULE, over: Partial<Parameters<typeof ProposalCard>[0]> = {}) => (
    <ProposalCard proposal={proposal} now={NOW} busy={false} onApprove={noop} onReject={noop} onUndo={noop} onRefine={noop} onOpenChat={noop} onOpenItem={noop} {...over} />
  );
  const saying = (made: ReturnType<typeof drawn>, word: string) =>
    made.filter((element) => element.type === 'button' && text(React.createElement('span', null, element.props.children as React.ReactNode)).trim() === word);

  it('a new item: what the bot does from now on, why, and the rule in a paragraph — no "before", nothing in red', () => {
    const html = render(card());
    // 1. The headline.
    expect(html).toContain('מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה');
    // 2. Why, in a sentence, with the way to the conversation.
    expect(html).toContain('<strong>למה:</strong> הלקוחה שאלה פעמיים על המחיר ולא קיבלה תשובה.');
    expect(html).toContain('>לשיחה</button>');
    // 3. What changes: one paragraph.
    expect(html).toContain('מה ישתנה');
    expect(html).toContain(`<p class="${r.plainRule}" dir="auto">כשלקוח שואל שוב את אותה שאלה, הבוט עונה עליה ישירות ולא חוזר על התשובה הקודמת.</p>`);
    expect(html).not.toContain('<span>היה</span>');
    expect(html).not.toContain(r.was);
    // The old table is gone: no red column, no dash standing for "nothing before", and — before anything is opened — no field names as rows.
    expect(html).not.toContain(s.diffBefore);
    expect(html).not.toContain('>—<');
    const open = html.split('<details')[0];
    expect(open).not.toContain('מפתח');
    expect(open).not.toContain('דוגמה רעה');
    expect(open).not.toContain('מתי לומר');
  });

  it('the examples and the technical details are folded; a code name is written only among the technical details', () => {
    const html = render(card());
    expect(html).not.toContain('<details open');
    const folds = html.split('<details').slice(1);
    expect(folds).toHaveLength(3);
    expect(folds[0]).toContain('דוגמאות');
    expect(folds[0]).toContain('דוגמה רעה');
    expect(folds[0]).toContain('כפי שציינתי, החוג מתקיים בימי שני.');
    expect(folds[0]).toContain('דוגמה טובה');
    expect(folds[1]).toContain('פרטים טכניים');
    expect(folds[1]).toContain('כלל התנהגות');
    expect(folds[1]).toContain('הנחיה פנימית');
    expect(folds[1]).toContain('behavior_rule');
    expect(folds[1]).toContain('repeated_question');
    expect(folds[2]).toContain('מה נאמר בשיחה');
    // Everything before the folds is in words only.
    const top = html.split('<details')[0];
    expect(top).not.toMatch(/behavior_rule|repeated_question|internal/);
  });

  it('an update: "היה" above "יהיה", only for what changed', () => {
    const html = render(card(PRICE_UPDATE));
    expect(html).toContain('לעדכן את מחיר חוג הקפוארה');
    expect(html).toMatch(/<span>היה<\/span><span>החוג עולה 250 ₪ לחודש\.<\/span>/);
    expect(html).toMatch(/<span>יהיה<\/span><span>החוג עולה 280 ₪ לחודש\.<\/span>/);
    expect(html.indexOf('<span>היה</span>')).toBeLessThan(html.indexOf('<span>יהיה</span>'));
    // One thing changed: one pair, and no label over it. The title and "when to say" did not change.
    expect((html.match(/<span>היה<\/span>/g) ?? []).length).toBe(1);
    expect(html).not.toContain(r.swapField);
    expect(html).not.toContain(r.plainRule);
  });

  it('waiting: אשר · דחה · דיוק', () => {
    const onApprove = vi.fn();
    const onRefine = vi.fn();
    const made = drawn(card(NEW_RULE, { onApprove, onRefine }));
    expect(saying(made, 'אשר')).toHaveLength(1);
    expect(saying(made, 'דחה')).toHaveLength(1);
    expect(saying(made, 'דיוק')).toHaveLength(1);
    expect(saying(made, 'בטל')).toHaveLength(0);
    (saying(made, 'אשר')[0].props.onClick as () => void)();
    expect(onApprove).toHaveBeenCalledWith('');
    (saying(made, 'דיוק')[0].props.onClick as () => void)();
    expect(onRefine).toHaveBeenCalledTimes(1);
  });

  it('in the knowledge already: בטל · דיוק — beside the headline while the card is folded', () => {
    const onUndo = vi.fn();
    const onRefine = vi.fn();
    const applied = { ...NEW_RULE, status: 'applied' as const, status_label: 'הוחל על הידע', decided_at: '2026-10-11T13:00:00+03:00', decided_by_name: 'דור' };
    const made = drawn(card(applied, { compact: true, onUndo, onRefine }));
    expect(saying(made, 'אשר')).toHaveLength(0);
    expect(saying(made, 'דחה')).toHaveLength(0);
    (saying(made, 'בטל')[0].props.onClick as () => void)();
    expect(onUndo).toHaveBeenCalledTimes(1);
    (saying(made, 'דיוק')[0].props.onClick as () => void)();
    expect(onRefine).toHaveBeenCalledTimes(1);
    const html = render(card(applied, { compact: true }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>בטל</button>');
    // Folded: the headline, and nothing of the rest.
    expect(html).not.toContain('מה השתנה');
    expect(html).not.toContain('<details');
  });

  it('in the knowledge, but the server says it cannot be taken back from here: "דיוק" alone', () => {
    const applied = { ...NEW_RULE, status: 'applied' as const, status_label: 'הוחל על הידע', can_undo: false };
    const made = drawn(card(applied, { compact: true }));
    expect(saying(made, 'בטל')).toHaveLength(0);
    expect(saying(made, 'דיוק')).toHaveLength(1);
  });

  it('turned down, or taken back: nothing left to press', () => {
    for (const status of ['rejected', 'undone'] as const) {
      const made = drawn(card({ ...NEW_RULE, status, status_label: status === 'undone' ? 'בוטל' : 'נדחה' }, { compact: true }));
      expect(saying(made, 'בטל')).toHaveLength(0);
      expect(saying(made, 'דיוק')).toHaveLength(0);
      expect(saying(made, 'אשר')).toHaveLength(0);
    }
  });

  it('without the server\'s wording the card is worded from the change itself', () => {
    const html = render(card({ ...NEW_RULE, plain: undefined }));
    expect(html).toContain('לקוח שחוזר על שאלה');
    expect(html).toContain('אם הלקוח חוזר על אותה שאלה – התשובה הקודמת לא ענתה לו. עונים ישירות על השאלה.');
    expect(html).toContain('הנחיה פנימית');
    expect(html).not.toContain('<span>היה</span>');
  });
});

describe('"דיוק" on a proposal', () => {
  const isRefine = (element: { type: unknown; props: Props }) =>
    element.type === 'button' && text(React.createElement('span', null, element.props.children as React.ReactNode)).trim() === 'דיוק';

  it('opens the small chat on the proposal itself: its id, and what it says', () => {
    const target = proposalTarget(NEW_RULE);
    expect(target).toMatchObject({ proposalId: 81, contactId: 14, contactName: 'מיכל ברק', messageIds: [] });
    expect(target.excerpt.map((line) => [line.label, line.text])).toEqual([
      ['ההצעה', 'מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה'],
      ['מה ישתנה', 'כשלקוח שואל שוב את אותה שאלה, הבוט עונה עליה ישירות ולא חוזר על התשובה הקודמת.'],
    ]);
  });

  it('from the review tab', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 1, applied_7d: 0, rejected_7d: 0, auto_mode: true, auto_apply: true });
    queryClient.setQueryData(botKeys.proposals('all'), [NEW_RULE]);
    const value = standIn();
    const made = drawn(within(value, <ReviewTab onOpenChat={noop} onOpenItem={noop} />), queryClient);
    (made.find(isRefine)!.props.onClick as () => void)();
    expect(value.open).toHaveBeenCalledTimes(1);
    expect(((value.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as RefineTarget).proposalId).toBe(81);
  });

  it('where there is no small chat to open, the card does not offer it', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 1, applied_7d: 0, rejected_7d: 0, auto_mode: true, auto_apply: true });
    queryClient.setQueryData(botKeys.proposals('all'), [NEW_RULE]);
    const made = drawn(<ReviewTab onOpenChat={noop} onOpenItem={noop} />, queryClient);
    expect(made.some(isRefine)).toBe(false);
  });

  it('the small chat then quotes the proposal and asks what to change in it', () => {
    const target = proposalTarget(NEW_RULE);
    expect(target.heading).toBe('ההצעה');
    const html = render(chatView({ excerpt: target.excerpt, excerptCount: 0, heading: target.heading, onProposal: true, contactName: target.contactName }));
    expect(html).toContain('placeholder="מה לשנות בהצעה?"');
    expect(html).toContain('>ההצעה<');
    expect(html).toContain('מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה');
    expect(html).toContain('על הצעה לעדכון הבוט');
    expect(html).not.toContain('הודעות שנבחרו');
    expect(html).not.toContain('מה לא היה טוב כאן?');
  });
});

// ---------------------------------------------------------------------------
// Review: "עודכן לבד", and the floating button
// ---------------------------------------------------------------------------

const auto = makeProposal(71, {
  status: 'applied',
  status_label: 'הוחל על הידע',
  source: 'refine',
  source_label: 'דיוק',
  title: 'מחיר חוג קפוארה: 280 ₪',
  explanation: 'המפעילה כתבה שהמחיר שהבוט אמר לא נכון.',
  contact_id: 12,
  contact_name: 'נועה לוי',
  change: { action: 'update', item_id: 7, kind: 'fact', before: { body: 'החוג עולה 250 ₪ לחודש.' }, after: { body: 'החוג עולה 280 ₪ לחודש.' } },
  change_kind_label: 'עובדה',
  decision_note: AUTO_APPLIED_NOTE,
  decided_at: '2026-10-11T13:00:00+03:00',
});
const undone = makeProposal(72, {
  status: 'undone',
  status_label: 'בוטל',
  title: 'אין שיעורים בשבת',
  decision_note: AUTO_APPLIED_NOTE,
  auto_applied: true,
  decided_at: '2026-10-11T12:00:00+03:00',
});
const byHand = makeProposal(73, { status: 'applied', status_label: 'הוחל על הידע', title: 'נוסח סגירה חדש', decision_note: 'נראה טוב', decided_by_name: 'דור', decided_at: '2026-10-11T11:00:00+03:00' });
const waiting = makeProposal(74, { title: 'לא לשאול שוב על העיר' });

describe('"עודכן לבד"', () => {
  const section = (over: Partial<Parameters<typeof AutoAppliedSection>[0]> = {}) => (
    <AutoAppliedSection proposals={[auto, undone]} autoApply now={NOW} busyId={null} onUndo={noop} onRefine={noop} {...over} />
  );
  const sayingIn = (made: ReturnType<typeof drawn>, word: string) =>
    made.filter((element) => element.type === 'button' && text(React.createElement('span', null, element.props.children as React.ReactNode)).trim() === word);

  it('a row is what the bot does from now on; why and what changed are a press away', () => {
    const html = render(section());
    expect(html).toContain('aria-label="עודכן לבד"');
    expect(html).toContain('מחיר חוג קפוארה: 280 ₪');
    expect(html).toContain('>עודכן לבד<');
    expect(html).toContain('נועה לוי');
    expect(html).toContain('aria-expanded="false"');
    // Folded: neither the reason nor the change is on screen yet.
    expect(html).not.toContain('המפעילה כתבה שהמחיר שהבוט אמר לא נכון.');
    expect(html).not.toContain('החוג עולה 280 ₪ לחודש.');
  });

  it('each row has "בטל" and "דיוק"; one that was taken back says "בוטל" and has neither', () => {
    const onUndo = vi.fn();
    const onRefine = vi.fn();
    const made = drawn(section({ onUndo, onRefine }));
    expect(sayingIn(made, 'בטל')).toHaveLength(1);
    expect(sayingIn(made, 'דיוק')).toHaveLength(1);
    (sayingIn(made, 'בטל')[0].props.onClick as () => void)();
    expect(onUndo).toHaveBeenCalledWith(auto);
    (sayingIn(made, 'דיוק')[0].props.onClick as () => void)();
    expect(onRefine).toHaveBeenCalledWith(auto);
    const html = render(section());
    expect(html).toContain('>בוטל<');
    expect(html).toContain(r.plainUndone);
  });

  it('while one is being taken back its button waits', () => {
    const made = drawn(section({ proposals: [auto], busyId: auto.id }));
    expect(sayingIn(made, 'בטל')[0].props.disabled).toBe(true);
  });

  it('a long list shows its first rows and offers the rest', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...auto, id: 100 + index, title: `תיקון ${index + 1}` }));
    const html = render(section({ proposals: many }));
    expect(html).toContain('תיקון 6');
    expect(html).not.toContain('תיקון 7');
    expect(html).toContain('הצג עוד 3');
  });

  it('the switch on and nothing applied yet: said in a line, not left blank', () => {
    expect(render(section({ proposals: [] }))).toContain('עוד לא היו תיקונים שנכנסו לבד.');
    expect(render(section({ proposals: [], autoApply: false }))).toBe('');
  });
});

describe('the review tab', () => {
  function reviewTab(summary: Record<string, unknown>, proposals = [auto, undone, byHand, waiting]) {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, summary);
    queryClient.setQueryData(botKeys.proposals('all'), proposals);
    return render(<ReviewTab onOpenChat={noop} onOpenItem={noop} />, queryClient);
  }
  const SUMMARY = { pending: 1, applied_7d: 3, rejected_7d: 0, auto_mode: true, auto_applied_7d: 2, auto_apply: true };

  it('lists what was applied by itself, apart from what a person decides', () => {
    const html = reviewTab(SUMMARY);
    expect(html).toContain('aria-label="עודכן לבד"');
    expect(html).toContain('עודכן לבד ב-7 ימים');
    expect(html).toContain('אישור אוטומטי פעיל');
    // The two that were applied by themselves are in their own list, above the filter — and not among the proposals below it.
    const [above, below] = html.split('aria-label="סינון"');
    expect(above).toContain('aria-label="מחיר חוג קפוארה: 280 ₪"');
    expect(above).toContain('aria-label="אין שיעורים בשבת"');
    expect(below).not.toContain('מחיר חוג קפוארה: 280 ₪');
    expect(below).not.toContain('אין שיעורים בשבת');
    // What a person decided, or still has to, is below, each the same kind of card.
    expect(below).toContain('aria-label="נוסח סגירה חדש"');
    expect(below).toContain('aria-label="לא לשאול שוב על העיר"');
    expect(above).not.toContain('נוסח סגירה חדש');
    // The old promise of "the next stage" is gone.
    expect(html).not.toContain('בשלב הבא');
  });

  it('counts only what a person decides in the filter', () => {
    const html = reviewTab(SUMMARY);
    // "הכול" = the one applied by hand + the one waiting.
    expect(html).toMatch(/הכול<span class="[^"]*">2<\/span>/);
    expect(html).toMatch(/ממתינות<span class="[^"]*">1<\/span>/);
  });

  it('the switch off and nothing ever applied by itself: no empty card', () => {
    const html = reviewTab({ ...SUMMARY, auto_apply: false, auto_applied_7d: 0 }, [byHand, waiting]);
    expect(html).not.toContain('aria-label="עודכן לבד"');
    expect(html).toContain('נוסח סגירה חדש');
  });

  it('a server built before auto-apply: the tile shows "–" and nothing is claimed about the switch', () => {
    const html = reviewTab({ pending: 1, applied_7d: 3, rejected_7d: 0, auto_mode: false }, [byHand, waiting]);
    expect(html).toContain('עודכן לבד ב-7 ימים');
    expect(html).not.toContain('אישור אוטומטי פעיל');
    expect(html).not.toContain('אישור אוטומטי כבוי');
  });
});

describe('the floating button', () => {
  it('counts only what waits for a decision — not what was applied by itself', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 1, applied_7d: 3, rejected_7d: 0, auto_mode: true, auto_applied_7d: 2, auto_apply: true });
    queryClient.setQueryData(botKeys.proposals('pending'), [auto, undone, waiting]);
    const html = render(<ProposalsFab onOpenChat={noop} onOpenItem={noop} onOpenReview={noop} />, queryClient);
    expect(html).toContain('יש הצעות לעדכון הבוט');
    expect(html).toContain('>1<');
  });

  it('is not there when everything was applied by itself', () => {
    const queryClient = client();
    queryClient.setQueryData(botKeys.reviewSummary, { pending: 0, applied_7d: 3, rejected_7d: 0, auto_mode: true, auto_applied_7d: 3, auto_apply: true });
    queryClient.setQueryData(botKeys.proposals('pending'), [auto]);
    expect(render(<ProposalsFab onOpenChat={noop} onOpenItem={noop} onOpenReview={noop} />, queryClient)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Settings: the one switch
// ---------------------------------------------------------------------------

describe('"אישור אוטומטי של תיקונים" in the settings', () => {
  const view = (over: Partial<Parameters<typeof AutoApplyView>[0]> = {}) => (
    <AutoApplyView on state="ready" busy={false} onToggle={noop} onRetry={noop} {...over} />
  );
  const isSwitch = (props: Props) => props.role === 'switch';

  it('is one switch with one line saying what it does', () => {
    const html = render(view());
    expect(AUTO_APPLY_TITLE).toBe('אישור אוטומטי של תיקונים');
    expect(html).toContain(AUTO_APPLY_TITLE);
    expect(html.split(AUTO_APPLY_LINE.replace(/"/g, '&quot;')).length - 1).toBe(1);
    expect((html.match(/role="switch"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/role="switch" aria-checked="true"/);
  });

  it('a press asks for the other state', () => {
    const onToggle = vi.fn();
    press(find(view({ onToggle }), isSwitch));
    expect(onToggle).toHaveBeenLastCalledWith(false);
    press(find(view({ on: false, onToggle }), isSwitch));
    expect(onToggle).toHaveBeenLastCalledWith(true);
  });

  it('waits while the press is on its way', () => {
    expect(find(view({ busy: true }), isSwitch).props.disabled).toBe(true);
  });

  it('a server without it: "עוד לא זמין", and no switch that would do nothing', () => {
    const html = render(view({ state: 'unavailable' }));
    expect(html).toContain('עוד לא זמין');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('role="alert"');
  });

  it('a failure to read it offers another try', () => {
    const onRetry = vi.fn();
    const failed = view({ state: 'error', onRetry });
    expect(render(failed)).toContain('לא הצלחנו לטעון את המתג');
    press(find(failed, buttonSaying('נסה שוב')));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
