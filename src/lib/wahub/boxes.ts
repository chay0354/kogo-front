import type {
  WahubBox,
  WahubBoxCounts,
  WahubContact,
  WahubQueue,
  WahubQueueCounts,
  WahubSharedFilters,
  WahubSummary,
} from '@/types/wahub';

export type Tone = 'neutral' | 'primary' | 'danger' | 'warning' | 'info' | 'success' | 'muted';

export interface BoxDef {
  key: WahubBox;
  label: string;
  tone: Tone;
}

/**
 * The boxes above the conversations list, in the order they are shown. The
 * server also knows a "bot" box; the screen does not offer it, because "הכול"
 * less "בטיפול נציג" already is that list.
 */
export const CHAT_BOXES: BoxDef[] = [
  { key: 'all', label: 'הכול', tone: 'neutral' },
  { key: 'waiting', label: 'מחכים לתשובה', tone: 'warning' },
  { key: 'needs_human', label: 'מבקשים נציג', tone: 'danger' },
  { key: 'unread', label: 'לא נקראו', tone: 'primary' },
  { key: 'human', label: 'בטיפול נציג', tone: 'info' },
];

export interface QueueDef {
  key: WahubQueue;
  label: string;
  hint: string;
  tone: Tone;
}

/** The work queues of the leads tab. It opens on "הכול". */
export const LEAD_QUEUES: QueueDef[] = [
  { key: 'all', label: 'הכול', hint: '', tone: 'neutral' },
  { key: 'due', label: 'לחזור אליהם', hint: 'סימנת "לחזור אליו", או שהגיע היום שנקבע', tone: 'danger' },
  { key: 'none', label: 'עוד לא פנינו', hint: 'עוד לא סימנת להם כלום', tone: 'primary' },
  { key: 'no_answer', label: 'לא ענו לנו', hint: '', tone: 'warning' },
  { key: 'answered', label: 'בשיחה', hint: '', tone: 'info' },
  { key: 'later', label: 'בזמן אחר', hint: '', tone: 'muted' },
  { key: 'registered', label: 'נרשמו', hint: '', tone: 'success' },
  { key: 'not_relevant', label: 'לא רלוונטי', hint: '', tone: 'muted' },
];

export function boxLabel(box: WahubBox): string {
  return CHAT_BOXES.find((def) => def.key === box)?.label ?? 'הכול';
}

export function queueDef(queue: WahubQueue): QueueDef {
  return LEAD_QUEUES.find((def) => def.key === queue) ?? LEAD_QUEUES[0];
}

export function boxCount(counts: Partial<WahubBoxCounts> | null | undefined, box: WahubBox): number | null {
  const value = counts?.[box];
  return typeof value === 'number' ? value : null;
}

export function queueCount(
  counts: Partial<WahubQueueCounts> | null | undefined,
  queue: WahubQueue | 'hidden',
): number | null {
  const value = counts?.[queue];
  return typeof value === 'number' ? value : null;
}

/**
 * Whether a conversation belongs in a box — the same question the server
 * answers, asked again here for a contact that arrives through the live
 * update, so the list can take it in or let it go without being fetched again.
 */
export function matchesBox(contact: WahubContact, box: WahubBox): boolean {
  switch (box) {
    case 'waiting':
      return Boolean(contact.chat.waiting_since);
    case 'needs_human':
      return contact.chat.needs_human === true;
    case 'unread':
      return contact.chat.unread_count > 0;
    case 'human':
      return contact.chat.handled_by === 'human';
    case 'bot':
      return contact.chat.handled_by === 'bot';
    default:
      return true;
  }
}

/**
 * Whether a lead belongs in a queue. "לחזור אליהם" is the server's own answer
 * (`followup.is_due`): the rule looks at today's date in Israel and at what the
 * system knows, and is worked out in one place only.
 */
export function matchesQueue(contact: WahubContact, queue: WahubQueue): boolean {
  switch (queue) {
    case 'all':
      return true;
    case 'due':
      return contact.followup.is_due === true;
    case 'none':
      return !contact.followup.status;
    default:
      return contact.followup.status === queue;
  }
}

