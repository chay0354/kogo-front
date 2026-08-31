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
import { fetchFinancialData, fetchInvoicingData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { DateRange } from './GlobalDateFilter';
import { MONTHS } from './filters/monthYearUtils';
import { formatCurrency, formatPercent } from './format';
import theme from './theme/dashboard.module.css';

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

interface InstructorRow {
  instructor_name: string;
  instructor_id: string;
  revenue: number;
  salary: number;
  profit: number;
}

const SOURCE_LABELS: Record<string, string> = {
  crm: 'חוגים והרשמות',
  store: 'חנות',
  formal: 'מסמכים פורמליים',
  tranzila: 'Tranzila',
};

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

  const revenue = Number(kpis.total_revenue ?? 0);
  const profit = Number(kpis.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

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
    return <div className={theme.scope}><div className={theme.card}>טוען נתונים כספיים…</div></div>;
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
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>הכנסות</div>
            <div className={`${theme.kpiVal} ${theme.up}`}>{formatCurrency(revenue)}</div>
            <div className={theme.kpiFoot}>
              {Number(kpis.registration_fees_collected ?? 0) > 0
                ? `מתוכם ${formatCurrency(kpis.registration_fees_collected)} דמי רישום`
                : 'מרישום לשיעורים'}
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>רווח נקי</div>
            <div className={`${theme.kpiVal} ${profit >= 0 ? theme.up : theme.down}`}>
              {formatCurrency(profit)}
            </div>
            <div className={theme.kpiFoot}>לתקופה שנבחרה</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>שיעור רווח</div>
            <div className={`${theme.kpiVal} ${margin >= 0 ? theme.up : theme.down}`}>
              {revenue > 0 ? formatPercent(margin, 1) : '—'}
            </div>
            <div className={theme.kpiFoot}>רווח מתוך ההכנסות</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>נגבה בפועל</div>
            <div className={`${theme.kpiVal} ${theme.up}`}>
              {hasInvoices ? formatCurrency(inv.collected) : '—'}
            </div>
            <div className={theme.kpiFoot}>
              {hasInvoices ? `שיעור גבייה ${inv.collection_rate}%` : 'אין חשבוניות בתקופה'}
            </div>
          </div>
        </div>
      </div>

      {/* trend */}
      {monthlyTrends.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת הכנסות ורווח</h2>
          <p className={theme.cardSub}>{scopeLabel}</p>
          <div style={{ height: 300 }}>
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
        {hasInvoices ? (
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

      {/* by instructor */}
      {revenueByInstructor.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>הכנסות לפי מדריך</h2>
          <p className={theme.cardSub}>שמונת המובילים</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...revenueByInstructor].sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 8)}
                margin={{ top: 8, right: 12, left: 4, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="instructor_name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={56}
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
