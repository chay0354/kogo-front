/**
 * Customer/Child related types
 */

export interface EnrollmentDetail {
  lesson_id: string;
  enrollment_id: string;
  course_name: string;
  course_id: string;
  course_display_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  branch_name: string | null;
  instructor_name: string | null;
  status: string;
  bundle_id?: string | null;
  trial_lesson_date?: string | null;
  /** Set once the trial date passed: attended / no_show / unmarked. */
  trial_outcome?: 'attended' | 'no_show' | 'unmarked' | null;
  /** 1 for the first trial; the office may book a second (2, 3…) from the CRM. */
  trial_number?: number;
  /** A downgrade waiting for the next billing date (the child stays put until then). */
  scheduled_change?: {
    id: string;
    effective_date: string;
    target_label: string;
    old_amount: string | null;
    new_amount: string | null;
    /** Set when the cron could not move the child on the date (a full or cancelled lesson). */
    last_error?: string;
  } | null;
}

export interface ChangeLessonQuote {
  target_label: string;
  current_amount: string | null;
  new_base_price: string | null;
  new_amount: string | null;
  discount_amount: string;
  discounts: Array<{ name: string; reason: string; value: string }>;
  direction: 'same' | 'up' | 'down' | 'no_sto';
  difference: string;
  prorated_difference: string;
  remaining_occurrences: number;
  total_occurrences: number;
  effective_date: string | null;
  /** False for a legacy order not billed on the 1st — a priced change is refused. */
  effective_on_first: boolean;
  has_saved_card: boolean;
  /** A different amount already waiting for the next cycle; this change replaces it. */
  pending_amount: string | null;
  pending_effective_date: string | null;
  clears_pending: boolean;
  blocked: string;
  pending_change: EnrollmentDetail['scheduled_change'];
}

export interface ChildWithDetails {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  birth_date: string | null;
  gender: "male" | "female" | null;
  age: number;
  id_number: string | null;
  phone_number: string | null;
  family_id: string;
  family_name: string;
  family_phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  // Only while the list is searched: the off-row field the search hit.
  search_match?: { label: string; value: string } | null;
  parent_id: string | null;
  parent_id_number?: string | null;
  parent_email?: string | null;
  family_email?: string | null;
  family_address?: string | null;
  
  // NEW: Explicit status field
  status: "active" | "trial_signed" | "trial_completed" | "payment_problem" | "not_paid" | "pending" | "ghost" | "inactive";
  paid_until_date: string | null;
  trial_classes_attended: number;
  absent_irregularly: boolean;
  is_ghost_visible: boolean;
  
  // Subscription dates (reference)
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  
  // Enrollment and attendance
  enrollments: EnrollmentDetail[];
  trial_enrollment?: {
    enrollment_id: string;
    lesson_id: string;
    course_name: string;
    trial_lesson_date: string | null;
    trial_outcome?: 'attended' | 'no_show' | 'unmarked' | null;
    trial_number?: number;
  } | null;
  attendance_rate: number;
  
  created_at: string | null;
  /** Brothers and sisters on the same family, so the office can move between them. */
  siblings?: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    age: number | null;
    gender: string | null;
    status: string | null;
  }[];
}

export interface Branch {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  name: string;
  branch_name: string;
  course_type?: string;
}

export interface Instructor {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
}

export interface CustomerFilters {
  search: string;
  city: string;
  branch: string;
  course_type: string;
  course: string;
  /** One slot of the chosen course (lesson id) — only meaningful when `course` is set. */
  lesson: string;
  /** 0 = Sunday … 6 = Saturday, as the backend's Lesson.day_of_week. */
  day_of_week: string;
  instructor: string;
  status: string;
  absent_irregularly: string;
}

export type ViewMode = 'children' | 'courses';

export interface CourseGroup {
  course_id: string;
  course_name: string;
  course_display_id: number | null;
  branch_name: string | null;
  instructor_name: string | null;
  students_count: number;
  students_preview: Array<{
    id: string;
    full_name: string | null;
  }>;
  students_preview_truncated: boolean;
}

export interface AbsenceRecord {
  id: string;
  lesson_name: string;
  course_name: string;
  course_display_id: number | null;
  occurrence_date: string;
  created_at: string;
}
