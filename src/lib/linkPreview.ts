import type { Metadata } from 'next';

/**
 * What a link the office sends looks like before it is opened.
 *
 * WhatsApp (and every other chat) reads the page's head and shows a card: a
 * picture, a title, a line of text. Without it a parent got a bare address —
 * the owner's words, 30.9.2026: "קישור מכוער". The card is the same for every
 * link of a kind and says nothing about the customer or the sum: a preview is
 * read by whoever the link is forwarded to, and by the chat's own servers.
 */

/** Where the app is served from. A preview picture needs a full address. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kogo-front.vercel.app').replace(/\/+$/, '');

export type LinkPreviewKind = 'pay' | 'card' | 'sign' | 'register';

const PICTURES: Record<LinkPreviewKind, string> = {
  pay: '/og/pay.png',
  card: '/og/card.png',
  sign: '/og/sign.png',
  register: '/og/register.png',
};

interface LinkPreviewOptions {
  kind: LinkPreviewKind;
  /** The tab's name and the card's headline. */
  title: string;
  /** One short line under the headline. */
  description: string;
  /** A page reached only by its token is kept out of search engines. */
  tokenPage?: boolean;
}

export function linkPreview({ kind, title, description, tokenPage = true }: LinkPreviewOptions): Metadata {
  const picture = { url: PICTURES[kind], width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    ...(tokenPage ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title,
      description,
      siteName: 'קוגומלו',
      locale: 'he_IL',
      type: 'website',
      images: [picture],
    },
    twitter: { card: 'summary_large_image', title, description, images: [picture.url] },
  };
}
