/** A municipality sheet, from upload until it is applied or thrown away. */

export type RosterImportStatus =
  | 'uploaded' | 'parsing' | 'parsed' | 'applied' | 'failed' | 'discarded';

export type RosterUnitStatus =
  | 'pending' | 'running' | 'parsed' | 'mismatch' | 'failed' | 'skipped';

/** How sure the server is about which lesson a group means. */
export type RosterMatchState = 'confirmed' | 'exact' | 'ambiguous' | 'none';

export type RosterRowAction = 'add' | 'keep' | 'remove';

export interface RosterCandidate {
  lesson_id: string;
  course_id: string;
  course_name: string;
  course_display_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  min_age: number | null;
  max_age: number | null;
}

export interface RosterRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  action: RosterRowAction;
  existing_student: string | null;
  edited: boolean;
}

export interface RosterUnit {
  id: string;
  ordinal: number;
  municipality_code: string;
  group_name: string;
  slots_raw: string;
  slots: Array<{ day: number; start: string }>;
  status: RosterUnitStatus;
  error: string;
  /** What the sheet claims for this group, against what we actually read. */
  stated_total: number | null;
  read_total: number;
  match_state: RosterMatchState;
  candidates: RosterCandidate[];
  matched_lesson_ids: string[];
  counts: { add: number; keep: number; remove: number };
  rows: RosterRow[];
  duration_ms: number;
}

export interface RosterImport {
  id: string;
  branch: string;
  branch_name: string;
  kind: 'xlsx' | 'pdf';
  original_filename: string;
  period_label: string;
  status: RosterImportStatus;
  units_total: number;
  units_done: number;
  error: string;
  created_at: string;
  applied_at: string | null;
  stated_report_total: number | null;
  summary: {
    add: number; keep: number; remove: number; read_total: number;
    matches_stated_total: boolean;
  };
  units: RosterUnit[];
  /** Review only: guards apply against a plan that moved underneath it. */
  diff_digest?: string;
  blocking_units?: string[];
  bulk_removal_lessons?: string[];
  result?: { added: number; removed: number; kept: number };
}
