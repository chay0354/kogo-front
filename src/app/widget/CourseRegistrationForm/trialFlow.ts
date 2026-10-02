import { getDayName } from '@/lib/courseUtils';
import type { Step } from './types';

/**
 * Where a trial goes after the details step.
 *
 * A paid trial (the course charges for it) keeps the full flow — terms, signature,
 * then the card — exactly as before. A free trial goes to a summary screen with one
 * confirm: the parent has typed nothing but names and a date, and there is nothing
 * to sign for a lesson that costs nothing. The backend never received the consent
 * fields on this path anyway.
 */
export function trialNextStep(trialLessonIsPaid: boolean): Extract<Step, 'consents' | 'trial_confirm'> {
  return trialLessonIsPaid ? 'consents' : 'trial_confirm';
}

/**
 * When the trial lesson is, as its summary says it: the day and the date —
 * "יום שלישי · 6.10" — and the hours apart, "16:00–16:45". It is what the
 * parent came to check, so it is written short.
 *
 * The day and the hours are the server's own when the chosen date is one it
 * listed; otherwise the day is read from the date, and no hours are said.
 */
export function trialWhen(
  dateIso: string,
  listed?: { day_name?: string; start_time?: string; end_time?: string } | null,
): { day: string; hours: string } {
  const [year, month, dayOfMonth] = dateIso.split('T')[0].split('-').map(Number);
  if (!year || !month || !dayOfMonth) return { day: dateIso, hours: '' };
  const name = (listed?.day_name || getDayName(new Date(year, month - 1, dayOfMonth).getDay())).trim();
  const dayName = name.startsWith('יום ') ? name : `יום ${name}`;
  const start = (listed?.start_time || '').slice(0, 5);
  const end = (listed?.end_time || '').slice(0, 5);
  return {
    day: `${dayName} · ${dayOfMonth}.${month}`,
    hours: start && end ? `${start}–${end}` : '',
  };
}
