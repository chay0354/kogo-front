/*
 * Shared number formatting for the dashboard.
 *
 * IMPORTANT: the currency logic is byte-for-byte the same as the per-section
 * `formatCurrency` used before the v5 redesign, so displayed numbers stay
 * identical to evidence/dashboard-baseline-2026-08-30.md.
 */

export function formatCurrency(value: number | null | undefined): string {
  return `₪${Number(value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

export function formatCompactCurrency(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  return Math.abs(v) >= 1000
    ? `₪${(v / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}K`
    : `₪${v}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

/**
 * Where an invoiced shekel came from, as `invoicing.by_source` names it.
 * Shared because two tabs show the same breakdown and the wording has to agree.
 */
export const SOURCE_LABELS: Record<string, string> = {
  crm: 'חוגים והרשמות',
  store: 'חנות',
  formal: 'מסמכים פורמליים',
  tranzila: 'Tranzila',
};
