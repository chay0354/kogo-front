/**
 * The owner's round of 15.10.2026 on the conversations screen: the boxes say what they mean ("מה זה אומר?" —
 * on hover, on a long press, behind the "?" of their group), "ברכת יום הולדת" with a clock, the bubbles name the
 * bot "בוט" and the old one "בוט ישן", and an office message never shows an email.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_BOXES, type BoxDef } from '@/lib/wahub/boxes';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubBoxCounts } from '@/types/wahub';
import b from '../boxHelp.module.css';
import { HoverHelp } from '../shared/StageHelp';
import s from '../wahub.module.css';
import { BoxChip, BoxHelpSheet, GroupHelpButton, HOLD_MS, createHold } from './BoxHelp';
import ChatList from './ChatList';
import { senderLine } from './MessageBubble';

(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-15T12:00:00+03:00');
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

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const def = (key: string) => CHAT_BOXES.find((box) => box.key === key) as BoxDef;

const COUNTS: WahubBoxCounts = { all: 30, waiting: 2, needs_human: 1, unread: 4, human: 3, bot: 27, open: 5, future: 1, birthday: 2, overdue: 0 };

function list(over: Partial<React.ComponentProps<typeof ChatList>> = {}) {
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

describe('the boxes above the conversations', () => {
  it('the second group is "מצב השיחה", with "לא נענו" and "לא נפתחו"; "ברכת יום הולדת" stands among the person\'s', () => {
    const html = text(render(list()));
    expect(html).toContain('מצב השיחה');
    expect(html).not.toMatch(/(^| )בוט( |$)/);
    expect(html).toContain('לא נענו 2');
    expect(html).toContain('לא נפתחו 4');
    expect(html).not.toContain('מחכים לתשובה');
    expect(html).not.toContain('לא נקראו');
    expect(html.indexOf('מבקשים נציג')).toBeLessThan(html.indexOf('ברכת יום הולדת'));
    expect(html.indexOf('ברכת יום הולדת')).toBeLessThan(html.indexOf('בטיפול נציג'));
  });

  it('"ברכת יום הולדת" carries a clock before its name, and its count', () => {
    const html = render(list());
    const chip = html.match(/<button[^>]*data-box="birthday"[^>]*>.*?<\/button>/)?.[0] ?? '';
    expect(chip).toContain('<svg');
    expect(chip).toContain('lucide-clock');
    expect(text(chip)).toBe('ברכת יום הולדת 2');
    // No other box has a picture.
    const others = html.match(/<button[^>]*data-box="(?!birthday)[a-z_]+"[^>]*>.*?<\/button>/g) ?? [];
    expect(others.length).toBe(7);
    expect(others.some((other) => other.includes('<svg'))).toBe(false);
  });

  it('a server that does not count it is not offered it', () => {
    const { birthday: _gone, ...older } = COUNTS;
    expect(render(list({ counts: older as WahubBoxCounts }))).not.toContain('data-box="birthday"');
  });

  it('every box with words has them behind a mouse resting on it — not in the browser\'s own small note', () => {
    const made = drawn(list());
    const bubbles = made.filter((element) => element.type === HoverHelp && element.props.help);
    expect(bubbles.map((element) => element.props.help)).toEqual(CHAT_BOXES.filter((box) => box.help).map((box) => box.help));
    const html = render(list());
    expect(html).not.toContain(`title="${def('waiting').hint}"`);
    // "הכול" has no words: its note stays.
    expect(html).toContain('title="כל השיחות"');
  });

  it('a "?" beside each group\'s name opens the words of all its boxes', () => {
    const made = drawn(list());
    const buttons = made.filter((element) => element.type === GroupHelpButton);
    expect(buttons.map((element) => element.props.label)).toEqual(['נציג', 'מצב השיחה']);
    const html = render(<GroupHelpButton label="מצב השיחה" open={false} onToggle={noop} />);
    expect(html).toContain('aria-label="מה אומרת כל תיבה ב&quot;מצב השיחה&quot;?"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-box-help=""');
  });

  it('the sheet under the boxes says one box\'s two lines, the point in bold', () => {
    const html = render(<BoxHelpSheet open={{ kind: 'box', def: def('unread') }} onClose={noop} />);
    expect(html).toContain(b.sheet);
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('לא נפתחו');
    expect(html).toContain('<b>אף אחד מהמשרד עוד לא פתח</b>');
    expect(text(html)).toContain('(גם אם הבוט כבר ענה)');
    expect(html).toContain('aria-label="סגור"');
  });

  it('and a group\'s boxes, each with its name', () => {
    const defs = CHAT_BOXES.filter((box) => box.group === 'bot');
    const html = render(<BoxHelpSheet open={{ kind: 'group', label: 'מצב השיחה', defs }} onClose={noop} />);
    expect(html.match(/<dt>/g)).toHaveLength(2);
    expect(html).toContain('<dt>לא נענו</dt>');
    expect(html).toContain('<b>אף אחד</b>');
    expect(html).toContain('<b>לא ענה לו</b>');
    expect(text(html)).toContain('הלקוח כתב, ועוד אף אחד (לא הבוט ולא נציג) לא ענה לו');
    expect(html).toContain('<dt>לא נפתחו</dt>');
    expect(render(<BoxHelpSheet open={null} onClose={noop} />)).toBe('');
  });

  it('a box is still a filter: a plain press chooses it', () => {
    const onPress = vi.fn();
    const made = drawn(<BoxChip def={def('waiting')} count={2} active={false} loud={false} onPress={onPress} onHold={noop} />);
    const button = made.find((element) => element.type === 'button')!;
    (button.props.onClick as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.className).toContain(b.holdable);
    expect(button.props.className).toContain(s.chipbtn);
  });
});

describe('a long press on a box', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a finger resting on it opens its words, and the click that follows does not filter', () => {
    const onHold = vi.fn();
    const hold = createHold(onHold);
    hold.down('touch', 10, 10);
    expect(hold.blocksMenu()).toBe(true);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(hold.held()).toBe(true);
    // Read once: the next press is a press again.
    expect(hold.held()).toBe(false);
  });

  it('a short tap is a press; a finger that moves is scrolling the row; a mouse never holds', () => {
    const onHold = vi.fn();
    const hold = createHold(onHold);
    hold.down('touch', 10, 10);
    vi.advanceTimersByTime(200);
    hold.cancel();
    vi.advanceTimersByTime(HOLD_MS);
    expect(hold.held()).toBe(false);

    hold.down('touch', 10, 10);
    hold.move(14, 12);
    hold.move(40, 10);
    vi.advanceTimersByTime(HOLD_MS);
    expect(hold.held()).toBe(false);

    hold.down('mouse', 10, 10);
    vi.advanceTimersByTime(HOLD_MS);
    expect(hold.held()).toBe(false);
    expect(hold.blocksMenu()).toBe(false);
    expect(onHold).not.toHaveBeenCalled();
  });
});

describe('who wrote a message, in the bubble\'s small line', () => {
  it('the new bot is "בוט" and the old one "בוט ישן"', () => {
    expect(senderLine(makeMessage(1, { direction: 'out', sender: 'bot', sender_label: 'בוט', new_bot: true }))).toBe('בוט');
    expect(senderLine(makeMessage(2, { direction: 'out', sender: 'bot', sender_label: 'בוט' }))).toBe('בוט ישן');
    expect(senderLine(makeMessage(3))).toBe('');
  });

  it('the office with the writer\'s name — never an email; with neither, "משרד"', () => {
    const office = (sender_name: string | null) => makeMessage(4, { direction: 'out', sender: 'office', sender_label: 'משרד', sender_name, status: 'sent' });
    expect(senderLine(office('מיכל כהן'))).toBe('משרד · מיכל כהן');
    expect(senderLine(office('cogo@cogo.co.il'))).toBe('משרד');
    expect(senderLine(office(''))).toBe('משרד');
    expect(senderLine(office(null))).toBe('משרד');
    expect(senderLine({ ...office(null), sender_label: '' })).toBe('משרד');
  });
});

describe('a conversation in the list', () => {
  it('waits for the birthday greeting: the row says where it stands while a search looks everywhere', () => {
    const contact = makeContact(1, {
      name: 'רונית לב',
      chat: { open: true, open_reason: 'birthday', box: 'birthday', box_label: 'מחכה לברכה ליום הולדת', birthday_wait_since: '2026-10-15T09:00:00+03:00' },
    });
    const html = render(list({ items: [contact], search: 'רונית', found: 'רונית' }));
    expect(text(html)).toContain('מחכה לברכה ליום הולדת');
  });
});
