export const UPCOMING_CHARGE_LIMIT = 10;

export type UpcomingStandingOrder = {
  id: string;
  status: string;
  amount: unknown;
  pending_amount?: unknown;
  pending_amount_effective_date?: string | null;
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
    yield {
      key: `${order.id}-${chargeDate.getFullYear()}-${chargeDate.getMonth() + 1}-${chargeDate.getDate()}`,
      date: chargeDate,
      description: lessonLabel(order),
      amount: amountOn(order, chargeDate),
      courseDisplayId: order.initial_payment_details?.lesson_course_display_id ?? null,
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
