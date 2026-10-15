import type { WahubContact, WahubKogoChild, WahubKogoChildClass, WahubLead, WahubOutcome } from '@/types/wahub';
import type { Tone } from './boxes';
import { formatShortDate } from './format';

/**
 * "ילדים וחוגים" — the third section of the contact's card
 * (docs/WAHUB-CONTRACT-LAYOUT.md, ב.3): each child Kogo found for the phone,
 * by name and status, and under the child every class they are in now, one
 * readable line each. The server sends the classes with the single contact
 * (`kogo.children[].classes`, kogo-back apps/wahub/matching.py `children_of`);
 * a server built before them sends none, and the child is shown alone.
 *
 * And the owner's rule for the whole card (15.10.2026): nothing is said
 * twice. "מה עכשיו" above already tells the matching's answer in its own
 * words for most people, so the answer's tag and its sentence are shown here
 * only when it does not — and the names the children's rows carry are not
 * repeated in the sentences around them.
 */

/** The colour of a child's status: paying green, a card that failed red, a trial gold, the rest quiet. */
const CHILD_TONE: Record<string, Tone | 'gold'> = {
  active: 'success',
  payment_problem: 'danger',
  trial_signed: 'gold',
  trial_completed: 'warning',
  pending: 'warning',
  inactive: 'muted',
  ghost: 'muted',
};

export function childTone(status: string): Tone | 'gold' {
  return CHILD_TONE[status] ?? 'neutral';
}

/** The classes of a child as the server sent them; [] from a server that sends none. */
export function classesOf(child: WahubKogoChild): WahubKogoChildClass[] {
  return Array.isArray(child.classes) ? child.classes.filter((row) => row && typeof row === 'object') : [];
}

function norm(text: string | null | undefined): string {
  return (text ?? '').replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** "ניסיון ב-20.10" (and the year, when it is not this one); '' for a row that is no trial. */
export function trialOnText(row: Pick<WahubKogoChildClass, 'trial_on'>, now: Date = new Date()): string {
  const day = formatShortDate(row.trial_on ?? null, now);
  return day ? `ניסיון ב-${day}` : '';
}

/**
 * One class, said in one line: the class — the group's own name, which most
 * often carries its ages already — then the day and the hours (`when`, kept
 * whole on a line of its own when the line breaks), the place, the
 * instructor, and the ages when the name did not say them (`rest`).
 *
 *   "4.5-6 קפוארה" · "ראשון 16:45–17:30" · "מינץ, פתח תקווה · מדריך: אורי בן דוד"
 *
 * Each part only when it is known, and none the name of the class already says.
 */
export function classParts(row: WahubKogoChildClass): { title: string; when: string; rest: string } {
  const title = (row.course || row.course_type || '').trim();
  const said = norm(title);
  const fresh = (part: string | null | undefined) => {
    const text = (part ?? '').trim();
    return text && !said.includes(norm(text)) ? text : '';
  };
  const hours = [row.start, row.end].filter(Boolean).join('–');
  const when = [row.day, hours].filter(Boolean).join(' ');
  const branch = fresh(row.branch);
  const city = fresh(row.city);
  const place = [branch, city && !norm(branch).includes(norm(city)) ? city : ''].filter(Boolean).join(', ');
  const instructor = (row.instructor ?? '').trim();
  // "גיל 4.5-6": the name "4.5-6 קפוארה" said it.
  const ages = (row.ages ?? '').trim();
  const agesSaid = ages && said.includes(norm(ages.replace(/^גיל\s*/, '')));
  const rest = [place, instructor ? `מדריך: ${instructor}` : '', agesSaid ? '' : ages].filter(Boolean).join(' · ');
  return { title, when, rest };
}

/** The same line as plain text — for a reader of the screen, and for a test. */
export function classLine(row: WahubKogoChildClass): string {
  const { title, when, rest } = classParts(row);
  return [title, when, rest].filter(Boolean).join(' · ');
}

/** A class the child is in while the billing of it has a problem — said once: not when the child's own status says so. */
export function classHasBillingNote(row: WahubKogoChildClass, child: Pick<WahubKogoChild, 'status'>): boolean {
  return row.status === 'payments_problem' && child.status !== 'payment_problem';
}

/** Sentences, cut where a full stop (or ? !) is followed by a space — never inside "2.10". */
function sentencesOf(text: string): string[] {
  const found: string[] = [];
  const boundary = /[.?!]\s+/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text))) {
    found.push(text.slice(start, match.index + 1));
    start = match.index + match[0].length;
  }
  found.push(text.slice(start));
  return found.map((part) => part.trim()).filter(Boolean);
}

