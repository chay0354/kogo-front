export interface Branch {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
  branch: string;
}

export interface Instructor {
  id: string;
  full_name: string;
  fixed_salary_per_lesson?: string | number;
}

import type { CourseWithLessons } from '@/types/course';

export interface AddCourseDialogProps {
  courseTypeId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When set, pre-fills the form from an existing team for duplication. */
  duplicateFrom?: CourseWithLessons | null;
}
