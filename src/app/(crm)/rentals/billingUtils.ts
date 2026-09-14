import { billingMonthLabel } from '@/app/rc/cardFlow';
import { moneyText } from '@/app/s/signingFlow';
import type {
  BillingStatus,
  CardLinkInfo,
  MarkChargedPayload,
  StandingOrder,
  StandingOrderCreatePayload,
  StandingOrderUpdatePayload,
  TenantCharge,
} from '@/lib/rentalBillingApi';
import type { Tenancy, TenancyTenant } from '@/lib/rentalsApi';
import { formatDateTime } from './contractUtils';
import { isSigningLinkExpired } from './signingUtils';
import {
  amountFieldValue,
  formatDay,
  isValidBillingDay,
  parseAmountInput,
  tenancyApiError,
  toDecimalString,
  type StatusTone,
} from './tenancyUtils';

// ---- what the server said ----

/**
 * A billing refusal in the server's words. Its `error` is the whole sentence,
 * and must win: a refused receipt comes back as {error, charge}, and reading
 * every string in the body (tenancyApiError's way with DRF's field errors)
 * would list the charge's fields as if they were messages. Anything else —
 * field errors, a 403, no answer — reads as the tenants screen reads it.
 */
export function billingApiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }
  return tenancyApiError(err, fallback);
}

// ---------------------------------------------------------------------------
// A tenancy's standing order and its charges, on the tenants screen — pure, so
// billingUtils.test.ts pins it down: the chips, what each order and charge
// status allows, how the money and the months read, what the office is asked
// before a decision that moves money or is final, and what is sent. Where an
// order or a charge stands is the server's to say, and it refuses what a
// status does not allow whatever this offers — these only keep the screen
// from offering what would be refused.
// ---------------------------------------------------------------------------

// ---- the switch ----

export const BILLING_OFF_TEXT =
  'חיוב שוכרים כבוי — אפשר לפתוח הוראות קבע ולשלוח קישורים, אבל שום כרטיס לא יחויב עד ההפעלה';

/** The banner's lines above the tenants: charging off, and a business the charges cannot be tagged to. */
export function billingNotices(status: BillingStatus | null | undefined): string[] {
  if (!status) return [];
  const notices: string[] = [];
  if (!status.enabled) notices.push(BILLING_OFF_TEXT);
  if (!status.business_found) {
    notices.push(`העסק "${status.business_name || 'סוחרים'}" לא נמצא במערכת — עד שייפתח, שום חיוב של שוכר לא יתבצע`);
  }
  return notices;
}

const TERMINAL_SET_NOTES: Record<string, string> = {
  rental: 'חיוב השוכרים מכוון למסוף טרנזילה ייעודי לשכירויות, ולא למסופי הייצור הרגילים',
  mixed: 'חלק מחיובי השוכרים מכוונים למסוף טרנזילה אחר, ולא למסופי הייצור הרגילים',
};

/**
 * A small line under the banner when tenant billing is pointed somewhere other
 * than production's terminals. The server names the set and the terminals —
 * names only, never their keys — so the office can tell where a charge would
 * land. '' for production, or when the server says nothing.
 */
export function terminalSetNote(status: Pick<BillingStatus, 'tranzila'> | null | undefined): string {
  const tranzila = status?.tranzila;
  const set = (tranzila?.terminal_set ?? '').trim();
  if (!set || set === 'production') return '';
  const head = TERMINAL_SET_NOTES[set] ?? `חיוב השוכרים מכוון למסופי טרנזילה מסוג ${set}`;
  const names = [tranzila?.terminal, tranzila?.token_terminal].map((name) => (name ?? '').trim()).filter(Boolean);
  return `${head}${names.length ? ` (${[...new Set(names)].join(' · ')})` : ''}.`;
}

// ---- money and months ----

/** A shekel string as money, read as the tenant's page reads it: '₪566.40', '₪480'; '—' when there is none. */
export const billingMoney = moneyText;

export { billingMonthLabel };

// ---- the standing order ----

