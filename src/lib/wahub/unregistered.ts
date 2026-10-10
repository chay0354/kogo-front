import type { WahubForCustomerContact, WahubUnregisteredCounts, WahubUnregisteredLead } from '@/types/wahub';

/**
 * "שאלו ולא נרשמו" (stage 3, §א/§ג.1) — the words and the query of the list,
 * kept out of the component so they can be read on their own.
 */

/** The ranges the card offers. The server's default is 30; its ceiling is 365. */
export const UNREGISTERED_DAY_RANGES = [7, 30, 90] as const;
export type UnregisteredDays = (typeof UNREGISTERED_DAY_RANGES)[number];
export const DEFAULT_UNREGISTERED_DAYS: UnregisteredDays = 30;

/** The query of GET leads/unregistered/. `hot` is sent only when it is on — off is the server's default. */
export function unregisteredParams(days: number, hot: boolean): Record<string, string> {
  const params: Record<string, string> = { days: String(Math.min(Math.max(1, Math.round(days)), 365)) };
  if (hot) params.hot = '1';
  return params;
}

/** "היום", "אתמול", "לפני יומיים", "לפני 5 ימים" — from a count of whole days. Empty when there is none. */
export function daysAgoText(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days < 0) return '';
  const whole = Math.floor(days);
  if (whole === 0) return 'היום';
  if (whole === 1) return 'אתמול';
  if (whole === 2) return 'לפני יומיים';
  return `לפני ${whole} ימים`;
}

/** The two short lines under the number on the card. Nothing when the list is empty. */
export function unregisteredNotes(counts: WahubUnregisteredCounts | null | undefined): string[] {
  if (!counts || !counts.total) return [];
  const notes: string[] = [];
  if (counts.hot > 0) notes.push(`מתוכם חמים ${counts.hot.toLocaleString('he-IL')}`);
  const oldest = daysAgoText(counts.oldest_days);
  if (oldest && oldest !== 'היום') notes.push(`הוותיק ביותר: ${oldest}`);
  return notes;
}

/** The phone as it is shown: the server's display form when it sent one, else the bare number. */
export function leadPhone(lead: Pick<WahubUnregisteredLead | WahubForCustomerContact, 'phone' | 'phone_display'>): string {
  return lead.phone_display || lead.phone || '';
}

/** The name on a row: the contact's own, or the phone when there is none. */
export function leadName(lead: Pick<WahubUnregisteredLead | WahubForCustomerContact, 'name' | 'phone' | 'phone_display'>): string {
  return (lead.name || '').trim() || leadPhone(lead);
}

/** Who wrote the last message of a conversation, in one word for the customer's card. */
export function lastMessageWho(contact: Pick<WahubForCustomerContact, 'last_message_direction' | 'last_message_sender'>): string {
  if (contact.last_message_direction === 'in') return 'הלקוח';
  switch (contact.last_message_sender) {
    case 'bot':
      return 'הבוט';
    case 'office':
      return 'המשרד';
    case 'system':
      return 'המערכת';
    case 'customer':
      return 'הלקוח';
    default:
      return '';
  }
}