/** A part of a sentence that is nothing but names of the children listed: "נועה לוי", "נועה לוי, תמר לוי (פעיל)". */
function onlyNames(part: string, names: ReadonlySet<string>): boolean {
  const pieces = part
    .split(',')
    .map((piece) => norm(piece.replace(/\([^)]*\)\s*$/, '')))
    .filter(Boolean);
  return pieces.length > 0 && pieces.every((piece) => names.has(piece));
}

/**
 * A sentence of the matching or of the lead's state ("לקוח רשום מ-2.10 · נועה
 * לוי.") without the names of the children the card lists under it — they are
 * said there, beside their status. Everything else stays as the server wrote
 * it; with no child listed nothing is taken out.
 */
export function withoutChildNames(text: string | null | undefined, children: ReadonlyArray<Pick<WahubKogoChild, 'name'>>): string {
  const clean = (text ?? '').trim();
  if (!clean || children.length === 0) return clean;
  const names = new Set(children.map((child) => norm(child.name)).filter(Boolean));
  if (names.size === 0) return clean;
  return sentencesOf(clean)
    .map((sentence) => {
      const last = sentence.slice(-1);
      const closed = '.?!'.includes(last);
      const body = closed ? sentence.slice(0, -1) : sentence;
      const kept = body.split(' · ').filter((part) => part.trim() && !onlyNames(part, names));
      return kept.length ? kept.join(' · ').trim() + (closed ? last : '') : '';
    })
    .filter(Boolean)
    .join(' ');
}

/** The lead's states that are the matching's own answer, told in the lead's words (kogo-back apps/wahub/lead_stage.py). */
const STAGES_OF_OUTCOME: Partial<Record<WahubOutcome, readonly string[]>> = {
  customer_before: ['customer'],
  registered_after: ['registered'],
  trial_upcoming: ['trial_booked'],
  trial_only: ['trial_done', 'trial_no_show'],
  signup_declined: ['signup_failed'],
  pending: ['signup_started'],
};

/**
 * What "ילדים וחוגים" says above the children: the matching's answer as a tag
 * (`outcome`), and its sentence (`detail`, '' for none) — each only when "מה
 * עכשיו" does not already say it, and the sentence without the names listed
 * below it. With no lead state (a server built before it) the state says
 * nothing of Kogo, and both are shown.
 */
export function kogoLines(
  contact: Pick<WahubContact, 'kogo'>,
  lead: Pick<WahubLead, 'stage' | 'reason'> | null,
): { outcome: boolean; detail: string } {
  const { kogo } = contact;
  const children = kogo.children ?? [];
  const reason = norm(lead?.reason);
  const sentence = norm(kogo.detail).replace(/\.$/, '');
  const toldByState =
    lead !== null &&
    Boolean(kogo.outcome) &&
    ((STAGES_OF_OUTCOME[kogo.outcome] ?? []).includes(lead.stage) || (sentence !== '' && reason.includes(sentence)));
  if (toldByState) return { outcome: false, detail: '' };
  const detail = withoutChildNames(kogo.detail, children);
  return { outcome: true, detail: detail && reason.includes(norm(detail).replace(/\.$/, '')) ? '' : detail };
}
