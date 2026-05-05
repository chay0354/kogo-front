/**
 * Branch utility functions
 */

import { STUDENT_MONTHLY_FEE, INSTRUCTOR_LESSON_SALARY, WEEKS_PER_MONTH, BRANCH_STATUS_CONFIG } from '@/types/branch';

/**
 * Calculate monthly revenue based on number of students
 */
export function calculateBranchRevenue(students: number, pricePerStudent: number = STUDENT_MONTHLY_FEE): number {
  return students * pricePerStudent;
}

/**
 * Calculate instructor costs based on number of lessons
 */
export function calculateInstructorCosts(
  lessonsCount: number,
  salaryPerLesson: number = INSTRUCTOR_LESSON_SALARY
): number {
  return lessonsCount * salaryPerLesson * WEEKS_PER_MONTH;
}

/**
 * Calculate total monthly costs for a branch
 */
export function calculateTotalMonthlyCosts(
  lessonsCount: number,
  monthlyCost: number = 0,
  cleaningCost: number = 0
): number {
  const instructorCosts = calculateInstructorCosts(lessonsCount);
  return instructorCosts + monthlyCost + cleaningCost;
}

/**
 * Calculate profit
 */
export function calculateProfit(revenue: number, costs: number): number {
  return revenue - costs;
}

/**
 * Format branch status for display
 */
export function formatBranchStatus(isActive: boolean): 'active' | 'closed' {
  return isActive ? 'active' : 'closed';
}

/**
 * Get branch status badge configuration
 */
export function getBranchStatusBadge(isActive: boolean) {
  const status = formatBranchStatus(isActive);
  return BRANCH_STATUS_CONFIG[status];
}

/**
 * Format currency (ILS)
 */
export function formatCurrency(amount: number): string {
  return `₪${amount.toLocaleString('he-IL')}`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file type icon name based on mime type
 */
export function getFileTypeIcon(mimeType: string | null, fileType: string): string {
  if (fileType === 'video') return 'Video';
  if (mimeType?.startsWith('image/')) return 'Image';
  if (mimeType?.includes('pdf')) return 'FileText';
  return 'File';
}

/**
 * Check if file is video
 */
export function isVideoFile(mimeType: string | null): boolean {
  return mimeType?.startsWith('video/') || false;
}

/**
 * Check if file is image
 */
export function isImageFile(mimeType: string | null): boolean {
  return mimeType?.startsWith('image/') || false;
}

/**
 * Validate file for upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 50 * 1024 * 1024; // 50MB
  
  if (file.size > maxSize) {
    return { valid: false, error: 'גודל הקובץ לא יכול לעבור 50MB' };
  }
  
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];
  
  if (!allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: 'סוג קובץ לא נתמך. סוגי קבצים מותרים: PDF, DOC, XLSX, תמונות (JPEG, PNG, GIF, WEBP), וידאו (MP4, WEBM, MOV)' 
    };
  }
  
  return { valid: true };
}

/**
 * Generate WhatsApp share link
 */
export function generateWhatsAppLink(fileUrl: string, fileName: string): string {
  const message = encodeURIComponent(`${fileName}\n${fileUrl}`);
  return `https://wa.me/?text=${message}`;
}

/**
 * Generate email share link
 */
export function generateEmailLink(fileUrl: string, fileName: string): string {
  const subject = encodeURIComponent(`קובץ: ${fileName}`);
  const body = encodeURIComponent(`קובץ מצורף:\n${fileUrl}`);
  return `mailto:?subject=${subject}&body=${body}`;
}

