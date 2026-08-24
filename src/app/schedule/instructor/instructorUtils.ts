import { DAY_NAMES, type Lesson, type WeekDay } from '@/types/schedule';
import { formatTime } from '@/lib/scheduleUtils';

export const DAY_LETTERS: Record<WeekDay, string> = {
  0: 'א',
  1: 'ב',
  2: 'ג',
  3: 'ד',
  4: 'ה',
  5: 'ו',
  6: 'ש',
};

export function timeToMinutes(time: string): number {
  const [hours, minutes] = formatTime(time).split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function isLessonNow(lesson: Lesson, selectedDate: Date): boolean {
  if (selectedDate.toDateString() !== new Date().toDateString()) return false;
  const start = timeToMinutes(lesson.start_time);
  const end = timeToMinutes(lesson.end_time);
  const now = nowMinutes();
  return now >= start && now < end;
}

export function findCurrentOrNextLessonId(lessons: Lesson[], selectedDate: Date): string | null {
  if (lessons.length === 0) return null;
  const current = lessons.find((lesson) => isLessonNow(lesson, selectedDate));
  if (current) return current.id;
  if (selectedDate.toDateString() !== new Date().toDateString()) return lessons[0].id;
  const now = nowMinutes();
  const upcoming = lessons.find((lesson) => timeToMinutes(lesson.start_time) > now);
  return upcoming?.id ?? lessons[lessons.length - 1].id;
}

export function lessonTitle(lesson: Lesson): string {
  const name = (lesson.course_name || '').trim();
  const type = (lesson.course_type_name || '').trim();
  if (!type) return name;
  if (!name) return type;
  if (name.includes(type)) return name;
  return `${name} ${type}`;
}

export function shortGroupLabel(lesson: Lesson): string {
  const name = (lesson.course_name || '').trim();
  const type = (lesson.course_type_name || '').trim();
  if (type && name.endsWith(type)) {
    return name.slice(0, -type.length).trim() || name;
  }
  if (type && name.includes(type)) {
    return name.replace(type, '').trim() || name;
  }
  return name.split(' ')[0] || name;
}

export function hebrewDayTitle(date: Date): string {
  const day = date.getDay() as WeekDay;
  return `יום ${DAY_NAMES[day]}`;
}

export function hebrewDayLetter(date: Date): string {
  return DAY_LETTERS[date.getDay() as WeekDay];
}

export function lessonTimeRange(lesson: Lesson): string {
  return `${formatTime(lesson.start_time)}-${formatTime(lesson.end_time)}`;
}
