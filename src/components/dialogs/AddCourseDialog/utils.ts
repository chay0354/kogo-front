import { LessonPriceTier } from '@/types/course';
import { FIRST_PRICE_TIER_INDEX } from './constants';

export function toPositiveNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function calcEndTime(startTime: string, durationMinutes = 45): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

export function addExtraTier(tiers: LessonPriceTier[]): LessonPriceTier[] {
  return [...tiers, { course_index: FIRST_PRICE_TIER_INDEX + tiers.length, price: 0 }];
}

export function removeExtraTier(tiers: LessonPriceTier[], idx: number): LessonPriceTier[] {
  return tiers
    .filter((_, i) => i !== idx)
    .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: t.price }));
}

export function updateExtraTierPrice(tiers: LessonPriceTier[], idx: number, raw: string): LessonPriceTier[] {
  const value = raw === '' ? 0 : Number(raw);
  return tiers.map((t, i) => (i === idx ? { ...t, price: Number.isFinite(value) ? value : 0 } : t));
}
