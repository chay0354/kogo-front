export const UPCOMING_CHARGE_LIMIT = 10;

/** A single month billed at something other than the standing amount. */
export type MonthOverride = {
  id: string;
  billing_month: string;
  amount: unknown;
  original_amount?: unknown;
  reason: string;
  source: 'manual' | 'store' | string;
  store_invoice_number?: string | null;
  created_by_name?: string | null;
};

export type UpcomingStandingOrder = {
  id: string;
  status: string;
  amount: unknown;
  pending_amount?: unknown;
  pending_amount_effective_date?: string | null;
  upcoming_overrides?: MonthOverride[] | null;
  next_billing_date?: string | null;
  billing_day?: number | null;
  end_date?: string | null;
  initial_payment_details?: {
    lesson_name?: string | null;
    description?: string | null;
    lesson_course_display_id?: number | null;
  } | null;
  course_name?: string | null;
};

export type UpcomingCharge = {
  key: string;
  date: Date;
  description: string;
  amount: number;
  courseDisplayId?: number | null;
  orderId: string;
  /** Set when this month was told to bill at something else. */
  override?: MonthOverride | null;
  /** What the month would have cost without that instruction. */
  regularAmount: number;
};

export function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nextMonthFirst(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function compareDates(a: Date, b: Date): number {
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

function firstChargeDate(order: UpcomingStandingOrder, today: Date): Date | null {
  const scheduled = parseYmd(order.next_billing_date);
  if (scheduled) return scheduled;
  const billingDay = Math.min(Math.max(Number(order.billing_day) || 1, 1), 28);
  const candidate = new Date(today.getFullYear(), today.getMonth(), billingDay);
  return compareDates(candidate, today) >= 0 ? candidate : nextMonthFirst(today);
}

/** The override filed for the month a charge falls in, if any. */
function overrideOn(order: UpcomingStandingOrder, chargeDate: Date): MonthOverride | null {
  const rows = order.upcoming_overrides;
  if (!rows || rows.length === 0) return null;
  return (
    rows.find((row) => {
      const month = parseYmd(row.billing_month);
      return (
        !!month
        && month.getFullYear() === chargeDate.getFullYear()
        && month.getMonth() === chargeDate.getMonth()
      );
    }) ?? null
  );
}

function amountOn(order: UpcomingStandingOrder, chargeDate: Date): number {
  const pending = Number(order.pending_amount);
  const effective = parseYmd(order.pending_amount_effective_date);
  if (Number.isFinite(pending) && effective && compareDates(chargeDate, effective) >= 0) {
    return pending;
  }
  const current = Number(order.amount);
  return Number.isFinite(current) ? current : 0;
}

function lessonLabel(order: UpcomingStandingOrder): string {
  return (
    order.initial_payment_details?.lesson_name
    || order.course_name
    || order.initial_payment_details?.description
    || 'הוראת קבע'
  );
}

function* iterateOrderCharges(order: UpcomingStandingOrder, today: Date): Generator<UpcomingCharge> {
  const endDate = parseYmd(order.end_date);
  let chargeDate = firstChargeDate(order, today);
  if (!chargeDate) return;

  for (let index = 0; index < UPCOMING_CHARGE_LIMIT; index += 1) {
    if (endDate && compareDates(chargeDate, endDate) > 0) return;
    const regular = amountOn(order, chargeDate);
    // An override replaces the month outright: it already carries the store
    // purchases and any manual change folded into one figure.
    const override = overrideOn(order, chargeDate);
    const overrideAmount = Number(override?.amount);
    yield {
      key: `${order.id}-${chargeDate.getFullYear()}-${chargeDate.getMonth() + 1}-${chargeDate.getDate()}`,
      date: chargeDate,
      description: lessonLabel(order),
      amount: override && Number.isFinite(overrideAmount) ? overrideAmount : regular,
      courseDisplayId: order.initial_payment_details?.lesson_course_display_id ?? null,
      orderId: order.id,
      override,
      regularAmount: regular,
    };
    chargeDate = nextMonthFirst(chargeDate);
  }
}

export function upcomingCharges(
  orders: UpcomingStandingOrder[],
  today: Date = new Date(),
  limit = UPCOMING_CHARGE_LIMIT,
): UpcomingCharge[] {
  const todayStart = startOfDay(today);
  const charges: UpcomingCharge[] = [];
  for (const order of orders) {
    if (order.status !== 'active') continue;
    for (const charge of iterateOrderCharges(order, todayStart)) {
      charges.push(charge);
    }
  }
  charges.sort((a, b) => {
    const byDate = compareDates(a.date, b.date);
    if (byDate !== 0) return byDate;
    return a.description.localeCompare(b.description, 'he');
  });
  return charges.slice(0, limit);
}
