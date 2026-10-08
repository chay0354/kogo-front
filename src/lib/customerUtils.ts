/**
 * Customer/Child utility functions
 */

import { ChildWithDetails, EnrollmentDetail } from '@/types/customer';

export interface ChildStatus {
  color: 'black' | 'red' | 'orange' | 'green' | 'blue';
  description: string;
  hebrewStatus: string;
}

/**
 * Get child status based on explicit status field from backend
 */
/** The six statuses a child can be in. Kept in step with the backend's
 *  apps/customers/child_status.py — that file is the source of truth. */
export const CHILD_STATUSES = [
  'active',
  'trial_signed',
  'trial_completed',
  'pending',
  'payment_problem',
  'inactive',
  'ghost',
] as const;

export type ChildStatusValue = (typeof CHILD_STATUSES)[number];

const STATUS_DETAILS: Record<ChildStatusValue, ChildStatus> = {
  active: {
    color: 'green',
    description: 'פעיל — שולם והכסף נכנס למערכת',
    hebrewStatus: 'פעיל',
  },
  trial_signed: {
    color: 'orange',
    description: 'נרשם לניסיון — יש שיעור ניסיון שעוד לא התקיים',
    hebrewStatus: 'נרשם לניסיון',
  },
  trial_completed: {
    color: 'orange',
    description: 'ביצע ניסיון — שיעור הניסיון כבר התקיים',
    hebrewStatus: 'ביצע ניסיון',
  },
  pending: {
    color: 'blue',
    description: 'בתהליך רישום — הפרטים מולאו, טרם שולם',
    hebrewStatus: 'בתהליך רישום',
  },
  payment_problem: {
    color: 'red',
    description: 'בעיה באשראי — החיוב לא עבר',
    hebrewStatus: 'בעיה באשראי',
  },
  inactive: {
    color: 'black',
    description: 'לא פעיל — היה לו משהו, הוא בוטל, ולא נשאר כלום',
    hebrewStatus: 'לא פעיל',
  },
  ghost: {
    color: 'blue',
    description: 'רפאים — תלמיד מזדמן שהמדריך הוסיף',
    hebrewStatus: 'רפאים',
  },
};

/** Statuses written before the list was settled, and what they read as now. */
const LEGACY_STATUS_ALIASES: Record<string, ChildStatusValue> = {
  not_paid: 'payment_problem',
  non_active: 'inactive',
  expired: 'inactive',
  trial: 'trial_completed',
};

export function normalizeChildStatus(status: string | null | undefined): ChildStatusValue | null {
  if (!status) return null;
  if ((CHILD_STATUSES as readonly string[]).includes(status)) return status as ChildStatusValue;
  return LEGACY_STATUS_ALIASES[status] ?? null;
}

/**
 * Get child status based on the explicit status field from the backend.
 *
 * The stored status is the answer. It used to be second-guessed here — a child
 * with any non-trial enrolment was redrawn as פעיל whether or not a shekel had
 * ever arrived, which is precisely what פעיל is supposed to mean.
 */
export function getChildStatus(child: ChildWithDetails): ChildStatus {
  return getChildStatusByValue(child.status);
}

/** The same answer for a bare status value — for screens whose rows are not a full child card. */
export function getChildStatusByValue(value: string | null | undefined): ChildStatus {
  const status = normalizeChildStatus(value);
  if (status) return STATUS_DETAILS[status];
  return {
    color: 'blue',
    description: 'לא מוגדר',
    hebrewStatus: 'לא מוגדר',
  };
}

/** The customers table shows the same status as everywhere else. */
export function getCustomerTableStatus(child: ChildWithDetails): ChildStatus {
  return getChildStatus(child);
}

export function isTrialEnrollment(enrollment: EnrollmentDetail): boolean {
  return Boolean(enrollment.trial_lesson_date);
}

export type GroupedEnrollmentChip = {
  key: string;
  courseId: string;
  courseName: string;
  trial: boolean;
  slots: EnrollmentDetail[];
};

function enrollmentSlotTime(start?: string | null): string {
  if (!start) return '';
  return start.slice(0, 5);
}

export function formatEnrollmentSlot(enrollment: EnrollmentDetail): string {
  const day = enrollment.day_of_week != null ? getDayName(enrollment.day_of_week) : '';
  const time = enrollmentSlotTime(enrollment.start_time);
  return [day, time].filter(Boolean).join(' ');
}