export const ORDER_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pending_card', label: 'ממתינה לכרטיס' },
  { value: 'active', label: 'פעילה' },
  { value: 'paused', label: 'מושהית' },
  { value: 'failed', label: 'החיוב נכשל' },
  { value: 'ended', label: 'הסתיימה' },
];

/** The server's label when it sent one — it is the source of the wording — else ours. */
export function orderStatusLabel(status: string, serverLabel?: string | null): string {
  const label = (serverLabel ?? '').trim();
  if (label) return label;
  return ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? (status || '—');
}

/** Running, waiting on the tenant, failed, or at rest (paused, ended). */
export function orderStatusTone(status: string): StatusTone {
  switch (status) {
    case 'active':
      return 'ok';
    case 'pending_card':
      return 'progress';
    case 'failed':
      return 'bad';
    default:
      return 'off';
  }
}

/** Every order holds its tenancy; ended ones stay for the history, so an open one wins. */
function isOpenOrder(order: Pick<StandingOrder, 'status'>): boolean {
  return order.status !== 'ended';
}

/**
 * The order each tenancy's row shows: its open one (the server allows one at a
 * time), else its newest ended one, so an ended order is still reachable.
 */
export function ordersByTenancy(orders: readonly StandingOrder[]): Map<string, StandingOrder> {
  const byTenancy = new Map<string, StandingOrder>();
  orders.forEach((order) => {
    const held = byTenancy.get(order.tenancy_id);
    if (!held) {
      byTenancy.set(order.tenancy_id, order);
      return;
    }
    const heldOpen = isOpenOrder(held);
    const open = isOpenOrder(order);
    if (open !== heldOpen) {
      if (open) byTenancy.set(order.tenancy_id, order);
      return;
    }
    if ((order.created_at ?? '') > (held.created_at ?? '')) byTenancy.set(order.tenancy_id, order);
  });
  return byTenancy;
}

/** "פתיחת הוראת קבע" is offered: no open order, and an agreement that has not ended or been cancelled. */
export function canOpenOrder(
  tenancy: Pick<Tenancy, 'status'>,
  order: Pick<StandingOrder, 'status'> | null | undefined,
): boolean {
  if (order && isOpenOrder(order)) return false;
  return tenancy.status !== 'cancelled' && tenancy.status !== 'ended';
}

export interface OrderActions {
  edit: boolean;
  /** Waiting for a card, or its charge failed: the only orders the server makes a card link for. */
  cardLink: boolean;
  charges: boolean;
  pause: boolean;
  resume: boolean;
  end: boolean;
}

export function orderActions(order: Pick<StandingOrder, 'status'>): OrderActions {
  const { status } = order;
  return {
    edit: true,
    cardLink: status === 'pending_card' || status === 'failed',
    charges: true,
    pause: status === 'active',
    resume: status === 'paused',
    end: status !== 'ended',
  };
}

type EditableField = keyof StandingOrderUpdatePayload;

const EDITABLE_FIELDS: readonly EditableField[] = ['amount_before_vat', 'billing_day', 'end_date', 'notes'];

/** What the office may change: the four the server takes — only the notes once the order has ended. */
export function editableOrderFields(order: Pick<StandingOrder, 'status'>): readonly EditableField[] {
  return order.status === 'ended' ? ['notes'] : EDITABLE_FIELDS;
}

/** What a row's standing-order column says. */
export interface OrderCell {
  statusLabel: string;
  tone: StatusTone;
  /** '₪566.40 לחודש', with VAT. */
  total: string;
  /** 'חיוב הבא: 1.10.2026'; '' when none is due (no card yet, paused, ended). */
  next: string;
  /** The card on file, or null without one. */
  card: { last4: string; expiry: string } | null;
  /** Why the last charge failed; '' unless it did. */
  problem: string;
}

