/**
 * "דיוק" — fixing the bot in free text (docs/WAHUB-CONTRACT-REFINE.md).
 *
 * The operator marks the messages she did not like, says in her own words what
 * was wrong, and the server works out the change to the bot's knowledge. These
 * are the shapes the screen keeps; what the server sends is read into them in
 * src/lib/wahub/refine.ts, leniently, because the contract names the fields
 * and not every detail of their shape.
 */

import type { WahubProposalPlain } from './wahub';

export type WahubRefineAction = 'create' | 'update' | 'deactivate';

/** One change to the bot's knowledge that a refinement made (or proposes). */
export interface WahubRefineChange {
  /** The proposal that records the change; `review/proposals/{id}/undo/` takes it back alone. */
  proposal_id: number | null;
  action: WahubRefineAction;
  /** The knowledge item made or changed; null for one that does not exist yet. */
  item_id: number | null;
  /** The kind's code name, when the server sends it; shown only among the technical details. */
  kind: string;
  kind_label: string;
  title: string;
  /** The item's fields before and after — or a plain text, if that is what the server sends. */
  before: Record<string, unknown> | string | null;
  after: Record<string, unknown> | string | null;
  /** True once the change is in the knowledge. False: it waits for an approval, or was taken back. */
  applied: boolean;
  /** Taken back with "בטל". Not in the contract: read when the server says it, and set by the screen after an undo. */
  undone: boolean;
  /** The change in words (the proposal's `plain`), when the server sends it with the change. */
  plain: Partial<WahubProposalPlain> | null;
  /** False when the server says this change cannot be taken back; null when it does not say. */
  can_undo: boolean | null;
}

export type WahubRefineRole = 'operator' | 'system';

export interface WahubRefineTurn {
  role: WahubRefineRole;
  text: string;
  changes: WahubRefineChange[];
  created_at: string | null;
}

export type WahubRefineStatus = 'open' | 'done';

/** A refinement thread, as POST refine/, POST refine/{id}/say/ and GET refine/{id}/ answer. */
export interface WahubRefineThread {
  id: number;
  contact_id: number | null;
  message_ids: number[];
  status: WahubRefineStatus;
  /** The system's last answer: "הבנתי: … שיניתי: …", or its question. */
  reply: string;
  /** The system asked something and changed nothing yet. */
  needs_answer: boolean;
  /** Where the thread's changes stand now. */
  changes: WahubRefineChange[];
  turns: WahubRefineTurn[];
  created_at: string | null;
  created_by_name: string;
}

/** GET settings/review/ and PATCH settings/review/. */
export interface WahubReviewSettings {
  auto_apply: boolean;
}
