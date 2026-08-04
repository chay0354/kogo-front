import { CourseFormData, CourseWithLessons, LessonFormData, LessonPriceTier } from '@/types/course';
import {
  addMinutesToTime,
  normalizeTimeValue,
} from '@/lib/timeUtils';
import { FIRST_PRICE_TIER_INDEX } from './constants';

function normalizeTime(time?: string): string {
  return normalizeTimeValue(time, '16:00');
}

export function buildDefaultLessonTemplate(): LessonFormData {
  return {
    course: '',
    room: '',
    day_of_week: 0,
    start_time: '16:00',
    end_time: '16:45',
    price: undefined,
    lesson_price_override: undefined,
    notes: '',
  };
}

export function buildDefaultCourseData(courseTypeId: string): CourseFormData {
  return {
    course_type: courseTypeId,
    name: '',
    description: '',
    price: 0,
    capacity: 20,
    branch: '',
    min_age: 1,
    max_age: 14,
    instructor: '',
    instructor_salary_override: undefined,
    is_adult: false,
    must_attend_all_lessons: false,
    external_link: '',
  };
}

export function buildDuplicateFormState(
  source: CourseWithLessons,
  courseTypeId: string
): { course: CourseFormData; lessons: LessonFormData[] } {
  const branchId = typeof source.branch === 'string' ? source.branch : '';
  const lessons =
    source.lessons?.length > 0
      ? source.lessons.map((lesson) => ({
          course: '',
          room: lesson.room?.id || '',
          day_of_week: lesson.day_of_week,
          start_time: normalizeTime(lesson.start_time),
          end_time: normalizeTime(lesson.end_time) || addMinutesToTime(normalizeTime(lesson.start_time), 45),
          price: undefined,
          lesson_price_override: undefined,
          notes: lesson.notes || '',
        }))
      : [buildDefaultLessonTemplate()];

  return {
    course: {
      course_type: courseTypeId,
      name: source.name,
      description: source.description || '',
      price: Number(source.price),
      capacity: source.capacity,
      branch: branchId,
      min_age: source.min_age || 1,
      max_age: source.max_age || 14,
      instructor: source.instructor?.id || '',
      instructor_salary_override:
        source.instructor_salary_override != null
          ? Number(source.instructor_salary_override)
          : undefined,
      is_adult: source.is_adult ?? false,
      must_attend_all_lessons: source.must_attend_all_lessons ?? false,
      external_link: source.external_link || '',
    },
    lessons,
  };
}

export function toPositiveNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function calcEndTime(startTime: string, durationMinutes = 45): string {
  return addMinutesToTime(startTime, durationMinutes);
}

export function addExtraTier(tiers: LessonPriceTier[]): LessonPriceTier[] {
  return [...tiers, { course_index: FIRST_PRICE_TIER_INDEX + tiers.length, price: 0 }];
}

export function removeExtraTier(tiers: LessonPriceTier[], idx: number): LessonPriceTier[] {
  return tiers
    .filter((_, i) => i !== idx)
    .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: t.price }));
}

export function updateExtraTierPrice(tiers: LessonPriceTier[], idx: number, raw: string): LessonPriceTier[] {
  const value = raw === '' ? 0 : Number(raw);
  return tiers.map((t, i) => (i === idx ? { ...t, price: Number.isFinite(value) ? value : 0 } : t));
}