export function orderCell(order: StandingOrder): OrderCell {
  const due = order.status !== 'paused' && order.status !== 'ended' && order.next_charge_date;
  const last4 = (order.card_last4 ?? '').trim();
  return {
    statusLabel: orderStatusLabel(order.status, order.status_label),
    tone: orderStatusTone(order.status),
    total: `${billingMoney(order.monthly_total)} לחודש`,
    next: due ? `חיוב הבא: ${formatDay(order.next_charge_date)}` : '',
    card: order.has_card && last4 ? { last4, expiry: (order.card_expiry ?? '').trim() } : null,
    problem: order.status === 'failed' ? (order.last_error ?? '').trim() || 'החיוב האחרון נכשל' : '',
  };
}

export interface BlockedChip {
  /** 'החיוב עצור — ספטמבר 2026 ממתין להחלטה'. */
  label: string;
  /** What being blocked means, for the chip's title and for a screen reader. */
  title: string;
  /** The month, when the server named a readable one. */
  month: string;
  /** The charge holding it up — the charges dialog points at it. */
  chargeId: string;
}

export const BLOCKED_TITLE_TEXT = 'עד שהחודש הזה יסומן כחויב או יבוטל, שום חודש נוסף לא ייגבה מהשוכר הזה.';

/**
 * A month waiting for a person to decide stops the whole tenancy: while the
 * server names one in blocked_by_charge nothing is charged — not that month and
 * not the next. The chip says so on the row; it clears once a manager marks
 * that month charged or voids it. Null when nothing is held up.
 */
export function blockedChargeChip(order: Pick<StandingOrder, 'blocked_by_charge'> | null | undefined): BlockedChip | null {
  const blocked = order?.blocked_by_charge;
  if (!blocked?.id) return null;
  const month = billingMonthLabel(blocked.period);
  return {
    label: month ? `החיוב עצור — ${month} ממתין להחלטה` : 'החיוב עצור — חודש ממתין להחלטה',
    title: BLOCKED_TITLE_TEXT,
    month,
    chargeId: blocked.id,
  };
}

/** The same in the charges dialog, pointing at the month that holds everything up. */
export function blockedChargeNotice(
  order: Pick<StandingOrder, 'blocked_by_charge'> | null | undefined,
  canDecide: boolean,
): string {
  const blocked = order?.blocked_by_charge;
  if (!blocked?.id) return '';
  const month = billingMonthLabel(blocked.period) || 'חודש אחד';
  return canDecide
    ? `החיוב של הוראת הקבע עצור: ${month} ממתין להחלטה. סמנו אותו כחויב או בטלו אותו — עד אז שום חודש נוסף לא ייגבה מהשוכר הזה.`
    : `החיוב של הוראת הקבע עצור: ${month} ממתין להחלטה של מנהל. עד אז שום חודש נוסף לא ייגבה מהשוכר הזה.`;
}

/** Said on the month itself, in the charges list. */
export const BLOCKED_ROW_TEXT = 'החודש הזה עוצר את הוראת הקבע — עד שיוסדר, שום חודש נוסף לא ייגבה.';

export type OrderLifecycle = 'pause' | 'resume' | 'end';

/** What the office is asked before an order is paused, resumed or ended. */
export function lifecycleConfirmCopy(
  kind: OrderLifecycle,
  tenantName: string,
): { title: string; message: string; confirmText: string } {
  const name = tenantName.trim() || 'השוכר';
  switch (kind) {
    case 'pause':
      return {
        title: 'השהיית הוראת קבע',
        message: `להשהות את הוראת הקבע של ${name}?\nלא יירדו חיובים עד שתחודש, והחודשים שיעברו בהשהיה לא יחויבו גם אחרי החידוש.`,
        confirmText: 'השהיה',
      };
    case 'resume':
      return {
        title: 'חידוש הוראת קבע',
        message: `לחדש את הוראת הקבע של ${name}?\nהחיוב הבא יהיה ביום החיוב הקרוב שהחודש שלו עוד לא חויב. החודשים שעברו בהשהיה לא יחויבו.`,
        confirmText: 'חידוש',
      };
    default:
      return {
        title: 'סיום הוראת קבע',
        message: `לסיים את הוראת הקבע של ${name}?\nלא יירדו ממנה עוד חיובים, וקישור לכרטיס שממתין לשוכר יבוטל. הוראה שהסתיימה אי אפשר לחדש — רק לפתוח חדשה.`,
        confirmText: 'סיום הוראת הקבע',
      };
  }
}

