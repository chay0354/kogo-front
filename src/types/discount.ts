/**
 * Discount Types
 * 
 * Types for managing discounts in the system
 */

export type DiscountType = 'early_signup' | 'second_child';

export interface Discount {
  id: string;
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed' | 'fixed_final_price';
  value: number;
  applies_to: 'family' | 'child' | 'course' | 'lesson';
  promotion_type: 'permanent' | 'temporary';
  start_date: string | null;
  end_date: string | null;
  is_built_in: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EarlySignupDiscount {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  value: number;
  is_active: boolean;
}

export interface SecondChildDiscount {
  id: string;
  discount_type: 'fixed' | 'fixed_final_price';
  value: number;
  is_active: boolean;
}

export interface EarlySignupDiscountFormData {
  name?: string;
  start_date: string;
  end_date: string;
  value: number;
  is_active: boolean;
}

export interface SecondChildDiscountFormData {
  discount_type?: 'fixed' | 'fixed_final_price';
  value: number;
  is_active: boolean;
}

export interface AdditionalLessonDiscount {
  id: string;
  value: number;
  is_active: boolean;
}

export interface AdditionalLessonDiscountFormData {
  value: number;
  is_active: boolean;
}

export interface ApplicableDiscount {
  name: string;
  type: string;
  amount: number;
  reason: string;
}

export interface DiscountEvaluation {
  base_price: number;
  discounts: ApplicableDiscount[];
  total_discount: number;
  final_price: number;
  discount_count: number;
}

export interface DiscountEvaluationRequest {
  family_id: string;
  child_id: string;
  payment_date: string;
  base_price: number;
}

