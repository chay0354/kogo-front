import {
  Lesson,
  Instructor,
  LessonFinancials,
  CourseFinancials,
  CourseTypeFinancials,
  CourseWithLessons,
} from '@/types/course';

// Constants
export const LESSONS_PER_MONTH = 4;

/**
 * Monthly instructor pay configured on the team (עריכת קבוצה).
 * When unset, falls back to the instructor profile pay from מדריכים (per-lesson × 4 × slots).
 */
export function getInstructorMonthlySalaryFromProfile(course: CourseWithLessons): number {
  if (!course.lessons?.length) {
    return 0;
  }

  let monthly = 0;
  for (const lesson of course.lessons) {
    const instructor = course.instructor ?? lesson.instructor;
    if (!instructor) {
      continue;
    }
    const perLesson = calculateInstructorSalary(
      lesson,
      instructor,
      Number(lesson.enrolled_count) || 0
    );
    monthly += perLesson * LESSONS_PER_MONTH;
  }
  return monthly;
}

export function getTeamInstructorMonthlySalary(course: CourseWithLessons): number {
  if (
    course.instructor_salary_override !== null &&
    course.instructor_salary_override !== undefined
  ) {
    return Number(course.instructor_salary_override) || 0;
  }
  return getInstructorMonthlySalaryFromProfile(course);
}

/** @deprecated Use getTeamInstructorMonthlySalary */
export const getTeamInstructorSalaryPerLesson = getTeamInstructorMonthlySalary;

/**
 * Calculate instructor salary for a lesson based on their salary model (from מדריכים settings).
 */
export function calculateInstructorSalary(
  lesson: Lesson,
  instructor: Instructor | null,
  enrolledCount: number
): number {
  // Check for override first
  if (lesson.instructor_salary_override !== null && lesson.instructor_salary_override !== undefined) {
    return Number(lesson.instructor_salary_override);
  }

  // If no instructor assigned, salary is 0 (lesson remains but has no instructor)
  if (!instructor) {
    return 0;
  }

  // Handle tiered salary model
  if (instructor.salary_model_type === 'tiered_by_students') {
    // Check if instructor has salary tiers
    if (instructor.salary_tiers && instructor.salary_tiers.length > 0) {
      // For 0 students, use the lowest tier (tier with min_students=1)
      const effectiveCount = Math.max(enrolledCount, 1);
      const applicableTier = instructor.salary_tiers.find(
        (tier) =>
          effectiveCount >= tier.min_students &&
          (tier.max_students === null || effectiveCount <= tier.max_students)
      );
      return applicableTier ? Number(applicableTier.salary_per_lesson) : Number(instructor.fixed_salary_per_lesson) || 0;
    }
    // Fall back to fixed salary if no tiers defined
    return Number(instructor.fixed_salary_per_lesson) || 0;
  }

  // Default to fixed salary
  return Number(instructor.fixed_salary_per_lesson) || 0;
}

/**
 * Calculate financial metrics for a single lesson
 */
export function calculateLessonFinancials(
  lesson: Lesson,
  coursePrice: number
): LessonFinancials {
  const enrolledCount = Number(lesson.enrolled_count) || 0;
  const price = Number(coursePrice) || 0;
  
  // Revenue: (course monthly price / lessons per month) * enrolled students
  const revenue = (price / LESSONS_PER_MONTH) * enrolledCount;
  
  const salary = calculateInstructorSalary(lesson, lesson.instructor, enrolledCount);
  
  // Profit: revenue - salary
  const profit = revenue - salary;

  return {
    revenue: Number(revenue.toFixed(2)),
    salary: Number(salary.toFixed(2)),
    profit: Number(profit.toFixed(2)),
  };
}

/**
 * Calculate monthly financial metrics for a course (sum all its lessons)
 */
export function calculateCourseFinancials(course: CourseWithLessons): CourseFinancials {
  let monthlyRevenue = 0;
  
  const coursePrice = Number(course.price) || 0;
  course.lessons.forEach((lesson) => {
    const lessonFinancials = calculateLessonFinancials(lesson, coursePrice);
    monthlyRevenue += lessonFinancials.revenue * LESSONS_PER_MONTH;
  });

  // Team expense = monthly instructor pay from team settings (not per lesson)
  const monthlySalary = getTeamInstructorMonthlySalary(course);

  const monthlyProfit = monthlyRevenue - monthlySalary;

  return {
    monthlyRevenue: Number(monthlyRevenue.toFixed(2)),
    monthlySalary: Number(monthlySalary.toFixed(2)),
    monthlyProfit: Number(monthlyProfit.toFixed(2)),
  };
}

/**
 * Calculate total monthly financial metrics for all courses
 */
