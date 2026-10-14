import { formatDateTime } from './format';

/**
 * A conversation that began before the switch from the old bot (14.10.2026): the server says so on the contact
 * (`history`), with the address of the same conversation in ManyChat's own inbox — what the old bot answered and
 * what the office wrote there never reached Kogo. The owner, that day: "שלא יהיה מצב… שאתחיל לענות לדברים בלי
 * שאני יודע את ההיסטוריה".
 */
export interface WahubHistoryNote {
  switched_at: string;
  /** Empty when ManyChat's number for the customer is not on record. */
  manychat_url: string;
}

export interface HistoryLine {
  title: string;
  text: string;
  link: string;
  href: string;
}

export function historyLine(note: WahubHistoryNote | null | undefined, now: Date): HistoryLine | null {
  if (!note || !note.switched_at) return null;
  const when = formatDateTime(note.switched_at, now);
  return {
    title: 'השיחה התחילה לפני המעבר לבוט החדש',
    text: `עד ${when} ענה כאן הבוט הישן: מה שהוא ענה, ומה שנכתב ב-ManyChat, לא מופיע כאן. כדאי לקרוא לפני שעונים`,
    link: note.manychat_url ? 'לשיחה המלאה ב-ManyChat' : 'את השיחה המלאה פותחים ב-ManyChat לפי מספר הטלפון',
    href: note.manychat_url,
  };
}
