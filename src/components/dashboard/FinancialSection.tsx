'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchFinancialData, fetchInvoicingData } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { DateRange } from './GlobalDateFilter';
import { MONTHS } from './monthYearUtils';
import { formatCurrency, formatPercent, SOURCE_LABELS } from './format';
import KpiCard from './KpiCard';
import { deriveTrends } from './trends';
import theme from './theme/dashboard.module.css';
import { SectionSkeleton } from './SectionSkeleton';

interface Props {
  globalDateRange: DateRange;
}

interface BranchRow {
  branch_name: string;
  branch_id: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface BusinessCategoryRow {
  category_id: string | null;
  category_name: string;
  revenue: number;
}

interface BusinessRow {
  business_id: string | null;
  business_name: string;
  revenue: number;
  categories: BusinessCategoryRow[];
}

interface InstructorRow {
  instructor_name: string;
  instructor_id: string;
  revenue: number;
  salary: number;
  profit: number;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = String(monthKey).split('-');
  const name = MONTHS.find((m) => m.value === Number(month))?.label ?? month;
  return `${name} ${year}`;
}

function formatPeriodLabel(range: DateRange): string {
  const start = MONTHS.find((m) => m.value === range.startMonth)?.label ?? '';
  const end = MONTHS.find((m) => m.value === range.endMonth)?.label ?? '';
  if (range.startYear === range.endYear && range.startMonth === range.endMonth) {
    return `${start} ${range.startYear}`;
  }
  return `${start} ${range.startYear} – ${end} ${range.endYear}`;
}

/**
 * "כספים" — revenue, profit and collections.
 *
 * Built from the shared dashboard theme so it reads as one surface with the
 * overview tab. Expenses are deliberately absent for now at the owner's
 * request; profit stays.
 */
export default function FinancialSection({ globalDateRange }: Props) {
  const [branchId, setBranchId] = useState('all');
  const { branches } = useScopedBranches();
  const periodLabel = formatPeriodLabel(globalDateRange);

  const apiFilters = useMemo(
    () => ({
      branch_id: branchId,
      date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
      date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
    }),
    [branchId, globalDateRange],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-financial', apiFilters],
    queryFn: () => fetchFinancialData(apiFilters),
  });

  // Its own query so a slow or empty invoicing read never holds up the summary.
  const invoicing = useQuery({
    queryKey: ['dashboard-invoicing', apiFilters],
    queryFn: () => fetchInvoicingData(apiFilters),
  });

  const kpis = data?.kpis ?? {};
  const revenueByBranch: BranchRow[] = data?.revenue_by_branch ?? [];
  const revenueByInstructor: InstructorRow[] = data?.revenue_by_instructor ?? [];
  const revenueByBusiness: BusinessRow[] = data?.revenue_by_business ?? [];

