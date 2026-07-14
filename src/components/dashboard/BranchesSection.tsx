'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchBranchesData, fetchCoursesList } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Download, Tags } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BranchFinancialDonut } from '@/components/branches/BranchFinancialDonut/BranchFinancialDonut';
import { BranchesSummaryBar } from '@/components/branches/BranchesSummaryBar/BranchesSummaryBar';
import { sumTotalIncome, sumTotalExpenses } from '@/components/branches/BranchesSummaryBar/BranchesSummaryBar.utils';
import type { DateRange } from './GlobalDateFilter';

interface Props {
  globalDateRange: DateRange;
}

interface LocalFilters {
  branch_id: string;
  city_id: string;
}

export default function BranchesSection({ globalDateRange }: Props) {
  const [filters, setFilters] = useState<LocalFilters>({
    branch_id: 'all',
    city_id: 'all',
  });

  const { branches: branchOptions, cities } = useScopedBranches();

  const branchesForFilter = useMemo(
    () => filterBranchesByCity(branchOptions, filters.city_id),
    [branchOptions, filters.city_id],
  );

  useEffect(() => {
    if (filters.branch_id === 'all') return;
    if (!branchesForFilter.some((b) => b.id === filters.branch_id)) {
      setFilters((prev) => ({ ...prev, branch_id: 'all' }));
    }
  }, [filters.branch_id, branchesForFilter]);

  const apiFilters = useMemo(() => ({
    branch_id: filters.branch_id,
    city_id: filters.city_id,
    date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
  }), [filters, globalDateRange]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-branches', apiFilters],
    queryFn: () => fetchBranchesData(apiFilters),
  });

  const router = useRouter();

  const handleExport = () => {
    toast.success('מייצא נתונים...');
  };

  const kpis = data?.kpis || {};
  const branchList = data?.branch_list || [];
  const discountBreakdown = data?.discount_breakdown || [];

  const gridBranches = filters.branch_id === 'all'
    ? branchesForFilter
    : branchesForFilter.filter((b) => b.id === filters.branch_id);

  const branchFinancials = new Map<string, { revenue: number; spending: number; profit: number }>(
    branchList.map((row: any) => [
      row.branch_id,
      { revenue: row.revenue || 0, spending: row.spending || 0, profit: row.profit || 0 },
    ])
  );

  const handleCardClick = (branchId: string) => {
    router.push(`/branches/${branchId}`);
  };

  // Discount type colors
  const DISCOUNT_COLORS = [
    'hsl(262, 83%, 58%)',  // Purple - Early signup
    'hsl(221, 83%, 53%)',  // Blue - Second child
    'hsl(142, 71%, 45%)',  // Green - Additional lesson
    'hsl(25, 95%, 53%)',   // Orange - Fixed price
  ];

  return (
    <div className="space-y-6">
      {/* Local Filters (without date selection) */}
      <div className="rounded-xl bg-card p-4 shadow-md border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-medium mb-1 block">עיר</label>
            <select
              value={filters.city_id}
              onChange={(e) => setFilters({ ...filters, city_id: e.target.value })}
              className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">כל הערים</option>
              {cities.map((city: any) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-medium mb-1 block">סניף</label>
            <select
              value={filters.branch_id}
              onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
              className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">כל הסניפים</option>
              {branchesForFilter.map((branch) => (
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

      {/* KPI Cards - Only 1 KPI (profit total now lives in BranchesSummaryBar below) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">סה"כ תלמידים</p>
                <p className="text-2xl font-bold text-success">{kpis.total_students || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Cards - same grid/card pattern as the Branches page */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {gridBranches.map((branch) => {
          const financials = branchFinancials.get(branch.id);

          return (
            <div
              key={branch.id}
              className="card hover:shadow-lg transition-all duration-300 cursor-pointer border border-border/50"
              onClick={() => handleCardClick(branch.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(branch.id);
                }
              }}
            >
              <h3 className="text-xl font-bold mb-4">{branch.name}</h3>
              <BranchFinancialDonut
                branchName={branch.name}
                revenue={financials?.revenue || 0}
                spending={financials?.spending || 0}
                profit={financials?.profit || 0}
                isLoading={isLoading}
              />
            </div>
          );
        })}
      </div>
      
      <BranchesSummaryBar
        totalProfit={kpis.total_profit || 0}
        totalExpenses={sumTotalExpenses(branchList)}
        totalIncome={sumTotalIncome(branchList)}
        isLoading={isLoading}
      />

      {/* Discount Breakdown Chart */}
      {discountBreakdown.length > 0 && (
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5 text-purple-500" />
              פילוח הנחות שניתנו
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={discountBreakdown}
                      dataKey="amount"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(props: any) => `${props.type}: ₪${props.amount.toLocaleString()}`}
                      labelLine={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1 }}
                    >
                      {discountBreakdown.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={DISCOUNT_COLORS[index % DISCOUNT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "2px solid hsl(var(--border))",
                        borderRadius: "12px",
                        direction: "rtl",
                      }}
                      formatter={(value: any) => [`₪${value.toLocaleString()}`, 'סכום']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend with totals */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg mb-4">סיכום הנחות</h3>
                {discountBreakdown.map((item: any, index: number) => (
                  <div key={item.type} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: DISCOUNT_COLORS[index % DISCOUNT_COLORS.length] }}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{item.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.count || 0} {item.count === 1 ? 'הנחה' : 'הנחות'}
                        </span>
                      </div>
                    </div>
                    <span className="font-bold text-lg">₪{item.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border-2 border-border mt-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground">סה״כ הנחות</span>
                    <span className="text-xs text-muted-foreground">
                      {discountBreakdown.reduce((sum: number, d: any) => sum + (d.count || 0), 0)} הנחות בסך הכל
                    </span>
                  </div>
                  <span className="font-bold text-xl text-foreground">
                    ₪{discountBreakdown.reduce((sum: number, d: any) => sum + d.amount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
