import { Lesson, LessonPriceTier } from '@/types/course';

export const FIRST_PRICE_TIER_INDEX = 2;

export function sanitizePriceTiers(
  tiers: LessonPriceTier[] | null | undefined,
  legacySecondLessonPrice?: number | string | null
): LessonPriceTier[] {
  const normalized = Array.isArray(tiers)
    ? tiers
        .filter((t) => t && Number(t.course_index) >= FIRST_PRICE_TIER_INDEX)
        .map((t) => ({ course_index: Number(t.course_index), price: Number(t.price) || 0 }))
    : [];

  const legacyPrice = legacySecondLessonPrice == null ? 0 : Number(legacySecondLessonPrice);
  const hasSecondLessonTier = normalized.some((t) => t.course_index === FIRST_PRICE_TIER_INDEX);
  if (!hasSecondLessonTier && Number.isFinite(legacyPrice) && legacyPrice > 0) {
    normalized.unshift({ course_index: FIRST_PRICE_TIER_INDEX, price: legacyPrice });
  }

  return normalized
    .sort((a, b) => a.course_index - b.course_index)
    .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: t.price }));
}

export function tiersFromCourseLessons(lessons: Lesson[] | undefined): LessonPriceTier[] {
  const source = lessons?.find(
    (l) =>
      (l.additional_course_prices && l.additional_course_prices.length > 0) ||
      (l.lesson_price_override != null && Number(l.lesson_price_override) > 0)
  );
  if (!source) return [];
  return sanitizePriceTiers(source.additional_course_prices, source.lesson_price_override);
}

export function cleanTiersForSubmit(extraTiers: LessonPriceTier[]) {
  const cleaned = extraTiers
    .filter((t) => Number.isFinite(t.price) && t.price > 0)
    .map((t, i) => ({ course_index: FIRST_PRICE_TIER_INDEX + i, price: Number(t.price) }));
  const secondLessonTier = cleaned.find((t) => t.course_index === FIRST_PRICE_TIER_INDEX);
  return {
    additional_course_prices: cleaned,
    lesson_price_override: secondLessonTier?.price ?? null,
  };
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