// ---- the order's form ----

export interface OrderForm {
  amount: string;
  billingDay: string;
  startDate: string;
  endDate: string;
  notes: string;
}

/** A new order starts from the tenancy's agreement: its amount, billing day and dates. */
export function orderFormFromTenancy(
  tenancy: Pick<Tenancy, 'monthly_amount' | 'billing_day' | 'start_date' | 'end_date'>,
): OrderForm {
  return {
    amount: amountFieldValue(tenancy.monthly_amount),
    billingDay: isValidBillingDay(tenancy.billing_day) ? String(tenancy.billing_day) : '1',
    startDate: tenancy.start_date ?? '',
    endDate: tenancy.end_date ?? '',
    notes: '',
  };
}

export function orderFormFromOrder(order: StandingOrder): OrderForm {
  return {
    amount: amountFieldValue(order.amount_before_vat),
    billingDay: isValidBillingDay(order.billing_day) ? String(order.billing_day) : '1',
    startDate: order.start_date ?? '',
    endDate: order.end_date ?? '',
    notes: order.notes ?? '',
  };
}

/** The server's own rules for an order, so a mistake is caught before the round trip. */
export function orderFormErrors(form: OrderForm, { creating = false }: { creating?: boolean } = {}): string[] {
  const errors: string[] = [];
  const amount = parseAmountInput(form.amount);
  if (!form.amount.trim()) errors.push('יש להזין סכום חודשי לפני מע״מ');
  else if (amount === null) errors.push('הסכום החודשי צריך להיות מספר, עד שתי ספרות אחרי הנקודה');
  else if (amount <= 0) errors.push('הסכום החודשי חייב להיות גדול מ־0');
  if (!isValidBillingDay(form.billingDay)) errors.push('יום החיוב צריך להיות בין 1 ל־28');
  if (creating && !form.startDate) errors.push('יש לבחור תאריך התחלה');
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.push('תאריך הסיום מוקדם מתאריך ההתחלה');
  }
  return errors;
}

/** A new order, the form as the office left it — the tenancy's defaults, or what they changed. */
export function buildOrderCreatePayload(form: OrderForm, tenancyId: string): StandingOrderCreatePayload {
  return {
    tenancy_id: tenancyId,
    amount_before_vat: toDecimalString(parseAmountInput(form.amount) ?? 0),
    billing_day: Number(form.billingDay),
    start_date: form.startDate,
    end_date: form.endDate || null,
    notes: form.notes.trim(),
  };
}

/** The PATCH: what differs from the order as saved, among what may change. Empty when nothing did. */
export function buildOrderUpdatePayload(form: OrderForm, order: StandingOrder): StandingOrderUpdatePayload {
  const allowed = new Set(editableOrderFields(order));
  const patch: StandingOrderUpdatePayload = {};
  const amount = toDecimalString(parseAmountInput(form.amount) ?? 0);
  if (allowed.has('amount_before_vat') && amount !== toDecimalString(Number(order.amount_before_vat) || 0)) {
    patch.amount_before_vat = amount;
  }
  if (allowed.has('billing_day') && Number(form.billingDay) !== Number(order.billing_day)) {
    patch.billing_day = Number(form.billingDay);
  }
  const end = form.endDate || null;
  if (allowed.has('end_date') && end !== (order.end_date || null)) patch.end_date = end;
  const notes = form.notes.trim();
  if (allowed.has('notes') && notes !== (order.notes ?? '').trim()) patch.notes = notes;
  return patch;
}

// ---- the card link ----

/**
 * The link the tenant can still open: one with an address, and not past an
 * expiry if the server ever gives one — it no longer does, since a card link
 * stays open until it is used, cancelled or replaced. Null otherwise.
 */
