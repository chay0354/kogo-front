import api from '@/lib/api';
import { Lesson, LessonDetail, LessonFilters, AttendanceMark, AttendanceRecord, InstructorSalary, SalaryHistory } from '@/types/schedule';

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
  
  const url = `/scheduling/lessons/${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await api.get(url);
  return res.data as Lesson[];
}

/**
 * Fetch a single lesson with details
 */
export async function fetchLessonDetail(lessonId: string, date?: string): Promise<LessonDetail> {
  const url = date ? `/scheduling/lessons/${lessonId}/?date=${encodeURIComponent(date)}` : `/scheduling/lessons/${lessonId}/`;
  const res = await api.get(url);
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
export async function markAttendance(lessonId: string, date: string, attendance: AttendanceMark[]): Promise<void> {
  await api.post(`/scheduling/lessons/${lessonId}/mark_attendance/`, { date, attendance });
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

