/**
 * Period-over-period figures derived from the financial `monthly_trends`
 * series the API already returns.
 *
 * The dashboard spec shows a change indicator and a sparkline on every KPI.
 * Nothing new is fetched for them — the trend rows carry enough history.
 */

export interface TrendRow {
  month: string;
  revenue: number;
  expenses: number;
}

export interface Derived {
  revenue: number[];
  profit: number[];
  revenueDelta: number | null;
  profitDelta: number | null;
  marginDelta: number | null;
}

function pctChange(curr: number, prev: number): number | null {
  // A change from zero has no meaningful percentage; show nothing rather than
  // an infinity or a misleading 100%.
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function deriveTrends(rows: any[] | undefined): Derived {
  const series = (rows ?? []).map((r) => ({
    revenue: Number(r.revenue ?? 0),
    expenses: Number(r.expenses ?? 0),
  }));

  const revenue = series.map((r) => r.revenue);
  const profit = series.map((r) => r.revenue - r.expenses);

  if (series.length < 2) {
    return { revenue, profit, revenueDelta: null, profitDelta: null, marginDelta: null };
  }

  const last = series[series.length - 1];
  const prev = series[series.length - 2];

  const lastMargin = last.revenue > 0 ? ((last.revenue - last.expenses) / last.revenue) * 100 : 0;
  const prevMargin = prev.revenue > 0 ? ((prev.revenue - prev.expenses) / prev.revenue) * 100 : 0;

  return {
    revenue,
    profit,
    revenueDelta: pctChange(last.revenue, prev.revenue),
    profitDelta: pctChange(last.revenue - last.expenses, prev.revenue - prev.expenses),
    // Margin is already a percentage, so the change is in points, not percent.
    marginDelta: prev.revenue > 0 ? lastMargin - prevMargin : null,
  };
}
