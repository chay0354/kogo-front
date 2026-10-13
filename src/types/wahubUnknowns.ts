/**
 * "מה הבוט לא ידע השבוע" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.3): the questions of real customers the new
 * bot had no answer to, gathered into topics — so the owner teaches the answer once, where it was missing.
 *
 * These are the shapes the screen keeps; what the server sends is read into them, leniently, in
 * src/lib/wahub/unknowns.ts. No name and no phone is ever in them: the server takes both out before it keeps
 * a question.
 */

export type WahubUnknownWeek = 'this' | 'last';

/** Which topics a read asks for: the open ones (and the ones taught that are still asked), or one of the two that left the list. */
export type WahubUnknownFilter = 'active' | 'taught' | 'dismissed' | 'all';

export type WahubUnknownStatus = 'open' | 'taught' | 'dismissed';

/** Against the week before: more, fewer, the same — or `new`, when nobody asked it then. Empty: the server did not say. */
export type WahubUnknownTrend = 'up' | 'down' | 'same' | 'new' | '';

/** One question, in the customer's own words. */
export interface WahubUnknownExample {
  question: string;
  at: string | null;
}

export interface WahubUnknownTopic {
  id: number;
  /** A short title in Hebrew: "חניה בסניף". */
  title: string;
  status: WahubUnknownStatus;
  status_label: string;
  /** How many times in the week that was asked for, and in the week before it. */
  count: number;
  count_before: number;
  trend: WahubUnknownTrend;
  /** Ever. */
  total: number;
  last_asked_at: string | null;
  /** Up to three, the newest first. */
  examples: WahubUnknownExample[];
  /** What the bot answered the last time, up to 200 characters. */
  bot_said: string;
  /** It was taught, and asked again afterwards: it is back on the list. */
  still_asked: boolean;
  taught: { at: string | null; by_name: string; thread: number | null } | null;
  dismissed: { at: string | null; by_name: string } | null;
}

/** GET bot/unknowns/ */
export interface WahubUnknowns {
  week: { key: WahubUnknownWeek; from: string; to: string; label: string };
  /** Of the week asked for and of the open topics, whatever the list is narrowed to. `topics` is the number beside "ללמד". */
  counts: { topics: number; questions: number; unsorted: number };
  /** When the questions were last sorted into topics; null — never. */
  sorted_at: string | null;
  results: WahubUnknownTopic[];
  /** Questions of the week the sorting has not reached yet: how many, and up to three of them. Nothing can be done with them. */
  unsorted: { count: number; examples: WahubUnknownExample[] };
}
