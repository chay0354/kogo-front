/**
 * A municipality child on an external branch's list.
 *
 * Not a Child: no family, no payment, no standing order. They exist so a
 * register can be called, a headcount can be known and a message can be sent.
 */
export type ExternalStudent = {
  id: string;
  lesson: string;
  lesson_id: string;
  course_id: string;
  course_name: string;
  course_display_id: number;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  notes: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  source: 'manual' | 'import';
  attendance_count: number;
  created_at: string;
  updated_at: string;
};

export type ExternalStudentFormData = {
  lesson: string;
  first_name: string;
  last_name: string;
  phone: string;
  notes: string;
};

export type ExternalBroadcastRow = {
  student_id: string;
  student_name: string;
  phone: string;
  status: 'sent' | 'failed' | 'preview' | 'skipped';
  reason: string | null;
  error: string | null;
};

export type ExternalBroadcastResult = {
  dry_run: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  preview_count: number;
  phones: string[];
  results: ExternalBroadcastRow[];
};
