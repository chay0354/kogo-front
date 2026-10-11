import type {
  WahubContact,
  WahubKnown,
  WahubLead,
  WahubLeadActSummary,
  WahubLeadBoard,
  WahubLeadBoardGroup,
  WahubLeadBoardStage,
  WahubLeadGroup,
  WahubLeadTemperature,
  WahubPage,
  WahubSummary,
} from '@/types/wahub';
import type { Tone } from './boxes';
import { daysAgoText } from './unregistered';

/**
 * "מצב הליד" (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב) — the words and the small
 * decisions of the screens that show it. The state itself is the server's: it
 * is worked out there, by rules, and only read here.
 */

/** The three groups, in the order the board shows them. */
export const LEAD_GROUP_ORDER: WahubLeadGroup[] = ['act', 'wait', 'closed'];

export const LEAD_GROUP_LABELS: Record<WahubLeadGroup, string> = {
  act: 'דורש טיפול',
  wait: 'בתהליך',
  closed: 'סגור',
};

/** One plain line under each group's title. */
export const LEAD_GROUP_HINTS: Record<WahubLeadGroup, string> = {
  act: 'מי שמחכה למשהו מאיתנו',
  wait: 'אין מה לעשות עכשיו',
  closed: 'נרשמו, לקוחות, ומי שלא רלוונטי',
};

/** The contract's own wording, for a row whose label the server left out. */
export const LEAD_STAGE_LABELS: Record<string, string> = {
  needs_reply: 'שאל ולא קיבל תשובה',
  signup_failed: 'ניסה להירשם והחיוב נכשל',
  signup_started: 'התחיל הרשמה ולא סיים',
  trial_no_show: 'נרשם לניסיון ולא הגיע',
  trial_done: 'עשה ניסיון ולא נרשם',
  callback_due: 'הגיע הזמן לחזור אליו',
  answered_silent: 'קיבל תשובה ולא נרשם',
  trial_booked: 'רשום לשיעור ניסיון',
  waiting_date: 'ממתין לתאריך',
  in_conversation: 'בשיחה',
  registered: 'נרשם',
  customer: 'לקוח קיים',
  not_relevant: 'לא רלוונטי',
  cold: 'ליד ישן',
};

function isGroup(value: unknown): value is WahubLeadGroup {
  return value === 'act' || value === 'wait' || value === 'closed';
}

/**
 * The lead's state as the server sent it. Null when it did not — a server
 * built before the lead states — or when what it sent cannot be shown; the
 * screens then fall back to what they showed before.
 */
export function leadOf(contact: Pick<WahubContact, 'lead'> | null | undefined): WahubLead | null {
  const lead = contact?.lead;
  if (!lead || typeof lead !== 'object') return null;
  if (!lead.stage || !isGroup(lead.group)) return null;
  return lead;
}

export function leadStageLabel(lead: Pick<WahubLead, 'stage' | 'stage_label'>): string {
  return lead.stage_label || LEAD_STAGE_LABELS[lead.stage] || lead.stage;
}

/**
 * The colour of a state's tag. What waits for us is amber; red is kept for the
 * person who asked for a human and for a charge that failed. What is in
 * progress is navy, and what is closed is quiet — green only for who registered.
 */
export function leadTone(lead: Pick<WahubLead, 'group' | 'stage'>, needsHuman = false): Tone {
  if (lead.group === 'act') {
    if (lead.stage === 'signup_failed') return 'danger';
    return needsHuman && lead.stage === 'needs_reply' ? 'danger' : 'warning';
  }
  if (lead.group === 'wait') return 'primary';
  return lead.stage === 'registered' || lead.stage === 'customer' ? 'success' : 'muted';
}

/** The tag of a state belongs beside the name in the conversations list only when it calls for action. */
export function showsInList(lead: WahubLead | null): lead is WahubLead {
  return lead !== null && lead.group === 'act';
}

/** "היום" / "אתמול" / "לפני 4 ימים" — how long the lead has been in its state. Empty when unknown. */
export function leadDaysText(lead: Pick<WahubLead, 'days' | 'since'>, now: Date): string {
  if (lead.days != null && Number.isFinite(lead.days)) return daysAgoText(lead.days);
  if (!lead.since) return '';
  const since = new Date(lead.since).getTime();
  if (!Number.isFinite(since)) return '';
  return daysAgoText(Math.max(0, Math.floor((now.getTime() - since) / 86_400_000)));
}

/** "הוותיק: לפני 3 ימים" on a state's row of the board. Empty for a state with nobody in it. */
export function oldestText(days: number | null | undefined): string {
  const text = daysAgoText(days);
  return text ? `הוותיק: ${text}` : '';
}

const TEMPERATURE_LABELS: Record<Exclude<WahubLeadTemperature, ''>, string> = {
  hot: 'חם',
  warm: 'מתעניין',
  cold: 'קר',
};