export function calculateCourseTypeFinancials(
  courses: CourseWithLessons[]
): CourseTypeFinancials {
  let totalRevenue = 0;
  let totalSalary = 0;

  courses.forEach((course) => {
    const courseFinancials = calculateCourseFinancials(course);
    totalRevenue += courseFinancials.monthlyRevenue;
    totalSalary += courseFinancials.monthlySalary;
  });

  const totalProfit = totalRevenue - totalSalary;

  return {
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalSalary: Number(totalSalary.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
  };
}

/**
 * Format currency in ILS
 */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}₪`;
}

/**
 * Fixed age-group scale used everywhere a course age range is picked or displayed:
 * two preschool bands followed by grades א-י״ב. Position in this array (1-indexed)
 * is the value stored on Course.min_age / Course.max_age.
 */
export const AGE_GROUP_LABELS = [
  '3-4.5', '4.5-6',
  'כיתה א', 'כיתה ב', 'כיתה ג', 'כיתה ד', 'כיתה ה', 'כיתה ו',
  'כיתה ז', 'כיתה ח', 'כיתה ט', 'כיתה י', 'כיתה י״א', 'כיתה י״ב',
  'בוגרים', 'מדריכים',
];

/**
 * Ordinal age-group values (1-16) matching AGE_GROUP_LABELS, for populating
 * min/max age dropdowns.
 */
export const AGE_OPTIONS = AGE_GROUP_LABELS.map((_, i) => i + 1);

/** 1-based age-group values for בוגרים / מדריכים in AGE_GROUP_LABELS. */
export const ADULTS_AGE_GROUP = AGE_GROUP_LABELS.indexOf('בוגרים') + 1;
export const INSTRUCTORS_AGE_GROUP = AGE_GROUP_LABELS.indexOf('מדריכים') + 1;

export const INSTRUCTORS_TRACK_TITLE = 'מסלול מדריכים - פתוח לכל השיעורים';

export function isInstructorsAgeGroup(age?: number | null): boolean {
  return age === INSTRUCTORS_AGE_GROUP;
}

export function isInstructorsCourse(course: {
  min_age?: number | null;
  max_age?: number | null;
}): boolean {
  return course.min_age === INSTRUCTORS_AGE_GROUP && course.max_age === INSTRUCTORS_AGE_GROUP;
}

/**
 * Format age range for display (handles preschool and grades)
 */
export function formatAgeRange(minAge?: number | null, maxAge?: number | null): string {
  if (!minAge && !maxAge) return '';
  if (!minAge) return formatAge(maxAge!);
  if (!maxAge) return formatAge(minAge);
  if (minAge === maxAge) return formatAge(minAge);

  return `${formatAge(minAge)} - ${formatAge(maxAge)}`;
}

/**
 * Format single age-group value (1-2 = preschool, 3-14 = grades א-י״ב, 15-16 = בוגרים/מדריכים)
 */
export function formatAge(age: number): string {
  return AGE_GROUP_LABELS[age - 1] ?? '';
}

/**
 * Get Hebrew day name
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return '';
  return days[dayOfWeek];
}

/**
 * Format time range
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return '';
  return `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`;
}

/**
 * Get time of day category
 */
export function getTimeOfDay(startTime: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return 'morning';
  if (hour < 16) return 'afternoon';
  return 'evening';
}

/**
 * Check if lesson matches age filter
 */
export function matchesAgeFilter(
  course: CourseWithLessons,
  filter: { minAge?: number; maxAge?: number }
): boolean {
  if (!filter.minAge && !filter.maxAge) return true;
  
  const courseMinAge = course.min_age || 0;
  const courseMaxAge = course.max_age || 100;
  
  // For single age selection (minAge === maxAge), check if it falls within course range
  if (filter.minAge === filter.maxAge) {
    const selectedAge = filter.minAge || 0;
    return courseMinAge <= selectedAge && selectedAge <= courseMaxAge;
  }
  
  // For age range filters, check if there's any overlap
  const filterMinAge = filter.minAge || 0;
  const filterMaxAge = filter.maxAge || 100;
  return courseMinAge <= filterMaxAge && courseMaxAge >= filterMinAge;
}

/**
 * Check if lesson matches time filter
 */
export function matchesTimeFilter(
  lesson: Lesson,
  filter: { startHour?: number; endHour?: number }
): boolean {
  if (!filter.startHour && !filter.endHour) return true;
  
  const lessonHour = parseInt(lesson.start_time.split(':')[0]);
  const filterStartHour = filter.startHour || 0;
  const filterEndHour = filter.endHour || 24;
  
  return lessonHour >= filterStartHour && lessonHour < filterEndHour;
}

/**
 * Check if course is profitable
 */
export function isProfitable(course: CourseWithLessons): boolean {
  const financials = calculateCourseFinancials(course);
  return financials.monthlyProfit > 0;
}

/**
 * Filter courses by age, time, and profitability
 */
export function filterCourses(
  courses: CourseWithLessons[],
  filters: {
    age?: { minAge?: number; maxAge?: number };
    time?: { startHour?: number; endHour?: number };
    profitability?: 'all' | 'profitable' | 'unprofitable';
    branchId?: string;
  }
): CourseWithLessons[] {
  return courses.filter((course) => {
    if (filters.branchId && String(course.branch) !== filters.branchId) {
      return false;
    }

    // Age filter
    if (filters.age && !matchesAgeFilter(course, filters.age)) {
      return false;
    }

    // Time filter - course must have at least one lesson matching time
    if (filters.time && filters.time.startHour !== undefined) {
      const hasMatchingLesson = course.lessons.some((lesson) =>
        matchesTimeFilter(lesson, filters.time!)
      );
      if (!hasMatchingLesson) return false;
    }

    // Profitability filter
    if (filters.profitability && filters.profitability !== 'all') {
      const courseProfitable = isProfitable(course);
      if (filters.profitability === 'profitable' && !courseProfitable) return false;
      if (filters.profitability === 'unprofitable' && courseProfitable) return false;
    }

    return true;
  });
}

/**
 * Get color class based on profit/loss
 */
export function getProfitColorClass(profit: number): string {
  return profit >= 0 ? 'text-green-600' : 'text-red-600';
}

/**
 * Get background color class based on profit/loss
 */
export function getProfitBgColorClass(profit: number): string {
  return profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
}

/**
 * Calculate total students enrolled in a course
 */
export function getTotalStudents(course: CourseWithLessons): number {
  // Use Set to count unique students across all lessons
  const uniqueStudents = new Set<string>();
  course.lessons.forEach((lesson) => {
    // For now, just sum enrolled counts (in real app would need student IDs)
    // This is a simplified version
  });
  // Simplified: just return max enrolled count across lessons
  return Math.max(...course.lessons.map((l) => l.enrolled_count), 0);
}

