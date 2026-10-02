/**
 * The order a form's registrations are sent in, written once.
 *
 * The form registers one child × course at a time, each call handing the next
 * the child it got back. The quote that prices the form before the signature
 * must send the very same things in the very same order — otherwise the price
 * shown is not the price charged — so both are built from one plan.
 */
import type { AppliedDiscount, PaymentResponse } from './types';

export interface PlanSelection {
  courseId: string;
  bundleId?: string;
  lessonId?: string;
  priceOptionId?: string;
}

export interface PlanChild {
  /** The child_* fields, and `identified_child_id` for a child chosen from the list. */
  payload: Record<string, unknown>;
  selections: PlanSelection[];
  /** For the child's first registration; the ones after it follow the child returned. */
  discountConfirmed: boolean;
  startingChildId: string;
}

/** What only a signed registration carries, and a quote must not. */
const SIGNED_ONLY = ['signature', 'computerized_docs_consent', 'terms_consent', 'health_consent'];

export function selectionFields(selection: PlanSelection): Record<string, unknown> {
  return {
    course_id: selection.courseId,
    bundle_id: selection.bundleId,
    lesson_id: selection.lessonId,
    price_option_id: selection.priceOptionId,
  };
}

/** The items of `widget/quote/`: every registration of the plan, in order. */
export function quoteItems(
  parentPayload: Record<string, unknown>,
  plan: PlanChild[],
): Array<Record<string, unknown>> {
  const parent = Object.fromEntries(
    Object.entries(parentPayload).filter(([key]) => !SIGNED_ONLY.includes(key)),
  );
  const items: Array<Record<string, unknown>> = [];
  for (const child of plan) {
    const first = items.length;
    child.selections.forEach((selection, index) => {
      items.push({
        ...parent,
        ...child.payload,
        ...selectionFields(selection),
        discount_confirmed: index === 0 ? child.discountConfirmed : false,
        existing_child_id: index === 0 ? child.startingChildId : '',
        // The server hands this item the child the first one produced, as the form does when registering.
        ...(index > 0 ? { same_child_as: first } : {}),
      });
    });
  }
  return items;
}

/** One registration's answer — or one quote item — as the form keeps it. */
export function toPaymentResponse(data: Record<string, unknown>): PaymentResponse {
  if (!data.is_bundle) return data as unknown as PaymentResponse;
  const payments = (Array.isArray(data.payments) ? data.payments : []) as Array<{
    payment_id: string;
    discounts_applied?: AppliedDiscount[];
  }>;
  const pick = <T,>(key: string) => data[key] as T;
  return {
    child_id: pick<string | undefined>('child_id'),
    payment_id: payments[0]?.payment_id ?? '',
    payment_ids: payments.map((payment) => payment.payment_id),
    final_amount: pick<number>('final_amount'),
    base_amount: pick<number>('base_amount'),
    discount_amount: pick<number>('discount_amount'),
    prorated_amount: pick<number | undefined>('prorated_amount'),
    registration_fee: pick<number | undefined>('registration_fee'),
    monthly_amount: pick<number | undefined>('monthly_amount'),
    prorate_lessons_remaining: pick<number | undefined>('prorate_lessons_remaining'),
    total_lessons_this_month: pick<number | undefined>('total_lessons_this_month'),
    subscription_start_date: pick<string | null | undefined>('subscription_start_date'),
    next_billing_date: pick<string | null | undefined>('next_billing_date'),
    trial_credit_amount: pick<number | undefined>('trial_credit_amount'),
    trial_credit_paid: pick<number | undefined>('trial_credit_paid'),
    trial_credit_date: pick<string | null | undefined>('trial_credit_date'),
    trial_credit_reason: pick<string | undefined>('trial_credit_reason'),
    // A quote names no payments; its discounts come gathered already.
    discounts_applied: payments.length > 0
      ? payments.flatMap((payment) => payment.discounts_applied ?? [])
      : (pick<AppliedDiscount[] | undefined>('discounts_applied') ?? []),
  };
}
