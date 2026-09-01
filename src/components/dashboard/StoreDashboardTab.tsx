'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAnalytics } from '@/lib/storeApi';
import type { DateRange } from './GlobalDateFilter';
import type { StoreAnalytics } from '@/types/store';
import { formatCurrency } from './format';
import theme from './theme/dashboard.module.css';
import { SectionSkeleton } from './SectionSkeleton';

const EMPTY: StoreAnalytics = {
  total_revenue: 0,
  net_profit: 0,
  total_sales_count: 0,
  low_stock_count: 0,
  inventory_value: 0,
  top_product: null,
  shrinkage_by_reason: [],
  monthly_revenue: [],
  sales_by_product: [],
  sales_by_category: [],
  sales_by_branch: [],
  sales_by_payment_method: [],
  low_stock_products: [],
  recent_sales: [],
};

interface Props {
  /** The dashboard's global period. When present the tab follows it instead of
   *  its own day window, so the store agrees with every other tab. */
  globalDateRange?: DateRange;
}

/**
 * "חנות" — sales, margin and what needs restocking.
 *
 * Built on the shared dashboard theme so it matches the other tabs.
 */
export default function StoreDashboardTab({ globalDateRange }: Props) {
  const [analytics, setAnalytics] = useState<StoreAnalytics>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [days, setDays] = useState(30);

  const dateFrom = globalDateRange ? format(globalDateRange.date_from, 'yyyy-MM-dd') : undefined;
  const dateTo = globalDateRange ? format(globalDateRange.date_to, 'yyyy-MM-dd') : undefined;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchAnalytics(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : { days })
      .then((data) => { if (!cancelled) { setAnalytics(data); setFailed(false); } })
      // Falling back to zeros on a failed read presents "the request broke" as
      // "the shop sold nothing", which are opposite pieces of news.
      .catch(() => { if (!cancelled) { setAnalytics(EMPTY); setFailed(true); } })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [days, dateFrom, dateTo]);

  if (isLoading) {
    return <SectionSkeleton label="טוען נתוני חנות" hero />;
  }
  if (failed) {
    return (
      <div className={theme.scope}>
        <div className={theme.card}>שגיאה בטעינת הנתונים. נסו לרענן את הדף.</div>
      </div>
    );
  }

  const revenue = Number(analytics.total_revenue ?? 0);
  const profit = Number(analytics.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const salesByProduct = analytics.sales_by_product ?? [];
  const maxProduct = Math.max(...salesByProduct.map((p) => Number(p.revenue) || 0), 1);
  const trend = (analytics.monthly_revenue ?? []).map((r) => ({
    month: r.month,
    revenue: Number(r.revenue ?? 0),
  }));

  return (
    <div className={theme.scope}>
      {/* headline */}
      <div className={theme.hero}>
        <div className={theme.heroLbl}>הכנסות החנות בתקופה שנבחרה</div>
        <div className={theme.heroBig}>{formatCurrency(revenue)}</div>
        <div className={theme.heroRow}>
          <div>
            <span>רווח נקי</span>
            <b>{formatCurrency(profit)}</b>
          </div>
          <div>
            <span>שיעור רווח</span>
            <b>{revenue > 0 ? `${margin.toFixed(1)}%` : '—'}</b>
          </div>
          <div>
            <span>מכירות</span>
            <b>{Number(analytics.total_sales_count ?? 0)}</b>
          </div>
        </div>
      </div>

      {/* own window, only when the dashboard is not driving the period */}
      {!globalDateRange ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <div className={theme.kpiLbl}>טווח</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`${theme.chip} ${days === d ? theme.rankTop : ''}`}
                style={{ cursor: 'pointer', border: 0, font: 'inherit', fontWeight: 800 }}
              >
                {d} ימים
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* KPI row */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סיכום חנות</h2>
        <p className={theme.cardSub}>מכירות ומלאי בתקופה שנבחרה</p>
        <div className={`${theme.grid} ${theme.g4}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>שווי מלאי</div>
            <div className={theme.kpiVal}>{formatCurrency(analytics.inventory_value)}</div>
            <div className={theme.kpiFoot}>לפי מחיר עלות</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מכירות</div>
            <div className={theme.kpiVal}>{Number(analytics.total_sales_count ?? 0)}</div>
            <div className={theme.kpiFoot}>עסקאות שהושלמו</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מוצר מוביל</div>
            <div className={`${theme.kpiVal} ${theme.kpiValS}`}>
              {analytics.top_product?.name ?? '—'}
            </div>
            <div className={theme.kpiFoot}>
              {analytics.top_product ? `${analytics.top_product.quantity} יח׳ נמכרו` : 'אין מכירות בתקופה'}
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מלאי נמוך</div>
            <div className={`${theme.kpiVal} ${Number(analytics.low_stock_count ?? 0) > 0 ? theme.down : ''}`}>
              {Number(analytics.low_stock_count ?? 0)}
            </div>
            <div className={theme.kpiFoot}>מוצרים מתחת לסף</div>
          </div>
        </div>
      </div>

      {/* revenue trend — a line needs at least two points */}
      {trend.length === 1 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת הכנסות</h2>
          <p className={theme.cardSub}>{trend[0].month} · בחרו טווח רחב יותר כדי לראות מגמה</p>
          <div className={theme.counts} style={{ marginTop: 0 }}>
            <div>
              <b className={theme.up}>{formatCurrency(trend[0].revenue)}</b>
              <span>הכנסות</span>
            </div>
          </div>
        </div>
      ) : null}

      {trend.length > 1 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת הכנסות</h2>
          <p className={theme.cardSub}>הכנסות החנות לאורך זמן</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="הכנסות"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* sales by product */}
      {salesByProduct.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מכירות לפי מוצר</h2>
          <p className={theme.cardSub}>הכנסה לכל מוצר</p>
          {salesByProduct.slice(0, 8).map((p, i, arr) => (
            <div
              className={theme.hbar}
              key={p.product + i}
              style={i === Math.min(arr.length, 8) - 1 ? { marginBottom: 0 } : undefined}
            >
              <div className={theme.hbarName}>{p.product}</div>
              <div className={theme.hbarNum}>
                {formatCurrency(p.revenue)} · {Number(p.quantity ?? 0)} יח׳
              </div>
              <div className={theme.track}>
                <div
                  className={theme.fill}
                  style={{ width: `${(Number(p.revenue) / maxProduct) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* restock */}
      {(analytics.low_stock_products?.length ?? 0) > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מוצרים שדורשים חידוש מלאי</h2>
          <p className={theme.cardSub}>מתחת לסף שהוגדר</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>סניף</th>
                  <th className={theme.n}>יחידות שנותרו</th>
                </tr>
              </thead>
              <tbody>
                {analytics.low_stock_products.slice(0, 10).map((p: any) => (
                  <tr key={p.id ?? p.name}>
                    <td className={theme.name}>{p.name}</td>
                    <td style={{ color: 'var(--kg-muted)', fontSize: 12 }}>{p.branch_name || '—'}</td>
                    <td className={theme.n}>
                      <span className={`${theme.tag} ${theme.tagLow}`}>{p.stock_quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analytics.low_stock_products.length > 10 ? (
            <p className={theme.note}>ועוד {analytics.low_stock_products.length - 10} מוצרים</p>
          ) : null}
        </div>
      ) : null}

      {/* shrinkage */}
      {(analytics.shrinkage_by_reason?.length ?? 0) > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>פחת</h2>
          <p className={theme.cardSub}>יחידות שיצאו מהמלאי שלא במכירה</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>סיבה</th>
                  <th className={theme.n}>יחידות</th>
                </tr>
              </thead>
              <tbody>
                {analytics.shrinkage_by_reason.map((r) => (
                  <tr key={r.reason}>
                    <td className={theme.name}>{r.reason_label}</td>
                    <td className={theme.n}>
                      <span className={`${theme.tag} ${theme.tagLow}`}>{r.total_units}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {revenue === 0 && salesByProduct.length === 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <div className={theme.kpiFoot}>אין מכירות בתקופה שנבחרה</div>
        </div>
      ) : null}

      <div className={theme.mt}>
        <Link href="/store/dashboard" className={theme.chip} style={{ textDecoration: 'none' }}>
          לדוח החנות המלא →
        </Link>
      </div>
    </div>
  );
}
