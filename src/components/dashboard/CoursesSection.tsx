'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCoursesData, fetchCoursesList } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import { BookOpen, TrendingUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from './GlobalDateFilter';

interface Props {
  globalDateRange: DateRange;
}

interface LocalFilters {
  course_id: string;
  branch_id: string;
  city_id: string;
}

export default function CoursesSection({ globalDateRange }: Props) {
  const [filters, setFilters] = useState<LocalFilters>({
    course_id: 'all',
    branch_id: 'all',
    city_id: 'all',
  });

  // Fetch reference data
  const { data: coursesData } = useQuery({
    queryKey: ['courses-list'],
    queryFn: fetchCoursesList,
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

  const courses = useMemo(() => {
    if (!coursesData) return [];
    const data = Array.isArray(coursesData) ? coursesData : (coursesData.results || []);
    return data.map((c: any) => ({ id: c.id, name: c.name }));
  }, [coursesData]);

  const apiFilters = useMemo(() => ({
    course_id: filters.course_id,
    branch_id: filters.branch_id,
    city_id: filters.city_id,
    date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
  }), [filters, globalDateRange]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-courses', apiFilters],
    queryFn: () => fetchCoursesData(apiFilters),
  });

  const handleExport = () => {
    toast.success('מייצא נתונים...');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>טוען נתוני חוגים...</span>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const topCourses = data?.top_courses || [];
  const lowOccupancyCourses = data?.low_occupancy_courses || [];
  const courseList = data?.course_list || [];

  return (
    <div className="space-y-6">
      {/* Local Filters (without date selection) */}
      <div className="rounded-xl bg-card p-4 shadow-md border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[160px]">
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

          <div className="flex-1 min-w-[160px]">
            <label className="text-sm font-medium mb-1 block">חוג</label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}
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

          <div className="flex-1 min-w-[160px]">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">סה"כ חוגים</p>
                <p className="text-2xl font-bold text-primary">{kpis.total_courses || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">חוגים פעילים</p>
                <p className="text-2xl font-bold text-success">{kpis.active_courses || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">תפוסה מלאה</p>
                <p className="text-2xl font-bold text-info">{kpis.full_capacity || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">תפוסה נמוכה</p>
                <p className="text-2xl font-bold text-warning">{kpis.low_occupancy || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Courses Chart */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader>
          <CardTitle>חוגים מובילים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCourses}>
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
                <Bar dataKey="students" name="תלמידים" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Low Occupancy Courses */}
      {lowOccupancyCourses.length > 0 && (
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>חוגים בתפוסה נמוכה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowOccupancyCourses.map((course: any) => (
                <div key={course.course_id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium">
                      {course.name}
                      <GroupIdBadge displayId={course.display_id} />
                    </p>
                    <p className="text-sm text-muted-foreground">{course.branch}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${course.occupancy < 30 ? 'text-destructive' : 'text-warning'}`}>
                      {course.occupancy}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Courses Table */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader>
          <CardTitle>כל החוגים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-96">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3 text-sm font-medium">שם חוג</th>
                  <th className="text-right p-3 text-sm font-medium">סניף</th>
                  <th className="text-right p-3 text-sm font-medium">שיעורים</th>
                  <th className="text-right p-3 text-sm font-medium">תלמידים</th>
                  <th className="text-right p-3 text-sm font-medium">תפוסה</th>
                  <th className="text-right p-3 text-sm font-medium">הכנסות</th>
                  <th className="text-right p-3 text-sm font-medium">רווח</th>
                </tr>
              </thead>
              <tbody>
                {courseList.map((course: any) => (
                  <tr key={course.course_id} className="border-b border-border">
                    <td className="p-3 font-medium">
                      {course.name}
                      <GroupIdBadge displayId={course.display_id} />
                    </td>
                    <td className="p-3">{course.branch}</td>
                    <td className="p-3">{course.lessons}</td>
                    <td className="p-3">{course.students}</td>
                    <td className="p-3">
                      <span className={`font-medium ${
                        course.occupancy >= 90 ? 'text-success' :
                        course.occupancy < 50 ? 'text-warning' :
                        'text-primary'
                      }`}>
                        {course.occupancy}%
                      </span>
                    </td>
                    <td className="p-3 text-success">₪{course.revenue?.toLocaleString()}</td>
                    <td className={`p-3 ${course.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ₪{course.profit?.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

