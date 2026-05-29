'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Wallet, GraduationCap, Users, BookOpen, Building2, RefreshCw, ShoppingBag } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshCurrentMonthSnapshots } from '@/lib/api';
import { toast } from 'sonner';
import GlobalDateFilter, { getDefaultDateRange, type DateRange } from '@/components/dashboard/GlobalDateFilter';

// Dashboard section components
import FinancialSection from '@/components/dashboard/FinancialSection';
import InstructorsSection from '@/components/dashboard/InstructorsSection';
import StudentsSection from '@/components/dashboard/StudentsSection';
import CoursesSection from '@/components/dashboard/CoursesSection';
import BranchesSection from '@/components/dashboard/BranchesSection';
import StoreDashboardTab from '@/components/dashboard/StoreDashboardTab';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('financial');
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
    }
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader 
            title="לוח בקרה" 
            description="סקירה כללית של הנתונים העסקיים"
          />
          <div className="flex gap-3 items-center">
            <GlobalDateFilter 
              dateRange={globalDateRange} 
              onDateRangeChange={setGlobalDateRange}
            />
            <Button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshMutation.isPending ? 'מעדכן...' : 'רענן נתונים'}
            </Button>
          </div>
        </div>
        
        <Tabs defaultValue="financial" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 h-auto">
            <TabsTrigger value="financial" className="gap-2 py-3">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">כספים</span>
            </TabsTrigger>
            <TabsTrigger value="instructors" className="gap-2 py-3">
              <GraduationCap className="h-4 w-4" />
              <span className="hidden sm:inline">מדריכים</span>
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-2 py-3">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">תלמידים</span>
            </TabsTrigger>
            <TabsTrigger value="courses" className="gap-2 py-3">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">חוגים</span>
            </TabsTrigger>
            <TabsTrigger value="branches" className="gap-2 py-3">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">סניפים</span>
            </TabsTrigger>
            <TabsTrigger value="store" className="gap-2 py-3">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">חנות</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="financial" className="mt-6">
            <FinancialSection globalDateRange={globalDateRange} />
          </TabsContent>

          <TabsContent value="instructors" className="mt-6">
            <InstructorsSection globalDateRange={globalDateRange} />
          </TabsContent>

          <TabsContent value="students" className="mt-6">
            <StudentsSection globalDateRange={globalDateRange} />
          </TabsContent>

          <TabsContent value="courses" className="mt-6">
            <CoursesSection globalDateRange={globalDateRange} />
          </TabsContent>

          <TabsContent value="branches" className="mt-6">
            <BranchesSection globalDateRange={globalDateRange} />
          </TabsContent>

          <TabsContent value="store" className="mt-6">
            <StoreDashboardTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
