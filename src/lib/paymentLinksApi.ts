import api from './api';

// ---------------------------------------------------------------------------
// Public (payer) side
// ---------------------------------------------------------------------------

export type PublicPaymentOption = { id: string; label: string; amount: string };

export type PublicPaymentLink = {
  slug: string;
  title: string;
  description: string;
  options: PublicPaymentOption[];
};

export type PublicPaymentStatus = 'pending' | 'completed' | 'failed' | 'review';

export async function fetchPublicPaymentLink(slug: string) {
  const res = await api.get(`/payment-links/public/${encodeURIComponent(slug)}/`);
  return res.data as PublicPaymentLink;
}

export async function startPublicPayment(slug: string, payload: {
  option_id: string;
  payer_name: string;
  payer_phone: string;
  payer_email?: string;
}) {
  const res = await api.post(`/payment-links/public/${encodeURIComponent(slug)}/start/`, payload, { timeout: 60_000 });
  return res.data as { payment_id: string; amount: string; iframe_url: string };
}

export async function fetchPublicPaymentStatus(paymentId: string) {
  const res = await api.get(`/payment-links/public/payments/${encodeURIComponent(paymentId)}/status/`);
  return res.data as { payment_id: string; status: PublicPaymentStatus; amount: string; link_title: string; failure_reason: string };
}

// ---------------------------------------------------------------------------
// CRM side (managers)
// ---------------------------------------------------------------------------

export type PaymentLinkOption = {
  id?: string;
  label: string;
  amount: string;
  sort_order?: number;
  is_active?: boolean;
};

export type PaymentLink = {
  id: string;
  slug: string;
  title: string;
  description: string;
  business: string | null;
  business_name: string;
  business_category: string | null;
  business_category_name: string;
  branch: string | null;
  branch_name: string;
  is_active: boolean;
  expires_at: string | null;
  public_url: string;
  is_open: boolean;
  options: Array<Required<Pick<PaymentLinkOption, 'id' | 'label' | 'amount'>> & PaymentLinkOption>;
  paid_count: number;
  paid_total: string;
  review_count: number;
  created_at: string;
  updated_at: string;
};

export type PaymentLinkInput = {
  title: string;
  description: string;
  business: string | null;
  business_category: string | null;
  branch: string | null;
  is_active: boolean;
  expires_at: string | null;
  options: PaymentLinkOption[];
};

export type PaymentLinkPayment = {
  id: string;
  link: string;
  link_title: string;
  option: string | null;
  option_label: string;
  amount: string;
  reported_amount: string | null;
  payer_name: string;
  payer_phone: string;
  payer_email: string;
  status: PublicPaymentStatus;
  gateway_transaction_id: string;
  gateway_confirmation_code: string;
  card_last4: string;
  card_type: string;
  failure_reason: string;
  failure_code: string;
  review_reason: string;
  paid_at: string | null;
  formal_document: string | null;
  created_at: string;
};

export async function fetchPaymentLinks() {
  const res = await api.get('/payment-links/links/');
  return (res.data?.results ?? res.data ?? []) as PaymentLink[];
}

export async function fetchPaymentLink(id: string) {
  const res = await api.get(`/payment-links/links/${id}/`);
  return res.data as PaymentLink;
}

export async function createPaymentLink(data: PaymentLinkInput) {
  const res = await api.post('/payment-links/links/', data);
  return res.data as PaymentLink;
}

export async function updatePaymentLink(id: string, data: Partial<PaymentLinkInput>) {
  const res = await api.patch(`/payment-links/links/${id}/`, data);
  return res.data as PaymentLink;
}

export async function closePaymentLink(id: string) {
  const res = await api.delete(`/payment-links/links/${id}/`);
  return res.data as { closed?: boolean } | undefined;
}

export async function fetchPaymentLinkPayments(id: string, status?: PublicPaymentStatus) {
  const res = await api.get(`/payment-links/links/${id}/payments/`, { params: status ? { status } : undefined });
  return res.data as PaymentLinkPayment[];
}

export async function resolvePaymentLinkReview(linkId: string, paymentId: string, decision: 'completed' | 'failed', reason?: string) {
  const res = await api.post(`/payment-links/links/${linkId}/payments/${paymentId}/resolve/`, { decision, reason });
  return res.data as PaymentLinkPayment;
}

export function formatShekels(value: string | number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return `₪${value}`;
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Card link for an existing customer (standing order or one-time charge)
// ---------------------------------------------------------------------------

export type CardLinkKind = 'standing_order' | 'one_time';
export type CardLinkStatus = 'pending' | 'processing' | 'completed' | 'review' | 'cancelled';

export type CardLink = {
  id: string;
  kind: CardLinkKind;
  status: CardLinkStatus;
  child_id: string;
  lesson_id: string | null;
  lesson_label: string;
  include_registration_fee: boolean;
  amount: string | null;
  description: string;
  branch_id: string | null;
  business_id: string | null;
  business_category_id: string | null;
  public_url: string;
  attempts: number;
  last_error: string;
  review_reason: string;
  payment_id: string | null;
  recurring_payment_id: string | null;
  sent_at: string | null;
  sent_result: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
  quote?: { first_charge: string; monthly_amount: string; registration_fee: string; next_billing_date: string };
  quote_error?: string;
  whatsapp?: { sent?: boolean; method?: string; reason?: string; error?: string };
};

export type CardLinkInput =
  | { kind: 'standing_order'; child_id: string; lesson_id: string; include_registration_fee: boolean; send?: boolean }
  | {
      kind: 'one_time';
      child_id: string;
      amount: string;
      description: string;
      branch_id?: string | null;
      business_id?: string | null;
      business_category_id?: string | null;
      send?: boolean;
    };

export async function fetchCardLinks(childId: string) {
  const res = await api.get('/customers/card-links/', { params: { child_id: childId } });
  return res.data as CardLink[];
}

export async function createCardLink(data: CardLinkInput) {
  const res = await api.post('/customers/card-links/', data);
  return res.data as CardLink;
}

export async function cardLinkAction(id: string, action: 'send' | 'cancel' | 'regenerate') {
  const res = await api.post(`/customers/card-links/${id}/${action}/`);
  return res.data as CardLink;
}

export type CardLinkPreview = {
  ok: boolean;
  kind: CardLinkKind;
  already_done: boolean;
  status: CardLinkStatus;
  child_name: string;
  course_name?: string;
  branch_name?: string;
  day_name?: string;
  start_time?: string;
  end_time?: string;
  first_charge?: string;
  monthly_amount?: string;
  registration_fee?: string;
  next_billing_date?: string;
  quote_error?: string;
  description?: string;
  amount?: string;
};

export async function fetchCardLinkPreview(token: string) {
  const res = await api.get(`/customers/card-link/${encodeURIComponent(token)}/`);
  return res.data as CardLinkPreview;
}

export async function submitCardLink(token: string, card: {
  card_number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
  card_holder_id: string;
}) {
  const res = await api.post(`/customers/card-link/${encodeURIComponent(token)}/charge/`, { card_details: card }, { timeout: 90_000 });
  return res.data as {
    success: boolean;
    already_done?: boolean;
    review?: boolean;
    charged?: string;
    monthly_amount?: string;
    next_billing_date?: string;
    message?: string;
    error?: string;
    processing?: boolean;
  };
}
