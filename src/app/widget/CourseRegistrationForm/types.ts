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

export interface SavedParentDetails {
  parentIdNumber: string;
  parentFirstName: string;
  parentLastName: string;
  parentPhone: string;
  parentEmail: string;
}

export interface Props {
  courseId: string;
  courseName: string;
  isAdult?: boolean;
  bundleId?: string;
  lessonId?: string;
  priceOptionId?: string;
  /** Default widget filters — prefill the mini catalog for additional children. */
  catalogDefaultFilters?: {
    city: string;
    branch: string;
    courseType: string;
    age: string;
  };
  /** When trial signup has no single lesson (e.g. twice-a-week bundle), pick one of these slots. */
  trialLessonOptions?: TrialLessonOption[];
  isTrial?: boolean;
  trialLessonIsPaid?: boolean;
  trialLessonPrice?: number | null;
  /** Prefill parent fields when registering a sibling right after another child. */
  initialParent?: SavedParentDetails | null;
  onBack: () => void;
  onComplete: () => void;
  /** Close the form and return to the catalog to pick another lesson for a sibling. */
  onRegisterAnother?: (parent: SavedParentDetails) => void;
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
  | 'payment_pending'
  | 'trial_success';

export interface LookupResult {
  family_status: 'new' | 'existing';
  child_status: 'new' | 'active';
  child_id?: string;
  discount_type: 'sibling' | 'additional_lesson' | null;
  discount_question: string | null;
  enrolled_lesson_ids?: string[];
  already_registered?: boolean;
}

export interface AppliedDiscount {
  name: string;
  type?: string;
  value?: number;
  amount?: number;
  reason?: string;
}

export interface PaymentResponse {
  payment_id: string;
  child_id?: string;
  payment_ids?: string[]; // present for a bundle registration — charge all of these with the same card
  final_amount: number;
  base_amount: number;
  discount_amount: number;
  prorated_amount?: number;
  registration_fee?: number;
  monthly_amount?: number;
  /** Set when monthly billing only starts later — nothing but דמי רישום is charged now. */
  subscription_start_date?: string | null;
  discounts_applied: AppliedDiscount[];
}
