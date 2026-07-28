import type { Lesson, LessonBundle } from '@/types/course';

export interface ManageLessonBundlesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
  lessons: Lesson[];
}

export interface BundleFormState {
  name: string;
  lessonIds: string[];
  combinedPrice: string;
}

export const emptyFormState: BundleFormState = {
  name: '',
  lessonIds: [],
  combinedPrice: '',
};

export type { LessonBundle };
