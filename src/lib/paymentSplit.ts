/**
 * A child's monthly payment for one class split between up to three cards
 * (owner, 15.10.2026) — the figures and choices the split window works with.
 * The server divides and checks again; this only keeps the window honest.
 */
import type { SplitParent, SplitPayerInput } from '@/lib/paymentLinksApi';

export const OTHER_PAYER = 'other';
export const MAX_PAYERS = 3;

export type PayerDraft = { choice: string; name: string; phone: string; email: string };

const cents = (value: string | number) => Math.round(Number(value) * 100);

/** Why the office's own figures cannot be used, or '' when they add up. */
export function amountsProblem(amounts: string[], total: string): string {
  if (amounts.some((value) => !value.trim() || !Number.isFinite(Number(value)))) return 'יש למלא סכום לכל משלם';
  if (amounts.some((value) => cents(value) < 100)) return 'כל משלם משלם לפחות ₪1';
  const sum = amounts.reduce((acc, value) => acc + cents(value), 0);
  const want = cents(total);
  if (sum !== want) {
    const diff = (want - sum) / 100;
    return diff > 0 ? `חסרים ₪${diff.toFixed(2)} כדי להגיע ל־₪${Number(total).toFixed(2)}` : `₪${(-diff).toFixed(2)} יותר מ־₪${Number(total).toFixed(2)}`;
  }
  return '';
}

/**
 * The payers a split starts with: the family's parents in order, then "another payer".
 * `skip` is a parent who is already paying (the first payer of an existing order).
 */
export function defaultPayers(parents: SplitParent[], count: number, skip: string[] = []): PayerDraft[] {
  const free = parents.filter((parent) => !skip.includes(parent.id));
  return Array.from({ length: count }, (_, index) => {
    const parent = free[index];
    return parent
      ? { choice: parent.id, name: '', phone: '', email: '' }
      : { choice: OTHER_PAYER, name: '', phone: '', email: '' };
  });
}

/** Why a payer cannot be sent a link yet, or ''. */
export function payerProblem(payer: PayerDraft, parents: SplitParent[]): string {
  if (payer.choice !== OTHER_PAYER) {
    const parent = parents.find((row) => row.id === payer.choice);
    if (!parent) return 'יש לבחור משלם';
    return parent.phone ? '' : `ל${parent.name} אין טלפון בכרטיס — בחרו "משלם אחר"`;
  }
  if (payer.name.trim().length < 2) return 'יש להזין שם למשלם';
  if (payer.phone.replace(/\D/g, '').length < 9) return 'יש להזין טלפון תקין — אליו נשלח הקישור';
  return '';
}

/** Two payers may not be the same parent. */
export function duplicateParent(payers: PayerDraft[], taken: string[] = []): boolean {
  const ids = [...taken, ...payers.filter((p) => p.choice !== OTHER_PAYER).map((p) => p.choice)];
  return new Set(ids).size !== ids.length;
}

export function payerInput(payer: PayerDraft): SplitPayerInput {
  if (payer.choice !== OTHER_PAYER) return { parent_id: payer.choice };
  return { name: payer.name.trim(), phone: payer.phone.trim(), ...(payer.email.trim() ? { email: payer.email.trim() } : {}) };
}

export function payerLabel(payer: PayerDraft, parents: SplitParent[], fallback: string): string {
  if (payer.choice !== OTHER_PAYER) return parents.find((row) => row.id === payer.choice)?.name || fallback;
  return payer.name.trim() || fallback;
}