export function liveCardLink(
  link: Pick<CardLinkInfo, 'url' | 'expired' | 'expires_at'> | null | undefined,
  now: Date = new Date(),
): { url: string; expiresAt: string | null } | null {
  if (!link) return null;
  const url = (link.url ?? '').trim();
  if (!url || link.expired || isSigningLinkExpired(link.expires_at, now)) return null;
  return { url, expiresAt: link.expires_at ?? null };
}

const REVIEW_REASONS: Record<string, string> = {
  stale_processing: 'הניסיון לא הסתיים',
  gateway_uncertain: 'טרנזילה לא החזירה תשובה ברורה',
  record_failed: 'החיוב עבר ככל הנראה, אך הרישום לא הושלם',
};

/**
 * Where the newest link stands when it is not live, for the dialog's line: in
 * use this moment, frozen for the office, used or cancelled. '' for a live
 * link, which the dialog shows instead. Nothing here can be "expired" any more:
 * a card link does not run out of time.
 */
export function cardLinkStateText(
  link: Pick<CardLinkInfo, 'status' | 'expired' | 'expires_at' | 'used_at' | 'review_reason' | 'url'> | null | undefined,
  now: Date = new Date(),
): string {
  if (!link) return 'עדיין לא נוצר קישור לכרטיס.';
  if (link.status === 'processing') return 'השוכר מזין כרטיס ממש עכשיו — המתינו לתוצאה לפני שיוצרים קישור חדש.';
  if (link.status === 'review') {
    const why = REVIEW_REASONS[(link.review_reason ?? '').trim()] ?? '';
    return `הניסיון האחרון בקישור עבר לבדיקה${why ? ` (${why})` : ''} — בדקו בחיובים ובטרנזילה לפני שיוצרים קישור חדש.`;
  }
  if (link.status === 'used') {
    const when = formatDateTime(link.used_at);
    return `הכרטיס נקלט בקישור האחרון${when ? ` ב־${when}` : ''}.`;
  }
  if (link.status === 'cancelled') return 'הקישור האחרון בוטל.';
  if (liveCardLink(link, now)) return '';
  // A link with no address left and no status of its own to explain it.
  return 'אין קישור פעיל לכרטיס.';
}

/** '2 ניסיונות · האחרון נכשל: הכרטיס נדחה'; '' before any try. */
export function cardLinkAttemptsText(link: Pick<CardLinkInfo, 'attempts' | 'last_error'> | null | undefined): string {
  const attempts = Number(link?.attempts) || 0;
  if (attempts <= 0) return '';
  const error = (link?.last_error ?? '').trim();
  return [attempts === 1 ? 'ניסיון אחד' : `${attempts} ניסיונות`, error ? `האחרון נכשל: ${error}` : ''].filter(Boolean).join(' · ');
}

/** The message the office sends with the link, in its own WhatsApp. */
export function cardLinkWhatsAppMessage({
  tenant,
  url,
  branchName,
  monthlyTotal,
  expiresAt,
}: {
  tenant: Partial<Pick<TenancyTenant, 'first_name' | 'full_name'>> | null | undefined;
  url: string;
  branchName?: string | null;
  monthlyTotal?: string | null;
  expiresAt?: string | null;
}): string {
  const name = (tenant?.first_name ?? '').trim() || (tenant?.full_name ?? '').trim();
  const branch = (branchName ?? '').trim();
  const total = monthlyTotal ? billingMoney(monthlyTotal) : '—';
  const until = formatDateTime(expiresAt);
  return [
    name ? `שלום ${name},` : 'שלום,',
    `זה הקישור להזנת כרטיס האשראי להוראת הקבע של השכירות${branch ? ` בסניף ${branch}` : ''}${
      total !== '—' ? ` (${total} לחודש, כולל מע״מ)` : ''
    }:`,
    url,
    until ? `הקישור בתוקף עד ${until}.` : '',
    'תודה, קוגומלו',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- charges ----

export const CHARGE_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'reserved', label: 'שמור לחיוב' },
  { value: 'charged', label: 'חויב' },
  { value: 'failed', label: 'נדחה' },
  { value: 'review', label: 'בבדיקה' },
  { value: 'voided', label: 'בוטל' },
  // A month that passed with no charge, should the server list one as a charge of its own.
  { value: 'missed', label: 'לא חויב' },
];

