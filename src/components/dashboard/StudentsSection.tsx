'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchStudentsData, fetchCoursesList, fetchBranchesList } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, UserPlus, Ghost, ClipboardCheck, CheckCircle, Download, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, XAxis, YAxis, CartesianGrid, Cell as BarCell } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { DateRange } from './GlobalDateFilter';

// Lighter colors for quit percentage pie chart
const QUIT_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--info))'];

// Lighter, distinct colors for irregular attendance by branch
const BRANCH_COLORS = [
  'hsl(200, 70%, 70%)',  // Light blue
  'hsl(150, 65%, 70%)',  // Light green
  'hsl(280, 60%, 75%)',  // Light purple
  'hsl(30, 80%, 70%)',   // Light orange
  'hsl(340, 70%, 75%)',  // Light pink
  'hsl(180, 65%, 70%)',  // Light cyan
  'hsl(50, 75%, 70%)',   // Light yellow
  'hsl(260, 60%, 70%)',  // Light violet
];

interface Props {
  globalDateRange: DateRange;
}

interface LocalFilters {
  search_query: string;
  course_id: string;
  branch_id: string;
}

export default function StudentsSection({ globalDateRange }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<LocalFilters>({
    search_query: '',
    course_id: 'all',
    branch_id: 'all',
  });
  const [selectedQuitStatus, setSelectedQuitStatus] = useState<any>(null);
  const [isQuitModalOpen, setIsQuitModalOpen] = useState(false);

  // Fetch reference data
  const { data: coursesData } = useQuery({
    queryKey: ['courses-list'],
    queryFn: fetchCoursesList,
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: fetchBranchesList,
  });

  const courses = useMemo(() => {
    if (!coursesData) return [];
    const data = Array.isArray(coursesData) ? coursesData : (coursesData.results || []);
    return data.map((c: any) => ({ id: c.id, name: c.name }));
  }, [coursesData]);

  const branches = useMemo(() => {
    if (!branchesData) return [];
    const data = Array.isArray(branchesData) ? branchesData : (branchesData.results || []);
    return data.map((b: any) => ({ id: b.id, name: b.name }));
  }, [branchesData]);

  const apiFilters = useMemo(() => ({
    search_query: filters.search_query,
    course_id: filters.course_id,
    branch_id: filters.branch_id,
    date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
  }), [filters, globalDateRange]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-students', apiFilters],
    queryFn: () => fetchStudentsData(apiFilters),
  });

  const handleExport = () => {
    toast.success('מייצא נתונים...');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">טוען נתונים...</div>;
  }

  const kpis = data?.kpis || {};
  const studentList = data?.student_list || [];
  const abnormalByBranch = data?.abnormal_attendance_by_branch || [];
  const quitData = data?.quit_percentage || { total_quit: 0, by_status: [], by_course_type: [] };
  const quitByCourseType = quitData.by_course_type || [];

  const handleAbnormalClick = () => {
    router.push('/customers?abnormal_attendance=true');
  };

  const handleQuitPieClick = (data: any) => {
    if (data && data.payload) {
      setSelectedQuitStatus(data.payload);
      setIsQuitModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Local Filters (without date selection) */}
      <div className="rounded-xl bg-card p-4 shadow-md border border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-sm font-medium mb-1 block">חיפוש</label>
            <Input
              placeholder="חפש תלמיד..."
              value={filters.search_query}
              onChange={(e) => setFilters({ ...filters, search_query: e.target.value })}
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="text-sm font-medium mb-1 block">חוג</label>
            <select
              value={filters.course_id}
              onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}
              className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="all">כל החוגים</option>
              {courses.map((course: any) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[130px]">
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
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">תלמידים פעילים</p>
                <p className="text-2xl font-bold text-primary">{kpis.active_students || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">בעיות אשראי</p>
                <p className="text-2xl font-bold text-destructive">{kpis.credit_problems || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">תלמידי רפאים</p>
                <p className="text-2xl font-bold text-muted-foreground">{kpis.ghost_students || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Ghost className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">נרשמו לניסיון</p>
                <p className="text-2xl font-bold text-warning">{kpis.signed_for_trial || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ביצעו ניסיון</p>
                <p className="text-2xl font-bold text-success">{kpis.done_trial || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abnormal Attendance, Quit Percentage & Quit By Course Type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>נוכחות חריגה לפי סניף</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {abnormalByBranch.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={abnormalByBranch} onClick={handleAbnormalClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="branch_name" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        direction: "rtl",
                      }}
                    />
                    <Bar dataKey="count" name="תלמידים">
                      {abnormalByBranch.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={BRANCH_COLORS[index % BRANCH_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  אין נתונים להצגה
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>אחוז נשירה (סה"כ: {quitData.total_quit})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {quitData.by_status.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={quitData.by_status}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => `${entry.status}: ${entry.percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                      onClick={handleQuitPieClick}
                      style={{ cursor: 'pointer' }}
                    >
                      {quitData.by_status.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={QUIT_COLORS[index % QUIT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  אין נתונים להצגה
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl bg-card shadow-md border border-border/50">
          <CardHeader>
            <CardTitle>נושרים לפי תחום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {quitByCourseType.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quitByCourseType} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="course_type_name"
                      stroke="hsl(var(--muted-foreground))"
                      interval={0}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        direction: "rtl",
                      }}
                    />
                    <Bar dataKey="count" name="נושרים">
                      {quitByCourseType.map((_entry: any, index: number) => (
                        <Cell key={`ct-cell-${index}`} fill={BRANCH_COLORS[index % BRANCH_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  אין נתונים להצגה
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student List */}
      <Card className="rounded-xl bg-card shadow-md border border-border/50">
        <CardHeader>
          <CardTitle>תלמידים מובילים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-96">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3 text-sm font-medium">שם</th>
                  <th className="text-right p-3 text-sm font-medium">סניף</th>
                  <th className="text-right p-3 text-sm font-medium">חוג</th>
                  <th className="text-right p-3 text-sm font-medium">נוכחות</th>
                  <th className="text-right p-3 text-sm font-medium">ניסיון</th>
                </tr>
              </thead>
              <tbody>
                {studentList.map((student: any) => (
                  <tr key={student.id} className="border-b border-border">
                    <td className="p-3">{student.name}</td>
                    <td className="p-3">{student.branch}</td>
                    <td className="p-3">{student.course}</td>
                    <td className="p-3">
                      <span className={`font-medium ${
                        student.attendance >= 75 ? 'text-success' :
                        student.attendance >= 50 ? 'text-warning' :
                        'text-destructive'
                      }`}>
                        {student.attendance}%
                      </span>
                    </td>
                    <td className="p-3">
                      {student.is_trial ? (
                        <span className="px-2 py-1 bg-warning/10 text-warning rounded text-sm">כן</span>
                      ) : (
                        <span className="px-2 py-1 bg-muted text-muted-foreground rounded text-sm">לא</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quit Details Modal */}
      <Dialog open={isQuitModalOpen} onOpenChange={setIsQuitModalOpen}>
        <DialogContent className="sm:max-w-[600px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>תלמידים שעזבו - {selectedQuitStatus?.status}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {selectedQuitStatus && selectedQuitStatus.children && selectedQuitStatus.children.length > 0 ? (
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-right p-3 text-sm font-medium">שם מלא</th>
                    <th className="text-right p-3 text-sm font-medium">תאריך שינוי</th>
                    <th className="text-right p-3 text-sm font-medium">ת.ז</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedQuitStatus.children.map((child: any) => (
                    <tr key={child.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{child.full_name}</td>
                      <td className="p-3">{new Date(child.changed_at).toLocaleDateString('he-IL')}</td>
                      <td className="p-3 text-sm font-mono">{child.id_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                אין נתונים להצגה
              </div>
            )}
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              סה"כ: {selectedQuitStatus?.count || 0} תלמידים
            </span>
            <Button variant="outline" onClick={() => setIsQuitModalOpen(false)}>
              סגור
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