  const revenue = Number(kpis.total_revenue ?? 0);
  const profit = Number(kpis.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const trends = deriveTrends(data?.monthly_trends);

  const monthlyTrends = useMemo(
    () =>
      (data?.monthly_trends ?? []).map((row: any) => ({
        monthLabel: formatMonthLabel(row.month),
        revenue: Number(row.revenue ?? 0),
        profit: Number(row.revenue ?? 0) - Number(row.expenses ?? 0),
      })),
    [data?.monthly_trends],
  );

  const scopeLabel =
    branchId === 'all' ? 'כל הסניפים' : branches.find((b) => b.id === branchId)?.name ?? 'סניף';

  if (isLoading) {
    return <SectionSkeleton label="טוען נתונים כספיים" hero />;
  }
  if (error) {
    return (
      <div className={theme.scope}>
        <div className={theme.card}>שגיאה בטעינת הנתונים. נסו לרענן את הדף.</div>
      </div>
    );
  }

  const inv = invoicing.data;
  const hasInvoices = Number(inv?.documents ?? 0) > 0;

  return (
    <div className={theme.scope}>
      {/* headline */}
      <div className={theme.hero}>
        <div className={theme.heroLbl}>
          הכנסות · {scopeLabel} · {periodLabel}
        </div>
        <div className={theme.heroBig}>{formatCurrency(revenue)}</div>
        <div className={theme.heroRow}>
          <div>
            <span>רווח נקי</span>
            <b>{formatCurrency(profit)}</b>
          </div>
          <div>
            <span>שיעור רווח</span>
            <b>{formatPercent(margin, 1)}</b>
          </div>
          {hasInvoices ? (
            <div>
              <span>יתרה פתוחה</span>
              <b>{formatCurrency(inv.open_balance)}</b>
            </div>
          ) : null}
        </div>
      </div>

      {/* branch scope */}
      <div className={`${theme.card} ${theme.mt}`}>
        <label className={theme.kpiLbl} htmlFor="fin-branch">
          סניף
        </label>
        <select
          id="fin-branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          style={{
            display: 'block',
            marginTop: 6,
            width: '100%',
            maxWidth: 320,
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            font: 'inherit',
            fontWeight: 700,
          }}
        >
          <option value="all">כל הסניפים</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* KPI row */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סיכום כספי</h2>
        <p className={theme.cardSub}>
          {scopeLabel} · {periodLabel}
        </p>
        <div className={`${theme.grid} ${theme.g4}`}>
          <KpiCard
            label="הכנסות"
            value={formatCurrency(revenue)}
            tone="up"
            delta={trends.revenueDelta}
            series={trends.revenue}
            foot={
              Number(kpis.registration_fees_collected ?? 0) > 0
                ? `כולל ${formatCurrency(kpis.registration_fees_collected)} דמי רישום`
                : undefined
            }
          />
          <KpiCard
            label="רווח נקי"
            value={formatCurrency(profit)}
            tone={profit >= 0 ? 'up' : 'down'}
            delta={trends.profitDelta}
            series={trends.profit}
          />
          <KpiCard
            label="שיעור רווח"
            value={revenue > 0 ? formatPercent(margin, 1) : '—'}
            tone={margin >= 0 ? 'up' : 'down'}
            delta={trends.marginDelta}
            foot="רווח מתוך ההכנסות"
          />
          <KpiCard
            label="נגבה בפועל"
            value={hasInvoices ? formatCurrency(inv.collected) : '—'}
            tone="up"
            // "no invoices" is only true once the invoicing query has answered;
            // saying it while it is still in flight states something unknown.
            foot={
              hasInvoices
                ? `שיעור גבייה ${inv.collection_rate}%`
                : invoicing.isLoading
                  ? undefined
                  : 'אין חשבוניות בתקופה'
            }
          />
        </div>
      </div>

