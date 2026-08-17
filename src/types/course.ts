// Course Type (תחום) - Main category
export interface CourseType {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Course Type with aggregated statistics
export interface CourseTypeWithStats {
  id: string;
  name: string;
  description: string;
  courses_count: number;
  lessons_count: number;
  students_count: number;
  branches: Branch[];
  is_active: boolean;
}

// Branch minimal info
export interface Branch {
  id: string;
  name: string;
  is_external?: boolean;
}

// Room minimal info
export interface Room {
  id: string;
  name: string;
}

// Instructor salary tier
export interface SalaryTier {
  min_students: number;
  max_students: number | null;
  salary_per_lesson: number | string;
}

// Instructor minimal info
export interface Instructor {
  id: string;
  full_name: string;
  salary_model_type: 'fixed_per_lesson' | 'tiered_by_students';
  fixed_salary_per_lesson: number | string;
  salary_tiers: SalaryTier[];
}

// Course (חוג) - Specific course within a type
export interface Course {
  id: string;
  course_type?: string;
  course_type_name?: string;
  name: string;
  description: string;
  price: number;
  capacity: number;
  branch: string;
  branch_name?: string;
  min_age?: number | null;
  max_age?: number | null;
  is_active: boolean;
  is_adult: boolean;
  must_attend_all_lessons: boolean;
  trial_lesson_is_paid?: boolean;
  trial_lesson_price?: number | null;
  external_link?: string;
  created_at: string;
  updated_at: string;
}

// Tier price for students concurrently enrolled in additional courses.
// course_index is 1-based and >= 2 (2 = student's 2nd concurrent course).
export interface LessonPriceTier {
  course_index: number;
  price: number;
}

// Lesson (שיעור) - Individual recurring lesson
export interface Lesson {
  id: string;
  course?: string;
  course_name?: string;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  branch?: { id: string; name: string } | null;
  room?: Room | null;
  instructor: Instructor | null;
  enrolled_count: number; // Paying active students (trial signups excluded)
  total_students_count?: number; // All students regardless of status (for display)
  price?: number | null;
  lesson_price_override?: number | null;
  additional_course_prices?: LessonPriceTier[];
  instructor_salary_override?: number | null;
  max_students?: number | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  is_recurring: boolean;
  notes: string;
}

// LessonBundle (מסלול משולב) — combined-price package of 2+ lessons of the same course
export interface LessonBundleLesson {
  id: string;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  instructor_id?: string | null;
  instructor_name?: string | null;
}

export interface LessonBundle {
  id: string;
  course: string;
  name: string;
  lessons: string[];
  lessons_detail: LessonBundleLesson[];
  combined_price: number;
  price_per_lesson: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonBundleFormData {
  course: string;
  name?: string;
  lessons: string[];
  combined_price: number;
  is_active?: boolean;
}

// Course with nested lessons
export interface CourseWithLessons {
  id: string;
  name: string;
  description: string;
  price: number;
  capacity: number;
  min_age?: number | null;
  max_age?: number | null;
  branch?: string;
  branch_name?: string;
  instructor?: Instructor | null;
  instructor_salary_override?: number | null;
  /** Distinct active students (paying + trial) across all lessons in this course */
  course_enrollment_count?: number;
  lessons: Lesson[];
  is_active: boolean;
  is_adult?: boolean;
  must_attend_all_lessons?: boolean;
  trial_lesson_is_paid?: boolean;
  trial_lesson_price?: number | null;
  external_link?: string;
}

// Course Type with complete details
export interface CourseTypeDetails {
  id: string;
  name: string;
  description: string;
  courses: CourseWithLessons[];
  is_active: boolean;
}

// Financial calculations
export interface LessonFinancials {
  revenue: number;
  salary: number;
  profit: number;
}

export interface CourseFinancials {
  monthlyRevenue: number;
  monthlySalary: number;
  monthlyProfit: number;
}

export interface CourseTypeFinancials {
  totalRevenue: number;
  totalSalary: number;
  totalProfit: number;
}

// Filter options
export interface AgeFilter {
  label: string;
  minAge?: number;
  maxAge?: number;
}

export interface TimeFilter {
  label: string;
  startHour?: number;
  endHour?: number;
}

export interface ProfitabilityFilter {
  label: string;
  value: 'all' | 'profitable' | 'unprofitable';
}

// Form data for creating/editing
export interface CourseTypeFormData {
  name: string;
  description: string;
}

export interface CourseFormData {
  course_type: string;
  name: string;
  description: string;
  price: number;
  capacity: number;
  branch?: string;
  min_age: number;
  max_age: number;
  instructor?: string;
  instructor_salary_override?: number | null;
  is_adult?: boolean;
  must_attend_all_lessons?: boolean;
  trial_lesson_is_paid?: boolean;
  trial_lesson_price?: number | null;
  external_link?: string;
}

export interface LessonFormData {
  course: string;
  branch?: string;
  room: string;
  instructor?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  price?: number;
  lesson_price_override?: number;
  additional_course_prices?: LessonPriceTier[];
  instructor_salary_override?: number;
  max_students?: number;
  notes?: string;
}

