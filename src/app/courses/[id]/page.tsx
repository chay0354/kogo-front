'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import {
  CourseTypeDetails,
  CourseWithLessons,
  Lesson,
  AgeFilter,
} from '@/types/course';
import {
  calculateLessonFinancials,
  calculateCourseFinancials,
  calculateCourseTypeFinancials,
  filterCourses,
  formatCurrency,
  formatAgeRange,
  formatTimeRange,
  getDayName,
  getProfitColorClass,
} from '@/lib/courseUtils';
import AddCourseDialog from '@/components/dialogs/AddCourseDialog';
import AddLessonDialog from '@/components/dialogs/AddLessonDialog';
import EditCourseDialog from '@/components/dialogs/EditCourseDialog';
import EditLessonDialog from '@/components/dialogs/EditLessonDialog';

export default function CourseTypeDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const courseTypeId = params.id as string;

  const [courseTypeDetails, setCourseTypeDetails] = useState<CourseTypeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [showAddCourseDialog, setShowAddCourseDialog] = useState(false);
  const [showAddLessonDialog, setShowAddLessonDialog] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedCoursePrice, setSelectedCoursePrice] = useState<number | null>(null);
  
  // Edit/Delete states
  const [showEditCourseDialog, setShowEditCourseDialog] = useState(false);
  const [showEditLessonDialog, setShowEditLessonDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithLessons | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<CourseWithLessons | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);
  const [deleteError, setDeleteError] = useState<string>('');

  // Filters
  const [ageFilter, setAgeFilter] = useState<AgeFilter>({ label: 'הכל' });
  const [profitabilityFilter, setProfitabilityFilter] = useState<'all' | 'profitable' | 'unprofitable'>('all');

  useEffect(() => {
    fetchCourseTypeDetails();
  }, [courseTypeId]);

  const fetchCourseTypeDetails = async () => {
    try {
      const response = await api.get(`/courses/types/${courseTypeId}/details/`);
      const data = response.data;
      // Ensure courses is an array
      if (data && !Array.isArray(data.courses)) {
        data.courses = [];
      }
      setCourseTypeDetails(data);
    } catch (error) {
      console.error('Error fetching course type details:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCourseExpanded = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
    }
    setExpandedCourses(newExpanded);
  };

  const handleAddLesson = (courseId: string, coursePrice?: number | string | null) => {
    setSelectedCourseId(courseId);
    const parsed = coursePrice === null || coursePrice === undefined || coursePrice === ''
      ? null
      : Number(coursePrice);
    setSelectedCoursePrice(Number.isFinite(parsed as number) ? (parsed as number) : null);
    setShowAddLessonDialog(true);
  };

  const handleLessonAdded = () => {
    setShowAddLessonDialog(false);
    fetchCourseTypeDetails();
  };

  const handleCourseAdded = () => {
    setShowAddCourseDialog(false);
    fetchCourseTypeDetails();
  };

  const handleEditCourse = (course: CourseWithLessons) => {
    // Attach course_type from URL params since nested courses don't include it
    const courseWithType = { ...course, course_type: courseTypeId };
    setSelectedCourse(courseWithType as any);
    setShowEditCourseDialog(true);
  };

  const handleCourseUpdated = () => {
    setShowEditCourseDialog(false);
    setSelectedCourse(null);
    fetchCourseTypeDetails();
  };

  const handleDeleteCourse = async (course: CourseWithLessons) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את החוג? פעולה זו אינה ניתנת לביטול.')) {
      return;
    }

    try {
      await api.delete(`/courses/courses/${course.id}/`);
      fetchCourseTypeDetails();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'שגיאה במחיקת החוג';
      alert(errorMsg);
    }
  };

  const handleEditLesson = (
    lesson: Lesson,
    courseId: string,
    coursePrice?: number | string | null
  ) => {
    // Attach course ID to lesson since nested lessons don't include it
    const lessonWithCourse = { ...lesson, course: courseId };
    setSelectedLesson(lessonWithCourse);
    const parsed = coursePrice === null || coursePrice === undefined || coursePrice === ''
      ? null
      : Number(coursePrice);
    setSelectedCoursePrice(Number.isFinite(parsed as number) ? (parsed as number) : null);
    setShowEditLessonDialog(true);
  };

  const handleLessonUpdated = () => {
    setShowEditLessonDialog(false);
    setSelectedLesson(null);
    fetchCourseTypeDetails();
  };

  const handleDeleteLesson = async (lesson: Lesson) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את השיעור? פעולה זו אינה ניתנת לביטול.')) {
      return;
    }

    try {
      await api.delete(`/courses/lessons/${lesson.id}/`);
      fetchCourseTypeDetails();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'שגיאה במחיקת השיעור';
      alert(errorMsg);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div dir="rtl" className="card">
          <p className="text-muted-foreground text-center">טוען נתונים...</p>
        </div>
      </AppLayout>
    );
  }

  if (!courseTypeDetails) {
    return (
      <AppLayout>
        <div dir="rtl" className="card">
          <p className="text-muted-foreground text-center">לא נמצא תחום</p>
        </div>
      </AppLayout>
    );
  }

  // Apply filters
  const filteredCourses = filterCourses(courseTypeDetails.courses, {
    age: ageFilter.minAge !== undefined ? ageFilter : undefined,
    profitability: profitabilityFilter,
  });

  // Calculate financials
  const financials = calculateCourseTypeFinancials(filteredCourses);

  const ageFilterOptions: AgeFilter[] = [
    { label: 'הכל' },
    { label: '1', minAge: 1, maxAge: 1 },
    { label: '2', minAge: 2, maxAge: 2 },
    { label: '3', minAge: 3, maxAge: 3 },
    { label: '4', minAge: 4, maxAge: 4 },
    { label: '5', minAge: 5, maxAge: 5 },
    { label: '6', minAge: 6, maxAge: 6 },
    { label: 'א', minAge: 7, maxAge: 7 },
    { label: 'ב', minAge: 8, maxAge: 8 },
    { label: 'ג', minAge: 9, maxAge: 9 },
    { label: 'ד', minAge: 10, maxAge: 10 },
    { label: 'ה', minAge: 11, maxAge: 11 },
    { label: 'ו', minAge: 12, maxAge: 12 },
    { label: 'ז', minAge: 13, maxAge: 13 },
    { label: 'ח', minAge: 14, maxAge: 14 },
    { label: 'ט', minAge: 15, maxAge: 15 },
    { label: 'י', minAge: 16, maxAge: 16 },
    { label: 'יא', minAge: 17, maxAge: 17 },
    { label: 'יב', minAge: 18, maxAge: 18 },
  ];


  return (
    <AppLayout>
      <div dir="rtl" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">{courseTypeDetails.name}</h1>
          </div>
          <button
            onClick={() => setShowAddCourseDialog(true)}
            className="btn-primary flex items-center gap-2"
          >
            <span>+</span>
            <span>הוסף חוג</span>
          </button>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">סה"כ הכנסות</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(financials.totalRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="card bg-orange-50 border-orange-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">תשלום למדריכים</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(financials.totalSalary)}</p>
              </div>
            </div>
          </div>

          <div className={`card ${financials.totalProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${financials.totalProfit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <svg
                  className={`w-6 h-6 ${financials.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={financials.totalProfit >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">רווח/הפסד</p>
                <p className={`text-2xl font-bold ${getProfitColorClass(financials.totalProfit)}`}>
                  {financials.totalProfit >= 0 ? '' : '-'}{formatCurrency(Math.abs(financials.totalProfit))}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              סינון:
            </span>

            {/* Age Filter */}
            <select
              value={ageFilter.label}
              onChange={(e) => {
                const selected = ageFilterOptions.find((f) => f.label === e.target.value);
                if (selected) setAgeFilter(selected);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {ageFilterOptions.map((option) => (
                <option key={option.label} value={option.label}>
                  גיל: {option.label}
                </option>
              ))}
            </select>

            {/* Profitability Filter */}
            <select
              value={profitabilityFilter}
              onChange={(e) => setProfitabilityFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">הכל</option>
              <option value="profitable">רווחי</option>
              <option value="unprofitable">לא רווחי</option>
            </select>
          </div>
        </div>

        {/* Courses and Lessons */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">חוגים ושיעורים</h2>

          {filteredCourses.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">אין חוגים התואמים לסינון</p>
          ) : (
            <div className="space-y-4">
              {filteredCourses.map((course) => {
                const isExpanded = expandedCourses.has(course.id);
                const courseFinancials = calculateCourseFinancials(course);
                const totalStudents = course.lessons.reduce((sum, l) => sum + (l.total_students_count || l.enrolled_count), 0);

                return (
                  <div key={course.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Course Header */}
                    <div
                      onClick={() => toggleCourseExpanded(course.id)}
                      className="p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <div>
                          <h3 className="font-semibold text-gray-900">{course.name}</h3>
                          <p className="text-sm text-gray-600">
                            {formatAgeRange(course.min_age, course.max_age)} • {formatCurrency(course.price)}/חודש • {totalStudents} תלמידים
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">שיעורים</p>
                          <p className="font-semibold">{course.lessons.length}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">רווח חודשי</p>
                          <p className={`font-semibold ${getProfitColorClass(courseFinancials.monthlyProfit)}`}>
                            {formatCurrency(courseFinancials.monthlyProfit)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleEditCourse(course)}
                            className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                            title="עריכת חוג"
                          >
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="מחיקת חוג"
                          >
                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lessons Table (when expanded) */}
                    {isExpanded && (
                      <div className="p-4">
                        {course.lessons.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4">אין שיעורים בחוג זה</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-right">
                                <th className="pb-2 font-medium text-gray-700">יום ושעה</th>
                                <th className="pb-2 font-medium text-gray-700">סניף</th>
                                <th className="pb-2 font-medium text-gray-700">מדריך</th>
                                <th className="pb-2 font-medium text-gray-700">תלמידים</th>
                                <th className="pb-2 font-medium text-gray-700">מחיר</th>
                                <th className="pb-2 font-medium text-gray-700">הכנסה</th>
                                <th className="pb-2 font-medium text-gray-700">שכר</th>
                                <th className="pb-2 font-medium text-gray-700">רווח/הפסד</th>
                                <th className="pb-2 font-medium text-gray-700 text-center">פעולות</th>
                              </tr>
                            </thead>
                            <tbody>
                              {course.lessons.map((lesson: any) => {
                                const lessonFinancials = calculateLessonFinancials(lesson, course.price);
                                const displayPrice = lesson.price !== null && lesson.price !== undefined ? Number(lesson.price) : Number(course.price);
                                return (
                                  <tr key={lesson.id} className="border-b last:border-b-0">
                                    <td className="py-3">
                                      <div>
                                        <p className="font-medium">
                                          {getDayName(lesson.day_of_week)} {formatTimeRange(lesson.start_time, lesson.end_time)}
                                        </p>
                                      </div>
                                    </td>
                                    <td className="py-3">
                                      <span className="inline-flex items-center gap-1">
                                        <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                        </svg>
                                        {lesson.branch.name}
                                      </span>
                                    </td>
                                    <td className="py-3">{lesson.instructor?.full_name || '—'}</td>
                                    <td className="py-3">{lesson.total_students_count || lesson.enrolled_count}</td>
                                    <td className="py-3 font-medium">
                                      {displayPrice.toFixed(0)}₪
                                    </td>
                                    <td className="py-3 text-green-600 font-medium">
                                      {lessonFinancials.revenue.toFixed(0)}₪
                                    </td>
                                    <td className="py-3 text-orange-600 font-medium">
                                      {lessonFinancials.salary.toFixed(0)}₪
                                    </td>
                                    <td className={`py-3 font-medium ${getProfitColorClass(lessonFinancials.profit)}`}>
                                      {lessonFinancials.profit >= 0 ? '' : '-'}{Math.abs(lessonFinancials.profit).toFixed(0)}₪
                                    </td>
                                    <td className="py-3 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => handleEditLesson(lesson, course.id, course.price)}
                                          className="p-1 hover:bg-blue-50 rounded transition-colors"
                                          title="עריכת שיעור"
                                        >
                                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteLesson(lesson)}
                                          className="p-1 hover:bg-red-50 rounded transition-colors"
                                          title="מחיקת שיעור"
                                        >
                                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}

                        {/* Course Financial Summary */}
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddLesson(course.id, course.price);
                            }}
                            className="btn-secondary text-sm"
                          >
                            + הוסף שיעור
                          </button>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-right">
                              <p className="text-gray-600">סה"כ הכנסות (חודשי)</p>
                              <p className="font-semibold text-green-600">{formatCurrency(courseFinancials.monthlyRevenue)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">סה"כ שכר (חודשי)</p>
                              <p className="font-semibold text-orange-600">{formatCurrency(courseFinancials.monthlySalary)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gray-600">רווח/הפסד (חודשי)</p>
                              <p className={`font-semibold ${getProfitColorClass(courseFinancials.monthlyProfit)}`}>
                                {formatCurrency(courseFinancials.monthlyProfit)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAddCourseDialog && (
        <AddCourseDialog
          courseTypeId={courseTypeId}
          open={showAddCourseDialog}
          onClose={() => setShowAddCourseDialog(false)}
          onSuccess={handleCourseAdded}
        />
      )}

      {showAddLessonDialog && (
        <AddLessonDialog
          courseId={selectedCourseId}
          coursePrice={selectedCoursePrice}
          open={showAddLessonDialog}
          onClose={() => setShowAddLessonDialog(false)}
          onSuccess={handleLessonAdded}
        />
      )}

      {showEditCourseDialog && selectedCourse && (
        <EditCourseDialog
          course={selectedCourse}
          open={showEditCourseDialog}
          onClose={() => {
            setShowEditCourseDialog(false);
            setSelectedCourse(null);
          }}
          onSuccess={handleCourseUpdated}
        />
      )}

      {showEditLessonDialog && selectedLesson && (
        <EditLessonDialog
          lesson={selectedLesson}
          coursePrice={selectedCoursePrice}
          open={showEditLessonDialog}
          onClose={() => {
            setShowEditLessonDialog(false);
            setSelectedLesson(null);
          }}
          onSuccess={handleLessonUpdated}
        />
      )}
    </AppLayout>
  );
}

