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
  trial_lesson_date?: string | null;
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
  parent_id: string | null;
  
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
  } | null;
  attendance_rate: number;
  
  created_at: string | null;
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
  branch: string;
  course_type: string;
  course: string;
  instructor: string;
  status: string;
  absent_irregularly: string;
  trial: string;
  payment: string;
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
