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
  calculateCourseFinancials,
  calculateCourseTypeFinancials,
  filterCourses,
  formatCurrency,
  formatAgeRange,
  formatTimeRange,
  getDayName,
} from '@/lib/courseUtils';
import AddCourseDialog from '@/components/dialogs/AddCourseDialog';
import AddLessonDialog from '@/components/dialogs/AddLessonDialog';
import EditCourseDialog from '@/components/dialogs/EditCourseDialog';
import EditLessonDialog from '@/components/dialogs/EditLessonDialog';
import styles from './page.module.css';
import { AGE_FILTER_OPTIONS } from './constants';

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

  // Edit/Delete states
  const [showEditCourseDialog, setShowEditCourseDialog] = useState(false);
  const [showEditLessonDialog, setShowEditLessonDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithLessons | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

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

  const handleAddLesson = (courseId: string) => {
    setSelectedCourseId(courseId);
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
      alert(err.response?.data?.error || 'שגיאה במחיקת החוג');
    }
  };

  const handleEditLesson = (lesson: Lesson, courseId: string) => {
    // Attach course ID to lesson since nested lessons don't include it
    const lessonWithCourse = { ...lesson, course: courseId };
    setSelectedLesson(lessonWithCourse);
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
      alert(err.response?.data?.error || 'שגיאה במחיקת השיעור');
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
          <p className="text-muted-foreground text-center">לא נמצא תחום</p>
        </div>
      </AppLayout>
    );
  }

  const filteredCourses = filterCourses(courseTypeDetails.courses, {
    age: ageFilter.minAge !== undefined ? ageFilter : undefined,
    profitability: profitabilityFilter,
  });

  const financials = calculateCourseTypeFinancials(filteredCourses);


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
                const courseFinancials = calculateCourseFinancials(course);
                const totalStudents = course.lessons.reduce((sum, l) => sum + (l.total_students_count || l.enrolled_count), 0);

                return (
                  <div key={course.id} className={styles.courseRow}>

                    {/* Course Header */}
                    <div onClick={() => toggleCourseExpanded(course.id)} className={styles.courseHeader}>
                      <svg
                        className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>

                      <span className={styles.courseName}>{course.name}</span>
                      {course.branch_name && (
                        <span className={styles.courseMeta}>{course.branch_name}</span>
                      )}
                      <span className={styles.courseMeta}>{formatAgeRange(course.min_age, course.max_age)}</span>
                      <span className={styles.courseMeta}>{formatCurrency(course.price)}/חודש</span>
                      {course.instructor?.full_name && (
                        <span className={styles.courseMeta}>מדריך: {course.instructor.full_name}</span>
                      )}
                      <span className={styles.courseMeta}>
                        <span className={styles.courseMetaNumber}>{totalStudents}</span> תלמידים
                      </span>
                      <span className={styles.courseMeta}>
                        <span className={styles.courseMetaNumber}>{course.lessons.length}</span> שיעורים
                      </span>
                      <span className={`${styles.courseProfit} ${courseFinancials.monthlyProfit >= 0 ? styles.profit : styles.loss}`}>
                        רווח: {formatCurrency(courseFinancials.monthlyProfit)}
                      </span>

                      <div className={styles.courseActions} onClick={(e) => e.stopPropagation()}>
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
                          onClick={() => handleDeleteCourse(course)}
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          title="מחיקת חוג"
                        >
                          <svg className={styles.deleteIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Lessons Table (when expanded) */}
                    {isExpanded && (
                      <div className={styles.lessonsBody}>
                        {course.lessons.length === 0 ? (
                          <p className={`text-muted-foreground ${styles.lessonsEmptyState}`}>אין שיעורים בחוג זה</p>
                        ) : (
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
                                    </td>
                                    <td className={styles.td}>{lesson.total_students_count || lesson.enrolled_count}</td>
                                    <td className={`${styles.td} ${styles.tdCenter}`}>
                                      <div className={styles.lessonActionButtons}>
                                        <button
                                          onClick={() => handleEditLesson(lesson, course.id)}
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
                                        >
                                          <svg className={styles.deleteIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* Course Financial Summary */}
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
      {showAddLessonDialog && <AddLessonDialog courseId={selectedCourseId} open onClose={() => setShowAddLessonDialog(false)} onSuccess={handleLessonAdded} />}
      {showEditCourseDialog && selectedCourse && <EditCourseDialog course={selectedCourse} open onClose={() => { setShowEditCourseDialog(false); setSelectedCourse(null); }} onSuccess={handleCourseUpdated} />}
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
