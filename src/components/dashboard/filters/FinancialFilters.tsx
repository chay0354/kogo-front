import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { MONTHS, YEARS } from './monthYearUtils';

export interface FinancialFiltersState {
  branch_id: string;
  month: number; // 1-12
  year: number;
  date_from: Date;
  date_to: Date;
}

export function getDefaultFinancialFilters(): FinancialFiltersState {
  const now = new Date();
  return {
    branch_id: 'all',
    month: now.getMonth() + 1, // JavaScript months are 0-indexed
    year: now.getFullYear(),
    date_from: startOfMonth(now),
    date_to: endOfMonth(now),
  };
}

interface Props {
  filters: FinancialFiltersState;
  onFiltersChange: (filters: FinancialFiltersState) => void;
  onExport: () => void;
  branches: Array<{ id: string; name: string }>;
}

export default function FinancialFilters({ filters, onFiltersChange, onExport, branches }: Props) {
  const handleMonthYearChange = (month: number, year: number) => {
    const date = new Date(year, month - 1, 1); // month - 1 because JS months are 0-indexed
    onFiltersChange({
      ...filters,
      month,
      year,
      date_from: startOfMonth(date),
      date_to: endOfMonth(date),
    });
  };

  const handleQuickDate = (type: 'current' | 'prev1' | 'prev2' | 'prev3') => {
    const now = new Date();
    let targetDate: Date;

    if (type === 'current') {
      targetDate = now;
    } else if (type === 'prev1') {
      targetDate = subMonths(now, 1);
    } else if (type === 'prev2') {
      targetDate = subMonths(now, 2);
    } else {
      targetDate = subMonths(now, 3);
    }

    handleMonthYearChange(targetDate.getMonth() + 1, targetDate.getFullYear());
  };

  return (
    <div className="rounded-xl bg-card p-4 shadow-md border border-border/50 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Branch Filter */}
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-medium mb-1 block">סניף</label>
          <select
            value={filters.branch_id}
            onChange={(e) => onFiltersChange({ ...filters, branch_id: e.target.value })}
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

        {/* Month Filter */}
        <div className="flex-1 min-w-[140px]">
          <label className="text-sm font-medium mb-1 block">חודש</label>
          <select
            value={filters.month}
            onChange={(e) => handleMonthYearChange(Number(e.target.value), filters.year)}
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            {MONTHS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="flex-1 min-w-[120px]">
          <label className="text-sm font-medium mb-1 block">שנה</label>
          <select
            value={filters.year}
            onChange={(e) => handleMonthYearChange(filters.month, Number(e.target.value))}
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Filters */}
        <div className="flex gap-2 items-end">
          <Button variant="outline" size="sm" onClick={() => handleQuickDate('current')}>
            החודש
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickDate('prev1')}>
            חודש קודם
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickDate('prev2')}>
            לפני חודשיים
          </Button>
        </div>

        {/* Export Button */}
        <Button variant="ghost" size="sm" onClick={onExport} className="gap-1">
          <Download className="h-4 w-4" />
          ייצוא
        </Button>
      </div>
    </div>
  );
}

