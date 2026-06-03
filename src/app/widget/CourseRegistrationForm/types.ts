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
  onBack: () => void;
  onComplete: () => void;
}

export type Step =
  | 'details'
  | 'discount_confirm'
  | 'consents'
  | 'submitting'
  | 'error'
  | 'payment'
  | 'payment_success'
  | 'payment_failed';

export interface LookupResult {
  family_status: 'new' | 'existing';
  child_status: 'new' | 'active';
  child_id?: string;
  discount_type: 'sibling' | 'additional_lesson' | null;
  discount_question: string | null;
}

export interface PaymentResponse {
  payment_id: string;
  final_amount: number;
  base_amount: number;
  discount_amount: number;
  discounts_applied: Array<{ name: string; amount: number }>;
}
