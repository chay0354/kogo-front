'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from './GlobalDateFilter';
import { MONTHS, YEARS } from './filters/monthYearUtils';

interface Props {
  globalDateRange: DateRange;
}

interface LocalFilters {
  branch_id: string;
}

type BranchMetric = 'revenue' | 'expenses' | 'profit';
type InstructorMetric = 'revenue' | 'salary' | 'profit';

const BRANCH_METRIC_OPTIONS: { key: BranchMetric; label: string; color: string }[] = [
  { key: 'revenue', label: 'הכנסות', color: 'hsl(var(--success))' },
  { key: 'expenses', label: 'הוצאות', color: 'hsl(var(--warning))' },
  { key: 'profit', label: 'רווח', color: 'hsl(var(--primary))' },
];

const INSTRUCTOR_METRIC_OPTIONS: { key: InstructorMetric; label: string; color: string }[] = [
  { key: 'revenue', label: 'הכנסות', color: 'hsl(var(--success))' },
  { key: 'salary', label: 'שכר', color: 'hsl(var(--warning))' },
  { key: 'profit', label: 'רווח', color: 'hsl(var(--primary))' },
];

type TrendsMonthRange = {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
};

const TRENDS_MONTH_PRESETS = [
  { value: 3, label: '3 חודשים' },
  { value: 6, label: '6 חודשים' },
  { value: 12, label: '12 חודשים' },
  { value: 24, label: '24 חודשים' },
] as const;

function getDefaultTrendsMonthRange(): TrendsMonthRange {
  const now = new Date();
  const endMonth = now.getMonth() + 1;
  const endYear = now.getFullYear();
  const start = subMonths(new Date(endYear, endMonth - 1, 1), 5);
  return {
    startMonth: start.getMonth() + 1,
    startYear: start.getFullYear(),
    endMonth,
    endYear,
  };
}

function trendsRangeToDates(range: TrendsMonthRange) {
  const startDate = new Date(range.startYear, range.startMonth - 1, 1);
  const endDate = new Date(range.endYear, range.endMonth - 1, 1);
  return {
    date_from: startOfMonth(startDate),
    date_to: endOfMonth(endDate),
  };
}

function applyTrendsPreset(months: number): TrendsMonthRange {
  const now = new Date();
  const endMonth = now.getMonth() + 1;
  const endYear = now.getFullYear();
  const start = subMonths(new Date(endYear, endMonth - 1, 1), months - 1);
  return {
    startMonth: start.getMonth() + 1,
    startYear: start.getFullYear(),
    endMonth,
    endYear,
  };
}

