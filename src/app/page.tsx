'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshCurrentMonthSnapshots } from '@/lib/api';
import { toast } from 'sonner';
import GlobalDateFilter, { getDefaultDateRange, type DateRange } from '@/components/dashboard/GlobalDateFilter';
import FloatingIsland, { type DashTab } from '@/components/dashboard/nav/FloatingIsland';
import RevealChildren from '@/components/dashboard/RevealChildren';
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
  const [scrolled, setScrolled] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const queryClient = useQueryClient();

  // "Has the page scrolled?" is detected with a zero-height sentinel above the
  // sticky stack rather than a scroll listener: it costs nothing per frame, it
  // works whatever element ends up owning the scroll, and it does not depend on
  // scroll events firing at all.
  //
  // Attached through a callback ref, not an effect: AppLayout withholds its
  // children while it verifies the session, so on the first render the sentinel
  // does not exist yet and a mount effect would find nothing to observe. The
  // callback runs exactly when the node enters and leaves the DOM.
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

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
        {/* Sentinel: while this is on screen the page is at the top. */}
        <div ref={sentinelRef} aria-hidden className={theme.stackSentinel} />

        {/* The island rides the top of the viewport; nothing is drawn above
            it, and the page header scrolls underneath. */}
        <div className={`${theme.stack} ${scrolled ? theme.stackScrolled : ''}`}>
          <div className="flex justify-center min-w-0 max-w-full overflow-hidden">
            <FloatingIsland value={activeTab} onChange={setActiveTab} compact={scrolled} />
          </div>
          <div className={theme.stackControls}>
            <GlobalDateFilter dateRange={globalDateRange} onDateRangeChange={setGlobalDateRange} />
            <Button onClick={handleRefresh} disabled={refreshMutation.isPending} variant="outline" className="gap-2">
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshMutation.isPending ? 'מעדכן...' : 'רענן נתונים'}
            </Button>
          </div>
        </div>

        {/* keyed on the tab so switching replays the entrance motion, and each
            card inside gets its own as it scrolls into view */}
        <RevealChildren key={activeTab} resetKey={activeTab}>
          {activeTab === 'main' && <MainSection globalDateRange={globalDateRange} />}
          {activeTab === 'financial' && <FinancialSection globalDateRange={globalDateRange} />}
          {activeTab === 'branches' && <BranchesSection globalDateRange={globalDateRange} />}
          {activeTab === 'students' && <StudentsSection globalDateRange={globalDateRange} />}
          {activeTab === 'courses' && <CoursesSection globalDateRange={globalDateRange} />}
          {activeTab === 'instructors' && <InstructorsSection globalDateRange={globalDateRange} />}
          {activeTab === 'store' && <StoreDashboardTab />}
        </RevealChildren>
      </div>
    </AppLayout>
  );
}
