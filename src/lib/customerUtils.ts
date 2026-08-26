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
export function getChildStatus(child: ChildWithDetails): ChildStatus {
  switch (child.status) {
    case 'active':
      return { 
        color: 'green', 
        description: 'פעיל - מנוי פעיל ושולם',
        hebrewStatus: 'פעיל'
      };
    
    case 'trial_signed':
      return { 
        color: 'orange', 
        description: 'נרשם לניסיון - בתהליך רישום לשיעור ניסיון',
        hebrewStatus: 'נרשם לניסיון'
      };
    
    case 'trial_completed':
      return { 
        color: 'orange', 
        description: 'ביצע ניסיון - סיים שיעור ניסיון',
        hebrewStatus: 'ביצע ניסיון'
      };
    
    case 'payment_problem':
      return { 
        color: 'red', 
        description: 'בעיות באשראי - בעיה בתשלום באשראי',
        hebrewStatus: 'בעיות באשראי'
      };
    
    case 'not_paid':
      return { 
        color: 'red', 
        description: 'לא שולם - חוב פתוח',
        hebrewStatus: 'לא שולם'
      };
    
    case 'pending':
      return { 
        color: 'blue', 
        description: 'בתהליך רישום - בתהליך רישום למערכת',
        hebrewStatus: 'בתהליך רישום'
      };
    
    case 'ghost':
      return { 
        color: 'blue', 
        description: 'רפאים - לקוח שלא פעיל',
        hebrewStatus: 'רפאים'
      };
    
    case 'inactive':
      return { 
        color: 'black', 
        description: 'לא פעיל - לא פעיל במערכת',
        hebrewStatus: 'לא פעיל'
      };
    
    default:
      return { 
        color: 'blue', 
        description: 'לא מוגדר',
        hebrewStatus: 'לא מוגדר'
      };
  }
}

const STATUS_OVERRIDE_KEEP = new Set([
  'payment_problem',
  'not_paid',
  'ghost',
  'inactive',
]);

/**
 * Customers-table status: trial-only kids stay נרשם לניסיון.
 * Any regular (paid) lesson, or both regular and trial, shows as פעיל.
 */
export function getCustomerTableStatus(child: ChildWithDetails): ChildStatus {
  if (STATUS_OVERRIDE_KEEP.has(child.status)) {
    return getChildStatus(child);
  }
  const enrollments = child.enrollments ?? [];
  const hasRegular = enrollments.some((row) => !row.trial_lesson_date);
  const hasTrial = enrollments.some((row) => Boolean(row.trial_lesson_date));
  if (hasRegular) {
    return getChildStatus({ ...child, status: 'active' });
  }
  if (hasTrial) {
    return getChildStatus({ ...child, status: 'trial_signed' });
  }
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
