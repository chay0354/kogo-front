/**
 * "השיחה התחילה לפני המעבר" (the owner, 14.10.2026: "שלא יהיה מצב… שאתחיל לענות לדברים בלי שאני יודע את ההיסטוריה"):
 * a conversation from before the switch says so at its head, with the way to read all of it in ManyChat.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { historyLine } from '@/lib/wahub/history';
import HistoryStrip from './HistoryStrip';

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
