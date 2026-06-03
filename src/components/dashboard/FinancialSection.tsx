'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialData, fetchBranchesList } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from './GlobalDateFilter';

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

export default function FinancialSection({ globalDateRange }: Props) {
  const [filters, setFilters] = useState<LocalFilters>({ branch_id: 'all' });
  const [branchMetric, setBranchMetric] = useState<BranchMetric>('revenue');
  const [instructorMetric, setInstructorMetric] = useState<InstructorMetric>('revenue');

  // Fetch branches list for dropdown
  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: fetchBranchesList,
  });

  const branches = useMemo(() => {
    if (!branchesData) return [];
    // Handle both array and paginated response
    const data = Array.isArray(branchesData) ? branchesData : (branchesData.results || []);
    return data.map((b: any) => ({ id: b.id, name: b.name }));
  }, [branchesData]);

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
  const revenueByBranch = data?.revenue_by_branch || [];
  const monthlyTrends = data?.monthly_trends || [];
  const revenueByInstructor = data?.revenue_by_instructor || [];

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue / Expenses / Profit by Branch */}
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>
              {BRANCH_METRIC_OPTIONS.find((o) => o.key === branchMetric)?.label} לפי סניף
            </CardTitle>
            <div
              role="tablist"
              aria-label="בחר מדד"
              className="inline-flex items-center rounded-lg bg-muted/60 p-1"
            >
              {BRANCH_METRIC_OPTIONS.map((opt) => {
                const active = branchMetric === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setBranchMetric(opt.key)}
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
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueByBranch}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="branch_name"
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
                    width={70}
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
                    dataKey={branchMetric}
                    name={BRANCH_METRIC_OPTIONS.find((o) => o.key === branchMetric)?.label}
                    fill={BRANCH_METRIC_OPTIONS.find((o) => o.key === branchMetric)?.color}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={56}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>מגמות חודשיות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={monthlyTrends}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
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
                  width={70}
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

