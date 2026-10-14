/**
 * Finding one lesson among a few hundred in the card-link dialog (owner,
 * 14.10.2026: "איך אני אמצא את זה… תעשה שאפשר לסנן סניף, תחום וכו'").
 * Filters by branch, field, day and age group, plus free words: every word
 * typed must appear somewhere in the lesson's line, in any order.
 */

export type LessonFilterRow = {
  id: string;
  day_of_week: number;
  branch_id?: string | null;
  branch_name?: string | null;
  course_type?: string | null;
  course_type_name?: string | null;
  min_age?: number | null;
  max_age?: number | null;
};

/** '' in any field = no narrowing on it. `age` is a position on the age-group scale (1–16). */
export type LessonFilters = { branchId: string; typeId: string; day: string; age: string; query: string };

export const NO_LESSON_FILTERS: LessonFilters = { branchId: '', typeId: '', day: '', age: '', query: '' };

/** Hebrew geresh/gershayim and their keyboard look-alikes count as the same mark. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[׳'`’‘]/g, "'")
    .replace(/[״"”“]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lessonMatches(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const hay = normalizeSearchText(haystack);
  return words.every((word) => hay.includes(word));
}

/** A lesson with no age range on its course is shown for every age. */
function fitsAge(lesson: LessonFilterRow, age: number): boolean {
  if (lesson.min_age == null && lesson.max_age == null) return true;
  const low = lesson.min_age ?? 1;
  const high = lesson.max_age ?? Number.MAX_SAFE_INTEGER;
  return low <= age && age <= high;
}

/** `text` is what the free words are looked for in — the lesson's whole line. */
export function lessonInFilters(lesson: LessonFilterRow, filters: LessonFilters, text: string): boolean {
  if (filters.branchId && lesson.branch_id !== filters.branchId) return false;
  if (filters.typeId && lesson.course_type !== filters.typeId) return false;
  if (filters.day !== '' && String(lesson.day_of_week) !== filters.day) return false;
  if (filters.age && !fitsAge(lesson, Number(filters.age))) return false;
  if (filters.query.trim() && !lessonMatches(text, filters.query)) return false;
  return true;
}

export type FilterChoice = { id: string; name: string };

/** The branches, fields and days that actually have lessons, for the filter menus. */
export function lessonFilterChoices(lessons: LessonFilterRow[]): {
  branches: FilterChoice[];
  types: FilterChoice[];
  days: number[];
} {
  const branches = new Map<string, string>();
  const types = new Map<string, string>();
  const days = new Set<number>();
  for (const lesson of lessons) {
    if (lesson.branch_id) branches.set(lesson.branch_id, lesson.branch_name || 'ללא שם');
    if (lesson.course_type) types.set(lesson.course_type, lesson.course_type_name || 'ללא שם');
    days.add(lesson.day_of_week);
  }
  const byName = (a: FilterChoice, b: FilterChoice) => a.name.localeCompare(b.name, 'he');
  return {
    branches: [...branches].map(([id, name]) => ({ id, name })).sort(byName),
    types: [...types].map(([id, name]) => ({ id, name })).sort(byName),
    days: [...days].sort((a, b) => a - b),
  };
}
