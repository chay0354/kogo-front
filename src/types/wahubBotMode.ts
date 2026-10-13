/**
 * "מי עונה ללקוחות" — whom the new bot answers for real, and the switch of its
 * comings back to the leads (docs/WAHUB-CONTRACT-GO-LIVE.md, ג).
 *
 * One body answers all four calls: GET / POST settings/bot-mode/ and
 * GET / POST settings/followups/. Kept in a file of its own, beside
 * src/types/wahub.ts, so the two can be worked on at the same time.
 */

/** `test`: only the contacts of the live test, as before. `all`: every customer who writes. */
export type WahubBotModeValue = 'test' | 'all';

/** What the live answers came to since midnight (Israel). */
export interface WahubBotModeToday {
  /** Answers that went out. */
  sent: number;
  /** Answers that failed. */
  failed: number;
  /** Answered late, by the safety net (counted in `sent` too). */
  late: number;
  /** "צריך נציג" opened by the bot. */
  needs_human: number;
  /** Times the handoff wording was sent in place of an answer. */
  fallback: number;
  /** Messages nobody answered, handed to a person. */
  unanswered: number;
}

/** The emergency brake fired: the mode went back to `test` by itself. */
export interface WahubBotModeStopped {
  at: string | null;
  reason: string;
  /** "הבוט החדש עצר את עצמו: …" — ready to show. */
  text: string;
}

/** The last failure, with no customer's details. */
export interface WahubBotModeFailure {
  at: string | null;
  kind: string;
  text: string;
}

/** The switch of the bot's comings back to the leads. */
export interface WahubBotFollowups {
  on: boolean;
  /** The first moment both the switch and sending were on; only what is due after it goes out. */
  since: string | null;
  turned_on_at: string | null;
  by: string;
  /** Where the switch stands, in one sentence — ready to show. */
  text: string;
  /** How many comings back of real customers wait right now. */
  due_now: number;
}

/** One change of the two switches, or the brake, or the moment the mode became live. */
export interface WahubBotModeLogEntry {
  at: string | null;
  /** `mode` / `followups` / `brake` / `live` — or one the server adds later. */
  what: string;
  to: string;
  by: string;
  text: string;
}

/** GET settings/bot-mode/ */
export interface WahubBotMode {
  /** What was chosen. */
  mode: WahubBotModeValue;
  /** The new bot answers everybody right now (`all`, and sending is on). */
  live: boolean;
  /** The moment it became so; a message that came in before it is never answered. */
  live_since: string | null;
  chosen_at: string | null;
  chosen_by: string;
  /** The owner's one switch for anything going out to a customer. */
  sending_enabled: boolean;
  /** Where the mode stands, in one sentence. */
  text: string;
  /** A sentence, when what was chosen and what happens are not the same; empty otherwise. */
  warning: string;
  stopped: WahubBotModeStopped | null;
  /** How many contacts are in the live test. */
  test_contacts: number;
  today: WahubBotModeToday;
  last_failure: WahubBotModeFailure | null;
  followups: WahubBotFollowups;
  /** The last changes, the newest first. Empty where the server sends none (the `bot` key of status/). */
  log: WahubBotModeLogEntry[];
}

/** One reason the server cannot answer customers right now (409 `not_ready`). */
export interface WahubBotModeProblem {
  code: string;
  text: string;
}
