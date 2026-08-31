'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshCurrentMonthSnapshots } from '@/lib/api';
import { toast } from 'sonner';
import GlobalDateFilter, { getDefaultDateRange, type DateRange } from '@/components/dashboard/GlobalDateFilter';
import FloatingIsland, { type DashTab } from '@/components/dashboard/nav/FloatingIsland';
import theme from '@/components/dashboard/theme/dashboard.module.css';

// Dashboard section components
import MainSection from '@/components/dashboard/MainSection';
import FinancialSection from '@/components/dashboard/FinancialSection';
import InstructorsSection from '@/components/dashboard/InstructorsSection';
import StudentsSection from '@/components/dashboard/StudentsSection';
import CoursesSection from '@/components/dashboard/CoursesSection';
import BranchesSection from '@/components/dashboard/BranchesSection';
import StoreDashboardTab from '@/components/dashboard/StoreDashboardTab';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<DashTab>('main');
  const [globalDateRange, setGlobalDateRange] = useState<DateRange>(getDefaultDateRange());
  const queryClient = useQueryClient();

  const refreshMutation = useMutation({
    mutationFn: refreshCurrentMonthSnapshots,
    onSuccess: (data) => {
      toast.success(data.message || 'נתוני החודש הנוכחי עודכנו בהצלחה!');
      // Invalidate all dashboard queries to refetch with new data
      queryClient.invalidateQueries({ queryKey: ['dashboard-financial'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-instructors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-students'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-courses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-branches'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'שגיאה בעדכון הנתונים');
    },
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <AppLayout>
      {/* .tokens re-maps the Tailwind colour tokens to the v5 palette for the
          dashboard subtree only — the sidebar and every other page keep the
          original globals.css values. */}
      <div dir="rtl" className={`space-y-6 ${theme.tokens}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <PageHeader title="לוח בקרה" description="סקירה כללית של הנתונים העסקיים" />
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center shrink-0">
            <GlobalDateFilter dateRange={globalDateRange} onDateRangeChange={setGlobalDateRange} />
            <Button onClick={handleRefresh} disabled={refreshMutation.isPending} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshMutation.isPending ? 'מעדכן...' : 'רענן נתונים'}
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <FloatingIsland value={activeTab} onChange={setActiveTab} />
        </div>

        <div>
          {activeTab === 'main' && <MainSection globalDateRange={globalDateRange} />}
          {activeTab === 'financial' && <FinancialSection globalDateRange={globalDateRange} />}
          {activeTab === 'branches' && <BranchesSection globalDateRange={globalDateRange} />}
          {activeTab === 'students' && <StudentsSection globalDateRange={globalDateRange} />}
          {activeTab === 'courses' && <CoursesSection globalDateRange={globalDateRange} />}
          {activeTab === 'instructors' && <InstructorsSection globalDateRange={globalDateRange} />}
          {activeTab === 'store' && <StoreDashboardTab />}
        </div>
      </div>
    </AppLayout>
  );
}
