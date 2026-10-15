/**
 * The writing box, 15.10.2026, drawn without a browser: the two openers of a closed conversation, a ready-made
 * reply taken once, 📎 and the file waiting above the box, "משיב ל:", and a bubble's "השב" and quote.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { ATTACH_ACCEPT } from '@/lib/wahub/composer';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import Composer, { AttachmentStrip, OpenersBox, QuickRepliesMenu, ReplyStrip } from './Composer';
import MessageBubble from './MessageBubble';
import c from './composer.module.css';
import s from '../wahub.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** The elements a stateless component draws, walked without a browser. */
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

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

function buttons(node: React.ReactNode) {
  return elements(node).filter((element) => element.type === 'button') as Array<React.ReactElement<Record<string, unknown>>>;
}

const base = {
  sending: false,
  simulated: false,
  sendingOff: false,
  onSend: async () => true,
  onSendFlow: async () => true,
  onOpenSettings: noop,
};
const opening = async () => ({ ok: true, text: 'נשלח ✓' });

describe('a closed conversation: the two openers, and nothing else to send', () => {
  it('only "פתיחת שיחה" and "המשך שיחה" — the list of templates is out of the box; the note stays', () => {
    const contact = makeContact(12, { chat: { can_free_text: false } });
    const html = render(<Composer {...base} contact={contact} onSendOpening={opening} onNote={async () => ''} />);
    expect(html).toContain(s.lockBox);
    expect(html).toContain('פתיחת שיחה');
    expect(html).toContain('המשך שיחה');
    expect(html).not.toContain('שלח תבנית');
    expect(html).not.toContain('<textarea');
    expect(html).toContain('aria-label="פתק על הלקוח"');
  });

  it('who wrote and went quiet is continued first; who never wrote is opened first', () => {
    const quiet = render(<Composer {...base} contact={makeContact(12, { chat: { can_free_text: false } })} onSendOpening={opening} />);
    expect(quiet.indexOf('המשך שיחה')).toBeLessThan(quiet.indexOf('פתיחת שיחה'));
    const never = render(
      <Composer
        {...base}
        contact={makeContact(13, { last_inbound_at: null, first_inbound_at: null, chat: { can_free_text: false } })}
        onSendOpening={opening}
      />,
    );
    expect(never.indexOf('פתיחת שיחה')).toBeLessThan(never.indexOf('המשך שיחה'));
    expect(never).toContain('הלקוח עוד לא כתב לנו');
  });

  it('sending switched off: no opener either', () => {
    const html = render(<Composer {...base} sendingOff contact={makeContact(12)} onSendOpening={opening} />);
    expect(html).toContain('השליחה ללקוחות כבויה');
    expect(html).not.toContain('פתיחת שיחה');
  });

  it('a press sends at once — no step to confirm — and both wait while one is on its way', () => {
    const onPress = vi.fn();
    const contact = makeContact(12);
    const box = OpenersBox({ contact, sending: false, busy: null, outcome: null, onPress });
    const [first, second] = buttons(box);
    expect(textOf(first.props.children as React.ReactNode)).toContain('המשך שיחה');
    (first.props.onClick as () => void)();
    expect(onPress).toHaveBeenCalledWith('continue');
    (second.props.onClick as () => void)();
    expect(onPress).toHaveBeenLastCalledWith('open');

    const busy = OpenersBox({ contact, sending: true, busy: 'continue', outcome: null, onPress });
    expect(buttons(busy).every((button) => button.props.disabled === true)).toBe(true);
    expect(render(busy)).toContain('שולח…');
  });

  it('what became of it is said under the buttons', () => {
    const contact = makeContact(12);
    const ok = render(<OpenersBox contact={contact} sending={false} busy={null} outcome={{ ok: true, text: 'נשלח ✓' }} onPress={noop} />);
    expect(ok).toContain('נשלח ✓');
    expect(ok).toContain(c.openerOk);
    const bad = render(
      <OpenersBox contact={contact} sending={false} busy={null} outcome={{ ok: false, text: 'חסרה ב-ManyChat תבנית בשם open chat' }} onPress={noop} />,
    );
    expect(bad).toContain('חסרה ב-ManyChat תבנית בשם open chat');
    expect(bad).toContain(c.openerBad);
    expect(bad).toContain('role="status"');
  });

  it('a thread with no opener to send keeps the list of templates, as before', () => {
    const html = render(<Composer {...base} contact={makeContact(12, { chat: { can_free_text: false } })} />);
    expect(html).toContain('שלח תבנית');
    expect(html).not.toContain('פתיחת שיחה');
  });
});

