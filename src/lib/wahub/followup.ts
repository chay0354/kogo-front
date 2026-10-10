import type {
  WahubContact,
  WahubFollowup,
  WahubFollowupPatch,
  WahubFollowupStatus,
  WahubKnown,
} from '@/types/wahub';
import { formatShortDate } from './format';

export type FollowupMark = Exclude<WahubFollowupStatus, ''>;

/**
 * The six marks, in the order the buttons stand. Only a person presses them —
 * nothing on the screen fills one in for him.
 */
export const FOLLOWUP_MARKS: Array<{ status: FollowupMark; label: string }> = [
  { status: 'waiting_us', label: 'לחזור אליו' },
  { status: 'no_answer', label: 'לא ענה' },
  { status: 'answered', label: 'ענה' },
  { status: 'later', label: 'בזמן אחר' },
  { status: 'registered', label: 'נרשם' },
  { status: 'not_relevant', label: 'לא רלוונטי' },
];

export function followupLabel(status: WahubFollowupStatus): string {
  return FOLLOWUP_MARKS.find((mark) => mark.status === status)?.label ?? '';
}

/**
 * What pressing a mark asks the server for. A second press on the mark that is
 * already set takes it off. The day to come back goes with "בזמן אחר" only.
 */
export function toggleFollowup(current: WahubFollowupStatus, pressed: FollowupMark): WahubFollowupPatch {
  const status: WahubFollowupStatus = current === pressed ? '' : pressed;
  return status === 'later' ? { status } : { status, due: null };
}

/** Choosing the day to come back. It is only kept under "בזמן אחר", so the mark goes with it. */
export function setFollowupDue(due: string | null | undefined): WahubFollowupPatch {
  return { status: 'later', due: due || null };
}

/** A plain date that is today or already behind us. */
export function isDateDue(date: string | null | undefined, today: string): boolean {
  if (!date) return false;
  return date.slice(0, 10) <= today;
}

const CALLBACK_COUNTS_UNDER: ReadonlyArray<WahubFollowupStatus> = ['', 'later', 'answered', 'no_answer'];

/**
 * "לחזור אליהם" — the contract's rule, word for word:
 * the mark is "לחזור אליו"; or it is "בזמן אחר" and its day has come; or the
 * customer himself asked to be called back on a day that has come, and the
 * mark is empty, "בזמן אחר", "ענה" or "לא ענה".
 *
 * The server is the one that decides (`followup.is_due`). This copy exists so a
 * mark shows its result the moment it is pressed, before the server answers.
 */
export function computeIsDue(
  contact: { followup: Pick<WahubFollowup, 'status' | 'due'>; known: Pick<WahubKnown, 'callback_on'> },
  today: string,
): boolean {
  const { status, due } = contact.followup;
  if (status === 'waiting_us') return true;
  if (status === 'later' && isDateDue(due, today)) return true;
  return isDateDue(contact.known.callback_on, today) && CALLBACK_COUNTS_UNDER.includes(status);
}

export interface DueLine {
  /** True when the day has come: the line is shown loud. */
  due: boolean;
  text: string;
}

/**
 * What the system knows about when the customer asked to be called back:
 * "ביקש שנחזור ב-24.10" while the day is ahead, "הגיע הזמן לחזור" once it came.
 */
export function callbackLine(
  callbackOn: string | null | undefined,
  today: string,
  now: Date = new Date(),
): DueLine | null {
  if (!callbackOn) return null;
  const date = formatShortDate(callbackOn.slice(0, 10), now);
  if (isDateDue(callbackOn, today)) return { due: true, text: `הגיע הזמן לחזור · ביקש ${date}` };
  return { due: false, text: `ביקש שנחזור ב-${date}` };
}

export type DueTone = 'danger' | 'warning' | 'info';

/** The line beside the "בזמן אחר" mark: the day chosen, and whether it has come. */
export function followupDueLine(
  followup: Pick<WahubFollowup, 'status' | 'due'>,
  today: string,
  now: Date = new Date(),
): { tone: DueTone; text: string } | null {
  if (followup.status !== 'later') return null;
  if (!followup.due) return { tone: 'warning', text: 'לא נקבע תאריך' };
  const date = formatShortDate(followup.due.slice(0, 10), now);
  if (isDateDue(followup.due, today)) return { tone: 'danger', text: `הגיע הזמן לחזור · ${date}` };
  return { tone: 'info', text: `לחזור ב-${date}` };
}

/**
 * The contact as it will read once the server has saved the change — shown at
 * once, and replaced by the server's own answer when it arrives.
 */
export function applyFollowupPatch(
  contact: WahubContact,
  patch: WahubFollowupPatch,
  today: string,
): WahubContact {
  const status = patch.status ?? contact.followup.status;
  const due = status === 'later' ? (patch.due !== undefined ? patch.due : contact.followup.due) : null;
  const note = patch.note ?? contact.followup.note;
  const followup: WahubFollowup = {
    ...contact.followup,
    status,
    status_label: followupLabel(status),
    due,
    note,
  };
  followup.is_due = computeIsDue({ followup, known: contact.known }, today);
  return { ...contact, followup };
}
