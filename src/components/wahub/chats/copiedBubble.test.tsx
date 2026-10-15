/**
 * The conversation from before the switch, copied from ManyChat (lib/wahub/history.ts): each line stands in its
 * place among the messages as the bubble it was. The big strip that said so at the head of the conversation is
 * gone (the owner, 15.10.2026) — the bubbles say "מ-ManyChat" on their own.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { readHistoryLines } from '@/lib/wahub/history';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail } from '@/types/wahub';
import type { ContactThread } from '../hooks/useContactThread';
import ChatThread from './ChatThread';
import { CopiedBubble } from './MessageBubble';

(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-14T11:00:00Z');
const noop = () => {};

describe('a line copied from ManyChat', () => {
  it('is the bubble it was, dashed, with who wrote it and "מ-ManyChat"', () => {
    const [bot, customer] = readHistoryLines([
      { id: 1, sent_at: '2026-10-10T08:00:00Z', direction: 'out', sender: 'bot', text: 'החוג עולה 230 ₪', message_type: 'text' },
      { id: 2, sent_at: '2026-10-10T07:59:00Z', direction: 'in', sender: 'customer', text: 'כמה עולה?', message_type: 'image' },
    ]);
    const botHtml = renderToStaticMarkup(<CopiedBubble line={bot} />);
    expect(botHtml).toContain('בוט ישן · מ-ManyChat');
    expect(botHtml).toContain('החוג עולה 230 ₪');
    expect(botHtml).toContain('copied');
    expect(renderToStaticMarkup(<CopiedBubble line={customer} />)).toContain('תמונה · מ-ManyChat');
  });

  it('a line that cannot be read is left out, never guessed', () => {
    expect(readHistoryLines(null)).toEqual([]);
    const lines = readHistoryLines([
      { id: 'x', sent_at: '2026-10-10T08:00:00Z', sender: 'bot' },
      { id: 3, sent_at: '2026-10-10T08:00:00Z', sender: 'stranger' },
      { id: 4, sent_at: '2026-10-10T08:00:00Z', sender: 'office', direction: 'out', text: 'שלום', message_type: 'weird' },
    ]);
    expect(lines).toEqual([
      { id: 4, sent_at: '2026-10-10T08:00:00Z', sender: 'office', direction: 'out', text: 'שלום', message_type: 'text' },
    ]);
  });
});

describe('a conversation from before the switch', () => {
  const contact: WahubContactDetail = {
    ...makeContact(12, { name: 'דנה כהן' }),
    history: { switched_at: '2026-10-14T09:32:31Z', manychat_url: 'https://app.manychat.com/fb5259597/chat/987654321', copied_at: '2026-10-14T10:40:00Z' },
    history_lines: [{ id: 1, sent_at: '2026-10-10T08:00:00Z', direction: 'out', sender: 'bot', text: 'החוג עולה 230 ₪', message_type: 'text' }],
    messages: [],
    has_older: false,
    events: [],
  };
  const thread: ContactThread = {
    contactId: 12,
    contact,
    messages: [makeMessage(1, { text: 'כמה עולה?' })],
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

  it('has no strip at its head any more — the copied lines stand among the messages, marked', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ChatThread
          thread={thread}
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
        />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('השיחה התחילה לפני המעבר');
    expect(html).not.toContain('לשיחה המלאה ב-ManyChat');
    expect(html).not.toContain('role="note"');
    expect(html).toContain('בוט ישן · מ-ManyChat');
    expect(html).toContain('החוג עולה 230 ₪');
  });
});