/** Same חוג twice/thrice a week → one chip; trial stays separate from regular. */
export function groupEnrollmentsForTable(enrollments: EnrollmentDetail[]): GroupedEnrollmentChip[] {
  const groups = new Map<string, GroupedEnrollmentChip>();
  const order: string[] = [];
  for (const enrollment of enrollments) {
    const trial = isTrialEnrollment(enrollment);
    const key = `${enrollment.course_id || enrollment.course_name}:${trial ? 'trial' : 'regular'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        courseId: enrollment.course_id,
        courseName: enrollment.course_name,
        trial,
        slots: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.slots.push(enrollment);
  }
  for (const group of groups.values()) {
    group.slots.sort((a, b) => {
      const day = (a.day_of_week ?? 0) - (b.day_of_week ?? 0);
      if (day !== 0) return day;
      return enrollmentSlotTime(a.start_time).localeCompare(enrollmentSlotTime(b.start_time));
    });
  }
  return order.map((key) => groups.get(key)!);
}

/** The two statuses a trial lesson is shown for in the customers list. */
const TRIAL_SHOWN_FOR = new Set(['trial_signed', 'trial_completed']);

type RowOfChips = {
  status?: string | null;
  enrollments?: EnrollmentDetail[] | null;
  trial_enrollment?: {
    enrollment_id: string;
    course_name: string;
    trial_lesson_date: string | null;
    trial_outcome?: 'attended' | 'no_show' | 'unmarked' | null;
    trial_number?: number;
  } | null;
};

function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The chips of one child's row in the customers list.
 *
 * Owner, 8.10.2026: a trial lesson is shown only on a child who is נרשם לניסיון
 * or ביצע ניסיון — the trial booked, or the one already held, with its date. On
 * anyone else (a student above all) "when they tried" beside their classes is
 * noise, so a trial whose date has passed is left out. A trial still ahead is a
 * live booking the office moves and cancels from this chip; it stays.
 *
 * A trial already held is no longer among the child's live classes, so its chip
 * is built from the trial the server names for the child (`trial_enrollment`).
 * That chip carries no ids: there is nothing left to move or cancel.
 */
export function chipsForCustomerRow(child: RowOfChips, now: Date = new Date()): GroupedEnrollmentChip[] {
  const groups = groupEnrollmentsForTable(child.enrollments ?? []);
  if (!TRIAL_SHOWN_FOR.has(child.status ?? '')) {
    const today = localIsoDate(now);
    return groups.filter(
      (group) => !group.trial || group.slots.some((slot) => (slot.trial_lesson_date ?? '') >= today),
    );
  }
  const held = child.trial_enrollment;
  if (!held?.course_name || !(held.trial_lesson_date || held.trial_outcome)) return groups;
  if (groups.some((group) => group.trial)) return groups;
  return [
    ...groups,
    {
      key: `held-trial:${held.enrollment_id}`,
      courseId: '',
      courseName: held.course_name,
      trial: true,
      slots: [
        {
          lesson_id: '',
          enrollment_id: '',
          course_name: held.course_name,
          course_id: '',
          course_display_id: null,
          // A held trial is a date, not a weekly slot. The server sends null here
          // for any row without one (a course-level row); the type does not say so.
          day_of_week: null as unknown as number,
          start_time: '',
          end_time: '',
          branch_name: null,
          instructor_name: null,
          status: 'inactive',
          trial_lesson_date: held.trial_lesson_date,
          trial_outcome: held.trial_outcome ?? null,
          trial_number: held.trial_number,
        },
      ],
    },
  ];
}

/** The small word at the end of a chip: רגיל, ניסיון, or what became of a trial already held. */
export function chipKindLabel(group: GroupedEnrollmentChip): string {
  if (!group.trial) return 'רגיל';
  const outcome = group.slots[0]?.trial_outcome;
  if (outcome === 'attended') return 'ניסיון · הגיע';
  if (outcome === 'no_show') return 'ניסיון · לא הגיע';
  return 'ניסיון';
}

/**
 * Get status dot CSS classes
 */
export function getStatusClasses(color: string): string {
  const baseClasses = 'inline-block w-3 h-3 rounded-full';
  const colorMap: Record<string, string> = {
    black: 'bg-gray-800',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-400',
  };
  
  return `${baseClasses} ${colorMap[color] || colorMap.gray}`;
}

/**
 * Format phone number for WhatsApp (Israeli format)
 */
export function formatWhatsAppLink(phone: string | null): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  let formatted: string;
  
  // If starts with 0, replace with 972
  if (cleaned.startsWith('0')) {
    formatted = '972' + cleaned.substring(1);
  }
  // If already starts with 972, return as is
  else if (cleaned.startsWith('972')) {
    formatted = cleaned;
  }
  // Otherwise, assume it needs 972 prefix
  else {
    formatted = '972' + cleaned;
  }
  
  return `https://wa.me/${formatted}`;
}

/**
 * Format day of week number to Hebrew name
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[dayOfWeek] || '';
}

/**
 * Get unique courses from enrollments
 */
export function getUniqueCourses(child: ChildWithDetails): string[] {
  const courseNames = new Set<string>();
  child.enrollments.forEach(enrollment => {
    courseNames.add(enrollment.course_name);
  });
  return Array.from(courseNames);
}

/**
 * Get attendance rate color
 */
export function getAttendanceColor(rate: number): string {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 70) return 'text-yellow-600';
  if (rate >= 50) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Format date to Hebrew format
 */
export function formatHebrewDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL');
}

/**
 * Get gender badge text and color
 */
export function getGenderBadge(gender: "male" | "female" | null): { text: string; color: string } {
  if (gender === 'male') {
    return { text: 'ז', color: 'bg-blue-100 text-blue-700' };
  }
  if (gender === 'female') {
    return { text: 'נ', color: 'bg-pink-100 text-pink-700' };
  }
  return { text: '-', color: 'bg-gray-100 text-gray-700' };
}

/**
 * Get fixed lesson time (first enrollment)
 */
export function getFixedLessonTime(child: ChildWithDetails): string | null {
  if (child.enrollments.length === 0) return null;
  
  const firstEnrollment = child.enrollments[0];
  const dayName = getDayName(firstEnrollment.day_of_week);
  return `${dayName} ${firstEnrollment.start_time}`;
}
