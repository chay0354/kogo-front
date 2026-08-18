export interface CourseLesson {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string | null;
}

export interface TrialLessonOption {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface Props {
  courseId: string;
  courseName: string;
  isAdult?: boolean;
  bundleId?: string;
  lessonId?: string;
  priceOptionId?: string;
  /** When trial signup has no single lesson (e.g. twice-a-week bundle), pick one of these slots. */
  trialLessonOptions?: TrialLessonOption[];
  isTrial?: boolean;
  trialLessonIsPaid?: boolean;
  trialLessonPrice?: number | null;
  onBack: () => void;
  onComplete: () => void;
}

export interface TrialOccurrence {
  lesson_id?: string;
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
  prorated_amount?: number;
  registration_fee?: number;
  monthly_amount?: number;
  /** Set when monthly billing only starts later — nothing but דמי רישום is charged now. */
  subscription_start_date?: string | null;
  discounts_applied: Array<{ name: string; amount: number }>;
}
