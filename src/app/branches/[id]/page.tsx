'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import EditBranchDialog from '@/components/dialogs/EditBranchDialog';
import CourseDetailsDialog from '@/components/dialogs/CourseDetailsDialog';
import BranchSectionFilters from '@/components/branches/BranchSectionFilters';
import api from '@/lib/api';
import { BranchDetail, BranchStatistics } from '@/types/branch';
import { formatCurrency, getBranchStatusBadge } from '@/lib/branchUtils';
import { DAY_OF_WEEK_HEBREW } from '@/types/branch';
import {
  Users, BookOpen, Calendar, GraduationCap, TrendingUp, TrendingDown, DollarSign,
  ArrowLeft, Edit, MapPin, Wifi, Bluetooth, Package, Trash2
} from 'lucide-react';

const STALE = 5 * 60 * 1000;

const toArray = (data: any) => {
  const arr = data?.results ?? data;
  return Array.isArray(arr) ? arr : [];
};

export default function BranchDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const branchId = params.id as string;
  const queryClient = useQueryClient();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [lessonFilters, setLessonFilters] = useState({ instructor_id: 'all', room_id: 'all' });
  const [studentFilters, setStudentFilters] = useState({ course_id: 'all', status: 'all' });

  const [
    { data: branch, isLoading, isError },
    { data: statistics },
    { data: products = [] },
    { data: courses = [] },
    { data: lessons = [] },
    { data: instructors = [] },
    { data: students = [] },
  ] = useQueries({
    queries: [
      {
        queryKey: ['branch', branchId],
        queryFn: (): Promise<BranchDetail> =>
          api.get(`/core/branches/${branchId}/`).then(r => r.data),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-stats', branchId],
        queryFn: (): Promise<BranchStatistics> =>
          api.get(`/core/branches/${branchId}/statistics/`).then(r => r.data),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-products', branchId],
        queryFn: () =>
          api.get(`/store/products/?branch=${branchId}`).then(r => toArray(r.data)),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-courses', branchId],
        queryFn: () =>
          api.get(`/courses/courses/?branch_id=${branchId}`).then(r => toArray(r.data)),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-lessons', branchId],
        queryFn: () =>
          api.get(`/courses/lessons/?branch_id=${branchId}`).then(r => toArray(r.data)),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-instructors', branchId],
        queryFn: () =>
          api.get(`/instructors/?branch=${branchId}&simple=true`).then(r =>
            toArray(r.data.instructors ?? r.data)
          ),
        staleTime: STALE,
        enabled: !!branchId,
      },
      {
        queryKey: ['branch-students', branchId],
        queryFn: () =>
          api.get(`/customers/children/?branch=${branchId}`).then(r => toArray(r.data)),
        staleTime: STALE,
        enabled: !!branchId,
      },
    ],
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['branch', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-stats', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-products', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-courses', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-lessons', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-instructors', branchId] });
    queryClient.invalidateQueries({ queryKey: ['branch-students', branchId] });
  };

  const handleEditSuccess = () => invalidateAll();

  const handleDeleteBranch = async () => {
    if (!branch) return;
    if (!confirm(`האם אתה בטוח שברצונך למחוק את סניף "${branch.name}"? פעולה זו אינה ניתנת לביטול.`)) {
      return;
    }
    try {
      await api.delete(`/core/branches/${branch.id}/`);
      router.push('/branches');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'שגיאה במחיקת הסניף';
      alert(errorMsg);
    }
  };

  const handleLessonFilterChange = (key: string, value: string) =>
    setLessonFilters(prev => ({ ...prev, [key]: value }));
  const handleClearLessonFilters = () =>
    setLessonFilters({ instructor_id: 'all', room_id: 'all' });

  const handleStudentFilterChange = (key: string, value: string) =>
    setStudentFilters(prev => ({ ...prev, [key]: value }));
  const handleClearStudentFilters = () =>
    setStudentFilters({ course_id: 'all', status: 'all' });

  const filteredLessons = lessons.filter(lesson => {
    if (lessonFilters.instructor_id !== 'all' && lesson.instructor !== lessonFilters.instructor_id) return false;
    if (lessonFilters.room_id !== 'all' && lesson.room !== lessonFilters.room_id) return false;
    return true;
  });

  const filteredStudents = students.filter(student => {
    if (studentFilters.status !== 'all' && student.status !== studentFilters.status) return false;
    if (studentFilters.course_id !== 'all') {
      const enrollments = student.enrollments || [];
      if (!enrollments.some((e: any) => e.course_id === studentFilters.course_id)) return false;
    }
    return true;
  });

  const uniqueInstructors = Array.from(
    new Map(
      lessons
        .filter((l: any) => l.instructor && l.instructor_name)
        .map((l: any) => [l.instructor, { value: l.instructor, label: l.instructor_name }])
    ).values()
  );

  const uniqueRooms = Array.from(
    new Map(
      lessons
        .filter((l: any) => l.room && l.room_name)
        .map((l: any) => [l.room, { value: l.room, label: l.room_name }])
    ).values()
  );

  const courseOptions = courses.map((c: any) => ({ value: c.id, label: c.name }));

  const statusOptions = [
    { value: 'trial', label: 'ניסיון' },
    { value: 'active', label: 'פעיל' },
    { value: 'payment_problem', label: 'בעיית תשלום' },
    { value: 'expired', label: 'פג תוקף' },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="card animate-fade-in">
          <p className="text-muted-foreground">טוען נתונים...</p>
        </div>
      </AppLayout>
    );
  }

  if (isError || !branch) {
    return (
      <AppLayout>
        <div className="card">
          <p className="text-destructive">שגיאה בטעינת נתוני הסניף</p>
          <button onClick={() => router.push('/branches')} className="btn-secondary mt-4">
            חזרה לרשימת סניפים
          </button>
        </div>
      </AppLayout>
    );
  }

  const statusBadge = getBranchStatusBadge(branch.is_active);

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={() => router.push('/branches')}
              className="p-2 hover:bg-accent rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold">{branch.name}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              </div>
              {branch.address && (
                <div className="flex items-center gap-2 text-muted-foreground mt-1 text-sm sm:text-base">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>{branch.address}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              className="btn-secondary flex items-center gap-2 flex-1 sm:flex-none justify-center"
              onClick={() => setShowEditDialog(true)}
            >
              <Edit className="w-4 h-4" />
              עריכת סניף
            </button>
            <button
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 flex-1 sm:flex-none justify-center"
              onClick={handleDeleteBranch}
            >
              <Trash2 className="w-4 h-4" />
              מחיקת סניף
            </button>
          </div>
        </div>
      </div>

      {/* KPI Dashboard */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6 animate-slide-up">
          <div className="card text-center">
            <Users className="w-8 h-8 mx-auto text-primary mb-2" />
            <div className="text-3xl font-bold">{statistics.active_students}</div>
            <div className="text-sm text-muted-foreground">תלמידים פעילים</div>
          </div>
          <div className="card text-center">
            <BookOpen className="w-8 h-8 mx-auto text-accent mb-2" />
            <div className="text-3xl font-bold">{statistics.courses_count}</div>
            <div className="text-sm text-muted-foreground">חוגים פעילים</div>
          </div>
          <div className="card text-center">
            <Calendar className="w-8 h-8 mx-auto text-info mb-2" />
            <div className="text-3xl font-bold">{statistics.lessons_count}</div>
            <div className="text-sm text-muted-foreground">שיעורים שבועיים</div>
          </div>
          <div className="card text-center">
            <GraduationCap className="w-8 h-8 mx-auto text-secondary mb-2" />
            <div className="text-3xl font-bold">{statistics.instructors_count}</div>
            <div className="text-sm text-muted-foreground">מדריכים פעילים</div>
          </div>
          <div className="card text-center">
            <DollarSign className="w-8 h-8 mx-auto text-success mb-2" />
            <div className="text-3xl font-bold">{formatCurrency(statistics.monthly_revenue)}</div>
            <div className="text-sm text-muted-foreground">הכנסות חודשיות</div>
          </div>
          <div className="card text-center">
            {statistics.profit < 0 ? (
              <TrendingDown className="w-8 h-8 mx-auto text-destructive mb-2" />
            ) : (
              <TrendingUp className="w-8 h-8 mx-auto text-success mb-2" />
            )}
            <div className={`text-3xl font-bold ${statistics.profit < 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(statistics.profit)}
            </div>
            <div className="text-sm text-muted-foreground">רווח חודשי</div>
          </div>
        </div>
      )}

      {/* Branch Details Card */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">פרטי הסניף</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">סניף חיצוני</span>
            <button
              type="button"
              role="switch"
              aria-checked={branch.is_external}
              disabled={savingExternal}
              onClick={async () => {
                setSavingExternal(true);
                try {
                  await api.patch(`/core/branches/${branchId}/`, { is_external: !branch.is_external });
                  queryClient.invalidateQueries({ queryKey: ['branch', branchId] });
                  setEditingLink(false);
                } finally {
                  setSavingExternal(false);
                }
              }}
              className={`relative inline-flex w-10 h-6 rounded-full transition-colors border-0 ${savingExternal ? 'cursor-wait opacity-60' : 'cursor-pointer'} ${branch.is_external ? 'bg-yellow-400' : 'bg-muted'}`}
            >
              {savingExternal ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </span>
              ) : (
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${branch.is_external ? 'right-1 -translate-x-4' : 'right-1'}`} />
              )}
            </button>
          </div>
        </div>

        {branch.is_external && (
          <div className="mb-4 pb-4 border-b border-border">
            <div className="text-sm text-muted-foreground mb-1">🔗 לינק לסניף</div>
            {editingLink ? (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={linkValue}
                  onChange={e => setLinkValue(e.target.value)}
                  placeholder="https://..."
                  className="input flex-1 text-sm"
                  autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Escape') { setEditingLink(false); setLinkValue(branch.external_link || ''); }
                    if (e.key === 'Enter') {
                      setSavingLink(true);
                      try {
                        await api.patch(`/core/branches/${branchId}/`, { external_link: linkValue });
                        queryClient.invalidateQueries({ queryKey: ['branch', branchId] });
                        setEditingLink(false);
                      } finally { setSavingLink(false); }
                    }
                  }}
                />
                <button
                  disabled={savingLink}
                  onClick={async () => {
                    setSavingLink(true);
                    try {
                      await api.patch(`/core/branches/${branchId}/`, { external_link: linkValue });
                      queryClient.invalidateQueries({ queryKey: ['branch', branchId] });
                      setEditingLink(false);
                    } finally { setSavingLink(false); }
                  }}
                  className="btn-primary text-sm px-3 py-1"
                >
                  {savingLink ? '...' : 'שמור'}
                </button>
                <button onClick={() => { setEditingLink(false); setLinkValue(branch.external_link || ''); }} className="btn-secondary text-sm px-3 py-1">
                  ביטול
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {branch.external_link ? (
                  <a href={branch.external_link} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm truncate max-w-xs">
                    {branch.external_link}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">לא הוזן לינק</span>
                )}
                <button
                  onClick={() => { setEditingLink(true); setLinkValue(branch.external_link || ''); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  עריכה
                </button>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {branch.branch_codes && branch.branch_codes.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-1"># קוד סניף</div>
              <div className="font-medium">{branch.branch_codes.join(', ')}</div>
            </div>
          )}
          {branch.address && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">📍 כתובת</div>
              <div className="font-medium">{branch.address}</div>
            </div>
          )}
          {branch.cleaning_managers && branch.cleaning_managers.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">✨ אחראי ניקיון</div>
              <div className="font-medium">{branch.cleaning_managers.join(', ')}</div>
            </div>
          )}
          {branch.wifi_name && (
            <div>
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Wifi className="w-4 h-4" />
                WiFi
              </div>
              <div className="font-medium">{branch.wifi_name}</div>
              {branch.wifi_code && (
                <div className="text-sm text-muted-foreground">{branch.wifi_code}</div>
              )}
            </div>
          )}
          {branch.bluetooth_codes && branch.bluetooth_codes.length > 0 && (
            <div>
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                <Bluetooth className="w-4 h-4" />
                Bluetooth
              </div>
              <div className="font-medium">{branch.bluetooth_codes.join(', ')}</div>
            </div>
          )}
          {branch.monthly_cost && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">💰 עלות חודשית</div>
              <div className="font-medium">{formatCurrency(branch.monthly_cost)}</div>
            </div>
          )}
          {branch.cleaning_cost && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">🧹 עלות ניקיון</div>
              <div className="font-medium">{formatCurrency(branch.cleaning_cost)}</div>
            </div>
          )}
        </div>

        {/* Custom Details */}
        {branch.custom_details && branch.custom_details.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-2">פרטים נוספים</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {branch.custom_details.map((detail, index) => (
                <div key={index}>
                  <div className="text-sm text-muted-foreground">{detail.label}</div>
                  <div className="font-medium">{detail.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rooms/Studios Card */}
      {branch.rooms && branch.rooms.length > 0 && (
        <div className="card mb-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">חדרים וסטודיואים ({branch.rooms.length})</h2>
            <button className="btn-secondary text-sm">+ הוסף חדר</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branch.rooms.map((room: any) => (
              <div key={room.id} className="p-4 border border-border rounded-lg">
                <div className="font-semibold mb-1">{room.name}</div>
                {room.purpose && (
                  <div className="text-sm text-muted-foreground mb-1">ייעוד: {room.purpose}</div>
                )}
                <div className="text-sm text-muted-foreground">קיבולת: {room.capacity} איש</div>
                {room.notes && (
                  <div className="text-sm text-muted-foreground mt-2">{room.notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Card */}
      {products.length > 0 && (
        <div className="card mb-6 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5" />
            <h2 className="text-xl font-bold">מוצרים בסניף ({products.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-2 px-4">שם מוצר</th>
                  <th className="text-right py-2 px-4">קטגוריה</th>
                  <th className="text-right py-2 px-4">מלאי</th>
                  <th className="text-right py-2 px-4">מחיר מכירה</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product: any) => (
                  <tr key={product.id} className="border-b border-border/50">
                    <td className="py-2 px-4">{product.name}</td>
                    <td className="py-2 px-4">{product.category}</td>
                    <td className="py-2 px-4">
                      <span className={product.is_low_stock ? 'text-destructive font-medium' : ''}>
                        {product.stock_quantity}
                      </span>
                    </td>
                    <td className="py-2 px-4">{formatCurrency(product.sale_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Placeholder for Files */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '400ms' }}>
        <h2 className="text-xl font-bold mb-4">קבצים וסרטוני הדרכה</h2>
        <p className="text-muted-foreground">ממשק העלאת קבצים יתווסף בקרוב...</p>
      </div>

      {/* Active Courses in Branch */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '500ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5" />
          <h2 className="text-xl font-bold">חוגים פעילים בסניף ({courses.length})</h2>
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            אין חוגים פעילים בסניף זה
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-3 px-4 font-semibold">שם החוג</th>
                  <th className="text-right py-3 px-4 font-semibold">מספר שיעורים</th>
                  <th className="text-right py-3 px-4 font-semibold">מספר תלמידים</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course: any) => (
                  <tr
                    key={course.id}
                    className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCourse(course)}
                  >
                    <td className="py-3 px-4 font-medium">{course.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{course.lessons_count || 0}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {course.enrolled_students_count || 0} תלמידים
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lessons in Branch */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '600ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5" />
          <h2 className="text-xl font-bold">שיעורים בסניף ({filteredLessons.length})</h2>
        </div>

        {lessons.length > 0 && (
          <BranchSectionFilters
            filters={lessonFilters}
            onFilterChange={handleLessonFilterChange}
            onClearFilters={handleClearLessonFilters}
            filterOptions={[
              { key: 'instructor_id', label: 'כל המדריכים', options: uniqueInstructors },
              { key: 'room_id', label: 'כל הסטודיואים', options: uniqueRooms },
            ]}
          />
        )}

        {filteredLessons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {lessons.length === 0 ? 'אין שיעורים מתוכננים בסניף זה' : 'לא נמצאו שיעורים מתאימים לפילטר'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-3 px-4 font-semibold">יום</th>
                  <th className="text-right py-3 px-4 font-semibold">שעה</th>
                  <th className="text-right py-3 px-4 font-semibold">חוג</th>
                  <th className="text-right py-3 px-4 font-semibold">סטודיו</th>
                  <th className="text-right py-3 px-4 font-semibold">מדריך</th>
                  <th className="text-right py-3 px-4 font-semibold">תלמידים</th>
                </tr>
              </thead>
              <tbody>
                {filteredLessons.map((lesson: any) => (
                  <tr key={lesson.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-3 px-4 font-medium">
                      {lesson.day_name || DAY_OF_WEEK_HEBREW[lesson.day_of_week]}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {lesson.start_time} - {lesson.end_time}
                    </td>
                    <td className="py-3 px-4">{lesson.course_name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{lesson.room_name || 'לא משויך'}</td>
                    <td className="py-3 px-4 text-muted-foreground">{lesson.instructor_name || 'לא משויך'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {lesson.enrolled_students_count || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instructors in Branch */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '700ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <GraduationCap className="w-5 h-5" />
          <h2 className="text-xl font-bold">מדריכים בסניף ({instructors.length})</h2>
        </div>

        {instructors.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            אין מדריכים משויכים לסניף זה
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {instructors.map((instructor: any) => (
              <div
                key={instructor.id}
                onClick={() => router.push(`/instructors/${instructor.id}`)}
                className="group relative p-4 border border-border rounded-lg hover:border-primary hover:shadow-md transition-all cursor-pointer bg-gradient-to-br from-white to-gray-50 hover:from-blue-50 hover:to-blue-100"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <GraduationCap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 group-hover:text-primary transition-colors truncate">
                      {instructor.full_name}
                    </p>
                    {instructor.specialization && (
                      <p className="text-xs text-muted-foreground truncate">
                        {instructor.specialization}
                      </p>
                    )}
                  </div>
                  <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Students List */}
      <div className="card mb-6 animate-slide-up" style={{ animationDelay: '800ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5" />
          <h2 className="text-xl font-bold">רשימת תלמידים ({filteredStudents.length})</h2>
        </div>

        {students.length > 0 && (
          <BranchSectionFilters
            filters={studentFilters}
            onFilterChange={handleStudentFilterChange}
            onClearFilters={handleClearStudentFilters}
            filterOptions={[
              { key: 'course_id', label: 'כל החוגים', options: courseOptions },
              { key: 'status', label: 'כל הסטטוסים', options: statusOptions },
            ]}
          />
        )}

        {filteredStudents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {students.length === 0 ? 'אין תלמידים רשומים בסניף זה' : 'לא נמצאו תלמידים מתאימים לפילטר'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-3 px-4 font-semibold">שם הילד</th>
                  <th className="text-right py-3 px-4 font-semibold">משפחה</th>
                  <th className="text-right py-3 px-4 font-semibold">טלפון</th>
                  <th className="text-right py-3 px-4 font-semibold">חוגים</th>
                  <th className="text-right py-3 px-4 font-semibold">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student: any) => {
                  const enrollments = student.enrollments || [];
                  const courseNames = enrollments.map((e: any) => e.course_name).join(', ');

                  const statusConfig: Record<string, { label: string; className: string }> = {
                    trial: { label: 'ניסיון', className: 'bg-warning/10 text-warning border-warning/20' },
                    active: { label: 'פעיל', className: 'bg-success/10 text-success border-success/20' },
                    payment_problem: { label: 'בעיית תשלום', className: 'bg-destructive/10 text-destructive border-destructive/20' },
                    expired: { label: 'פג תוקף', className: 'bg-muted/50 text-muted-foreground border-muted' },
                  };
                  const statusStyle = statusConfig[student.status] || statusConfig.trial;

                  return (
                    <tr key={student.id} className="border-b border-border/50 hover:bg-accent/50">
                      <td className="py-3 px-4 font-medium">{student.full_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{student.family_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{student.family_phone || '-'}</td>
                      <td className="py-3 px-4 text-sm">{courseNames || 'לא רשום לחוגים'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusStyle.className}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditBranchDialog
        isOpen={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        onSuccess={handleEditSuccess}
        branch={branch}
      />

      <CourseDetailsDialog
        isOpen={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
        course={selectedCourse}
      />
    </AppLayout>
  );
}
