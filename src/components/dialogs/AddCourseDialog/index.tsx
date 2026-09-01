'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { CourseFormData, LessonFormData } from '@/types/course';
import { formatAge, formatCurrency, LESSONS_PER_MONTH } from '@/lib/courseUtils';
import styles from './index.module.css';
import { Branch, Room, Instructor, AddCourseDialogProps } from './types';
import { AGE_OPTIONS, DAYS_OF_WEEK } from './constants';
import { calcEndTime, buildDefaultCourseData, buildDefaultLessonTemplate, buildDuplicateFormState } from './utils';
import { TimePicker } from '@/components/ui/time-picker';
import InstructorSelect from '@/components/InstructorSelect';
import { Skeleton } from '@/components/ui/skeleton';
import StudioBusyWarning, { useStudioBusyConflicts } from '@/components/dialogs/StudioBusyWarning';
import dialogMotion from '@/components/ui/motion.module.css';
import { useDialogExit } from '@/components/ui/motion';

export default function AddCourseDialog({
  courseTypeId,
  open,
  onClose: dismiss,
  onSuccess,
  duplicateFrom = null,
}: AddCourseDialogProps) {
  const { closing, requestClose: onClose } = useDialogExit(dismiss);
  const isDuplicateMode = Boolean(duplicateFrom);

  const [courseData, setCourseData] = useState<CourseFormData>(() =>
    buildDefaultCourseData(courseTypeId)
  );

  const [lessonTemplates, setLessonTemplates] = useState<LessonFormData[]>(() => [
    buildDefaultLessonTemplate(),
  ]);

  const queryClient = useQueryClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseCreated, setCourseCreated] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (duplicateFrom) {
      const built = buildDuplicateFormState(duplicateFrom, courseTypeId);
      setCourseData(built.course);
      setLessonTemplates(built.lessons);
    } else {
      setCourseData(buildDefaultCourseData(courseTypeId));
      setLessonTemplates([buildDefaultLessonTemplate()]);
    }
    setCourseCreated(false);
    setError('');

    if (branches.length === 0) {
      fetchReferenceData();
    }
  }, [open, duplicateFrom, courseTypeId]);

  const updateLessonTemplate = (index: number, patch: Partial<LessonFormData>) => {
    setLessonTemplates((prev) =>
      prev.map((lesson, i) => (i === index ? { ...lesson, ...patch } : lesson))
    );
  };

  const addLessonTemplate = () => {
    setLessonTemplates((prev) => {
      const sharedRoom = prev[0]?.room || '';
      return [...prev, { ...buildDefaultLessonTemplate(), room: sharedRoom }];
    });
  };

  const removeLessonTemplate = (index: number) => {
    setLessonTemplates((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const fetchReferenceData = async () => {
    setLoadingData(true);
    try {
      const [branchesRes, roomsRes, instructorsList] = await Promise.all([
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/', { params: { dropdown: 'true' } }),
        fetchInstructorsDropdown(),
      ]);
      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data?.results || []);
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || []);
      setInstructors(Array.isArray(instructorsList) ? instructorsList : []);
    } catch {
      setError('שגיאה בטעינת נתונים');
    } finally {
      setLoadingData(false);
    }
  };

  const selectedBranch = branches.find((b) => b.id === courseData.branch);

  const filteredRooms = courseData.branch
    ? rooms.filter((room) => room.branch === courseData.branch)
    : [];

  const selectedInstructor = instructors.find((i) => i.id === courseData.instructor);
  const defaultMonthlySalary =
    selectedInstructor?.fixed_salary_per_lesson != null
      ? Number(selectedInstructor.fixed_salary_per_lesson) * LESSONS_PER_MONTH * lessonTemplates.length
      : 0;
  const hasDefaultMonthlySalary = defaultMonthlySalary > 0;

  const handleClose = () => {
    if (courseCreated) {
      onSuccess();
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Course validation
    if (!courseData.name.trim()) {
      setError('שם החוג הוא שדה חובה');
      return;
    }
    if (courseData.price <= 0) {
      setError('מחיר חייב להיות גדול מ-0');
      return;
    }
    if (courseData.max_age < courseData.min_age) {
      setError('גיל מקסימום חייב להיות גדול או שווה לגיל מינימום');
      return;
    }
    if (!courseData.instructor) {
      setError('יש לבחור מדריך');
      return;
    }
    if (courseData.trial_lesson_is_paid && (!courseData.trial_lesson_price || courseData.trial_lesson_price <= 0)) {
      setError('יש להזין מחיר לשיעור ניסיון בתשלום');
      return;
    }

    // Lesson validation
    if (!courseData.branch) { setError('יש לבחור סניף'); return; }
    for (let i = 0; i < lessonTemplates.length; i += 1) {
      const lesson = lessonTemplates[i];
      if (!lesson.room) {
        setError(`יש לבחור סטודיו לשיעור ${i + 1}`);
        return;
      }
      if (lesson.end_time <= lesson.start_time) {
        setError(`שעת סיום חייבת להיות אחרי שעת התחלה (שיעור ${i + 1})`);
        return;
      }
    }
    setLoading(true);
    let createdCount = 0;
    try {
      const courseRes = await api.post('/courses/courses/', {
        ...courseData,
        name: courseData.name.trim(),
        instructor_salary_override: courseData.instructor_salary_override ?? null,
        external_link: selectedBranch?.is_external ? (courseData.external_link || '') : '',
        trial_lesson_price: courseData.trial_lesson_is_paid ? courseData.trial_lesson_price : null,
      });
      const newCourseId = courseRes.data.id;
      createdCount = 1;

      for (const lessonTemplate of lessonTemplates) {
        const lessonSubmitData = {
          ...lessonTemplate,
          course: newCourseId,
          price: null,
          lesson_price_override: null,
          additional_course_prices: [],
          is_recurring: true,
          status: 'scheduled',
        };
        await api.post('/courses/lessons/', lessonSubmitData);
      }

      setCourseCreated(true);
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      onSuccess();
    } catch (err: any) {
      const errorData = err.response?.data;
      const errMsg =
        errorData?.room ||
        errorData?.instructor ||
        errorData?.detail ||
        errorData?.message ||
        (isDuplicateMode ? 'שגיאה בשכפול קבוצה' : 'שגיאה ביצירת חוג');
      if (createdCount > 0) {
        setError(
          `${createdCount} קבוצות נוצרו. השגיאה: ${errMsg}. ניתן לסגור ולבדוק את הרשימה.`
        );
        setCourseCreated(true);
      } else {
        setError(typeof errMsg === 'string' ? errMsg : 'שגיאה ביצירת חוג');
      }
    } finally {
      setLoading(false);
    }
  };

  const studioConflicts = useStudioBusyConflicts({
    open,
    slots: lessonTemplates.map((lesson) => ({
      roomId: lesson.room,
      instructorId: courseData.instructor,
      dayOfWeek: lesson.day_of_week,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
    })),
  });

  if (!open) return null;

  return (
    <div className={`${styles.overlay} ${dialogMotion.overlay} ${closing ? dialogMotion.overlayClosing : ''}`} dir="rtl">
      <div className={`${styles.dialog} ${dialogMotion.panel} ${closing ? dialogMotion.panelClosing : ''}`}>
        <div className={styles.dialogBody}>
          <div className={styles.header}>
            <h2 className={styles.title}>
              {isDuplicateMode ? 'שכפול קבוצה' : 'הוספת חוג חדש'}
            </h2>
            <button onClick={handleClose} className={styles.closeButton}>
              <svg className={styles.iconLg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Name */}
            <div>
              <label htmlFor="name" className={styles.label}>
                שם החוג / רמה <span className={styles.required}>*</span>
              </label>
              <input type="text" id="name" value={courseData.name} onChange={(e) => setCourseData({ ...courseData, name: e.target.value })} className={styles.input} placeholder="לדוגמה: מתחילים, מתקדמים, כיתה א'-ג'" required />
            </div>

            {/* Age Range */}
            <div className={styles.grid2}>
              <div>
                <label htmlFor="min_age" className={styles.label}>
                  גיל מינימום <span className={styles.required}>*</span>
                </label>
                <select id="min_age" value={courseData.min_age} onChange={(e) => setCourseData({ ...courseData, min_age: Number(e.target.value) })} className={styles.select} required>
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={age}>{formatAge(age)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="max_age" className={styles.label}>
                  גיל מקסימום <span className={styles.required}>*</span>
                </label>
                <select id="max_age" value={courseData.max_age} onChange={(e) => setCourseData({ ...courseData, max_age: Number(e.target.value) })} className={styles.select} required>
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={age}>{formatAge(age)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 18+ toggle */}
            <div className={styles.adultToggleRow}>
              <label htmlFor="is_adult" className={styles.adultToggleLabel}>
                <input type="checkbox" id="is_adult" className={styles.adultCheckbox} checked={courseData.is_adult ?? false} onChange={(e) => setCourseData({ ...courseData, is_adult: e.target.checked })} />
                18+
              </label>
            </div>

            {/* Must attend all lessons toggle */}
            <div className={styles.adultToggleRow}>
              <label htmlFor="must_attend_all_lessons" className={styles.adultToggleLabel}>
                <input type="checkbox" id="must_attend_all_lessons" className={styles.adultCheckbox} checked={courseData.must_attend_all_lessons ?? false} onChange={(e) => setCourseData({ ...courseData, must_attend_all_lessons: e.target.checked })} />
                מחוייב בכל השיעורים
              </label>
            </div>

            {/* Paid trial lesson toggle */}
            <div className={styles.adultToggleRow}>
              <label htmlFor="trial_lesson_is_paid" className={styles.adultToggleLabel}>
                <input
                  type="checkbox"
                  id="trial_lesson_is_paid"
                  className={styles.adultCheckbox}
                  checked={courseData.trial_lesson_is_paid ?? false}
                  onChange={(e) => setCourseData({
                    ...courseData,
                    trial_lesson_is_paid: e.target.checked,
                    trial_lesson_price: e.target.checked ? courseData.trial_lesson_price : null,
                  })}
                />
                שיעור ניסיון בתשלום
              </label>
            </div>
            {courseData.trial_lesson_is_paid ? (
              <div>
                <label htmlFor="trial_lesson_price" className={styles.label}>
                  מחיר שיעור ניסיון (₪) <span className={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  id="trial_lesson_price"
                  value={courseData.trial_lesson_price ?? ''}
                  onChange={(e) => setCourseData({
                    ...courseData,
                    trial_lesson_price: e.target.value === '' ? null : Number(e.target.value),
                  })}
                  className={styles.input}
                  placeholder="50"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            ) : null}

            {/* Price and Capacity */}
            <div className={styles.grid2}>
              <div>
                <label htmlFor="price" className={styles.label}>
                  מחיר חודשי (₪) <span className={styles.required}>*</span>
                </label>
                <input type="number" id="price" value={courseData.price || ''} onChange={(e) => setCourseData({ ...courseData, price: Number(e.target.value) })} className={styles.input} placeholder="140" min="0" step="0.01" required />
              </div>
              <div>
                <label htmlFor="capacity" className={styles.label}>
                  קיבולת מקסימלית
                </label>
                <input type="number" id="capacity" value={courseData.capacity} onChange={(e) => setCourseData({ ...courseData, capacity: Number(e.target.value) })} className={styles.input} placeholder="20" min="1" />
              </div>
            </div>

            {/* Branch & Studio */}
            <div className={lessonTemplates.length > 1 ? undefined : styles.grid2}>
              <div>
                <label htmlFor="course_branch" className={styles.label}>
                  סניף <span className={styles.required}>*</span>
                </label>
                {loadingData ? (
                  <Skeleton className="h-[34px] rounded-[3px]" />
                ) : (
                  <select id="course_branch" value={courseData.branch} onChange={(e) => { setCourseData({ ...courseData, branch: e.target.value }); setLessonTemplates((prev) => prev.map((lesson) => ({ ...lesson, room: '' }))); }} className={styles.select} required>
                    <option value="">בחר סניף</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {lessonTemplates.length === 1 && (
              <div>
                <label htmlFor="course_room" className={styles.label}>
                  סטודיו / חדר <span className={styles.required}>*</span>
                </label>
                {loadingData ? (
                  <Skeleton className="h-[34px] rounded-[3px]" />
                ) : (
                  <>
                    <select id="course_room" value={lessonTemplates[0]?.room || ''} onChange={(e) => updateLessonTemplate(0, { room: e.target.value })} className={styles.select} disabled={!courseData.branch} required>
                      <option value="">בחר סטודיו</option>
                      {filteredRooms.map((room) => (
                        <option key={room.id} value={room.id}>{room.name}</option>
                      ))}
                    </select>
                    {!courseData.branch && (
                      <p className={styles.helperText}>יש לבחור סניף קודם</p>
                    )}
                  </>
                )}
              </div>
              )}
            </div>

            {/* External link — shown only when the selected branch is external */}
            {selectedBranch?.is_external && (
              <div>
                <label htmlFor="course_external_link" className={styles.label}>
                  לינק חיצוני לחוג
                </label>
                <input
                  type="url"
                  id="course_external_link"
                  value={courseData.external_link || ''}
                  onChange={(e) => setCourseData({ ...courseData, external_link: e.target.value })}
                  placeholder="https://..."
                  className={styles.input}
                />
                <p className={styles.helperText}>
                  ריק = שימוש בלינק החיצוני של הסניף.
                </p>
              </div>
            )}

            <div className={styles.grid2}>
              <div>
                <label htmlFor="instructor" className={styles.label}>
                  מדריך <span className={styles.required}>*</span>
                </label>
                <InstructorSelect
                  id="instructor"
                  value={courseData.instructor || ''}
                  onChange={(instructor) => setCourseData({ ...courseData, instructor })}
                  instructors={instructors}
                  required
                  className={styles.select}
                  placeholder="בחר מדריך"
                />
              </div>
              <div>
                <label htmlFor="course_salary_override" className={styles.label}>
                  שכר מדריך לקבוצה (₪ לחודש)
                </label>
                <input
                  type="number"
                  id="course_salary_override"
                  value={courseData.instructor_salary_override ?? ''}
                  onChange={(e) =>
                    setCourseData({
                      ...courseData,
                      instructor_salary_override: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className={styles.input}
                  placeholder={
                    hasDefaultMonthlySalary
                      ? `ברירת מחדל: ${formatCurrency(defaultMonthlySalary)}`
                      : 'סכום חודשי למדריך עבור הקבוצה'
                  }
                  min="0"
                  step="0.01"
                />
                {hasDefaultMonthlySalary ? (
                  <p className={styles.helperText}>
                    שכר לפי הגדרות המדריך: {formatCurrency(defaultMonthlySalary)} לחודש. השאר ריק כדי
                    להשתמש בערך זה, או הזן סכום חודשי כדי לדרוס אותו.
                  </p>
                ) : (
                  <p className={styles.helperText}>
                    תשלום חודשי קבוע למדריך עבור הקבוצה. ריק = שכר לפי הגדרות המדריך במסך מדריכים.
                  </p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className={styles.label}>
                תיאור
              </label>
              <textarea id="description" value={courseData.description} onChange={(e) => setCourseData({ ...courseData, description: e.target.value })} rows={3} className={styles.input} placeholder="תיאור אופציונלי של החוג" />
            </div>

            <p className={styles.helperText}>
              מחירים מוזלים — ניתן לערוך אחרי היצירה ב&quot;עריכת קבוצה&quot;.
            </p>

            {/* Lesson fields */}
            <div className={styles.lessonSection}>
                <div className={styles.lessonSectionHeader}>
                  <h3 className={styles.lessonSectionTitle}>
                    {lessonTemplates.length > 1 ? `שיעורים (${lessonTemplates.length})` : 'פרטי השיעור'}
                  </h3>
                  <button
                    type="button"
                    onClick={addLessonTemplate}
                    className={styles.addLessonButton}
                    disabled={loadingData}
                  >
                    <span className={styles.addLessonIcon}>+</span>
                    הוסף שיעור בשבוע
                  </button>
                </div>

                {lessonTemplates.length === 1 && (
                  <p className={styles.helperText}>
                    ניתן להוסיף מספר שיעורים בשבוע לאותה קבוצה (למשל שני ימים שונים).
                  </p>
                )}

                {loadingData ? (
                  <div className="flex flex-col gap-3" aria-busy="true" aria-label="טוען נתונים">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-[34px] rounded-[3px]" />
                    <div className={styles.grid2}>
                      <Skeleton className="h-[34px] rounded-[3px]" />
                      <Skeleton className="h-[34px] rounded-[3px]" />
                    </div>
                  </div>
                ) : (
                  <>
                    {lessonTemplates.map((lessonTemplate, lessonIndex) => (
                      <div key={lessonIndex} className={lessonIndex > 0 ? styles.lessonBlock : undefined}>
                        {lessonTemplates.length > 1 && (
                          <div className={styles.lessonBlockHeader}>
                            <p className={styles.lessonBlockTitle}>שיעור {lessonIndex + 1}</p>
                            <button
                              type="button"
                              onClick={() => removeLessonTemplate(lessonIndex)}
                              className={styles.removeLessonButton}
                              title="הסר שיעור"
                            >
                              <svg className={styles.iconSm} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {lessonTemplates.length > 1 && (
                          <div>
                            <label className={styles.label}>
                              סטודיו / חדר <span className={styles.required}>*</span>
                            </label>
                            <select
                              value={lessonTemplate.room}
                              onChange={(e) => updateLessonTemplate(lessonIndex, { room: e.target.value })}
                              className={styles.select}
                              disabled={!courseData.branch}
                              required
                            >
                              <option value="">בחר סטודיו</option>
                              {filteredRooms.map((room) => (
                                <option key={room.id} value={room.id}>{room.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className={styles.label}>
                            יום בשבוע <span className={styles.required}>*</span>
                          </label>
                          <select
                            value={lessonTemplate.day_of_week}
                            onChange={(e) => updateLessonTemplate(lessonIndex, { day_of_week: Number(e.target.value) })}
                            className={styles.select}
                          >
                            {DAYS_OF_WEEK.map((day) => (
                              <option key={day.value} value={day.value}>{day.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.grid2}>
                          <div>
                            <label className={styles.label}>
                              שעת התחלה <span className={styles.required}>*</span>
                            </label>
                            <TimePicker
                              value={lessonTemplate.start_time}
                              onChange={(start_time) =>
                                updateLessonTemplate(lessonIndex, {
                                  start_time,
                                  end_time: calcEndTime(start_time),
                                })
                              }
                              minuteStep={5}
                              selectClassName={styles.timeSelect}
                            />
                          </div>
                          <div>
                            <label className={styles.label}>
                              שעת סיום <span className={styles.required}>*</span>
                            </label>
                            <TimePicker
                              value={lessonTemplate.end_time}
                              onChange={(end_time) => updateLessonTemplate(lessonIndex, { end_time })}
                              minuteStep={5}
                              selectClassName={styles.timeSelect}
                            />
                            {lessonIndex === 0 && lessonTemplates.length === 1 && (
                              <p className={styles.helperText}>מתעדכן אוטומטית (+45 דקות)</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

            {/* Error Message */}
            {error && (
              <div className={styles.errorBox}>
                <p className={styles.errorText}>{error}</p>
              </div>
            )}
            <StudioBusyWarning conflicts={studioConflicts} />

            {/* Actions */}
            <div className={styles.actions}>
              <button type="button" onClick={handleClose} className={styles.cancelButton} disabled={loading}>
                {courseCreated ? 'סגור ורענן' : 'ביטול'}
              </button>
              {!courseCreated && (
                <button type="submit" className={styles.submitButton} disabled={loading}>
                  {loading
                    ? 'שומר...'
                    : isDuplicateMode
                      ? 'שכפל קבוצה'
                      : lessonTemplates.length > 1
                        ? 'הוסף קבוצה ושיעורים'
                        : 'הוסף קבוצה ושיעור'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
