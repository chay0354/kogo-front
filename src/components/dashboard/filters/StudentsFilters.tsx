import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download } from 'lucide-react';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { MONTHS, YEARS } from './monthYearUtils';

export interface StudentsFiltersState {
  search_query: string;
  course_id: string;
  branch_id: string;
  student_status: string;
  month: number;
  year: number;
  date_from: Date;
  date_to: Date;
}

export function getDefaultStudentsFilters(): StudentsFiltersState {
  const now = new Date();
  return {
    search_query: '',
    course_id: 'all',
    branch_id: 'all',
    student_status: 'all',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    date_from: startOfMonth(now),
    date_to: endOfMonth(now),
  };
}

interface Props {
  filters: StudentsFiltersState;
  onFiltersChange: (filters: StudentsFiltersState) => void;
  onExport: () => void;
  courses: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
}

export default function StudentsFilters({ filters, onFiltersChange, onExport, courses, branches }: Props) {
  const handleMonthYearChange = (month: number, year: number) => {
    const date = new Date(year, month - 1, 1);
    onFiltersChange({
      ...filters,
      month,
      year,
      date_from: startOfMonth(date),
      date_to: endOfMonth(date),
    });
  };

  const handleQuickDate = (type: 'current' | 'prev1' | 'prev2') => {
    const now = new Date();
    const targetDate = type === 'current' ? now : type === 'prev1' ? subMonths(now, 1) : subMonths(now, 2);
    handleMonthYearChange(targetDate.getMonth() + 1, targetDate.getFullYear());
  };

  return (
    <div className="rounded-xl bg-card p-4 shadow-md border border-border/50 mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-sm font-medium mb-1 block">חיפוש</label>
          <Input
            placeholder="חפש תלמיד..."
            value={filters.search_query}
            onChange={(e) => onFiltersChange({ ...filters, search_query: e.target.value })}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="text-sm font-medium mb-1 block">חוג</label>
          <select
            value={filters.course_id}
            onChange={(e) => onFiltersChange({ ...filters, course_id: e.target.value })}
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            <option value="all">כל החוגים</option>
            {courses.map((course: any) => (
              <option key={course.id} value={course.id}>
                {course.name}{course.display_id ? ` #${course.display_id}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[130px]">
          <label className="text-sm font-medium mb-1 block">סניף</label>
          <select
            value={filters.branch_id}
            onChange={(e) => onFiltersChange({ ...filters, branch_id: e.target.value })}
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            <option value="all">כל הסניפים</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[120px]">
          <label className="text-sm font-medium mb-1 block">סטטוס</label>
          <select
            value={filters.student_status}
            onChange={(e) => onFiltersChange({ ...filters, student_status: e.target.value })}
            className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
          >
            <option value="all">הכל</option>
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
            <option value="trial_signed">ניסיון</option>
          </select>
        </div>

        <div className="flex-1 min-w-[120px]">
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

        <div className="flex-1 min-w-[100px]">
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

        <div className="flex gap-2 items-end">
          <Button variant="outline" size="sm" onClick={() => handleQuickDate('current')}>
            החודש
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickDate('prev1')}>
            חודש קודם
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={onExport} className="gap-1">
          <Download className="h-4 w-4" />
          ייצוא
        </Button>
      </div>
    </div>
  );
}
