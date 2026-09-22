/**
 * The discounts behind a child's monthly amount.
 *
 * The office kept being asked "why does this family pay 225 and not 260?" and
 * the answer lived only in the discounts settings, a screen away, where it had
 * to be worked out again each time. The standing order already carries the
 * price before discounts, what was taken off, and which discounts did it.
 */

export interface DiscountLine {
  name: string;
  detail: string;
}

export interface ChildDiscount {
  id: string;
  courseName: string;
  /** Price before any discount. */
  base: number | null;
  discount: number;
  /** What is actually charged each month. */
  final: number;
  lines: DiscountLine[];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** How a single discount reads on screen: "הנחת אח שני · 10%" */
function describe(entry: Record<string, unknown>): DiscountLine {
  const name = String(entry.name || entry.type || 'הנחה').trim();
  const value = toNumber(entry.value);
  const kind = String(entry.type || '').toLowerCase();
  let detail = '';
  if (value !== null) {
    detail = kind.includes('percent') || kind.includes('אחוז') ? `${value}%` : `${value} ₪`;
  }
  const reason = String(entry.reason || '').trim();
  return { name, detail: [detail, reason].filter(Boolean).join(' · ') };
}

/**
 * The discounts worth showing: only standing orders that are actually running,
 * and only where something was taken off. A cancelled order's old discount is
 * not what this family pays today.
 */
export function childDiscounts(recurringPayments: unknown[]): ChildDiscount[] {
  if (!Array.isArray(recurringPayments)) return [];
  return recurringPayments
    .map((row) => (row || {}) as Record<string, unknown>)
    .filter((row) => row.status === 'active')
    .map((row) => {
      const details = Array.isArray(row.discount_details) ? row.discount_details : [];
      return {
        id: String(row.id ?? ''),
        courseName: String(row.course_name || 'חוג'),
        base: toNumber(row.base_amount),
        discount: toNumber(row.discount_amount) ?? 0,
        final: toNumber(row.amount) ?? 0,
        lines: details
          .map((entry) => describe((entry || {}) as Record<string, unknown>))
          .filter((line) => line.name),
      };
    })
    .filter((row) => row.discount > 0 || row.lines.length > 0);
}