export function chargeStatusLabel(status: string, serverLabel?: string | null): string {
  const label = (serverLabel ?? '').trim();
  if (label) return label;
  return CHARGE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? (status || '—');
}

export function chargeStatusTone(status: string): StatusTone {
  switch (status) {
    case 'charged':
      return 'ok';
    case 'failed':
      return 'bad';
    case 'review':
    case 'reserved':
      return 'progress';
    default:
      return 'off';
  }
}

/**
 * A charge's chip. A reservation that never heard back is not "saved for
 * charging" any more: its outcome is unknown and it waits for the office, as a
 * charge in review does — the server calls both undecided.
 */
export function chargeChip(charge: Pick<TenantCharge, 'status' | 'status_label' | 'undecided'>): {
  label: string;
  tone: StatusTone;
} {
  if (charge.status === 'reserved' && charge.undecided) return { label: 'ללא תשובה — לבדיקה', tone: 'progress' };
  return { label: chargeStatusLabel(charge.status, charge.status_label), tone: chargeStatusTone(charge.status) };
}

export const RETRY_OFF_TEXT = 'חיוב שוכרים כבוי — אי אפשר לנסות שוב עד ההפעלה';

export interface ChargeActionState {
  offered: boolean;
  /** Why it is shown but held back; '' when it may be pressed. */
  blockedReason: string;
}

export interface ChargeActions {
  /** A failed month, charged again now. */
  retry: ChargeActionState;
  /** A month in review, or a reservation that never heard back. */
  markCharged: boolean;
  /** Those, or a failed month. Final. */
  void: boolean;
  issueReceipt: boolean;
  downloadReceipt: boolean;
}

/**
 * What the office may do with a month. The four money decisions — retry, mark
 * charged, void, issue the receipt — are a manager's: the server refuses a
 * partner (403), so a partner sees where each month stands and nothing to press.
 */
export function chargeActions(
  charge: Pick<TenantCharge, 'status' | 'undecided' | 'needs_receipt' | 'receipt'>,
  {
    billingEnabled,
    canDecide,
    order,
  }: { billingEnabled: boolean; canDecide: boolean; order?: Pick<StandingOrder, 'status' | 'has_card'> | null },
): ChargeActions {
  const downloadReceipt = Boolean(charge.receipt?.id);
  if (!canDecide) {
    return { retry: { offered: false, blockedReason: '' }, markCharged: false, void: false, issueReceipt: false, downloadReceipt };
  }
  const undecided = charge.undecided === true || charge.status === 'review';
  let retry: ChargeActionState = { offered: false, blockedReason: '' };
  if (charge.status === 'failed') {
    const blockedReason = !billingEnabled
      ? RETRY_OFF_TEXT
      : order?.status === 'ended'
        ? 'הוראת הקבע הסתיימה'
        : order && !order.has_card
          ? 'אין כרטיס שמור — שלחו לשוכר קישור לכרטיס'
          : '';
    retry = { offered: true, blockedReason };
  }
  return {
    retry,
    markCharged: undecided,
    void: undecided || charge.status === 'failed',
    issueReceipt: charge.needs_receipt === true,
    downloadReceipt,
  };
}

/** '₪480 + מע״מ ₪86.40 = ₪566.40'. */
export function chargeAmountsLine(charge: Pick<TenantCharge, 'amount_before_vat' | 'vat_amount' | 'total'>): string {
  return `${billingMoney(charge.amount_before_vat)} + מע״מ ${billingMoney(charge.vat_amount)} = ${billingMoney(charge.total)}`;
}

