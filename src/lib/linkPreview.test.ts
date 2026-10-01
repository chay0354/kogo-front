import { describe, expect, it } from 'vitest';

import { SITE_URL, linkPreview } from './linkPreview';

describe('linkPreview', () => {
  const pay = linkPreview({ kind: 'pay', title: 'תשלום מאובטח — קוגומלו', description: 'לחצו כדי לשלם בעמוד מאובטח.' });

  it('gives the chat a picture, a headline and a line of text', () => {
    const images = pay.openGraph?.images as { url: string; width: number; height: number }[];
    expect(images[0]).toMatchObject({ url: '/og/pay.png', width: 1200, height: 630 });
    expect(pay.openGraph?.title).toBe('תשלום מאובטח — קוגומלו');
    expect(pay.openGraph?.description).toBe('לחצו כדי לשלם בעמוד מאובטח.');
    expect((pay.twitter as { card?: string }).card).toBe('summary_large_image');
  });

  it('keeps a token page out of search engines, and a public page in', () => {
    expect(pay.robots).toEqual({ index: false, follow: false });
    const widget = linkPreview({ kind: 'register', title: 'הרשמה', description: 'x', tokenPage: false });
    expect(widget.robots).toBeUndefined();
  });

  it('each kind has its own picture', () => {
    const urls = (['pay', 'card', 'sign', 'register'] as const).map(
      (kind) => (linkPreview({ kind, title: 't', description: 'd' }).openGraph?.images as { url: string }[])[0].url,
    );
    expect(new Set(urls).size).toBe(4);
  });

  it('the site address has no trailing slash, so the picture address joins cleanly', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
    expect(SITE_URL.startsWith('http')).toBe(true);
  });
});
