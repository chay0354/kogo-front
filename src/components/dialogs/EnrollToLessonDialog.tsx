'use client';

import { useState, useEffect } from 'react';
import { ChildWithDetails } from '@/types/customer';
import { X } from 'lucide-react';
import api from '@/lib/api';
import SubscriptionPaymentDialog from './SubscriptionPaymentDialog';

interface EnrollToLessonDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onEnroll: () => void;
}

interface CourseType {
  id: string;
  name: string;
}

interface Course {
  id: string;
  name: string;
  course_type: string;
  branch_name: string;
  price: string | null;
  capacity?: number | null;
  enrolled_students_count?: number | null;
}

interface Lesson {
  id: string;
  course: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  branch_name: string;
  instructor_name: string | null;
  price: string | null;
  lesson_price_override?: string | number | null;
  additional_course_prices?: Array<{ course_index: number | string; price: number | string }>;
  enrolled_students_count?: number | null;
  room_capacity?: number | null;
  max_students?: number | null;
}

interface Bundle {
  id: string;
  name: string;
  combined_price: number | string;
  is_active: boolean;
  lessons_detail: Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>;
}

const FULL_SUBSCRIPTION_MODE = 'full';

const BILLING_ENROLLMENT_STATUSES = new Set(['active', 'payments_problem']);

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const computeSeatsLeft = (capacity: number | null | undefined, enrolled: number | null | undefined) => {
  if (capacity == null) return null;
  const used = typeof enrolled === 'number' ? enrolled : 0;
  return Math.max(0, capacity - used);
};

const courseSeatsLeft = (course: Course) =>
  computeSeatsLeft(course.capacity, course.enrolled_students_count);

const formatSeatsSuffix = (seats: number | null) => {
  if (seats == null) return '';
  if (seats <= 0) return ' — מלא';
  return ` — נותרו ${seats} מקומות`;
};

const lessonSeatsLeft = (lesson: Lesson) => {
  const caps = [lesson.max_students, lesson.room_capacity].filter(
    (v): v is number => typeof v === 'number'
  );
  const capacity = caps.length ? Math.min(...caps) : null;
  return computeSeatsLeft(capacity, lesson.enrolled_students_count);
};

const formatLessonSchedule = (lesson: Pick<Lesson, 'day_of_week' | 'start_time' | 'end_time'>) =>
  `${DAY_NAMES[lesson.day_of_week]} ${lesson.start_time.slice(0, 5)} - ${lesson.end_time.slice(0, 5)}`;

