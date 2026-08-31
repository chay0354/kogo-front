'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import api from '@/lib/api';
import { CourseTypeDetails, CourseWithLessons, Lesson, AgeFilter, } from '@/types/course';
import { filterCourses, formatCurrency, formatAgeRange, formatTimeRange, getDayName, } from '@/lib/courseUtils';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AddCourseDialog from '@/components/dialogs/AddCourseDialog';
import AddLessonDialog from '@/components/dialogs/AddLessonDialog';
import EditCourseDialog from '@/components/dialogs/EditCourseDialog';
import EditLessonDialog from '@/components/dialogs/EditLessonDialog';
import ManageLessonBundlesDialog from '@/components/dialogs/ManageLessonBundlesDialog';
import ManageLessonPriceOptionsDialog from '@/components/dialogs/ManageLessonPriceOptionsDialog';
import styles from './page.module.css';
import { AGE_FILTER_OPTIONS } from './constants';

export default function CourseTypeDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const courseTypeId = params.id as string;

  const [courseTypeDetails, setCourseTypeDetails] = useState<CourseTypeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [showAddCourseDialog, setShowAddCourseDialog] = useState(false);
  const [showAddLessonDialog, setShowAddLessonDialog] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  // Edit/Delete/Duplicate states
  const [showEditCourseDialog, setShowEditCourseDialog] = useState(false);
  const [showDuplicateCourseDialog, setShowDuplicateCourseDialog] = useState(false);
  const [showEditLessonDialog, setShowEditLessonDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithLessons | null>(null);
  const [courseToDuplicate, setCourseToDuplicate] = useState<CourseWithLessons | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [togglingWidgetId, setTogglingWidgetId] = useState<string | null>(null);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [bundlesCourse, setBundlesCourse] = useState<CourseWithLessons | null>(null);
  const [priceOptionsLesson, setPriceOptionsLesson] = useState<{ lesson: Lesson; course: CourseWithLessons } | null>(null);

  // Lesson detail is no longer nested in the course-type-details response (it made
  // that request take 30+ seconds for course types with 100+ courses) — fetched
  // lazily per course instead, on expand or before opening a per-course dialog.
  const [loadingLessonsFor, setLoadingLessonsFor] = useState<Set<string>>(new Set());
  const loadedLessonsRef = useRef<Set<string>>(new Set());

  // Filters
  const [ageFilter, setAgeFilter] = useState<AgeFilter>({ label: 'הכל' });
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [profitabilityFilter, setProfitabilityFilter] = useState<'all' | 'profitable' | 'unprofitable'>('all');

  useEffect(() => {
    fetchCourseTypeDetails();
  }, [courseTypeId]);

  const fetchCourseTypeDetails = async () => {
    setLoadError(null);
    try {
      const response = await api.get(`/courses/types/${courseTypeId}/details/`);
      const data = response.data;
      if (data && !Array.isArray(data.courses)) {
        data.courses = [];
      }
      // Every course arrives with an empty lessons[] here — that's now fetched
      // lazily (see ensureCourseLessonsLoaded). Reset the cache so any
      // still-expanded course refetches fresh lesson data instead of showing stale.
      loadedLessonsRef.current = new Set();
      setCourseTypeDetails(data);
      expandedCourses.forEach((courseId) => ensureCourseLessonsLoaded(courseId));
    } catch (error: any) {
      console.error('Error fetching course type details:', error);
      if (error?.response?.status === 404) {
        setLoadError('לא נמצא תחום');
      } else if (error?.code === 'ECONNABORTED') {
        setLoadError('הטעינה ארכה זמן רב מדי. נסה לרענן את הדף.');
      } else {
        setLoadError('שגיאה בטעינת הנתונים. נסה לרענן את הדף.');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Fetch one course's lessons (with instructor/enrollment detail) on demand and
   * merge them into local state. Returns the lessons so a caller that needs them
   * immediately (e.g. before opening a dialog) doesn't have to re-read state. */
  const ensureCourseLessonsLoaded = async (courseId: string): Promise<Lesson[]> => {
    if (loadedLessonsRef.current.has(courseId)) {
      return courseTypeDetails?.courses.find((c) => c.id === courseId)?.lessons || [];
    }
    setLoadingLessonsFor((prev) => new Set(prev).add(courseId));
    try {
      const response = await api.get(`/courses/courses/${courseId}/lessons_detail/`);
      const lessons: Lesson[] = response.data;
      loadedLessonsRef.current.add(courseId);
      setCourseTypeDetails((prev) =>
        prev
          ? { ...prev, courses: prev.courses.map((c) => (c.id === courseId ? { ...c, lessons } : c)) }
          : prev,
      );
      return lessons;
    } catch (error) {
      console.error('Error fetching course lessons:', error);
      return [];
    } finally {
      setLoadingLessonsFor((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    }
  };

  const toggleCourseExpanded = (courseId: string) => {
    const newExpanded = new Set(expandedCourses);
    if (newExpanded.has(courseId)) {
      newExpanded.delete(courseId);
    } else {
      newExpanded.add(courseId);
      ensureCourseLessonsLoaded(courseId);
    }
    setExpandedCourses(newExpanded);
  };

  const handleAddLesson = async (courseId: string) => {
    setSelectedCourseId(courseId);
    // Needed for the "default room" lookup in the dialog below (reads
    // courseTypeDetails.courses[...].lessons[0]?.room).
    await ensureCourseLessonsLoaded(courseId);
    setShowAddLessonDialog(true);
  };

  const handleLessonAdded = () => {
    setShowAddLessonDialog(false);
    fetchCourseTypeDetails();
  };

  const handleCourseAdded = () => {
    setShowAddCourseDialog(false);
    setShowDuplicateCourseDialog(false);
    setCourseToDuplicate(null);
    fetchCourseTypeDetails();
  };

  const handleDuplicateCourse = async (course: CourseWithLessons) => {
    // Duplicate mode copies the lesson schedule as templates — needs full lesson data.
    const lessons = await ensureCourseLessonsLoaded(course.id);
    setCourseToDuplicate({ ...course, lessons });
    setShowDuplicateCourseDialog(true);
  };

  const handleEditCourse = async (course: CourseWithLessons) => {
    const lessons = await ensureCourseLessonsLoaded(course.id);
    // Attach course_type from URL params since nested courses don't include it
    const courseWithType = { ...course, lessons, course_type: courseTypeId };
    setSelectedCourse(courseWithType as any);
    setShowEditCourseDialog(true);
  };

  const handleCourseUpdated = () => {
    setShowEditCourseDialog(false);
    setSelectedCourse(null);
    fetchCourseTypeDetails();
  };

  const handleToggleWidgetVisibility = async (course: CourseWithLessons) => {
    const nextVisible = course.show_in_widget === false;
    setTogglingWidgetId(course.id);
    try {
      await api.patch(`/courses/courses/${course.id}/`, { show_in_widget: nextVisible });
      setCourseTypeDetails((prev) =>
        prev
          ? {
              ...prev,
              courses: prev.courses.map((item) =>
                item.id === course.id ? { ...item, show_in_widget: nextVisible } : item,
              ),
            }
          : prev,
      );
    } catch (err: any) {
      alert(err.response?.data?.error || err.response?.data?.detail || 'שגיאה בעדכון התצוגה בווידג׳ט');
    } finally {
      setTogglingWidgetId(null);
    }
  };

  const handleDeleteCourse = async (course: CourseWithLessons) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את החוג? פעולה זו אינה ניתנת לביטול.')) {
      return;
    }
    setDeletingCourseId(course.id);
    try {
      await api.delete(`/courses/courses/${course.id}/`);
      fetchCourseTypeDetails();
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה במחיקת החוג');
    } finally {
      setDeletingCourseId(null);
    }
  };

  const handleEditLesson = (lesson: Lesson, course: CourseWithLessons) => {
    setSelectedLesson({
      ...lesson,
      course: course.id,
      branch: course.branch
        ? { id: String(course.branch), name: course.branch_name || '' }
        : lesson.branch || null,
    });
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
    setDeletingLessonId(lesson.id);
    try {
      await api.delete(`/courses/lessons/${lesson.id}/`);
      fetchCourseTypeDetails();
    } catch (err: any) {
      alert(err.response?.data?.error || 'שגיאה במחיקת השיעור');
    } finally {
      setDeletingLessonId(null);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="card">
          <p className="text-muted-foreground text-center">טוען נתונים...</p>
        </div>
      </AppLayout>
    );
  }

  if (!courseTypeDetails) {
    return (
      <AppLayout>
        <div className="card">
          <p className="text-muted-foreground text-center">{loadError || 'לא נמצא תחום'}</p>
        </div>
      </AppLayout>
    );
  }

  const branchById = new Map<string, string>();
  for (const course of courseTypeDetails.courses) {
    if (course.branch && course.branch_name) {
      branchById.set(String(course.branch), course.branch_name);
    }
  }
  const branchOptions = Array.from(branchById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  // Profitability is filtered separately below (not passed into filterCourses) —
  // it needs the backend-computed monthly_profit field, since course.lessons is
  // no longer eagerly loaded for every course (see ensureCourseLessonsLoaded).
  const filteredCourses = filterCourses(courseTypeDetails.courses, {
    age: ageFilter.minAge !== undefined ? ageFilter : undefined,
    branchId: branchFilter === 'all' ? undefined : branchFilter,
  }).filter((course) => {
    if (profitabilityFilter === 'all') return true;
    const profitable = course.monthly_profit > 0;
    return profitabilityFilter === 'profitable' ? profitable : !profitable;
  });

  const financials = filteredCourses.reduce(
    (acc, course) => ({
      totalRevenue: acc.totalRevenue + (course.monthly_revenue || 0),
      totalSalary: acc.totalSalary + (course.monthly_salary || 0),
      totalProfit: acc.totalProfit + (course.monthly_profit || 0),
    }),
    { totalRevenue: 0, totalSalary: 0, totalProfit: 0 },
  );


  return (
    <AppLayout>
      <div className={styles.page}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button onClick={() => router.back()} className={styles.backButton}>
              <svg className={styles.backIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className={styles.pageTitle}>{courseTypeDetails.name}</h1>
          </div>
          <button
            onClick={() => setShowAddCourseDialog(true)}
            className={`btn-primary ${styles.addCourseButton}`}
          >
            <span>+</span>
            <span>הוסף קבוצה</span>
          </button>
        </div>

        {/* Financial Summary Cards */}
        <div className={styles.financialGrid}>
          <div className={`card ${styles.financialCardGreen}`}>
            <div className={styles.financialCardInner}>
              <div className={`${styles.financialIconWrap} ${styles.financialIconWrapGreen}`}>
                <svg className={`${styles.financialIcon} ${styles.financialIconGreen}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className={styles.financialLabel}>סה"כ הכנסות</p>
                <p className={`${styles.financialValue} ${styles.financialValueGreen}`}>{formatCurrency(financials.totalRevenue)}</p>
              </div>
            </div>
          </div>

          <div className={`card ${styles.financialCardOrange}`}>
            <div className={styles.financialCardInner}>
              <div className={`${styles.financialIconWrap} ${styles.financialIconWrapOrange}`}>
                <svg className={`${styles.financialIcon} ${styles.financialIconOrange}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className={styles.financialLabel}>תשלום למדריכים</p>
                <p className={`${styles.financialValue} ${styles.financialValueOrange}`}>{formatCurrency(financials.totalSalary)}</p>
              </div>
            </div>
          </div>

          <div className={`card ${financials.totalProfit >= 0 ? styles.financialCardGreen : styles.financialCardRed}`}>
            <div className={styles.financialCardInner}>
              <div className={`${styles.financialIconWrap} ${financials.totalProfit >= 0 ? styles.financialIconWrapGreen : styles.financialIconWrapRed}`}>
                <svg
                  className={`${styles.financialIcon} ${financials.totalProfit >= 0 ? styles.profit : styles.loss}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={financials.totalProfit >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
                </svg>
              </div>
              <div>
                <p className={styles.financialLabel}>רווח/הפסד</p>
                <p className={`${styles.financialValue} ${financials.totalProfit >= 0 ? styles.profit : styles.loss}`}>
                  {financials.totalProfit >= 0 ? '' : '-'}{formatCurrency(Math.abs(financials.totalProfit))}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className={styles.filtersRow}>
            <span className={styles.filtersLabel}>
              <svg className={styles.filtersIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              סינון:
            </span>

            <select
              value={ageFilter.label}
              onChange={(e) => {
                const selected = AGE_FILTER_OPTIONS.find((f) => f.label === e.target.value);
                if (selected) setAgeFilter(selected);
              }}
              className={styles.filterSelect}
            >
              {AGE_FILTER_OPTIONS.map((option) => (
                <option key={option.label} value={option.label}>
                  גיל: {option.label}
                </option>
              ))}
            </select>

            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">סניף: הכל</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  סניף: {branch.name}
                </option>
              ))}
            </select>

            <select
              value={profitabilityFilter}
              onChange={(e) => setProfitabilityFilter(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="all">הכל</option>
              <option value="profitable">רווחי</option>
              <option value="unprofitable">לא רווחי</option>
            </select>
          </div>
        </div>

        {/* Courses and Lessons */}
        <div className="card">
          <h2 className={styles.sectionTitle}>קבוצות</h2>

          {filteredCourses.length === 0 ? (
            <p className={`text-muted-foreground ${styles.emptyState}`}>אין חוגים התואמים לסינון</p>
          ) : (
            <div className={styles.courseList}>
              {filteredCourses.map((course) => {
                const isExpanded = expandedCourses.has(course.id);
                const isLoadingLessons = loadingLessonsFor.has(course.id);
                const courseFinancials = {
                  monthlyRevenue: course.monthly_revenue || 0,
                  monthlySalary: course.monthly_salary || 0,
                  monthlyProfit: course.monthly_profit || 0,
                };
                const courseStudentCount = course.course_enrollment_count ?? 0;
                const capacity = course.capacity || 0;
                const studentsDisplay = capacity > 0 ? `${courseStudentCount}/${capacity}` : String(courseStudentCount);
                const enrollmentDisplay = studentsDisplay;

                return (
                  <div
                    key={course.id}
                    className={`${styles.courseCard}${course.show_in_widget === false ? ` ${styles.courseCardHidden}` : ''}`}
                  >
                    <div
                      onClick={() => toggleCourseExpanded(course.id)}
                      className={styles.courseCardHeader}
                    >
                      <div className={styles.courseTitleRow}>
                        <svg
                          className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <div className={styles.courseNameGroup}>
                          <span className={styles.courseName}>{course.name}</span>
                          <GroupIdBadge displayId={course.display_id} />
                          {course.must_attend_all_lessons && (
                            <span className={styles.mustAttendBadge}>מחוייב בכל השיעורים</span>
                          )}
                          {course.show_in_widget === false && (
                            <span className={styles.hiddenFromWidgetBadge}>מוסתר מהווידג׳ט</span>
                          )}
                        </div>
                        <div className={styles.courseActions} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleWidgetVisibility(course)}
                            className={`${styles.actionButton} ${styles.hideWidgetButton}`}
                            title={course.show_in_widget === false ? 'הצג בווידג׳ט' : 'הסתר מהווידג׳ט'}
                            disabled={togglingWidgetId === course.id}
                          >
                            {togglingWidgetId === course.id ? (
                              <Loader2 className={styles.hideWidgetIconSpinning} />
                            ) : course.show_in_widget === false ? (
                              <Eye className={styles.hideWidgetIcon} />
                            ) : (
                              <EyeOff className={styles.hideWidgetIcon} />
                            )}
                          </button>
                          <button
                            onClick={() => handleEditCourse(course)}
                            className={`${styles.actionButton} ${styles.editButton}`}
                            title="עריכת קבוצה"
                          >
                            <svg className={styles.editIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDuplicateCourse(course)}
                            className={`${styles.actionButton} ${styles.duplicateButton}`}
                            title="שכפול קבוצה"
                          >
                            <svg className={styles.duplicateIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course)}
                            className={`${styles.actionButton} ${styles.deleteButton}`}
                            title="מחיקת חוג"
                            disabled={deletingCourseId === course.id}
                          >
                            {deletingCourseId === course.id ? (
                              <Loader2 className={styles.deleteIconSpinning} />
                            ) : (
                              <svg className={styles.deleteIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className={styles.courseStatsGrid}>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>סניף</span>
                          <span className={styles.statText}>{course.branch_name || '—'}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>גילאים</span>
                          <span className={styles.statText}>{formatAgeRange(course.min_age, course.max_age)}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>מחיר</span>
                          <span className={styles.statText}>{formatCurrency(course.price)}/חודש</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>מדריך</span>
                          <span className={styles.statText}>{course.instructor?.full_name || '—'}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>שכר מדריך</span>
                          <span className={styles.statText}>
                            {course.instructor_salary_override != null
                              ? `${formatCurrency(Number(course.instructor_salary_override))}/חודש`
                              : '—'}
                          </span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>תלמידים</span>
                          <span className={styles.statText}>{studentsDisplay}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>שיעורים</span>
                          <span className={styles.statText}>{course.lessons_count}</span>
                        </div>
                        <div className={styles.statItem}>
                          <span className={styles.statLabel}>רווח</span>
                          <span className={`${styles.statText} ${courseFinancials.monthlyProfit >= 0 ? styles.profit : styles.loss}`}>
                            {formatCurrency(courseFinancials.monthlyProfit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={styles.lessonsBody}>
                        {isLoadingLessons ? (
                          <p className={`text-muted-foreground ${styles.lessonsEmptyState}`}>טוען שיעורים...</p>
                        ) : course.lessons.length === 0 ? (
                          <p className={`text-muted-foreground ${styles.lessonsEmptyState}`}>אין שיעורים בחוג זה</p>
                        ) : (
                          <div className={styles.lessonsTableWrap}>
                            <table className={styles.lessonsTable}>
                              <thead>
                                <tr className={styles.tableHeadRow}>
                                  <th className={styles.th}>יום ושעה</th>
                                  <th className={styles.th}>נרשמים</th>
                                  <th className={`${styles.th} ${styles.thCenter}`}>פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {course.lessons.map((lesson: any) => (
                                  <tr key={lesson.id} className={styles.tableRow}>
                                    <td className={`${styles.td} ${styles.tdBold}`}>
                                      {getDayName(lesson.day_of_week)} {formatTimeRange(lesson.start_time, lesson.end_time)}
                                      {lesson.instructor?.full_name && (
                                        <div className={styles.lessonInstructor}>{lesson.instructor.full_name}</div>
                                      )}
                                      {lesson.room?.name && (
                                        <div className={styles.lessonInstructor}>{lesson.room.name}</div>
                                      )}
                                    </td>
                                    <td className={styles.td}>{enrollmentDisplay}</td>
                                    <td className={`${styles.td} ${styles.tdCenter}`}>
                                      <div className={styles.lessonActionButtons}>
                                        <button
                                          onClick={() => setPriceOptionsLesson({ lesson, course })}
                                          className={`${styles.lessonActionButton} ${styles.editButton}`}
                                          title="מחירים נוספים"
                                        >
                                          ₪
                                        </button>
                                        <button
                                          onClick={() => handleEditLesson(lesson, course)}
                                          className={`${styles.lessonActionButton} ${styles.editButton}`}
                                          title="עריכת שיעור"
                                        >
                                          <svg className={styles.editIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() => handleDeleteLesson(lesson)}
                                          className={`${styles.lessonActionButton} ${styles.deleteButton}`}
                                          title="מחיקת שיעור"
                                          disabled={deletingLessonId === lesson.id}
                                        >
                                          {deletingLessonId === lesson.id ? (
                                            <Loader2 className={styles.deleteIconSpinning} />
                                          ) : (
                                            <svg className={styles.deleteIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className={styles.courseFooter}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddLesson(course.id);
                            }}
                            className={`btn-secondary ${styles.addLessonButton}`}
                          >
                            + הוסף שיעור
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const lessons = await ensureCourseLessonsLoaded(course.id);
                              setBundlesCourse({ ...course, lessons });
                            }}
                            className={`btn-secondary ${styles.addLessonButton}`}
                          >
                            מסלולים משולבים
                          </button>
                          <div className={styles.courseFooterStats}>
                            <span>מחיר חודשי: <span className={styles.statValue}>{formatCurrency(Number(course.price))}</span></span>
                            <span>הכנסות: <span className={styles.statRevenue}>{formatCurrency(courseFinancials.monthlyRevenue)}</span></span>
                            <span>שכר: <span className={styles.statSalary}>{formatCurrency(courseFinancials.monthlySalary)}</span></span>
                            <span>רווח: <span className={`${styles.statValue} ${courseFinancials.monthlyProfit >= 0 ? styles.profit : styles.loss}`}>{formatCurrency(courseFinancials.monthlyProfit)}</span></span>
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
      {showAddCourseDialog && <AddCourseDialog courseTypeId={courseTypeId} open onClose={() => setShowAddCourseDialog(false)} onSuccess={handleCourseAdded} />}
      {showDuplicateCourseDialog && courseToDuplicate && (
        <AddCourseDialog
          courseTypeId={courseTypeId}
          duplicateFrom={courseToDuplicate}
          open
          onClose={() => {
            setShowDuplicateCourseDialog(false);
            setCourseToDuplicate(null);
          }}
          onSuccess={handleCourseAdded}
        />
      )}
      {showAddLessonDialog && (
        <AddLessonDialog
          courseId={selectedCourseId}
          branchId={(() => {
            const c = courseTypeDetails?.courses.find((c) => c.id === selectedCourseId);
            return typeof c?.branch === 'string' ? c.branch : undefined;
          })()}
          teamRoomId={
            courseTypeDetails?.courses.find((c) => c.id === selectedCourseId)?.lessons?.[0]?.room?.id
          }
          open
          onClose={() => setShowAddLessonDialog(false)}
          onSuccess={handleLessonAdded}
        />
      )}
      {showEditCourseDialog && selectedCourse && <EditCourseDialog course={selectedCourse} open onClose={() => { setShowEditCourseDialog(false); setSelectedCourse(null); }} onSuccess={handleCourseUpdated} />}

      {bundlesCourse && (
        <ManageLessonBundlesDialog
          isOpen={!!bundlesCourse}
          onClose={() => setBundlesCourse(null)}
          courseId={bundlesCourse.id}
          courseName={bundlesCourse.name}
          courseDisplayId={bundlesCourse.display_id}
          lessons={bundlesCourse.lessons}
          branchId={typeof bundlesCourse.branch === 'string' ? bundlesCourse.branch : undefined}
          onSaved={fetchCourseTypeDetails}
        />
      )}
      {priceOptionsLesson && (
        <ManageLessonPriceOptionsDialog
          isOpen={!!priceOptionsLesson}
          onClose={() => setPriceOptionsLesson(null)}
          lessonId={priceOptionsLesson.lesson.id}
          lessonLabel={`${getDayName(priceOptionsLesson.lesson.day_of_week)} ${formatTimeRange(priceOptionsLesson.lesson.start_time, priceOptionsLesson.lesson.end_time)}`}
          courseName={priceOptionsLesson.course.name}
          defaultPrice={Number(priceOptionsLesson.course.price)}
          onSaved={fetchCourseTypeDetails}
        />
      )}
      {showEditLessonDialog && selectedLesson && (
        <EditLessonDialog
          lesson={selectedLesson}
          open
          onClose={() => { setShowEditLessonDialog(false); setSelectedLesson(null); }}
          onSuccess={handleLessonUpdated}
        />
      )}
    </AppLayout>
  );
}
