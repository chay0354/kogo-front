/**
 * Instructor utility functions for salary and revenue calculations
 */

import {
  SalaryTier,
  InstructorListItem,
  InstructorDetail,
  DEFAULT_LESSON_SALARY
} from '@/types/instructor';

/**
 * Calculate salary for a lesson based on student count and instructor's salary model
 */
export function calculateLessonSalary(
  studentCount: number,
  instructor: InstructorListItem | InstructorDetail
): number {
  if (instructor.salary_model_type === 'tiered_by_students' && 'salary_tiers' in instructor) {
    const tiers = instructor.salary_tiers;
    
    if (tiers && tiers.length > 0) {
      // Find matching tier
      for (const tier of tiers) {
        if (tier.max_students === null) {
          // This is the "and above" tier
          if (studentCount >= tier.min_students) {
            return tier.salary_per_lesson;
          }
        } else {
          // Regular tier with min and max
          if (studentCount >= tier.min_students && studentCount <= tier.max_students) {
            return tier.salary_per_lesson;
          }
        }
      }
      
      // If no tier matches, use default
      return DEFAULT_LESSON_SALARY;
    }
  }
  
  // Fixed per lesson model
  return instructor.fixed_salary_per_lesson || DEFAULT_LESSON_SALARY;
}

/**
 * Validate salary tiers structure
 */
export function validateSalaryTiers(tiers: SalaryTier[]): { valid: boolean; error?: string } {
  if (!tiers || tiers.length === 0) {
    return { valid: false, error: 'חובה להגדיר לפחות מדרגה אחת' };
  }
  
  // Sort by min_students
  const sortedTiers = [...tiers].sort((a, b) => a.min_students - b.min_students);
  
  // Check first tier starts from 1
  if (sortedTiers[0].min_students !== 1) {
    return { valid: false, error: 'המדרגה הראשונה חייבת להתחיל מ-1 תלמיד' };
  }
  
  // Check for gaps and overlaps
  for (let i = 0; i < sortedTiers.length - 1; i++) {
    const current = sortedTiers[i];
    const next = sortedTiers[i + 1];
    
    if (current.max_students === null) {
      return { valid: false, error: 'רק המדרגה האחרונה יכולה להיות ללא מקסימום' };
    }
    
    if (current.max_students + 1 !== next.min_students) {
      return { valid: false, error: `קיים פער או חפיפה בין מדרגה ${i + 1} למדרגה ${i + 2}` };
    }
  }
  
  // Check all values are positive
  for (const tier of sortedTiers) {
    if (tier.min_students < 1 || tier.salary_per_lesson < 0) {
      return { valid: false, error: 'כל הערכים חייבים להיות חיוביים' };
    }
    if (tier.max_students !== null && tier.max_students < tier.min_students) {
      return { valid: false, error: 'המקסימום חייב להיות גדול או שווה למינימום' };
    }
  }
  
  return { valid: true };
}

/**
 * Format currency with ₪ symbol
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) {
    return '₪0';
  }
  
  return `₪${num.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

/**
 * Format currency with decimals
 */
export function formatCurrencyWithDecimals(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) {
    return '₪0.00';
  }
  
  return `₪${num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Format phone number to Israeli format (05X-XXX-XXXX)
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as 05X-XXX-XXXX
  if (cleaned.length === 10 && cleaned.startsWith('05')) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phone;
}

/**
 * Validate Israeli phone number
 */
export function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 && cleaned.startsWith('0');
}

/**
 * Get last N months in YYYY-MM format
 */
export function getLastNMonths(n: number): Array<{ value: string; label: string }> {
  const months = [];
  const now = new Date();
  
  for (let i = 0; i < n; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    // Hebrew month names
    const monthNames = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];
    
    const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    
    months.push({ value, label });
  }
  
  return months;
}

/**
 * Get current month in YYYY-MM format
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Parse month string to display format
 */
export function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-');
  const monthNames = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  
  const monthIndex = parseInt(monthNum, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

/**
 * Calculate profit color class based on amount
 */
export function getProfitColorClass(profit: number): string {
  if (profit > 0) return 'text-green-600';
  if (profit < 0) return 'text-red-600';
  return 'text-gray-600';
}

/**
 * Sort instructors by field
 */
export function sortInstructors<T extends InstructorListItem>(
  instructors: T[],
  field: keyof T,
  direction: 'asc' | 'desc'
): T[] {
  return [...instructors].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    
    // Handle null/undefined values
    if (aVal == null) return direction === 'asc' ? 1 : -1;
    if (bVal == null) return direction === 'asc' ? -1 : 1;
    
    // Compare values
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Filter instructors by search query
 */
export function filterInstructorsBySearch(
  instructors: InstructorListItem[],
  searchQuery: string
): InstructorListItem[] {
  if (!searchQuery.trim()) {
    return instructors;
  }
  
  const query = searchQuery.toLowerCase();
  
  return instructors.filter(instructor => {
    return (
      instructor.full_name.toLowerCase().includes(query) ||
      instructor.first_name.toLowerCase().includes(query) ||
      instructor.last_name.toLowerCase().includes(query) ||
      instructor.phone.includes(query) ||
      instructor.email.toLowerCase().includes(query) ||
      instructor.specialization.toLowerCase().includes(query)
    );
  });
}

/**
 * Check if a tier range has gaps or overlaps with existing tiers
 */
export function checkTierConflict(
  newTier: SalaryTier,
  existingTiers: SalaryTier[],
  excludeId?: string
): boolean {
  for (const tier of existingTiers) {
    // Skip the tier being edited
    if (excludeId && tier.id === excludeId) {
      continue;
    }
    
    // Check for overlap
    const newMin = newTier.min_students;
    const newMax = newTier.max_students ?? Infinity;
    const existingMin = tier.min_students;
    const existingMax = tier.max_students ?? Infinity;
    
    // Overlap exists if ranges intersect
    if (newMin <= existingMax && newMax >= existingMin) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate default salary tiers
 */
export function getDefaultSalaryTiers(): SalaryTier[] {
  return [
    { min_students: 1, max_students: 7, salary_per_lesson: 250 },
    { min_students: 8, max_students: 15, salary_per_lesson: 300 },
    { min_students: 16, max_students: null, salary_per_lesson: 350 }
  ];
}

/**
 * Calculate total from string amounts
 */
export function sumStringAmounts(amounts: string[]): number {
  return amounts.reduce((sum, amount) => {
    const num = parseFloat(amount);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
}