/** The word behind the small temperature dot. Empty when the server gave none. */
export function temperatureLabel(temperature: WahubLeadTemperature | undefined | null): string {
  return temperature ? TEMPERATURE_LABELS[temperature] ?? '' : '';
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function readStage(raw: Partial<WahubLeadBoardStage> | null | undefined): WahubLeadBoardStage | null {
  if (!raw || typeof raw !== 'object' || !raw.key) return null;
  const key = String(raw.key);
  const oldest = raw.oldest_days == null ? null : Number(raw.oldest_days);
  return {
    key,
    label: raw.label || LEAD_STAGE_LABELS[key] || key,
    hint: raw.hint ?? '',
    next_step: raw.next_step ?? '',
    count: count(raw.count),
    oldest_days: oldest != null && Number.isFinite(oldest) && oldest >= 0 ? oldest : null,
  };
}

/**
 * The board as the screen draws it: always the three groups, in the contract's
 * order, whatever order the answer came in. A state with nobody in it stays.
 */
export function readLeadBoard(raw: unknown): WahubLeadBoard {
  const data = (raw ?? {}) as Partial<WahubLeadBoard>;
  const sent = Array.isArray(data.groups) ? data.groups : [];
  const groups: WahubLeadBoardGroup[] = LEAD_GROUP_ORDER.map((key) => {
    const group = sent.find((item) => item && item.key === key);
    const stages = (Array.isArray(group?.stages) ? group.stages : [])
      .map(readStage)
      .filter((stage): stage is WahubLeadBoardStage => stage !== null);
    const summed = stages.reduce((sum, stage) => sum + stage.count, 0);
    return {
      key,
      label: group?.label || LEAD_GROUP_LABELS[key],
      total: group?.total == null ? summed : count(group.total),
      stages,
    };
  });
  return {
    groups,
    checked_at: data.checked_at ?? null,
    pending_scan: count(data.pending_scan),
  };
}

/** A state of the board by its key, with the group it sits in. */
export function findStage(
  board: WahubLeadBoard | null | undefined,
  key: string | null | undefined,
): { group: WahubLeadBoardGroup; stage: WahubLeadBoardStage } | null {
  if (!board || !key) return null;
  for (const group of board.groups) {
    const stage = group.stages.find((item) => item.key === key);
    if (stage) return { group, stage };
  }
  return null;
}

/**
 * The state a wide screen opens on when none was asked for: the first one that
 * needs handling and has someone in it, then the first one in progress.
 */
export function defaultStage(board: WahubLeadBoard | null | undefined): string | null {
  if (!board) return null;
  for (const key of ['act', 'wait'] as const) {
    const stage = board.groups.find((group) => group.key === key)?.stages.find((item) => item.count > 0);
    if (stage) return stage.key;
  }
  return null;
}

/** `lead_act` of the summary, when the server sends it: the total and the states with someone in them. */
export function leadActOf(summary: Pick<WahubSummary, 'lead_act'> | null | undefined): WahubLeadActSummary | null {
  const raw = summary?.lead_act;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.stages)) return null;
  const stages = raw.stages
    .filter((stage) => stage && stage.key && count(stage.count) > 0)
    .map((stage) => ({
      key: String(stage.key),
      label: stage.label || LEAD_STAGE_LABELS[String(stage.key)] || String(stage.key),
      count: count(stage.count),
    }));
  const summed = stages.reduce((sum, stage) => sum + stage.count, 0);
  return { total: raw.total == null ? summed : count(raw.total), stages };
}

/** A stage key as an address may carry it: lower-case letters, digits and underscores. */
export function parseStage(value: string | null | undefined): string | null {
  return value && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : null;
}

/**
 * "מה ידוע" in one or two lines, for the top of the contact's card on a server
 * that has no lead state yet: the summary, or — with none — the facts in a row.
 */
export function knownHeadline(known: WahubKnown): string {
  const summary = (known.summary || '').trim();
  if (summary) return summary;
  const branch = [known.branch_name, known.city].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
  return [known.topic_label, known.course_type, branch.join(', '), known.child_age ? `גיל ${known.child_age}` : '', known.interest_label]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The rows of every page of a state read so far, each person once, in the
 * server's order. A row that came back without the state it was asked for is
 * left out, so a server that ignores the filter can never fill a state with
 * everybody. With no state (a search across all of them) every row is kept.
 */
export function stageRows(
  pages: ReadonlyArray<Pick<WahubPage<WahubContact>, 'results'>> | undefined,
  stage: string | null,
): WahubContact[] {
  const seen = new Set<number>();
  const rows: WahubContact[] = [];
  for (const page of pages ?? []) {
    for (const contact of page.results) {
      if (seen.has(contact.id)) continue;
      if (stage !== null && leadOf(contact)?.stage !== stage) continue;
      seen.add(contact.id);
      rows.push(contact);
    }
  }
  return rows;
}

/**
 * Room for the states (300 at the least) and the people of one of them side by
 * side. Below it — a phone, a narrow tablet — one of the two at a time.
 */
export const LEADS_TWO_PANE_FROM = 780;