export default function FinancialSection({ globalDateRange }: Props) {
  const [filters, setFilters] = useState<LocalFilters>({ branch_id: 'all' });
  const [instructorMetric, setInstructorMetric] = useState<InstructorMetric>('revenue');
  const [trendsMonthRange, setTrendsMonthRange] = useState<TrendsMonthRange>(getDefaultTrendsMonthRange);
  const [trendsPreset, setTrendsPreset] = useState<number | 'custom'>(6);

  // Fetch branches list for dropdown
  const { branches } = useScopedBranches();

  // Convert dates to API format
  const apiFilters = useMemo(() => ({
    branch_id: filters.branch_id,
    date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
  }), [filters, globalDateRange]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-financial', apiFilters],
    queryFn: () => fetchFinancialData(apiFilters),
  });

  const trendsApiFilters = useMemo(() => {
    const { date_from, date_to } = trendsRangeToDates(trendsMonthRange);
    return {
      branch_id: filters.branch_id,
      date_from: format(date_from, 'yyyy-MM-dd'),
      date_to: format(date_to, 'yyyy-MM-dd'),
    };
  }, [filters.branch_id, trendsMonthRange]);

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['dashboard-financial-trends', trendsApiFilters],
    queryFn: () => fetchFinancialData(trendsApiFilters),
    enabled: !isLoading && !error,
  });

  const handleExport = () => {
    toast.success('מייצא נתונים כספיים לקובץ CSV...');
    // TODO: Implement actual CSV export
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>טוען נתונים כספיים...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-destructive">שגיאה בטעינת הנתונים</div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const monthlyTrendsGlobal = data?.monthly_trends || [];
  const monthlyTrends = trendsData?.monthly_trends || [];
  const revenueByInstructor = data?.revenue_by_instructor || [];

  // Scope label + whole-system (or single-branch) metric series by month.
  // "כל הסניפים" => aggregate of the entire system, not split per branch.
  const isAllBranches = filters.branch_id === 'all';
  const scopeLabel = isAllBranches
    ? 'כלל המערכת'
    : branches.find((b: any) => b.id === filters.branch_id)?.name || 'הסניף הנבחר';

  const systemMetricData = monthlyTrendsGlobal.map((m: any) => {
    const revenue = Number(m.revenue || 0);
    const expenses = Number(m.expenses || 0);
    return {
      month: m.month,
      revenue,
      expenses,
      profit: revenue - expenses,
    };
  });

  return (
    <div className="space-y-6">
      {/* Local Filters (without date selection) */}
      <div className="rounded-xl bg-card p-4 shadow-md border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-medium mb-1 block">סניף</label>
            <select
              value={filters.branch_id}
              onChange={(e) => setFilters({ branch_id: e.target.value })}
              className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">כל הסניפים</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1 mt-auto">
            <Download className="h-4 w-4" />
            ייצוא
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">הכנסות החודש</p>
                <p className="text-2xl font-bold text-success">₪{kpis.total_revenue?.toLocaleString() || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">הוצאות החודש</p>
                <p className="text-2xl font-bold text-warning">₪{kpis.total_expenses?.toLocaleString() || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">רווח נקי</p>
                <p className={`text-2xl font-bold ${kpis.net_profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  ₪{kpis.net_profit?.toLocaleString() || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts (stacked full-width) */}
      <div className="space-y-6">
        {/* Whole-system (or selected branch) Revenue / Expenses / Profit by month */}
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>הכנסות, הוצאות ורווח — {scopeLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={systemMetricData}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  barCategoryGap="20%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    interval={0}
                    tickMargin={8}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(value: number) => {
                      if (Math.abs(value) >= 1000) {
                        return `₪${(value / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}K`;
                      }
                      return `₪${value}`;
                    }}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      direction: 'rtl',
                      color: 'hsl(var(--foreground))',
                    }}
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    formatter={(value, name) => [
                      `₪${Number(value ?? 0).toLocaleString('he-IL')}`,
                      String(name),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ direction: 'rtl', paddingTop: '10px' }}
                  />
                  {BRANCH_METRIC_OPTIONS.map((opt) => (
                    <Bar
                      key={opt.key}
                      dataKey={opt.key}
                      name={opt.label}
                      fill={opt.color}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between space-y-0">
            <CardTitle>מגמות חודשיות — {scopeLabel}</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">טווח מהיר</label>
                <select
                  value={trendsPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setTrendsPreset('custom');
                      return;
                    }
                    const months = Number(val);
                    setTrendsPreset(months);
                    setTrendsMonthRange(applyTrendsPreset(months));
                  }}
                  className="h-9 min-w-[120px] px-3 text-sm rounded-md border border-input bg-background"
                >
                  {TRENDS_MONTH_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">מותאם</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">מחודש</label>
                <div className="flex gap-1">
                  <select
                    value={trendsMonthRange.startMonth}
                    onChange={(e) => {
                      setTrendsPreset('custom');
                      setTrendsMonthRange((prev) => ({
                        ...prev,
                        startMonth: Number(e.target.value),
                      }));
                    }}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-background"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={trendsMonthRange.startYear}
                    onChange={(e) => {
                      setTrendsPreset('custom');
                      setTrendsMonthRange((prev) => ({
                        ...prev,
                        startYear: Number(e.target.value),
                      }));
                    }}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-background"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">עד חודש</label>
                <div className="flex gap-1">
                  <select
                    value={trendsMonthRange.endMonth}
                    onChange={(e) => {
                      setTrendsPreset('custom');
                      setTrendsMonthRange((prev) => ({
                        ...prev,
                        endMonth: Number(e.target.value),
                      }));
                    }}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-background"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={trendsMonthRange.endYear}
                    onChange={(e) => {
                      setTrendsPreset('custom');
                      setTrendsMonthRange((prev) => ({
                        ...prev,
                        endYear: Number(e.target.value),
                      }));
                    }}
                    className="h-9 px-2 text-sm rounded-md border border-input bg-background"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>טוען מגמות...</span>
              </div>
            ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyTrends}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      direction: "rtl",
                      color: "hsl(var(--foreground))",
                    }}
                    cursor={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Legend 
                    wrapperStyle={{ direction: 'rtl', paddingTop: '10px' }}
                    iconType="line"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    name="הכנסות" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--success))' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="expenses" 
                    name="הוצאות" 
                    stroke="hsl(var(--warning))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--warning))' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue / Salary / Profit by Instructor */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>
            {INSTRUCTOR_METRIC_OPTIONS.find((o) => o.key === instructorMetric)?.label} לפי מדריך
          </CardTitle>
          <div
            role="tablist"
            aria-label="בחר מדד"
            className="inline-flex items-center rounded-lg bg-muted/60 p-1"
          >
            {INSTRUCTOR_METRIC_OPTIONS.map((opt) => {
              const active = instructorMetric === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setInstructorMetric(opt.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenueByInstructor}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="instructor_name"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  interval={0}
                  tickMargin={8}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(value: number) => {
                    if (Math.abs(value) >= 1000) {
                      return `₪${(value / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}K`;
                    }
                    return `₪${value}`;
                  }}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    direction: 'rtl',
                    color: 'hsl(var(--foreground))',
                  }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  formatter={(value, name) => [
                    `₪${Number(value ?? 0).toLocaleString('he-IL')}`,
                    String(name),
                  ]}
                />
                <Bar
                  dataKey={instructorMetric}
                  name={INSTRUCTOR_METRIC_OPTIONS.find((o) => o.key === instructorMetric)?.label}
                  fill={INSTRUCTOR_METRIC_OPTIONS.find((o) => o.key === instructorMetric)?.color}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

