import type { WahubChatState } from '@/types/wahub';
import type { WahubUrlState } from './params';

/**
 * Which panes of the conversations screen are on show. The answer depends on
 * the room the screen has and on what is open — never on the window alone,
 * because the side menu takes a column of the same window.
 */

/** A phone: the stylesheet's own line (`@media (max-width: 767px)` in wahub.module.css). */
export const PHONE_MEDIA_QUERY = '(max-width: 767px)';

/** Under a desktop's width (the CRM's own line, where the side menu turns into a drawer): never three columns. */
export const BELOW_DESKTOP_MEDIA_QUERY = '(max-width: 1023px)';

/**
 * Room for all three columns side by side (docs/WAHUB-CONTRACT-LAYOUT.md, א).
 * The contract speaks of a 1024px window; the menu beside the page takes 64px
 * of it when folded, which leaves the frame this much.
 */
export const WIDE_FROM = 960;
/** Room for the list beside the conversation. Below it: one pane at a time, like a phone. */
export const MEDIUM_FROM = 680;

export type ChatLayout = 'wide' | 'medium' | 'narrow';

/**
 * The layout for a frame of this width. Unmeasured (the first paint) counts as
 * wide. A phone is narrow whatever the frame measures, so the screen and the
 * stylesheet, which draws the phone from the same media query, never disagree.
 * A window under a desktop's width (768–1023) keeps to the list and the
 * conversation however much room the frame has: the contact's card is a drawer there.
 */
export function chatLayout(width: number | null, phone = false, belowDesktop = false): ChatLayout {
  if (phone) return 'narrow';
  if (width === null || width >= WIDE_FROM) return belowDesktop ? 'medium' : 'wide';
  return width >= MEDIUM_FROM ? 'medium' : 'narrow';
}

export interface ChatColumns {
  /** The conversations list, on the right. */
  list: number;
  /** The contact's card, on the left. */
  details: number;
}

/** The frame a 1440px window leaves with the menu folded (1376): the contract's larger columns start here. */
export const ROOMY_FROM = 1360;
/** Under this the three columns only fit with the two side ones drawn in (a 1280px window with the menu open leaves 1024). */
export const COMFORT_FROM = 1160;

/**
 * How wide the two side columns are; the conversation takes all the rest.
 * 340 / 380 as the contract says, 380 / 420 where there is room for them, and
 * a step narrower where the menu leaves little — so the conversation, which is
 * what the screen is for, never drops under a phone's width.
 */
export function chatColumns(width: number | null): ChatColumns {
  if (width !== null && width >= ROOMY_FROM) return { list: 380, details: 420 };
  if (width === null || width >= COMFORT_FROM) return { list: 340, details: 380 };
  return { list: 280, details: 320 };
}

export interface ChatPanes {
  list: boolean;
  thread: boolean;
  details: boolean;
  /** The details lie over the conversation as a drawer, rather than beside it or instead of it. */
  drawer: boolean;
  /** "בחרו שיחה מהרשימה", where a conversation would be. */
  placeholder: boolean;
}

/**
 * Wide: the list, the conversation and the details all at once — the details
 * are open unless the card was put away ("הסתר כרטיס"), and then the
 * conversation has their room. Medium: the list beside the conversation, and
 * the details as a drawer over it when asked for. Narrow (a phone): one of the
 * three — the list until a conversation is opened, then the conversation, then
 * the details when asked for. Putting the card away is a desktop's choice: a
 * tablet and a phone do not read it.
 */
export function chatPanes(layout: ChatLayout, contactId: number | null, detailsOpen: boolean, cardHidden = false): ChatPanes {
  const open = contactId != null;
  const drawer = open && layout === 'medium' && detailsOpen;
  return {
    list: layout !== 'narrow' || !open,
    thread: open && (layout !== 'narrow' || !detailsOpen),
    details: open && (layout === 'wide' ? !cardHidden : detailsOpen),
    drawer,
    placeholder: !open && layout !== 'narrow',
  };
}

/**
 * A conversation is open: on a phone the page's own title row and the bottom
 * bar step aside and the conversation fills the screen. Only the chats tab
 * holds a conversation; a contact left in the address on another tab is not one.
 */
export function conversationOpen(url: Pick<WahubUrlState, 'tab' | 'contact'>): boolean {
  return url.tab === 'chats' && url.contact != null;
}

/**
 * The short line under the name at the top of a conversation on a phone:
 * who answers, and whether the person asked for a human.
 */
export function phoneStatusLine(
  chat: Pick<WahubChatState, 'handled_by' | 'handled_by_label' | 'needs_human'>,
  demo = false,
  liveTest = false,
): string {
  const parts: string[] = [];
  if (demo) parts.push('דמו');
  // The sub line that carries the tag on a desktop is folded away on a phone, so the state line says it.
  if (liveTest) parts.push('בדיקה חיה');
  parts.push(chat.handled_by === 'human' ? 'נציג עונה' : chat.handled_by_label || 'הבוט עונה');
  if (chat.needs_human) parts.push('מבקש נציג');
  return parts.join(' · ');
}
