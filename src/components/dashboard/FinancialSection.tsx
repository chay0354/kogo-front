'use client';

import { useMemo, useState } from 'react';
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
import { Loader2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { fetchFinancialData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DateRange } from './GlobalDateFilter';
import { MONTHS } from './filters/monthYearUtils';
import styles from './FinancialSection.module.css';

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

interface MonthlyTrend {
  month: string;
  revenue: number;
  expenses: number;
}

type MonthlyTrendRow = MonthlyTrend & { monthLabel: string; profit: number };

interface InstructorRow {
  instructor_name: string;
  instructor_id: string;
  revenue: number;
  salary: number;
  profit: number;
}

type InstructorMetric = 'revenue' | 'salary' | 'profit';

const INSTRUCTOR_METRICS: { key: InstructorMetric; label: string; color: string }[] = [
  { key: 'revenue', label: 'הכנסות', color: 'hsl(var(--success))' },
  { key: 'salary', label: 'שכר', color: 'hsl(var(--warning))' },
  { key: 'profit', label: 'רווח', color: 'hsl(var(--primary))' },
];

function formatCurrency(value: number | null | undefined): string {
  return `₪${Number(value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthName = MONTHS.find((m) => m.value === Number(month))?.label ?? month;
  return `${monthName} ${year}`;
}

function formatPeriodLabel(range: DateRange): string {
  const start = MONTHS.find((m) => m.value === range.startMonth)?.label ?? '';
  const end = MONTHS.find((m) => m.value === range.endMonth)?.label ?? '';
  if (range.startYear === range.endYear && range.startMonth === range.endMonth) {
    return `${start} ${range.startYear}`;
  }
  return `${start} ${range.startYear} – ${end} ${range.endYear}`;
}

function profitClass(value: number): string {
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return styles.neutral;
}

export default function FinancialSection({ globalDateRange }: Props) {
  const [branchId, setBranchId] = useState('all');
  const [instructorMetric, setInstructorMetric] = useState<InstructorMetric>('revenue');
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

  const scopeLabel =
    branchId === 'all'
      ? 'כל הסניפים'
      : branches.find((b) => b.id === branchId)?.name ?? 'סניף';

  const kpis = data?.kpis ?? {};
  const expenseBreakdown = data?.expense_breakdown ?? {};
  const revenueByBranch: BranchRow[] = data?.revenue_by_branch ?? [];
  const revenueByInstructor: InstructorRow[] = data?.revenue_by_instructor ?? [];

  const monthlyTrends: MonthlyTrendRow[] = useMemo(() => {
    return (data?.monthly_trends ?? []).map((row: MonthlyTrend) => ({
      ...row,
      monthLabel: formatMonthLabel(row.month),
      profit: Number(row.revenue ?? 0) - Number(row.expenses ?? 0),
    }));
  }, [data?.monthly_trends]);

  const profitMargin =
    Number(kpis.total_revenue ?? 0) > 0
      ? (Number(kpis.net_profit ?? 0) / Number(kpis.total_revenue ?? 0)) * 100
      : 0;

  const hasData =
    Number(kpis.total_revenue ?? 0) > 0 ||
    Number(kpis.total_expenses ?? 0) > 0 ||
    revenueByBranch.length > 0;

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>טוען נתונים כספיים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        שגיאה בטעינת הנתונים. נסו לרענן את הדף או ללחוץ על &quot;רענן נתונים&quot; למעלה.
      </div>
    );
  }

  const instructorMetricMeta = INSTRUCTOR_METRICS.find((m) => m.key === instructorMetric)!;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          <p className={styles.toolbarTitle}>סיכום כספי</p>
          <p className={styles.toolbarSubtitle}>
            {scopeLabel} · {periodLabel}
          </p>
        </div>
        <div className={styles.branchField}>
          <label htmlFor="financial-branch">סניף</label>
          <select
            id="financial-branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className={styles.branchSelect}
          >
            <option value="all">כל הסניפים</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasData ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>אין נתונים לתקופה שנבחרה</p>
          <p className={styles.emptyHint}>
            לחצו על &quot;רענן נתונים&quot; בראש הדף כדי לחשב מחדש את החודש הנוכחי, או בחרו תקופה אחרת.
          </p>
        </div>
      ) : null}

      <div className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <CardContent className={styles.kpiContent}>
            <div>
              <p className={styles.kpiLabel}>הכנסות מרישום לשיעורים</p>
              <p className={`${styles.kpiValue} ${styles.positive}`}>{formatCurrency(kpis.total_revenue)}</p>
              {Number(kpis.registration_fees_collected ?? 0) > 0 ? (
                <p className={styles.kpiHint}>
                  מתוכם {formatCurrency(kpis.registration_fees_collected)} דמי רישום
                </p>
              ) : null}
            </div>
            <div className={`${styles.kpiIcon} ${styles.kpiIconSuccess}`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={styles.kpiCard}>
          <CardContent className={styles.kpiContent}>
            <div>
              <p className={styles.kpiLabel}>סה״כ הוצאות</p>
              <p className={`${styles.kpiValue} ${styles.warning}`}>{formatCurrency(kpis.total_expenses)}</p>
            </div>
            <div className={`${styles.kpiIcon} ${styles.kpiIconWarning}`}>
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={styles.kpiCard}>
          <CardContent className={styles.kpiContent}>
            <div>
              <p className={styles.kpiLabel}>רווח נקי</p>
              <p className={`${styles.kpiValue} ${profitClass(Number(kpis.net_profit ?? 0))}`}>
                {formatCurrency(kpis.net_profit)}
              </p>
            </div>
            <div className={`${styles.kpiIcon} ${styles.kpiIconPrimary}`}>
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={styles.kpiCard}>
          <CardContent className={styles.kpiContent}>
            <div>
              <p className={styles.kpiLabel}>שיעור רווח</p>
              <p className={`${styles.kpiValue} ${profitClass(profitMargin)}`}>
                {Number(kpis.total_revenue ?? 0) > 0 ? `${profitMargin.toFixed(1)}%` : '—'}
              </p>
              <p className={styles.kpiHint}>רווח מתוך ההכנסות</p>
            </div>
            <div className={`${styles.kpiIcon} ${styles.kpiIconPrimary}`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {monthlyTrends.length > 0 ? (
        <Card className={styles.panel}>
          <CardHeader className={styles.panelHeader}>
            <CardTitle className={styles.panelTitle}>מגמה חודשית — {scopeLabel}</CardTitle>
          </CardHeader>
          <CardContent className={styles.chartBox}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrends} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="monthLabel"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    Math.abs(value) >= 1000
                      ? `₪${(value / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}K`
                      : `₪${value}`
                  }
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    direction: 'rtl',
                  }}
                  formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
                />
                <Legend wrapperStyle={{ direction: 'rtl', paddingTop: 10 }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="הכנסות"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  name="הוצאות"
                  stroke="hsl(var(--warning))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name="רווח"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      <Card className={styles.panel}>
        <CardHeader className={styles.panelHeader}>
          <CardTitle className={styles.panelTitle}>פירוט הוצאות</CardTitle>
        </CardHeader>
        <CardContent className={styles.expenseGrid}>
          <div className={styles.expenseItem}>
            <span>שכר מדריכים</span>
            <strong>{formatCurrency(expenseBreakdown.instructor_salaries)}</strong>
          </div>
          <div className={styles.expenseItem}>
            <span>בונוסים</span>
            <strong>{formatCurrency(expenseBreakdown.instructor_bonuses)}</strong>
          </div>
          <div className={styles.expenseItem}>
            <span>עלויות תפעול (סניף)</span>
            <strong>{formatCurrency(expenseBreakdown.operational_costs)}</strong>
          </div>
        </CardContent>
      </Card>

      {revenueByBranch.length > 0 ? (
        <Card className={styles.panel}>
          <CardHeader className={styles.panelHeader}>
            <CardTitle className={styles.panelTitle}>השוואה לפי סניף</CardTitle>
          </CardHeader>
          <CardContent className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>סניף</th>
                  <th>הכנסות</th>
                  <th>הוצאות</th>
                  <th>רווח</th>
                  <th>שולי רווח</th>
                </tr>
              </thead>
              <tbody>
                {revenueByBranch.map((row) => {
                  const margin =
                    row.revenue > 0 ? Math.round((row.profit / row.revenue) * 100) : 0;
                  return (
                    <tr key={row.branch_id}>
                      <td>{row.branch_name}</td>
                      <td>{formatCurrency(row.revenue)}</td>
                      <td>{formatCurrency(row.expenses)}</td>
                      <td className={profitClass(row.profit)}>{formatCurrency(row.profit)}</td>
                      <td>{margin}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card className={styles.panel}>
        <CardHeader className={`${styles.panelHeader} ${styles.instructorHeader}`}>
          <CardTitle className={styles.panelTitle}>
            {instructorMetricMeta.label} לפי מדריך (8 מובילים)
          </CardTitle>
          <div className={styles.metricTabs} role="tablist" aria-label="בחר מדד">
            {INSTRUCTOR_METRICS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={instructorMetric === opt.key}
                className={`${styles.metricTab} ${instructorMetric === opt.key ? styles.metricTabActive : ''}`}
                onClick={() => setInstructorMetric(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className={styles.chartBoxTall}>
          {revenueByInstructor.length === 0 ? (
            <div className={styles.emptyInline}>אין נתוני מדריכים לתקופה שנבחרה.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenueByInstructor}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                barCategoryGap="24%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="instructor_name"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    Math.abs(value) >= 1000
                      ? `₪${(value / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}K`
                      : `₪${value}`
                  }
                  width={52}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    direction: 'rtl',
                  }}
                  formatter={(value) => formatCurrency(Number(value ?? 0))}
                />
                <Bar
                  dataKey={instructorMetric}
                  name={instructorMetricMeta.label}
                  fill={instructorMetricMeta.color}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
