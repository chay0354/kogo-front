/**
 * "השיחה התחילה לפני המעבר" (the owner, 14.10.2026: "שלא יהיה מצב… שאתחיל לענות לדברים בלי שאני יודע את ההיסטוריה"):
 * a conversation from before the switch says so at its head, with the way to read all of it in ManyChat.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { historyLine, readHistoryLines } from '@/lib/wahub/history';
import HistoryStrip from './HistoryStrip';
import { CopiedBubble } from './MessageBubble';

(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-14T11:00:00Z');
const NOTE = { switched_at: '2026-10-14T09:32:31Z', manychat_url: 'https://app.manychat.com/fb5259597/chat/987654321' };

describe('the strip of a conversation from before the switch', () => {
  it('says what is missing and where it is, with the link that opens it', () => {
    const line = historyLine(NOTE, NOW);
    expect(line?.title).toBe('השיחה התחילה לפני המעבר לבוט החדש');
    expect(line?.text).toContain('ענה כאן הבוט הישן');
    expect(line?.text).toContain('12:32');
    const html = renderToStaticMarkup(<HistoryStrip note={NOTE} now={NOW} />);
    expect(html).toContain('href="https://app.manychat.com/fb5259597/chat/987654321"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('לשיחה המלאה ב-ManyChat');
  });

  it('with no number of ManyChat on record it says how to find it, with no link', () => {
    const html = renderToStaticMarkup(<HistoryStrip note={{ ...NOTE, manychat_url: '' }} now={NOW} />);
    expect(html).not.toContain('<a ');
    expect(html).toContain('לפי מספר הטלפון');
  });

  it('a conversation from after the switch, or an older server, shows nothing', () => {
    expect(renderToStaticMarkup(<HistoryStrip note={null} now={NOW} />)).toBe('');
    expect(renderToStaticMarkup(<HistoryStrip note={undefined} now={NOW} />)).toBe('');
  });
});

describe('once the conversation from before the switch was copied from ManyChat', () => {
  const COPIED = { ...NOTE, copied_at: '2026-10-14T10:40:00Z' };

  it('the strip says the lines are in the conversation, marked, and ManyChat is left for pictures and recordings', () => {
    const line = historyLine(COPIED, NOW);
    expect(line?.text).toContain('הועתק לכאן');
    expect(line?.text).toContain('"מ-ManyChat"');
    const html = renderToStaticMarkup(<HistoryStrip note={COPIED} now={NOW} />);
    expect(html).toContain('תמונות והקלטות — ב-ManyChat');
    // With no number on record there is nothing to point to, and nothing empty is drawn.
    expect(renderToStaticMarkup(<HistoryStrip note={{ ...COPIED, manychat_url: '' }} now={NOW} />)).not.toContain('<span class="quiet');
  });

  it('a copied line is the bubble it was, dashed, with who wrote it and "מ-ManyChat"', () => {
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
