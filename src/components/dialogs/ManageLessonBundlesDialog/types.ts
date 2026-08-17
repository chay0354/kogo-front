import type { Lesson, LessonBundle } from '@/types/course';

export interface ManageLessonBundlesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseName: string;
  lessons: Lesson[];
  branchId?: string;
  onSaved?: () => void;
}

export interface BundleFormState {
  name: string;
  lessonIds: string[];
  combinedPrice: string;
  instructorsByLesson: Record<string, string>;
  roomsByLesson: Record<string, string>;
}

export const emptyFormState: BundleFormState = {
  name: '',
  lessonIds: [],
  combinedPrice: '',
  instructorsByLesson: {},
  roomsByLesson: {},
};

export interface InstructorOption {
  id: string;
  full_name: string;
}

export interface RoomOption {
  id: string;
  name: string;
  branch?: string;
}

export type { LessonBundle };
