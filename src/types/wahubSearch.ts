/**
 * The afternoon of 13.10.2026 (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח): a
 * search that looks everywhere, the way to the customer's card, and the summary
 * of what somebody on the waiting list asked for. These are the shapes the
 * screens keep; what the server sends is read into them, leniently, in
 * src/lib/wahub/search.ts and src/lib/wahub/waitingSummary.ts.
 *
 * Every one of them is absent on a server built before ח — and with it absent
 * the screen shows what it showed before.
 */

/** "לכרטיס הלקוח" (ח.2): the family Kogo knows this person by, and the card that opens. */
export interface WahubCustomerRef {
  family_id: string;
  /** Null: a family with no child — there is no card to open, and no button. */
  child_id: string | null;
  /** A path inside the CRM (/customers?child=…); null when there is no card. */
  link: string | null;
}

/**
 * Why a search found this row (ח.1.1), when it was not by the name or the phone the row already shows:
 * a child, a parent, the family's name, another phone of the family, the lesson, or a word in the conversation.
 */
export interface WahubFoundBy {
  kind: string;
  /** "ילד/ה", "הורה", "טלפון נוסף של המשפחה"… */
  label: string;
  /** The name or the number that matched; empty for a word in the conversation. */
  value: string;
}

/** A family in Kogo the search found, with no WhatsApp conversation behind it (ח.1.5). */
export interface WahubSearchCustomer {
  family_id: string;
  name: string;
  phone_display: string;
  children: Array<{ id: string; name: string; status_label: string }>;
  /** The customer's card; null for a family with no child. */
  link: string | null;
  /** Rarely: a WhatsApp contact with one of the family's phones that was not matched to it yet. */
  contact_id: number | null;
  found_by: WahubFoundBy | null;
}

/** Somebody the search found among the conversations, who is not in the list that was searched (ח.1.4). */
export interface WahubSearchContact {
  id: number;
  name: string;
  phone_display: string;
  is_demo: boolean;
  /** Where their conversation stands: "מבקש נציג", "הבוט עונה"… */
  box_label: string;
  found_by: WahubFoundBy | null;
  /** Their card in the customers section, when Kogo knows them. */
  customer_link: string | null;
}

/** What a search brings beside its rows. */
export interface WahubSearchExtras {
  customers: WahubSearchCustomer[];
  /** There are more such families than the five that came. */
  customers_more: boolean;
  contacts: WahubSearchContact[];
}

/** Where an entry of the waiting list stands (ח.3.1): two of the four call on the office. */
export type WahubWaitingState = 'waiting' | 'freed' | 'told' | 'answered';

/** How full a lesson is right now, by the sign-up form's own count. */
export interface WahubSeatsNow {
  enrolled: number | null;
  capacity: number | null;
  seats_left: number | null;
  is_full: boolean;
  /** "19 מתוך 20 · נשאר מקום אחד" — ready to show. */
  seats_label: string;
}

/** A lesson that has room right now, to offer on the phone in place of the one that is full. */
export interface WahubWaitingAlternative {
  lesson_id: string;
  /** "קפוארה גן חובה · יום חמישי · 17:00 · מינץ" */
  label: string;
  /** "מועד אחר של אותו חוג" · "חוג אחר באותו סניף" · "סניף אחר באותה עיר" */
  kind: string;
  kind_label: string;
  /** "נשארו 6" · "נשאר מקום אחד" · "יש מקום · בלי מגבלה" */
  seats_label: string;
  instructor: string;
}

/** What was asked for: the lesson, as it is today. */
export interface WahubWantedLesson {
  course: string;
  day: string;
  start: string;
  end: string;
  branch: string;
  city: string;
  instructor: string;
  ages: string;
  label: string;
  /** False: the lesson was deleted, or no longer takes place. */
  exists: boolean;
}

/**
 * `waiting_summary` (ח.3.2): what somebody on the waiting list asked for and where, since when and where they
 * stand in the line, how full the lesson is now, the number to call — and what could be offered instead.
 */
export interface WahubWaitingSummary {
  /** The sentence for the head of the card; `*…*` marks the class's name, which is drawn bold. */
  sentence: string;
  entry_id: number;
  state: WahubWaitingState | '';
  state_label: string;
  needs_office: boolean;
  wanted: WahubWantedLesson;
  /** What was written about the child ("בת 5", "כיתה ג"); empty when nothing was. */
  child: string;
  since: string | null;
  since_label: string;
  position: number | null;
  queue: number | null;
  /** "ראשונים בתור · 3 ממתינים" */
  position_label: string;
  seats: WahubSeatsNow;
  phone_display: string;
  /** "tel:+972501234567" — only a number that can be dialled. */
  tel: string;
  customer: WahubCustomerRef | null;
  alternatives: WahubWaitingAlternative[];
  /** Said when there is nothing to offer instead. */
  alternatives_note: string;
  /** The person's other active entries, each in the same shape. */
  others: WahubWaitingSummary[];
}
