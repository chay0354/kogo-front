export interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
}

export interface Props {
  courseId: string;
  courseName: string;
  isAdult?: boolean;
  bundleId?: string;
  lessonId?: string;
  isTrial?: boolean;
  trialLessonIsPaid?: boolean;
  trialLessonPrice?: number | null;
  onBack: () => void;
  onComplete: () => void;
}

export interface TrialOccurrence {
  date: string;
  label: string;
  day_name: string;
  start_time: string;
  end_time: string;
}

export type Step =
  | 'details'
  | 'discount_confirm'
  | 'consents'
  | 'submitting'
  | 'error'
  | 'payment'
  | 'payment_success'
  | 'payment_failed'
  | 'trial_success';

export interface LookupResult {
  family_status: 'new' | 'existing';
  child_status: 'new' | 'active';
  child_id?: string;
  discount_type: 'sibling' | 'additional_lesson' | null;
  discount_question: string | null;
}

export interface PaymentResponse {
  payment_id: string;
  payment_ids?: string[]; // present for a bundle registration — charge all of these with the same card
  final_amount: number;
  base_amount: number;
  discount_amount: number;
  discounts_applied: Array<{ name: string; amount: number }>;
}
