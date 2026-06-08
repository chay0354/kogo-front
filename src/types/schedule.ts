export type LessonStatus = 'scheduled' | 'completed' | 'cancelled';

export type Lesson = {
  id: string;
  course_name: string;
  course_type_name: string;
  instructor_id: string;
  instructor_name: string;
  branch_id: string;
  branch_name: string;
  city_id?: string;
  city_name?: string;
  room_name?: string;
  room_capacity?: number;
  day_of_week: number;
  day_of_week_display: string;
  start_time: string;
  end_time: string;
  lesson_date: string | null;
  status: LessonStatus;
  enrollment_count: number;
  notes: string;
  is_recurring: boolean;
};

export type LessonDetail = Lesson & {
  instructor_email: string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  enrollments: Array<{
    id: string;
    child_id: string;
    child_name: string;
    child_status?: string;
  }>;
  attendance: Array<{
    id: string;
    child?: string; // UUID field from backend
    child_id?: string; // Alternative field name
    child_name: string;
    status: 'present' | 'absent' | 'not_marked';
    child_status?: string;
  }>;
  created_at: string;
  updated_at: string;
};

export type AttendanceStatus = 'present' | 'absent' | 'not_marked';

export type AttendanceRecord = {
  id: string;
  lesson_id: string;
  occurrence_date?: string | null;
  child_id: string;
  child_name: string;
  status: AttendanceStatus;
  notes?: string;
  created_at: string;
};

export type AttendanceMark = {
  child_id: string;
  status: AttendanceStatus;
};

export type InstructorSalary = {
  instructor_id: string;
  instructor_name?: string;
  year: number;
  month: number;
  lesson_count: number;
  payment_per_lesson: string;
  total_salary: string;
  is_finalized: boolean;
  calculated_at: string;
};

export type SalaryHistory = InstructorSalary & {
  id: string;
};

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES: Record<WeekDay, string> = {
  0: 'ראשון',
  1: 'שני',
  2: 'שלישי',
  3: 'רביעי',
  4: 'חמישי',
  5: 'שישי',
  6: 'שבת',
};

export type LessonFilters = {
  start_date?: string;
  end_date?: string;
  branch_id?: string;
  city_id?: string;
  instructor_id?: string;
  status?: LessonStatus;
};

export type ScheduleEvent = {
  id: string;
  name: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  event_type: 'one_time' | 'weekly';
  is_daily_event: boolean;
  branch?: string;
  branch_name?: string;
  studio?: string;
  studio_name?: string;
  city?: string;
  city_name?: string;
  location?: string;
  assigned_instructors?: string[];
  assigned_instructor_names?: string[];
  color?: string;
  notes?: string;
  files?: string[];
  is_active: boolean;
  is_studio_rental?: boolean;
  renter_name?: string;
  /** Revenue per occurrence (one-time = once; weekly = each week in selected range for dashboards) */
  price_per_session?: string;
  /** 0=Sunday..6=Saturday; empty in API means anchor weekday from event_date */
  weekly_repeat_days?: number[];
  created_at: string;
  updated_at: string;
};

export type ScheduleEventFilters = {
  start_date?: string;
  end_date?: string;
  branch_id?: string;
  city_id?: string;
  /** When true, only studio rentals (שכירויות) are returned */
  studio_rental?: boolean;
};

