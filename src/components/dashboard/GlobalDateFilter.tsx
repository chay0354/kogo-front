'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MONTHS, YEARS } from './filters/monthYearUtils';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface DateRange {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  date_from: Date;
  date_to: Date;
}

interface Props {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export function getDefaultDateRange(): DateRange {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  return {
    startMonth: month,
    startYear: year,
    endMonth: month,
    endYear: year,
    date_from: startOfMonth(now),
    date_to: endOfMonth(now),
  };
}

export default function GlobalDateFilter({ dateRange, onDateRangeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(dateRange);

  const handleApply = () => {
    // Calculate date_from and date_to based on selected months
    const startDate = new Date(tempRange.startYear, tempRange.startMonth - 1, 1);
    const endDate = new Date(tempRange.endYear, tempRange.endMonth - 1, 1);
    
    const newRange: DateRange = {
      ...tempRange,
      date_from: startOfMonth(startDate),
      date_to: endOfMonth(endDate),
    };
    
    onDateRangeChange(newRange);
    setIsOpen(false);
  };

  const handleReset = () => {
    const defaultRange = getDefaultDateRange();
    setTempRange(defaultRange);
    onDateRangeChange(defaultRange);
    setIsOpen(false);
  };

  const formatDateRange = () => {
    const startMonthName = MONTHS.find(m => m.value === dateRange.startMonth)?.label || '';
    const endMonthName = MONTHS.find(m => m.value === dateRange.endMonth)?.label || '';
    
    if (dateRange.startYear === dateRange.endYear && dateRange.startMonth === dateRange.endMonth) {
      return `${startMonthName} ${dateRange.startYear}`;
    }
    
    return `${startMonthName} ${dateRange.startYear} - ${endMonthName} ${dateRange.endYear}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-lg">
          <span>📅</span>
          <span>{formatDateRange()}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] p-6" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl mb-4">בחר טווח תאריכים</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-2">
          {/* Start Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">מתאריך</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">חודש</label>
                <select
                  value={tempRange.startMonth}
                  onChange={(e) => setTempRange({ ...tempRange, startMonth: Number(e.target.value) })}
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                >
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">שנה</label>
                <select
                  value={tempRange.startYear}
                  onChange={(e) => setTempRange({ ...tempRange, startYear: Number(e.target.value) })}
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium">עד תאריך</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">חודש</label>
                <select
                  value={tempRange.endMonth}
                  onChange={(e) => setTempRange({ ...tempRange, endMonth: Number(e.target.value) })}
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                >
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">שנה</label>
                <select
                  value={tempRange.endYear}
                  onChange={(e) => setTempRange({ ...tempRange, endYear: Number(e.target.value) })}
                  className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t mt-6 pt-4">
            <Button variant="outline" onClick={handleReset} className="px-6">
              איפוס
            </Button>
            <Button onClick={handleApply} className="px-6">
              החל
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
