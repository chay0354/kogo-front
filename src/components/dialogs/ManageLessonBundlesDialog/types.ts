import type { Lesson, LessonBundle } from '@/types/course';

export interface ManageLessonBundlesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
  lessons: Lesson[];
  onSaved?: () => void;
}

export interface BundleFormState {
  name: string;
  lessonIds: string[];
  combinedPrice: string;
  instructorsByLesson: Record<string, string>;
}

export const emptyFormState: BundleFormState = {
  name: '',
  lessonIds: [],
  combinedPrice: '',
  instructorsByLesson: {},
};

export interface InstructorOption {
  id: string;
  full_name: string;
}

export type { LessonBundle };
