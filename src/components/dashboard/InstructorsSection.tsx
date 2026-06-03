'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInstructorsData, fetchInstructorsList, fetchBranchesList } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GraduationCap, Gift, Wallet, TrendingUp, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from './GlobalDateFilter';

interface Props {
  globalDateRange: DateRange;
}

interface LocalFilters {
  instructor_id: string;
  branch_id: string;
}

export default function InstructorsSection({ globalDateRange }: Props) {
  const [filters, setFilters] = useState<LocalFilters>({
    instructor_id: 'all',
    branch_id: 'all',
  });

  // Fetch reference data
  const { data: instructorsData } = useQuery({
    queryKey: ['instructors-list'],
    queryFn: fetchInstructorsList,
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: fetchBranchesList,
  });

  const instructors = useMemo(() => {
    if (!instructorsData) return [];
    const data = Array.isArray(instructorsData) ? instructorsData : (instructorsData.results || []);
    return data.map((i: any) => ({ 
      id: i.id, 
      name: `${i.first_name} ${i.last_name}` 
    }));
  }, [instructorsData]);

  const branches = useMemo(() => {
    if (!branchesData) return [];
    const data = Array.isArray(branchesData) ? branchesData : (branchesData.results || []);
    return data.map((b: any) => ({ id: b.id, name: b.name }));
  }, [branchesData]);

  const apiFilters = useMemo(() => ({
    instructor_id: filters.instructor_id,
    branch_id: filters.branch_id,
    date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
  }), [filters, globalDateRange]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-instructors', apiFilters],
    queryFn: () => fetchInstructorsData(apiFilters),
  });

  const handleExport = () => {
    toast.success('מייצא נתונים...');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>טוען נתוני מדריכים...</span>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const topPerformers = data?.top_performers || {};
  const instructorComparison = data?.instructor_comparison || [];
  const instructorDetails = data?.instructor_details || [];

  return (
    <div className="space-y-6">
      {/* Local Filters (without date selection) */}
      <div className="rounded-xl bg-card p-4 shadow-md border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-medium mb-1 block">מדריך</label>
            <select
              value={filters.instructor_id}
              onChange={(e) => setFilters({ ...filters, instructor_id: e.target.value })}
              className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">כל המדריכים</option>
              {instructors.map((instructor: any) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">מדריכים פעילים</p>
                <p className="text-2xl font-bold text-primary">{kpis.active_instructors || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">בונוסים</p>
                <p className="text-2xl font-bold text-info">₪{kpis.total_bonuses?.toLocaleString() || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center">
                <Gift className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">סה"כ שכר</p>
                <p className="text-2xl font-bold text-warning">₪{kpis.total_salary?.toLocaleString() || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">רווח כולל</p>
                <p className={`text-2xl font-bold ${kpis.total_profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ₪{kpis.total_profit?.toLocaleString() || 0}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">רווח הגבוה ביותר</p>
          <p className="text-lg font-bold text-success">{topPerformers.highest_profit?.name || '-'}</p>
          <p className="text-sm text-success">₪{topPerformers.highest_profit?.profit?.toLocaleString() || 0}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">הכי הרבה תלמידים</p>
          <p className="text-lg font-bold text-primary">{topPerformers.most_students?.name || '-'}</p>
          <p className="text-sm text-primary">{topPerformers.most_students?.students || 0} תלמידים</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">הכי הרבה שיעורים</p>
          <p className="text-lg font-bold text-info">{topPerformers.most_lessons?.name || '-'}</p>
          <p className="text-sm text-info">{topPerformers.most_lessons?.lessons || 0} שיעורים</p>
        </div>
      </div>

      {/* Instructor Comparison Chart */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader>
          <CardTitle>השוואת מדריכים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={instructorComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    direction: "rtl",
                  }}
                />
                <Legend />
                <Bar dataKey="revenue" name="הכנסות" fill="hsl(var(--success))" />
                <Bar dataKey="salary" name="שכר" fill="hsl(var(--warning))" />
                <Bar dataKey="profit" name="רווח" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Instructors Details Table */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader>
          <CardTitle>פירוט מדריכים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם מדריך</TableHead>
                  <TableHead className="text-right">סניף</TableHead>
                  <TableHead className="text-right">שיעורים</TableHead>
                  <TableHead className="text-right">תלמידים</TableHead>
                  <TableHead className="text-right">הכנסות</TableHead>
                  <TableHead className="text-right">שכר</TableHead>
                  <TableHead className="text-right">רווח</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructorDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      אין מדריכים להצגה
                    </TableCell>
                  </TableRow>
                ) : (
                  instructorDetails.map((instructor: any) => (
                    <TableRow key={instructor.instructor_id}>
                      <TableCell className="font-medium">{instructor.name}</TableCell>
                      <TableCell>{instructor.branch || '-'}</TableCell>
                      <TableCell>{instructor.lessons || 0}</TableCell>
                      <TableCell>{instructor.students || 0}</TableCell>
                      <TableCell className="text-success">₪{instructor.revenue?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-warning">₪{instructor.salary?.toLocaleString() || 0}</TableCell>
                      <TableCell className={instructor.profit >= 0 ? 'text-success' : 'text-destructive'}>
                        ₪{instructor.profit?.toLocaleString() || 0}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