export default function EnrollToLessonDialog({ child, isOpen, onClose, onEnroll }: EnrollToLessonDialogProps) {
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedTrialLesson, setSelectedTrialLesson] = useState('');
  const [trialPickerOpen, setTrialPickerOpen] = useState(false);
  const [registrationMode, setRegistrationMode] = useState(FULL_SUBSCRIPTION_MODE);

  const [loading, setLoading] = useState(false);
  const [loadingCourseTypes, setLoadingCourseTypes] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCourseTypes();
      setTrialPickerOpen(false);
      setSelectedTrialLesson('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCourseType) {
      loadCourses(selectedCourseType);
      setSelectedCourse('');
      setLessons([]);
      setTrialPickerOpen(false);
      setSelectedTrialLesson('');
    }
  }, [selectedCourseType]);

  useEffect(() => {
    if (selectedCourse) {
      loadLessons(selectedCourse);
      loadBundles(selectedCourse);
      setTrialPickerOpen(false);
      setSelectedTrialLesson('');
      setRegistrationMode(FULL_SUBSCRIPTION_MODE);
    } else {
      setLessons([]);
      setBundles([]);
    }
  }, [selectedCourse]);

  const loadCourseTypes = async () => {
    setLoadingCourseTypes(true);
    try {
      const response = await api.get('/courses/types/');
      setCourseTypes(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error loading course types:', error);
      alert('שגיאה בטעינת התחומים');
    } finally {
      setLoadingCourseTypes(false);
    }
  };

  const loadCourses = async (courseTypeId: string) => {
    setLoadingCourses(true);
    try {
      const response = await api.get(`/courses/courses/?course_type=${courseTypeId}`);
      setCourses(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error loading courses:', error);
      alert('שגיאה בטעינת הקבוצות');
    } finally {
      setLoadingCourses(false);
    }
  };

  const loadLessons = async (courseId: string) => {
    setLoadingLessons(true);
    try {
      const response = await api.get(`/courses/lessons/?course=${courseId}`);
      setLessons(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error loading lessons:', error);
      setLessons([]);
    } finally {
      setLoadingLessons(false);
    }
  };

  const loadBundles = async (courseId: string) => {
    try {
      const response = await api.get(`/courses/bundles/?course=${courseId}&is_active=true`);
      setBundles(response.data.results || response.data || []);
    } catch (error) {
      console.error('Error loading lesson bundles:', error);
      setBundles([]);
    }
  };

  const enrollInLessons = async (
    targetLessonList: Lesson[],
    options?: { trial?: boolean; skipLessonIds?: string[]; bundleId?: string }
  ) => {
    const targetLessons = targetLessonList.filter(
      (lesson) => !options?.skipLessonIds?.includes(lesson.id)
    );

    if (targetLessons.length === 0 && targetLessonList.length === 0) {
      throw new Error('לקבוצה זו אין שיעורים — הוסף שיעור לפני רישום');
    }

    let firstResponse = null;
    for (let index = 0; index < targetLessons.length; index += 1) {
      const lesson = targetLessons[index];
      try {
        const res = await api.post('/enrollments/lesson-enrollments/', {
          lesson: lesson.id,
          child: child.id,
          status: 'active',
          ...(options?.bundleId ? { bundle: options.bundleId } : {}),
          ...(options?.trial && index === 0 ? { trial_registration: true } : {}),
        });
        if (index === 0) firstResponse = res;
      } catch (error: any) {
        const msg = error.response?.data?.lesson || error.response?.data?.detail;
        if (msg?.includes('כבר רשום') || error.response?.status === 400) {
          continue;
        }
        throw error;
      }
    }

    if (!firstResponse && targetLessonList.length > 0) {
      throw new Error('הילד כבר רשום לקבוצה זו');
    }

    return firstResponse;
  };

  const enrollInAllTeamLessons = (options?: { trial?: boolean; skipLessonIds?: string[] }) =>
    enrollInLessons(lessons, options);

  const handleTrialRegistration = async () => {
    if (!selectedCourse) {
      alert('נא לבחור קבוצה');
      return;
    }
    if (lessons.length === 0) {
      alert('לקבוצה זו אין שיעורים — הוסף שיעור לפני רישום');
      return;
    }

    if (!trialPickerOpen) {
      setTrialPickerOpen(true);
      return;
    }

    if (!selectedTrialLesson) {
      alert('נא לבחור שיעור לניסיון');
      return;
    }

    setLoading(true);
    try {
      const enrollRes = await api.post('/enrollments/lesson-enrollments/', {
        lesson: selectedTrialLesson,
        child: child.id,
        status: 'active',
        trial_registration: true,
      });

      if (!enrollRes.data?.trial_applied) {
        alert('הרישום נשמר אך לא סומן כניסיון — נסה שוב או פנה למנהל מערכת.');
        return;
      }

      const whatsapp = enrollRes.data?.whatsapp;
      if (whatsapp && whatsapp.sent === false) {
        console.warn('Trial enrollment saved but WhatsApp failed:', whatsapp);
        alert(
          'הילד נרשם לניסיון במערכת, אך הודעת WhatsApp לא נשלחה. ' +
            (whatsapp.error || whatsapp.reason || 'בדוק ManyChat')
        );
      } else {
        alert('הילד נרשם לניסיון בהצלחה!');
      }
      onEnroll();
      onClose();
    } catch (error: any) {
      console.error('Error enrolling for trial:', error);
      const errorData = error.response?.data;
      let errorMessage = 'שגיאה ברישום לניסיון';

      if (errorData?.lesson) {
        errorMessage = errorData.lesson;
      } else if (errorData?.detail) {
        errorMessage = errorData.detail;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionRegistration = () => {
    if (!selectedCourse) {
      alert('נא לבחור קבוצה');
      return;
    }
    if (lessons.length === 0) {
      alert('לקבוצה זו אין שיעורים — הוסף שיעור לפני רישום');
      return;
    }
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async () => {
    if (activeBundle) {
      // Each bundle lesson is charged (and its LessonEnrollment created server-side)
      // individually via SubscriptionPaymentDialog — nothing left to enroll here.
      onEnroll();
      setPaymentModalOpen(false);
      onClose();
      return;
    }

    const paidLessonId = lessons[0]?.id;
    try {
      await enrollInAllTeamLessons({
        skipLessonIds: paidLessonId ? [paidLessonId] : [],
      });
    } catch (error) {
      console.warn('Some team lesson enrollments may already exist after payment:', error);
    }
    onEnroll();
    setPaymentModalOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  const selectedCourseDetails = courses.find((c) => c.id === selectedCourse);
  const activeBundle = bundles.find((b) => b.id === registrationMode);
  const billingLesson = lessons[0];
  const bundleLessons = activeBundle
    ? lessons.filter((l) => activeBundle.lessons_detail.some((bl) => bl.id === l.id))
    : [];
  const paymentLessons = activeBundle ? bundleLessons : (billingLesson ? [billingLesson] : []);
  const courseSeats = selectedCourseDetails ? courseSeatsLeft(selectedCourseDetails) : null;
  const canEnroll = Boolean(
    selectedCourse &&
    lessons.length > 0 &&
    courseSeats !== 0 &&
    (!activeBundle || bundleLessons.length === activeBundle.lessons_detail.length)
  );

  const existingCourseIds = new Set(
    child.enrollments
      .filter((e) => BILLING_ENROLLMENT_STATUSES.has(e.status))
      .map((e) => e.course_id)
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
            <h2 className="text-xl font-bold">רישום לקבוצה - {child.full_name}</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {child.enrollments.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">רישומים קיימים:</h3>
                <div className="space-y-2">
                  {[...new Map(child.enrollments.map((e) => [e.course_id, e])).values()].map((enrollment) => (
                    <div
                      key={enrollment.course_id}
                      className="text-sm p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div className="font-medium">{enrollment.course_name}</div>
                      {enrollment.instructor_name && (
                        <div className="text-xs text-muted-foreground mt-1">
                          מדריך: {enrollment.instructor_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  בחר תחום <span className="text-red-500">*</span>
                </label>
                {loadingCourseTypes ? (
                  <div className="text-sm text-muted-foreground">טוען תחומים...</div>
                ) : (
                  <select
                    value={selectedCourseType}
                    onChange={(e) => setSelectedCourseType(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">-- בחר תחום --</option>
                    {courseTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedCourseType && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    בחר קבוצה <span className="text-red-500">*</span>
                  </label>
                  {loadingCourses ? (
                    <div className="text-sm text-muted-foreground">טוען קבוצות...</div>
                  ) : courses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">אין קבוצות זמינות בתחום זה</div>
                  ) : (
                    <select
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">-- בחר קבוצה --</option>
                      {courses.map((course) => {
                        const seats = courseSeatsLeft(course);
                        const isFull = seats === 0;
                        const alreadyEnrolled = existingCourseIds.has(course.id);
                        return (
                          <option
                            key={course.id}
                            value={course.id}
                            disabled={isFull || alreadyEnrolled}
                          >
                            {course.name} - {course.branch_name}
                            {alreadyEnrolled ? ' — כבר רשום' : formatSeatsSuffix(seats)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {selectedCourse && trialPickerOpen && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    בחר שיעור לניסיון <span className="text-red-500">*</span>
                  </label>
                  {loadingLessons ? (
                    <div className="text-sm text-muted-foreground">טוען שיעורים...</div>
                  ) : (
                    <select
                      value={selectedTrialLesson}
                      onChange={(e) => setSelectedTrialLesson(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">-- בחר שיעור לניסיון --</option>
                      {lessons.map((lesson) => {
                        const seats = lessonSeatsLeft(lesson);
                        const isFull = seats === 0;
                        return (
                          <option key={lesson.id} value={lesson.id} disabled={isFull}>
                            {formatLessonSchedule(lesson)}
                            {lesson.instructor_name ? ` (${lesson.instructor_name})` : ''}
                            {formatSeatsSuffix(seats)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    רישום לניסיון הוא לשיעור אחד בלבד. מנוי מלא כולל את כל מועדי הקבוצה.
                  </p>
                </div>
              )}

              {selectedCourse && !trialPickerOpen && (
                <div className="text-sm text-muted-foreground">
                  {loadingLessons ? (
                    <div>טוען מועדים...</div>
                  ) : lessons.length === 0 ? (
                    <div className="text-red-600">לקבוצה זו אין שיעורים — יש להוסיף שיעור לפני רישום</div>
                  ) : bundles.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium mb-2 text-foreground">
                        אופן הרשמה
                      </label>
                      <div className="space-y-2" role="radiogroup" aria-label="אופן הרשמה">
                        <div
                          role="radio"
                          aria-checked={registrationMode === FULL_SUBSCRIPTION_MODE}
                          tabIndex={0}
                          onClick={() => setRegistrationMode(FULL_SUBSCRIPTION_MODE)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRegistrationMode(FULL_SUBSCRIPTION_MODE); } }}
                          className={`p-3 rounded-lg cursor-pointer text-foreground ${
                            registrationMode === FULL_SUBSCRIPTION_MODE
                              ? 'border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.04)]'
                              : 'border-2 border-border'
                          }`}
                        >
                          <div className="font-medium text-sm">
                            מנוי מלא — כל השיעורים (₪{selectedCourseDetails?.price ?? '—'})
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {lessons.map((lesson) => (
                              <li key={lesson.id}>{formatLessonSchedule(lesson)}</li>
                            ))}
                          </ul>
                        </div>

                        {bundles.map((bundle) => (
                          <div
                            key={bundle.id}
                            role="radio"
                            aria-checked={registrationMode === bundle.id}
                            tabIndex={0}
                            onClick={() => setRegistrationMode(bundle.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRegistrationMode(bundle.id); } }}
                            className={`p-3 rounded-lg cursor-pointer text-foreground ${
                              registrationMode === bundle.id
                                ? 'border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.04)]'
                                : 'border-2 border-border'
                            }`}
                          >
                            <div className="font-medium text-sm">
                              {bundle.name || 'מסלול משולב'} (₪{bundle.combined_price})
                            </div>
                            <ul className="mt-1 space-y-0.5">
                              {bundle.lessons_detail.map((bl) => (
                                <li key={bl.id}>{formatLessonSchedule(bl)}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {lessons.map((lesson) => (
                        <li key={lesson.id}>{formatLessonSchedule(lesson)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-6 mt-6 border-t">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
                ביטול
              </button>
              <button
                type="button"
                onClick={handleTrialRegistration}
                className="btn-secondary bg-orange-500 text-white hover:bg-orange-600"
                disabled={
                  loading ||
                  !canEnroll ||
                  (trialPickerOpen && !selectedTrialLesson)
                }
              >
                {loading
                  ? 'מבצע רישום...'
                  : trialPickerOpen
                    ? 'אשר רישום לניסיון'
                    : 'הרשם לניסיון'}
              </button>
              <button
                type="button"
                onClick={handleSubscriptionRegistration}
                className="btn-primary"
                disabled={loading || !canEnroll}
              >
                הרשם כמנוי
              </button>
            </div>
          </div>
        </div>
      </div>

      {paymentModalOpen && paymentLessons.length > 0 && selectedCourseDetails && (
        <SubscriptionPaymentDialog
          child={child}
          lessons={paymentLessons.map((l) => ({
            id: l.id,
            name: selectedCourseDetails.name,
            day_of_week: DAY_NAMES[l.day_of_week],
            time: l.start_time,
            price: activeBundle ? String(activeBundle.combined_price) : selectedCourseDetails.price,
          }))}
          bundleId={activeBundle?.id}
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
}
