import type { WahubChatState } from '@/types/wahub';
import type { WahubUrlState } from './params';

/**
 * Which panes of the conversations screen are on show. The answer depends on
 * the room the screen has and on what is open — never on the window alone,
 * because the side menu takes a column of the same window.
 */

/** A phone: the stylesheet's own line (`@media (max-width: 767px)` in wahub.module.css). */
export const PHONE_MEDIA_QUERY = '(max-width: 767px)';

/** Room for all three columns side by side. */
export const WIDE_FROM = 1040;
/** Room for the list beside the conversation. Below it: one pane at a time, like a phone. */
export const MEDIUM_FROM = 680;

export type ChatLayout = 'wide' | 'medium' | 'narrow';

/**
 * The layout for a frame of this width. Unmeasured (the first paint) counts as
 * wide. A phone is narrow whatever the frame measures, so the screen and the
 * stylesheet, which draws the phone from the same media query, never disagree.
 */
export function chatLayout(width: number | null, phone = false): ChatLayout {
  if (phone) return 'narrow';
  if (width === null || width >= WIDE_FROM) return 'wide';
  return width >= MEDIUM_FROM ? 'medium' : 'narrow';
}

export interface ChatPanes {
  list: boolean;
  thread: boolean;
  details: boolean;
  /** "בחרו שיחה מהרשימה", where a conversation would be. */
  placeholder: boolean;
}

/**
 * Wide: the list, the conversation and the details all at once. Medium: the
 * list beside either the conversation or the details. Narrow (a phone): one of
 * the three — the list until a conversation is opened, then the conversation,
 * then the details when asked for.
 */
export function chatPanes(layout: ChatLayout, contactId: number | null, detailsOpen: boolean): ChatPanes {
  const open = contactId != null;
  return {
    list: layout !== 'narrow' || !open,
    thread: open && (layout === 'wide' || !detailsOpen),
    details: open && (layout === 'wide' || detailsOpen),
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
