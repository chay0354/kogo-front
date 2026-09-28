/**
 * The "סטטוס מנוי" badge on the child card.
 *
 * It used to read dates alone: "הסתיים" when paid_until_date (or
 * subscription_end_date) had passed, and "פעיל" otherwise — so a child with no
 * dates at all read as פעיל whatever they were. A sign-up that never paid, a
 * trial and a child who left have no paid-until date, which is how 621 of the
 * 625 children who were not active showed "פעיל" on their card (production,
 * 27.9.2026).
 *
 * The child's status is the answer, as everywhere else in the CRM, and in the
 * same words (customerUtils). The date only refines פעיל: it says until when,
 * and an active child whose paid-until date is behind us is overdue — the
 * money stopped and the status has not caught up yet. The backend reads the
 * same date the same way: paid up to and including that day.
 */

import { getChildStatusByValue, normalizeChildStatus } from '@/lib/customerUtils';

export type SubscriptionBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export interface SubscriptionBadge {
  label: string;
  variant: SubscriptionBadgeVariant;
}

interface SubscriptionFacts {
  status?: string | null;
  paid_until_date?: string | null;
}

/** "YYYY-MM-DD" of a date in local time — the day the office is living in. */
function localIsoDay(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** "30.9.2026" from an ISO date, without passing it through a timezone. */
function shortHebrewDate(isoDay: string): string {
  const [y, m, d] = isoDay.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}

export function subscriptionBadge(child: SubscriptionFacts, today: Date = new Date()): SubscriptionBadge {
  const status = normalizeChildStatus(child.status);

  if (status === 'active') {
    const paidUntil = /^\d{4}-\d{2}-\d{2}/.test(child.paid_until_date ?? '')
      ? String(child.paid_until_date).slice(0, 10)
      : null;
    if (!paidUntil) return { label: 'פעיל', variant: 'secondary' };
    if (paidUntil < localIsoDay(today)) {
      return { label: `הסתיים · שולם עד ${shortHebrewDate(paidUntil)}`, variant: 'destructive' };
    }
    return { label: `פעיל · שולם עד ${shortHebrewDate(paidUntil)}`, variant: 'secondary' };
  }

  const label = getChildStatusByValue(child.status).hebrewStatus;
  if (status === 'payment_problem') return { label, variant: 'destructive' };
  return { label, variant: 'outline' };
}
