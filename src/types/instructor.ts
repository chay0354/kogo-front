/**
 * Instructor related types
 */

export interface SalaryTier {
  id?: string;
  min_students: number;
  max_students: number | null;
  salary_per_lesson: number;
  created_at?: string;
  updated_at?: string;
}

export interface InstructorBranch {
  id: string;
  branch: {
    id: string;
    name: string;
  };
  created_at: string;
}

export interface InstructorBonus {
  id: string;
  instructor: string;
  instructor_name: string;
  bonus_type: 'one_time';
  amount: number;
  bonus_date: string;
  description: string;
  notes: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstructorListItem {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  specialization: string;
  primary_branch: string | null;
  primary_branch_name: string | null;
  branches: Array<{
    id: string;
    name: string;
  }>;
  salary_model_type: 'fixed_per_lesson' | 'tiered_by_students';
  fixed_salary_per_lesson: number;
  is_active: boolean;
  
  // Financial metrics
  lessons_count?: number;
  students_count?: number;
  revenue?: number;
  salary?: number;
  profit?: number;
  cancelled_count?: number;
  avg_attendance_rate?: number;
  salary_is_finalized?: boolean;
  bonuses_amount?: number;
  
  created_at: string;
  updated_at: string;
}

export interface LessonWithStudents {
  lesson_id: string;
  course_name: string;
  course_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  branch_name: string;
  branch_id: string;
  room_name: string;
  student_count: number;
  lesson_price: string;
  revenue: string;
  salary: string;
  profit: string;
  status: string;
  salary_override?: boolean;
  salary_override_amount?: string | null;
}

export interface CourseInfo {
  id: string;
  name: string;
  course_type: string | null;
}

export interface InstructorMonthlySnapshot {
  id: string;
  instructor: string;
  instructor_name: string;
  month: string; // YYYY-MM
  total_lessons: number;
  total_students: number;
  total_revenue: string;
  total_salary: string;
  profit: string;
  cancelled_count: number;
  avg_attendance_rate: string;
  created_at: string;
  updated_at: string;
}

export interface InstructorDetail {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  specialization: string;
  primary_branch: string | null;
  primary_branch_name: string | null;
  branches: InstructorBranch[];
  salary_model_type: 'fixed_per_lesson' | 'tiered_by_students';
  fixed_salary_per_lesson: number;
  salary_tiers: SalaryTier[];
  is_active: boolean;
  bonuses: InstructorBonus[];
  
  // Financial summary
  total_students?: number;
  total_revenue?: string;
  total_salary?: string;
  total_profit?: string;
  
  // Lessons and courses
  lessons: LessonWithStudents[];
  courses: CourseInfo[];
  
  // Monthly snapshots (last 6 months)
  monthly_snapshots: InstructorMonthlySnapshot[];
  
  created_at: string;
  updated_at: string;
}

export interface InstructorFinancialSummary {
  month: string;
  total_instructors: number;
  total_lessons: number;
  total_students: number;
  total_revenue: string;
  total_salary: string;
  total_profit: string;
}

export interface InstructorFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  specialization: string;
  primary_branch: string | null;
  salary_model_type: 'fixed_per_lesson' | 'tiered_by_students';
  fixed_salary_per_lesson: number;
  salary_tiers?: SalaryTier[];
  branch_ids: string[];
  is_active: boolean;
}

export interface BulkBonusFormData {
  instructor_ids: string[];
  bonus_type: 'one_time';
  amount: number;
  bonus_date: string;
  description: string;
  notes: string;
}

export interface InstructorsListResponse {
  instructors: InstructorListItem[];
  summary: {
    total_instructors: number;
    total_revenue: string;
    total_salary: string;
    total_profit: string;
  };
}

export type SalaryModelType = 'fixed_per_lesson' | 'tiered_by_students';
export type BonusType = 'one_time';

export interface InstructorFilters {
  search: string;
  branch: string;
  min_students: string;
  max_students: string;
  month: string;
}

// Day of week mapping
export const DAY_OF_WEEK_HEBREW: Record<number, string> = {
  0: 'ראשון',
  1: 'שני',
  2: 'שלישי',
  3: 'רביעי',
  4: 'חמישי',
  5: 'שישי',
  6: 'שבת'
};

// Constants
export const DEFAULT_LESSON_SALARY = 250;
export const LESSONS_PER_MONTH = 4;

export const DEFAULT_SALARY_TIERS: SalaryTier[] = [
  { min_students: 1, max_students: 7, salary_per_lesson: 250 },
  { min_students: 8, max_students: 15, salary_per_lesson: 300 },
  { min_students: 16, max_students: null, salary_per_lesson: 350 }
];


export const BONUS_TYPES = [
  { value: 'one_time', label: 'חד פעמי' }
];