/** The lines under a charge: how it came about, when it went through, at Tranzila, and who decided on it. */
export function chargeMetaLines(
  charge: Pick<
    TenantCharge,
    | 'status'
    | 'trigger_label'
    | 'attempts'
    | 'charged_at'
    | 'card_last4'
    | 'transaction_id'
    | 'confirmation_code'
    | 'resolved_by_name'
    | 'resolved_at'
    | 'resolution_note'
  >,
): string[] {
  const attempts = Number(charge.attempts) || 0;
  const how = [(charge.trigger_label ?? '').trim(), attempts > 1 ? `${attempts} ניסיונות` : ''].filter(Boolean).join(' · ');
  const chargedAt = formatDateTime(charge.charged_at);
  const last4 = (charge.card_last4 ?? '').trim();
  const when =
    charge.status === 'charged' && chargedAt ? [`חויב ב־${chargedAt}`, last4 ? `כרטיס ${last4}` : ''].filter(Boolean).join(' · ') : '';
  const transaction = (charge.transaction_id ?? '').trim();
  const confirmation = (charge.confirmation_code ?? '').trim();
  const gateway = transaction ? [`עסקה ${transaction}`, confirmation ? `אישור ${confirmation}` : ''].filter(Boolean).join(' · ') : '';
  const resolvedAt = formatDateTime(charge.resolved_at);
  const by = (charge.resolved_by_name ?? '').trim();
  const note = (charge.resolution_note ?? '').trim();
  const decided = resolvedAt
    ? [
        `${charge.status === 'voided' ? 'בוטל' : 'סומן כחויב'}${by ? ` על ידי ${by}` : ''} ב־${resolvedAt}`,
        note,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return [how, when, gateway, decided].filter(Boolean);
}

/**
 * Months before this one that were never charged at all, as the server lists
 * them on the order. They are never charged automatically. Newest first, once
 * each; [] when it lists none.
 */
export function monthsNeverCharged(order: Pick<StandingOrder, 'months_never_charged'> | null | undefined): string[] {
  const list = Array.isArray(order?.months_never_charged) ? order.months_never_charged : [];
  const periods = list.map((item) => String(item ?? '').trim()).filter((item) => /^\d{4}-\d{2}/.test(item));
  return [...new Set(periods)].sort((a, b) => b.localeCompare(a));
}

/** 'קבלה 20012 · 1.10.2026', saying so when it was issued after its month. */
export function receiptLine(receipt: TenantCharge['receipt']): string {
  if (!receipt) return '';
  return [
    `קבלה ${receipt.document_number || ''}`.trim(),
    formatDay(receipt.document_date),
    receipt.issued_late ? 'הופק באיחור' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---- the office's decisions on a charge ----

export const MARK_CHARGED_WARNING =
  'סמנו כחויב רק אחרי שבדקתם בטרנזילה שהחיוב עבר בפועל. הסימון מפיק לשוכר קבלה על החודש ומקדם את הוראת הקבע לחודש הבא — ואם החיוב לא עבר, השוכר יקבל קבלה על כסף שלא שילם.';

export const VOID_UNDECIDED_WARNING =
  'הביטול סופי: החודש הזה לא יחויב שוב בהוראת הקבע, והיא עוברת לחודש הבא. בטלו רק אחרי שבדקתם בטרנזילה שהחיוב לא עבר — אם עבר, סמנו אותו כחויב.';

export const VOID_FAILED_WARNING =
  'הביטול סופי: החודש הזה לא יחויב שוב בהוראת הקבע, והיא עוברת לחודש הבא — למשל כשהשוכר שילם את החודש בדרך אחרת.';

/**
 * Said on a month whose outcome is unknown, above its actions — prominent,
 * because an unclear answer from Tranzila is common and either decision is
 * final. A partner, who cannot decide, is told who does.
 */
export function reviewRowText(charge: Pick<TenantCharge, 'status' | 'undecided'>, canDecide: boolean): string {
  if (!(charge.undecided === true || charge.status === 'review')) return '';
  return canDecide
    ? 'טרנזילה לא החזירה תשובה ברורה על החודש הזה. לפני כל פעולה בדקו בטרנזילה אם החיוב עבר: סמנו כחויב רק אם מצאתם אותו שם, ובטלו רק אם וידאתם שלא עבר.'
    : 'התשובה מטרנזילה לא ברורה — החודש ממתין לבדיקה של מנהל.';
}

function monthOf(charge: Pick<TenantCharge, 'period'>): string {
  return billingMonthLabel(charge.period) || 'החודש';
}

/** "סימון כחויב" asks for Tranzila's transaction id, and says plainly when it may be pressed. */
export function markChargedCopy(charge: Pick<TenantCharge, 'period'>): { title: string; warning: string; submit: string } {
  return { title: `סימון ${monthOf(charge)} כחויב`, warning: MARK_CHARGED_WARNING, submit: 'סימון כחויב' };
}

/** "ביטול" asks why, and says it is final — with the check a charge in review needs first. */
export function voidCopy(charge: Pick<TenantCharge, 'period' | 'status'>): { title: string; warning: string; submit: string } {
  return {
    title: `ביטול החיוב של ${monthOf(charge)}`,
    warning: charge.status === 'failed' ? VOID_FAILED_WARNING : VOID_UNDECIDED_WARNING,
    submit: 'ביטול החיוב — סופי',
  };
}

/** What the office confirms before a failed month is charged again, now. */
export function retryConfirmText(
  charge: Pick<TenantCharge, 'period' | 'total'>,
  order?: Pick<StandingOrder, 'card_last4'> | null,
): string {
  const last4 = (order?.card_last4 ?? '').trim();
  return `לחייב עכשיו ${billingMoney(charge.total)} על ${monthOf(charge)} בכרטיס ${last4 ? `שמסתיים ב־${last4}` : 'השמור'}?`;
}

export interface MarkChargedForm {
  transactionId: string;
  confirmationCode: string;
  note: string;
}

export const EMPTY_MARK_CHARGED_FORM: MarkChargedForm = { transactionId: '', confirmationCode: '', note: '' };

export function markChargedErrors(form: MarkChargedForm): string[] {
  const id = form.transactionId.trim();
  if (!id) return ['יש להזין את מזהה העסקה שנמצא בטרנזילה'];
  if (id.length > 100) return ['מזהה העסקה ארוך מדי'];
  return [];
}

export function markChargedPayload(form: MarkChargedForm): MarkChargedPayload {
  const payload: MarkChargedPayload = { transaction_id: form.transactionId.trim() };
  const confirmation = form.confirmationCode.trim();
  const note = form.note.trim();
  if (confirmation) payload.confirmation_code = confirmation;
  if (note) payload.note = note;
  return payload;
}

export function voidErrors(reason: string): string[] {
  const text = reason.trim();
  if (!text) return ['יש לכתוב את סיבת הביטול'];
  if (text.length > 1000) return ['סיבת הביטול ארוכה מדי'];
  return [];
}

/** What a retry came to, for the office. `ok` only when money moved. */
export function retryOutcomeText(
  outcome: string,
  charge: Pick<TenantCharge, 'total' | 'error'> | null | undefined,
): { ok: boolean; text: string } {
  if (outcome === 'charged') return { ok: true, text: `החיוב עבר — ${billingMoney(charge?.total)}` };
  if (outcome === 'failed') {
    const error = (charge?.error ?? '').trim();
    return { ok: false, text: `החיוב נדחה שוב${error ? `: ${error}` : ''}` };
  }
  if (outcome === 'review') {
    return { ok: false, text: 'טרנזילה לא החזירה תשובה ברורה, והחיוב עבר לבדיקה. בדקו בטרנזילה לפני כל פעולה נוספת.' };
  }
  return { ok: false, text: 'התשובה הגיעה אחרי שהחיוב כבר טופל. הרשימה מתרעננת — בדקו בה מה נרשם.' };
}
