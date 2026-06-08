'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { CourseFormData, LessonFormData } from '@/types/course';
import { formatAge } from '@/lib/courseUtils';
import styles from './index.module.css';
import { Branch, Room, Instructor, AddCourseDialogProps } from './types';
import { AGE_OPTIONS, DAYS_OF_WEEK } from './constants';
import { calcEndTime } from './utils';

export default function AddCourseDialog({
  courseTypeId,
  open,
  onClose,
  onSuccess,
}: AddCourseDialogProps) {
  const [courseData, setCourseData] = useState<CourseFormData>({
    course_type: courseTypeId,
    name: '',
    description: '',
    price: 0,
    capacity: 20,
    branch: '',
    min_age: 6,
    max_age: 18,
    instructor: '',
    instructor_salary_override: undefined,
  });

  const [lessonData, setLessonData] = useState<LessonFormData>({
    course: '',
    room: '',
    day_of_week: 0,
    start_time: '16:00',
    end_time: '16:45',
    price: undefined,
    lesson_price_override: undefined,
    max_students: undefined,
    notes: '',
  });

  const queryClient = useQueryClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courseCreated, setCourseCreated] = useState(false);

  useEffect(() => {
    if (open && branches.length === 0) {
      fetchReferenceData();
    }
  }, [open]);

  // Auto-calculate end time (+45 min) on start time change
  useEffect(() => {
    if (lessonData.start_time) {
      setLessonData((prev) => ({ ...prev, end_time: calcEndTime(prev.start_time) }));
    }
  }, [lessonData.start_time]);

  const fetchReferenceData = async () => {
    setLoadingData(true);
    try {
      const [branchesRes, roomsRes, instructorsRes] = await Promise.all([
        api.get('/core/branches/?simple=true'),
        api.get('/core/rooms/'),
        api.get('/instructors/'),
      ]);
      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : branchesRes.data?.results || []);
      setRooms(Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data?.results || []);
      const instructorsRaw = instructorsRes.data;
      setInstructors(
        Array.isArray(instructorsRaw)
          ? instructorsRaw
          : instructorsRaw?.instructors || instructorsRaw?.results || []
      );
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
    if (!lessonData.room) { setError('יש לבחור סטודיו'); return; }
    if (lessonData.end_time <= lessonData.start_time) {
      setError('שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }

    setLoading(true);
    try {
      // Step 1: create the course
      const courseRes = await api.post('/courses/courses/', {
        ...courseData,
        instructor_salary_override: courseData.instructor_salary_override ?? null,
      });
      const newCourseId = courseRes.data.id;

      // Step 2: create the lesson assigned to the new course
      setCourseCreated(true);
      try {
        const lessonSubmitData = {
          ...lessonData,
          course: newCourseId,
          price: null,
          lesson_price_override: null,
          additional_course_prices: [],
          max_students: lessonData.max_students || null,
          is_recurring: true,
          status: 'scheduled',
        };

        await api.post('/courses/lessons/', lessonSubmitData);
        await queryClient.invalidateQueries({ queryKey: ['courses'] });
        onSuccess();
      } catch (lessonErr: any) {
        const errorData = lessonErr.response?.data;
        const lessonErrMsg =
          errorData?.room ||
          errorData?.instructor ||
          errorData?.detail ||
          errorData?.message ||
          'שגיאה ביצירת שיעור';
        setError(
          `החוג נוצר בהצלחה. השיעור לא נוצר: ${lessonErrMsg}. ניתן לסגור ולהוסיף שיעור ידנית.`
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה ביצירת חוג');
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
            <h2 className={styles.title}>הוספת חוג חדש<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #3</span></h2>
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

            {/* Branch */}
            <div>
              <label htmlFor="course_branch" className={styles.label}>
                סניף <span className={styles.required}>*</span>
              </label>
              {loadingData ? (
                <div className={styles.loadingText}>טוען נתונים...</div>
              ) : (
                <select id="course_branch" value={courseData.branch} onChange={(e) => { setCourseData({ ...courseData, branch: e.target.value }); setLessonData((prev) => ({ ...prev, room: '' })); }} className={styles.select} required>
                  <option value="">בחר סניף</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
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
                  שכר חריג (₪)
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
                  placeholder="השאר ריק לשכר רגיל"
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
                <h3 className={styles.lessonSectionTitle}>פרטי השיעור</h3>

                {loadingData ? (
                  <div className={styles.loadingText}>טוען נתונים...</div>
                ) : (
                  <>
                    {/* Day of Week */}
                    <div>
                      <label htmlFor="day_of_week" className={styles.label}>
                        יום בשבוע <span className={styles.required}>*</span>
                      </label>
                      <select id="day_of_week" value={lessonData.day_of_week} onChange={(e) => setLessonData({ ...lessonData, day_of_week: Number(e.target.value) })} className={styles.select}>
                        {DAYS_OF_WEEK.map((day) => (
                          <option key={day.value} value={day.value}>{day.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Time Range */}
                    <div className={styles.grid2}>
                      <div>
                        <label htmlFor="start_time" className={styles.label}>
                          שעת התחלה <span className={styles.required}>*</span>
                        </label>
                        <input type="time" id="start_time" value={lessonData.start_time} onChange={(e) => setLessonData({ ...lessonData, start_time: e.target.value })} className={styles.input} required />
                      </div>
                      <div>
                        <label htmlFor="end_time" className={styles.label}>
                          שעת סיום <span className={styles.required}>*</span>
                        </label>
                        <input type="time" id="end_time" value={lessonData.end_time} onChange={(e) => setLessonData({ ...lessonData, end_time: e.target.value })} className={styles.input} required />
                        <p className={styles.helperText}>מתעדכן אוטומטית (+45 דקות)</p>
                      </div>
                    </div>

                    {/* Room */}
                    <div>
                      <label htmlFor="lesson_room" className={styles.label}>
                        סטודיו / חדר <span className={styles.required}>*</span>
                      </label>
                      <select id="lesson_room" value={lessonData.room} onChange={(e) => setLessonData({ ...lessonData, room: e.target.value })} className={styles.select} disabled={!courseData.branch} required>
                        <option value="">בחר סטודיו</option>
                        {filteredRooms.map((room) => (
                          <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                      </select>
                      {!courseData.branch && (
                        <p className={styles.helperText}>יש לבחור סניף קודם</p>
                      )}
                    </div>

                    {/* Max Students */}
                    <div>
                      <label htmlFor="lesson_max_students" className={styles.label}>
                        מקסימום תלמידים
                      </label>
                      <input type="number" id="lesson_max_students" value={lessonData.max_students ?? ''} onChange={(e) => setLessonData({ ...lessonData, max_students: e.target.value ? Number(e.target.value) : undefined })} className={styles.input} placeholder="השאר ריק לשימוש בקיבולת החדר" min="1" step="1" />
                    </div>
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
                  {loading ? 'שומר...' : 'הוסף קבוצה ושיעור'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
