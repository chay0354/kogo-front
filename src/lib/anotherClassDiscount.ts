/**
 * The discount for a child's second class onwards, as the office sets it
 * (kogo-back discount_service / AdditionalLessonDiscountSerializer).
 *
 * Two ways to say it (owner, 8.10.2026):
 *   'fixed'             — shekels off every extra class, whatever the course
 *                         costs. It adds up with the family's other discounts
 *                         (a brother, early sign-up).
 *   'fixed_final_price' — the price of the extra class itself. That figure is
 *                         final: nothing else comes off it.
 *
 * The words the settings card and the edit window show are worked out here, so
 * the two cannot disagree.
 */

export type AnotherClassKind = 'fixed' | 'fixed_final_price';

/** The kind a discount carries. A server that does not say (an older one) means the price. */
export function anotherClassKind(discount: { discount_type?: string | null } | null | undefined): AnotherClassKind {
  return discount?.discount_type === 'fixed' ? 'fixed' : 'fixed_final_price';
}

/** The label above the figure. */
export function anotherClassValueLabel(kind: AnotherClassKind): string {
  return kind === 'fixed' ? 'הנחה על כל חוג נוסף' : 'מחיר לחוג נוסף';
}

/** One line under the card's title, saying what the setting does. */
export function anotherClassDescription(kind: AnotherClassKind): string {
  return kind === 'fixed'
    ? 'אותו סכום יורד מכל חוג נוסף של אותו ילד, ומצטרף להנחות האחרות (אח, רישום מוקדם). החוג הראשון במחיר מלא.'
    : 'מחיר קבוע לחוגים נוספים של אותו ילד. זה המחיר הסופי — הנחות אחרות לא יורדות ממנו. החוג הראשון במחיר מלא.';
}

function shekels(value: number): string {
  return Number.isInteger(value) ? `₪${value}` : `₪${value.toFixed(2)}`;
}

/**
 * What a class of `coursePrice` costs as a second class — the worked example
 * the edit window shows. '' when nothing is set, or when a price is not below
 * the class's own (the server then leaves the class at its price).
 */
export function anotherClassExample(kind: AnotherClassKind, value: number, coursePrice = 350): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (kind === 'fixed') {
    const after = Math.max(coursePrice - value, 0);
    return `לדוגמה: חוג של ${shekels(coursePrice)} יעלה ${shekels(after)} כחוג נוסף. עם הנחת אח — עוד פחות.`;
  }
  if (value >= coursePrice) return '';
  return `לדוגמה: חוג של ${shekels(coursePrice)} יעלה ${shekels(value)} כחוג נוסף, גם אם יש אח.`;
}

/** What stops the form, in words — or '' when it may be saved. */
export function anotherClassProblem(kind: AnotherClassKind, value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'הסכום לא יכול להיות שלילי';
  if (value === 0) return kind === 'fixed' ? 'סכום ההנחה חייב להיות גדול מ-0' : 'מחיר לחוג נוסף חייב להיות גדול מ-0';
  return '';
}