      {/* trend — a line needs at least two months; one month is shown as
          figures rather than two lonely dots on an empty axis */}
      {monthlyTrends.length === 1 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת הכנסות ורווח</h2>
          <p className={theme.cardSub}>
            {monthlyTrends[0].monthLabel} · בחרו טווח של יותר מחודש כדי לראות מגמה
          </p>
          <div className={theme.counts} style={{ marginTop: 0 }}>
            <div>
              <b className={theme.up}>{formatCurrency(monthlyTrends[0].revenue)}</b>
              <span>הכנסות</span>
            </div>
            <div>
              <b className={monthlyTrends[0].profit >= 0 ? theme.up : theme.down}>
                {formatCurrency(monthlyTrends[0].profit)}
              </b>
              <span>רווח</span>
            </div>
          </div>
        </div>
      ) : null}

      {monthlyTrends.length > 1 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת הכנסות ורווח</h2>
          <p className={theme.cardSub}>{scopeLabel}</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrends} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={72} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="הכנסות"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="רווח"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* invoicing */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h2 className={theme.cardTitle}>חשבוניות וגבייה</h2>
        <p className={theme.cardSub}>ההכנסה כפי שהיא מדווחת במסמכים</p>
        {invoicing.isLoading ? (
          <Skeleton className="h-16" />
        ) : hasInvoices ? (
          <>
            <div className={theme.counts} style={{ marginTop: 0 }}>
              <div>
                <b>{formatCurrency(inv.invoiced)}</b>
                <span>סך שחויב</span>
              </div>
              <div>
                <b>{formatCurrency(inv.collected)}</b>
                <span>נגבה בפועל</span>
              </div>
              <div>
                <b>{formatCurrency(inv.open_balance)}</b>
                <span>יתרה פתוחה</span>
              </div>
              <div>
                <b>{inv.documents}</b>
                <span>מסמכים</span>
              </div>
            </div>
            {(inv.by_source ?? []).length > 0 ? (
              <div className={theme.tableScroll} style={{ marginTop: 14 }}>
                <table className={theme.table}>
                  <thead>
                    <tr>
                      <th>מקור</th>
                      <th className={theme.n}>מסמכים</th>
                      <th className={theme.n}>חויב</th>
                      <th className={theme.n}>נגבה</th>
                      <th className={theme.n}>פתוח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.by_source.map((row: any) => (
                      <tr key={row.source}>
                        <td className={theme.name}>{SOURCE_LABELS[row.source] ?? row.source}</td>
                        <td className={theme.n}>{row.documents}</td>
                        <td className={theme.n}>{formatCurrency(row.invoiced)}</td>
                        <td className={theme.n}>{formatCurrency(row.collected)}</td>
                        <td className={theme.n}>{formatCurrency(row.open)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <div className={theme.kpiFoot}>לא הופקו חשבוניות בתקופה שנבחרה</div>
        )}
      </div>

      {hasInvoices && (inv.by_source ?? []).length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>פירוט הכנסות לפי מקור</h2>
          <p className={theme.cardSub}>מתוך {formatCurrency(inv.invoiced)} שחויבו</p>
          {[...inv.by_source]
            .sort((a: any, b: any) => Number(b.invoiced) - Number(a.invoiced))
            .map((row: any, i: number, arr: any[]) => {
              const share = Number(inv.invoiced) > 0 ? (Number(row.invoiced) / Number(inv.invoiced)) * 100 : 0;
              const max = Math.max(...arr.map((r: any) => Number(r.invoiced) || 1));
              return (
                <div
                  className={theme.hbar}
                  key={row.source}
                  style={i === arr.length - 1 ? { marginBottom: 0 } : undefined}
                >
                  <div className={theme.hbarName}>{SOURCE_LABELS[row.source] ?? row.source}</div>
                  <div className={theme.hbarNum}>
                    {formatCurrency(row.invoiced)} · {formatPercent(share, 1)}
                  </div>
                  <div className={theme.track}>
                    <div className={theme.fill} style={{ width: `${(Number(row.invoiced) / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      ) : null}

      {/* by branch */}
      {revenueByBranch.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>הכנסות לפי סניף</h2>
          <p className={theme.cardSub}>ממוין לפי הכנסות</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>סניף</th>
                  <th className={theme.n}>הכנסות</th>
                  <th className={theme.n}>רווח</th>
                  <th className={theme.n}>שיעור רווח</th>
                </tr>
              </thead>
              <tbody>
                {[...revenueByBranch]
                  .sort((a, b) => Number(b.revenue) - Number(a.revenue))
                  .map((row, i) => {
                    const m = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                    return (
                      <tr key={row.branch_id ?? i}>
                        <td className={theme.name}>
                          <span className={`${theme.rank} ${i === 0 ? theme.rankTop : ''}`}>{i + 1}</span>
                          {row.branch_name}
                        </td>
                        <td className={theme.n}>{formatCurrency(row.revenue)}</td>
                        <td className={`${theme.n} ${row.profit >= 0 ? theme.up : theme.down}`}>
                          {formatCurrency(row.profit)}
                        </td>
                        <td className={`${theme.n} ${m >= 0 ? theme.up : theme.down}`}>
                          {formatPercent(m, 1)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* by business and category */}
      {revenueByBusiness.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>הכנסות לפי עסק וקטגוריה</h2>
          <p className={theme.cardSub}>לפי השיוך של החוגים; מה שלא שויך מופיע בנפרד</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>עסק / קטגוריה</th>
                  <th className={theme.n}>הכנסות</th>
                </tr>
              </thead>
              <tbody>
                {revenueByBusiness.map((row, i) => (
                  <Fragment key={row.business_id ?? `untagged-${i}`}>
                    <tr>
                      <td className={theme.name}>
                        <span className={`${theme.rank} ${i === 0 ? theme.rankTop : ''}`}>{i + 1}</span>
                        {row.business_name}
                      </td>
                      <td className={theme.n}>{formatCurrency(row.revenue)}</td>
                    </tr>
                    {row.categories.map((cat, j) => (
                      <tr key={cat.category_id ?? `untagged-${i}-${j}`}>
                        <td className={theme.name} style={{ paddingInlineStart: '2.5rem' }}>
                          {cat.category_name}
                        </td>
                        <td className={theme.n}>{formatCurrency(cat.revenue)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* by instructor */}
      {revenueByInstructor.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>הכנסות לפי מדריך</h2>
          <p className={theme.cardSub}>שמונת המובילים</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...revenueByInstructor].sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 8)}
                margin={{ top: 8, right: 12, left: 4, bottom: 56 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="instructor_name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={64}
                />
                <YAxis tick={{ fontSize: 11 }} width={72} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" name="הכנסות" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="רווח" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