/** Registered customers and people whose trial is still ahead are not leads. */
export function isHiddenLead(contact: WahubContact): boolean {
  return contact.kogo.hidden_by_default === true;
}

/**
 * Whether a contact that just changed could belong in the leads list on screen.
 * A text search cannot be answered here — the server searches fields the screen
 * does not hold — so with one typed in the answer is "cannot tell" (null).
 */
export function matchesLeadView(
  contact: WahubContact,
  view: { queue: WahubQueue; showHidden: boolean; filters: WahubSharedFilters },
): boolean | null {
  if (!view.showHidden && isHiddenLead(contact)) return false;
  if (!matchesQueue(contact, view.queue)) return false;
  const { filters } = view;
  if (filters.topic && contact.known.topic !== filters.topic) return false;
  if (filters.interest && contact.known.interest !== filters.interest) return false;
  if (filters.outcome && contact.kogo.outcome !== filters.outcome) return false;
  if (filters.branch && String(contact.known.branch_id ?? '') !== filters.branch) return false;
  if (filters.flag && !contact.known.flags.includes(filters.flag as never)) return false;
  if (filters.tag && !contact.tags.some((tag) => String(tag.id) === filters.tag)) return false;
  if (String(filters.search ?? '').trim()) return null;
  return true;
}

/** The small number beside the menu entry: people who are waiting for a person. */
export function menuBadgeCount(summary: Pick<WahubSummary, 'waiting' | 'needs_human'> | null | undefined): number {
  if (!summary) return 0;
  const waiting = Number(summary.waiting) || 0;
  const needsHuman = Number(summary.needs_human) || 0;
  return Math.max(0, waiting) + Math.max(0, needsHuman);
}

/** 120 → "99+": the badge is a nudge, not a report. */
export function badgeText(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

/**
 * Option lists for the filters of the leads tab.
 *
 * The contract sends every Hebrew label with the contact it describes, but has
 * no endpoint that lists the choices themselves. Until it does, these are the
 * names the filters use; a label the server sent with a loaded contact wins
 * over the one written here (see `learnLabels`).
 */
export const TOPIC_LABELS: Record<string, string> = {
  trial: 'שיעור ניסיון',
  registration: 'הרשמה',
  info: 'בירור פרטים',
  other: 'אחר',
};

export const INTEREST_LABELS: Record<string, string> = {
  hot: 'חם',
  warm: 'מתעניין',
  cold: 'קר',
  none: 'לא מעוניין',
};

export const OUTCOME_LABELS: Record<string, string> = {
  not_found: 'לא נמצא במערכת',
  in_system: 'נמצא במערכת',
  pending: 'התחיל הרשמה',
  signup_declined: 'ניסה להירשם והחיוב נכשל',
  trial_upcoming: 'ממתין לשיעור ניסיון',
  trial_only: 'עשה ניסיון ולא נרשם',
  registered_after: 'נרשם אחרי הפנייה',
  customer_before: 'לקוח מלפני הפנייה',
};

export interface LearnedLabels {
  topic: Record<string, string>;
  interest: Record<string, string>;
  outcome: Record<string, string>;
}

/** The server's own wording for each value, picked up from the contacts already loaded. */
export function learnLabels(contacts: ReadonlyArray<WahubContact>, into?: LearnedLabels): LearnedLabels {
  const learned: LearnedLabels = into
    ? { topic: { ...into.topic }, interest: { ...into.interest }, outcome: { ...into.outcome } }
    : { topic: {}, interest: {}, outcome: {} };
  for (const contact of contacts) {
    if (contact.known.topic && contact.known.topic_label) {
      learned.topic[contact.known.topic] = contact.known.topic_label;
    }
    if (contact.known.interest && contact.known.interest_label) {
      learned.interest[contact.known.interest] = contact.known.interest_label;
    }
    if (contact.kogo.outcome && contact.kogo.outcome_label) {
      learned.outcome[contact.kogo.outcome] = contact.kogo.outcome_label;
    }
  }
  return learned;
}

export function labelOptions(
  base: Record<string, string>,
  learned: Record<string, string> = {},
): Array<{ value: string; label: string }> {
  return Object.keys(base).map((value) => ({ value, label: learned[value] || base[value] }));
}