describe('a ready-made reply goes out on the press', () => {
  const replies = [{ id: 1, title: 'פתיחה', text: 'היי {{first_name}}' }];

  it('a press hands the reply on; while a message is on its way no second one is taken', () => {
    const onPick = vi.fn();
    const menu = QuickRepliesMenu({ replies, loading: false, failed: false, onPick, onManage: noop });
    const [item] = buttons(menu);
    (item.props.onClick as () => void)();
    expect(onPick).toHaveBeenCalledWith(replies[0]);
    const sending = QuickRepliesMenu({ replies, loading: false, failed: false, sending: true, onPick, onManage: noop });
    expect(buttons(sending)[0].props.disabled).toBe(true);
  });
});

describe('a file, and "משיב ל:"', () => {
  it('📎 is beside the box when files can be sent, with the kinds WhatsApp takes', () => {
    const html = render(<Composer {...base} contact={makeContact(12)} onSendMedia={async () => true} />);
    expect(html).toContain('aria-label="צרף קובץ"');
    expect(html).toContain('type="file"');
    expect(html).toContain(`accept="${ATTACH_ACCEPT}"`);
    expect(render(<Composer {...base} contact={makeContact(12)} />)).not.toContain('צרף קובץ');
  });

  it('the file waits above the box: its name and size, then the step it is at — × only while it waits', () => {
    const file = { name: 'מערך שיעור.pdf', size: 320 * 1024 };
    const waiting = render(<AttachmentStrip attachment={{ file, kind: 'file', preview: '' }} phase={null} onRemove={noop} />);
    expect(waiting).toContain('מערך שיעור.pdf');
    expect(waiting).toContain('320KB');
    expect(waiting).toContain('aria-label="הסר את הקובץ"');
    const uploading = render(<AttachmentStrip attachment={{ file, kind: 'file', preview: '' }} phase="upload" onRemove={noop} />);
    expect(uploading).toContain('מעלה את הקובץ…');
    expect(uploading).not.toContain('הסר את הקובץ');
    expect(render(<AttachmentStrip attachment={{ file, kind: 'video', preview: '' }} phase="send" onRemove={noop} />)).toContain('שולח…');
    const picture = render(<AttachmentStrip attachment={{ file: { name: 'a.png', size: 10 }, kind: 'image', preview: 'blob:x' }} phase={null} onRemove={noop} />);
    expect(picture).toContain('src="blob:x"');
  });

  it('"משיב ל:" with the line quoted, and × to answer nobody in particular', () => {
    const onClear = vi.fn();
    const strip = ReplyStrip({ excerpt: 'כמה עולה?', onClear });
    expect(render(strip)).toContain('משיב ל:');
    expect(render(strip)).toContain('כמה עולה?');
    (buttons(strip)[0].props.onClick as () => void)();
    expect(onClear).toHaveBeenCalled();
    const html = render(
      <Composer {...base} contact={makeContact(12)} replyTo={makeMessage(5, { text: 'כמה עולה?\nויש מקום?' })} onClearReply={noop} />,
    );
    expect(html).toContain('משיב ל:');
    expect(html).toContain('כמה עולה?');
    expect(html).not.toContain('ויש מקום?');
  });
});

describe('a bubble: "השב" and a quote', () => {
  it('"השב" stands beside a bubble that can be answered, and only there', () => {
    const message = makeMessage(5);
    const html = render(<MessageBubble message={message} arrived={false} onReply={noop} />);
    expect(html).toContain('aria-label="השב להודעה הזו"');
    expect(html).toContain(c.replyHost);
    expect(render(<MessageBubble message={message} arrived={false} />)).not.toContain('השב');
    // A bubble still on its way has nothing to answer yet.
    expect(render(<MessageBubble message={makeMessage(-5)} arrived={false} onReply={noop} />)).not.toContain('השב');
    // Ours stands on the other side: the button goes before it.
    expect(render(<MessageBubble message={makeMessage(6, { direction: 'out', sender: 'office' })} arrived={false} onReply={noop} />)).toContain(
      c.replyBtnOut,
    );
  });

  it('the "> " lines a reply starts with are a quote; the rest is the answer', () => {
    const html = render(<MessageBubble message={makeMessage(7, { direction: 'out', sender: 'office', text: '> כמה עולה?\n\n260 ₪ לחודש' })} arrived={false} />);
    expect(html).toMatch(new RegExp(`<blockquote class="${c.quote}"[^>]*>כמה עולה\\?</blockquote>`));
    expect(html).toContain('260 ₪ לחודש');
    expect(html).not.toContain('&gt; כמה');
    expect(render(<MessageBubble message={makeMessage(8, { text: 'בלי ציטוט' })} arrived={false} />)).not.toContain('<blockquote');
  });

  it('a video or a document the office sent is a file, not "אחר"', () => {
    const video = makeMessage(9, {
      direction: 'out',
      sender: 'office',
      message_type: 'other',
      media_url: 'office/12/0b5a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.mp4',
      has_media: true,
      text: 'לצפייה',
    });
    const html = render(<MessageBubble message={video} arrived={false} />);
    expect(html).not.toContain('אחר');
    expect(html).toContain(s.media);
    expect(html).toContain('לצפייה');
  });
});
