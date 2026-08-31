import api from '@/lib/api';
import { Lesson, LessonDetail, LessonFilters, AttendanceMark, AttendanceRecord, InstructorSalary, SalaryHistory, type ScheduleEvent, DAY_NAMES, type WeekDay, type WeeklyDayTimes } from '@/types/schedule';

/**
 * Fetch lessons with optional filters
 */
export async function fetchLessons(filters?: LessonFilters): Promise<Lesson[]> {
  const params = new URLSearchParams();
  
  if (filters?.start_date) params.append('start_date', filters.start_date);
  if (filters?.end_date) params.append('end_date', filters.end_date);
  if (filters?.branch_id) params.append('branch_id', filters.branch_id);
  if (filters?.city_id) params.append('city_id', filters.city_id);
  if (filters?.instructor_id) params.append('instructor_id', filters.instructor_id);
  if (filters?.status) params.append('status', filters.status);
  // A linked colleague's register. The server re-checks the link; sending an id
  // it has no row for is refused rather than quietly falling back.
  if (filters?.as_user) params.append('as_user', filters.as_user);
  
  const url = `/scheduling/lessons/${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await api.get(url, { timeout: 45000 });
  return res.data as Lesson[];
}

/**
 * Fetch a single lesson with details
 */
export async function fetchLessonDetail(
  lessonId: string,
  date?: string,
  asUser?: string,
): Promise<LessonDetail> {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  // A linked colleague's register. The lesson is only reachable through their
  // scope, so this has to travel with every call about it — not just the list.
  if (asUser) params.append('as_user', asUser);
  const query = params.toString();
  const res = await api.get(`/scheduling/lessons/${lessonId}/${query ? `?${query}` : ''}`);
  return res.data as LessonDetail;
}

/**
 * Cancel a lesson (manager only)
 */
export async function cancelLesson(lessonId: string, date: string, reason?: string): Promise<LessonDetail> {
  const res = await api.post(`/scheduling/lessons/${lessonId}/cancel/`, { date, reason });
  return res.data as LessonDetail;
}

/**
 * Restore a cancelled lesson (manager only)
 */
export async function restoreLesson(lessonId: string, date: string): Promise<LessonDetail> {
  const res = await api.post(`/scheduling/lessons/${lessonId}/restore/`, { date });
  return res.data as LessonDetail;
}

/**
 * Get attendance records for a lesson
 */
export async function fetchLessonAttendance(lessonId: string, date: string): Promise<AttendanceRecord[]> {
  const res = await api.get(`/scheduling/lessons/${lessonId}/attendance/?date=${encodeURIComponent(date)}`);
  return res.data as AttendanceRecord[];
}

/**
 * Mark attendance for a lesson
 */
export async function markAttendance(
  lessonId: string,
  date: string,
  attendance: AttendanceMark[],
  asUser?: string,
): Promise<void> {
  // as_user rides in the query string: the scope is resolved from there before
  // the body is looked at.
  const suffix = asUser ? `?as_user=${encodeURIComponent(asUser)}` : '';
  await api.post(`/scheduling/lessons/${lessonId}/mark_attendance/${suffix}`, { date, attendance });
}

/**
 * Add a child who turned up without being registered.
 *
 * Created as a walk-in: on the roster so attendance can be marked, but outside
 * capacity, billing and messaging until the office registers them properly.
 */
export async function addWalkInStudent(
  lessonId: string,
  date: string,
  student: { first_name: string; last_name: string; phone?: string },
  asUser?: string,
): Promise<LessonDetail['enrollments'][number]> {
  const suffix = asUser ? `?as_user=${encodeURIComponent(asUser)}` : '';
  const res = await api.post(`/scheduling/lessons/${lessonId}/add-walkin/${suffix}`, {
    date,
    ...student,
  });
  return res.data as LessonDetail['enrollments'][number];
}

/**
 * Get current month salary for an instructor
 */
export async function fetchCurrentSalary(instructorId: string, year?: number, month?: number): Promise<InstructorSalary> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());
  if (month) params.append('month', month.toString());
  
  const url = `/instructors/${instructorId}/current_salary/${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await api.get(url);
  return res.data as InstructorSalary;
}

/**
 * Get salary history for an instructor
 */
export async function fetchSalaryHistory(instructorId: string): Promise<SalaryHistory[]> {
  const res = await api.get(`/instructors/${instructorId}/salary_history/`);
  return res.data as SalaryHistory[];
}

/**
 * Finalize salary for a month (manager only)
 */
export async function finalizeMonth(year: number, month: number, instructorIds?: string[]): Promise<void> {
  await api.post('/instructors/finalize_month/', {
    year,
    month,
    instructor_ids: instructorIds,
  });
}

/**
 * Get the start and end dates for a week containing the given date
 */
export function getWeekDates(date: Date): { start: Date; end: Date; dates: Date[] } {
  const dayOfWeek = date.getDay(); // 0 = Sunday
  const start = new Date(date);
  start.setDate(date.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  // Generate all 7 dates in the week
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  
  return { start, end, dates };
}

/**
 * Group lessons by day of week
 */
export function groupLessonsByDay(lessons: Lesson[]): Record<number, Lesson[]> {
  const grouped: Record<number, Lesson[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };
  
  for (const lesson of lessons) {
    grouped[lesson.day_of_week].push(lesson);
  }
  
  // Sort lessons within each day by start time
  for (const day in grouped) {
    grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  
  return grouped;
}

/**
 * Group lessons by their actual date within a specific week
 * This replaces groupLessonsByDay for weekly views where lessons have specific dates
 */
export function groupLessonsByDate(lessons: Lesson[], weekDates: Date[]): Record<number, Lesson[]> {
  const grouped: Record<number, Lesson[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };
  
  // Create a map of date strings to day indices
  const dateToIndexMap: Record<string, number> = {};
  weekDates.forEach((date, index) => {
    dateToIndexMap[formatDateISO(date)] = index;
  });
  
  for (const lesson of lessons) {
    if (lesson.lesson_date) {
      // Use the actual lesson_date from the backend
      const dayIndex = dateToIndexMap[lesson.lesson_date];
      if (dayIndex !== undefined) {
        grouped[dayIndex].push(lesson);
      }
    } else {
      // Fallback to day_of_week (shouldn't happen with current backend)
      grouped[lesson.day_of_week].push(lesson);
    }
  }
  
  // Sort lessons within each day by start time
  for (const day in grouped) {
    grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  
  return grouped;
}

/**
 * Lesson day_of_week (0=Sunday .. 6=Saturday) from YYYY-MM-DD in local time.
 */
export function lessonDayOfWeekFromISODate(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.getDay();
}

export function initialWeeklyRepeatDays(
  ev?: ScheduleEvent | null,
  fallbackDateIso?: string
): number[] {
  if (ev?.event_type === 'weekly' && ev.weekly_repeat_days && ev.weekly_repeat_days.length > 0) {
    return [...new Set(ev.weekly_repeat_days.map((x) => Number(x)))]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b);
  }
  const d = ev?.event_date || fallbackDateIso;
  if (d) return [lessonDayOfWeekFromISODate(d)];
  return [];
}

/**
 * Seed the per-day time map for the weekly-rental time picker:
 * - Existing per-day data on the event wins.
 * - Otherwise falls back to the event's single start_time/end_time (legacy rentals,
 *   or a freshly-created event that hasn't set per-day times yet) for every day currently selected.
 */
export function initialWeeklyDayTimes(
  ev: ScheduleEvent | null | undefined,
  weeklyDays: number[]
): Record<number, { start: string; end: string }> {
  const existing = ev?.weekly_day_times;
  const fallbackStart = ev?.start_time ? formatTime(ev.start_time) : '';
  const fallbackEnd = ev?.end_time ? formatTime(ev.end_time) : '';

  const result: Record<number, { start: string; end: string }> = {};
  for (const day of weeklyDays) {
    const dt = existing?.[String(day) as keyof WeeklyDayTimes];
    result[day] = {
      start: dt ? formatTime(dt.start_time) : fallbackStart,
      end: dt ? formatTime(dt.end_time) : fallbackEnd,
    };
  }
  return result;
}

/** Comma-separated "day HH:MM–HH:MM" list for a weekly event's per-day times (rentals list display). */
export function formatWeeklyDayTimesHebrew(ev: {
  event_type: string;
  event_date: string;
  weekly_repeat_days?: number[];
  weekly_day_times?: WeeklyDayTimes;
  start_time?: string;
  end_time?: string;
}): string {
  if (ev.event_type !== 'weekly') return '—';

  const days = ev.weekly_repeat_days && ev.weekly_repeat_days.length > 0
    ? [...new Set(ev.weekly_repeat_days.map((x) => Number(x)))].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
    : [lessonDayOfWeekFromISODate(ev.event_date)];

  return days
    .map((d) => {
      const dt = ev.weekly_day_times?.[String(d) as keyof WeeklyDayTimes];
      const start = dt?.start_time ?? ev.start_time;
      const end = dt?.end_time ?? ev.end_time;
      const dayName = DAY_NAMES[d as WeekDay];
      return start && end ? `${dayName} ${formatTime(start)}–${formatTime(end)}` : dayName;
    })
    .join(', ');
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDateDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format time as HH:MM
 */
export function formatTime(time: string): string {
  // time comes as "HH:MM:SS" from backend
  return time.substring(0, 5);
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get Hebrew month name
 */
export function getHebrewMonth(month: number): string {
  const months = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  return months[month - 1] || '';
}


export interface InstructorDashboard {
  branches: Array<{ id: string; name: string }>;
  monthly_trend: Array<{ month: string; students: number }>;
  groups: Array<{
    lesson_id: string;
    course_name: string;
    branch_name: string;
    day_of_week: number;
    start_time: string;
    active_students: number;
    is_low: boolean;
  }>;
  unmarked_lessons: Array<{
    lesson_id: string;
    date: string;
    course_name: string;
    branch_name: string;
    start_time: string;
    missing: number;
  }>;
  unmarked_total: number;
  total_active_students: number;
  low_group_threshold: number;
  date_from: string;
  date_to: string;
  subject: { id: string; name: string; is_self: boolean };
}

/**
 * The signed-in instructor's own numbers — headcount trend, group sizes and
 * which occurrences still need attendance marked.
 */
export async function fetchInstructorDashboard(params: {
  date_from?: string;
  date_to?: string;
  branch_id?: string;
  as_user?: string;
}): Promise<InstructorDashboard> {
  const query = new URLSearchParams();
  if (params.date_from) query.append('date_from', params.date_from);
  if (params.date_to) query.append('date_to', params.date_to);
  if (params.branch_id && params.branch_id !== 'all') query.append('branch_id', params.branch_id);
  if (params.as_user) query.append('as_user', params.as_user);
  const res = await api.get(`/instructors/my-dashboard/${query.toString() ? `?${query}` : ''}`);
  return res.data as InstructorDashboard;
}
