'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { CourseFormData, LessonFormData } from '@/types/course';
import { formatAge } from '@/lib/courseUtils';
import styles from './index.module.css';
import { Branch, Room, Instructor, AddCourseDialogProps } from './types';
import { AGE_OPTIONS, DAYS_OF_WEEK } from './constants';
import { calcEndTime, buildDefaultCourseData, buildDefaultLessonTemplate, buildDuplicateFormState } from './utils';
import { TimePicker } from '@/components/ui/time-picker';

export default function AddCourseDialog({
  courseTypeId,
  open,
  onClose,
  onSuccess,
  duplicateFrom = null,
}: AddCourseDialogProps) {
  const isDuplicateMode = Boolean(duplicateFrom);

  const [courseData, setCourseData] = useState<CourseFormData>(() =>
    buildDefaultCourseData(courseTypeId)
  );

  const [lessonTemplates, setLessonTemplates] = useState<LessonFormData[]>(() => [
    buildDefaultLessonTemplate(),
  ]);
  const [copyCount, setCopyCount] = useState(1);

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
      setCopyCount(1);
    } else {
      setCourseData(buildDefaultCourseData(courseTypeId));
      setLessonTemplates([buildDefaultLessonTemplate()]);
      setCopyCount(1);
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

  const fetchReferenceData = async () => {
    setLoadingData(true);
    try {
      const [branchesRes, roomsRes, instructorsList] = await Promise.all([
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/'),
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

  const filteredRooms = courseData.branch
    ? rooms.filter((room) => {
        const branchId =
          typeof (room as any).branch === 'string'
            ? (room as any).branch
            : (room as any).branch?.id;
        return branchId === courseData.branch;
      })
    : [];

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
    if (isDuplicateMode && (copyCount < 1 || copyCount > 20)) {
      setError('מספר העותקים חייב להיות בין 1 ל-20');
      return;
    }

    setLoading(true);
    let createdCount = 0;
    try {
      const baseName = courseData.name.trim();

      for (let copyIndex = 0; copyIndex < (isDuplicateMode ? copyCount : 1); copyIndex += 1) {
        const copyName =
          isDuplicateMode && copyCount > 1 && copyIndex > 0
            ? `${baseName} (${copyIndex + 1})`
            : baseName;

        const courseRes = await api.post('/courses/courses/', {
          ...courseData,
          name: copyName,
          instructor_salary_override: courseData.instructor_salary_override ?? null,
        });
        const newCourseId = courseRes.data.id;
        createdCount += 1;

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

  if (!open) return null;

  return (
    <div className={styles.overlay} dir="rtl">
      <div className={styles.dialog}>
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
            {isDuplicateMode && (
              <div>
                <label htmlFor="copy_count" className={styles.label}>
                  מספר עותקים
                </label>
                <input
                  type="number"
                  id="copy_count"
                  value={copyCount}
                  onChange={(e) => setCopyCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className={styles.input}
                  min={1}
                  max={20}
                />
                <p className={styles.helperText}>
                  ניתן ליצור עד 20 קבוצות זהות. עותקים נוספים יקבלו סיומת (2), (3) וכו&apos; לשם.
                </p>
              </div>
            )}

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
                  <div className={styles.loadingText}>טוען נתונים...</div>
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
                  <div className={styles.loadingText}>טוען נתונים...</div>
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

            <div className={styles.grid2}>
              <div>
                <label htmlFor="instructor" className={styles.label}>
                  מדריך <span className={styles.required}>*</span>
                </label>
                <select
                  id="instructor"
                  value={courseData.instructor || ''}
                  onChange={(e) => setCourseData({ ...courseData, instructor: e.target.value })}
                  className={styles.select}
                  required
                >
                  <option value="">בחר מדריך</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.full_name}
                    </option>
                  ))}
                </select>
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
                  placeholder="סכום חודשי למדריך עבור הקבוצה"
                  min="0"
                  step="0.01"
                />
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
                <h3 className={styles.lessonSectionTitle}>
                  {lessonTemplates.length > 1 ? `שיעורים (${lessonTemplates.length})` : 'פרטי השיעור'}
                </h3>

                {loadingData ? (
                  <div className={styles.loadingText}>טוען נתונים...</div>
                ) : (
                  <>
                    {lessonTemplates.map((lessonTemplate, lessonIndex) => (
                      <div key={lessonIndex} className={lessonIndex > 0 ? styles.lessonBlock : undefined}>
                        {lessonTemplates.length > 1 && (
                          <p className={styles.lessonBlockTitle}>שיעור {lessonIndex + 1}</p>
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
                      ? copyCount > 1
                        ? `שכפל ${copyCount} קבוצות`
                        : 'שכפל קבוצה'
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
