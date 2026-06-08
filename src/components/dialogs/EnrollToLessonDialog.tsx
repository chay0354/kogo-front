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

const BILLING_ENROLLMENT_STATUSES = new Set(['active', 'payments_problem']);

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const toNumberOrNull = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getChildLessonIndexForBilling = (child: ChildWithDetails, lessonId: string) => {
  const signedLessons = child.enrollments.filter(
    (enrollment) =>
      BILLING_ENROLLMENT_STATUSES.has(enrollment.status) &&
      enrollment.lesson_id !== lessonId
  );
  return signedLessons.length + 1;
};

const getEffectiveLessonPrice = (
  child: ChildWithDetails,
  lesson: Lesson,
  coursePrice: string | null | undefined
) => {
  const basePrice = toNumberOrNull(coursePrice);
  const lessonIndex = getChildLessonIndexForBilling(child, lesson.id);

  if (lessonIndex <= 1) return basePrice;

  const tier = [...(lesson.additional_course_prices || [])]
    .map((entry) => ({
      course_index: Number(entry.course_index),
      price: toNumberOrNull(entry.price),
    }))
    .filter((entry) => Number.isFinite(entry.course_index) && entry.course_index <= lessonIndex && entry.price !== null)
    .sort((a, b) => b.course_index - a.course_index)[0];

  return tier?.price ?? toNumberOrNull(lesson.lesson_price_override) ?? basePrice;
};

const computeSeatsLeft = (capacity: number | null | undefined, enrolled: number | null | undefined) => {
  if (capacity == null) return null;
  const used = typeof enrolled === 'number' ? enrolled : 0;
  return Math.max(0, capacity - used);
};

const courseSeatsLeft = (course: Course) =>
  computeSeatsLeft(course.capacity, course.enrolled_students_count);

const lessonSeatsLeft = (lesson: Lesson) => {
  // Effective capacity: smaller of explicit lesson cap and the room capacity, when both exist.
  const caps = [lesson.max_students, lesson.room_capacity].filter(
    (v): v is number => typeof v === 'number'
  );
  const capacity = caps.length ? Math.min(...caps) : null;
  return computeSeatsLeft(capacity, lesson.enrolled_students_count);
};

const formatSeatsSuffix = (seats: number | null) => {
  if (seats == null) return '';
  if (seats <= 0) return ' — מלא';
  return ` — נותרו ${seats} מקומות`;
};

export default function EnrollToLessonDialog({ child, isOpen, onClose, onEnroll }: EnrollToLessonDialogProps) {
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  
  const [selectedCourseType, setSelectedCourseType] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedLesson, setSelectedLesson] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingCourseTypes, setLoadingCourseTypes] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCourseTypes();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCourseType) {
      loadCourses(selectedCourseType);
      setSelectedCourse('');
      setSelectedLesson('');
    }
  }, [selectedCourseType]);

  useEffect(() => {
    if (selectedCourse) {
      loadLessons(selectedCourse);
      setSelectedLesson('');
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
      alert('שגיאה בטעינת החוגים');
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
      alert('שגיאה בטעינת השיעורים');
    } finally {
      setLoadingLessons(false);
    }
  };

  const handleTrialRegistration = async () => {
    if (!selectedLesson) {
      alert('נא לבחור שיעור');
      return;
    }

    setLoading(true);
    try {
      const enrollRes = await api.post('/enrollments/lesson-enrollments/', {
        lesson: selectedLesson,
        child: child.id,
        status: 'active',
        trial_registration: true,
      });

      const whatsapp = enrollRes.data?.whatsapp;
      if (whatsapp && !whatsapp.sent) {
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
        errorMessage = errorData.lesson;  // Show capacity error
      } else if (errorData?.detail) {
        errorMessage = errorData.detail;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscriptionRegistration = () => {
    if (!selectedLesson) {
      alert('נא לבחור שיעור');
      return;
    }
    // Open payment dialog with selected lesson
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    // Payment successful - refresh and close
    onEnroll();
    setPaymentModalOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  const selectedLessonDetails = lessons.find(l => l.id === selectedLesson);
  const selectedCourseDetails = courses.find(c => c.id === selectedCourse);
  const lessonIndex = selectedLessonDetails
    ? getChildLessonIndexForBilling(child, selectedLessonDetails.id)
    : 1;
  const displayPrice = selectedLessonDetails
    ? getEffectiveLessonPrice(child, selectedLessonDetails, selectedCourseDetails?.price)
    : null;

  const dayNames = DAY_NAMES;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
        <div 
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
            <h2 className="text-xl font-bold">רישום לחוג - {child.full_name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #23</span></h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-6">
            {/* Current Enrollments */}
            {child.enrollments.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">רישומים קיימים:</h3>
                <div className="space-y-2">
                  {child.enrollments.map((enrollment) => (
                    <div key={enrollment.enrollment_id} className="text-sm p-3 bg-green-50 border border-green-200 rounded-lg">
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
              {/* Course Type Selection */}
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

              {/* Course Selection */}
              {selectedCourseType && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    בחר חוג <span className="text-red-500">*</span>
                  </label>
                  {loadingCourses ? (
                    <div className="text-sm text-muted-foreground">טוען חוגים...</div>
                  ) : courses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">אין חוגים זמינים בתחום זה</div>
                  ) : (
                    <select
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">-- בחר חוג --</option>
                      {courses.map((course) => {
                        const seats = courseSeatsLeft(course);
                        const isFull = seats === 0;
                        return (
                          <option key={course.id} value={course.id} disabled={isFull}>
                            {course.name} - {course.branch_name}{formatSeatsSuffix(seats)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Lesson Selection */}
              {selectedCourse && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    בחר שיעור <span className="text-red-500">*</span>
                  </label>
                  {loadingLessons ? (
                    <div className="text-sm text-muted-foreground">טוען שיעורים...</div>
                  ) : lessons.length === 0 ? (
                    <div className="text-sm text-muted-foreground">אין שיעורים זמינים בחוג זה</div>
                  ) : (
                    <select
                      value={selectedLesson}
                      onChange={(e) => setSelectedLesson(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">-- בחר שיעור --</option>
                      {lessons.map((lesson) => {
                        const seats = lessonSeatsLeft(lesson);
                        const isFull = seats === 0;
                        return (
                          <option key={lesson.id} value={lesson.id} disabled={isFull}>
                            {dayNames[lesson.day_of_week]} {lesson.start_time} - {lesson.end_time}
                            {lesson.instructor_name && ` (${lesson.instructor_name})`}
                            {formatSeatsSuffix(seats)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              )}

              {/* Lesson Details */}
              {selectedLessonDetails && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium text-lg mb-2">פרטי שיעור</div>
                    <div className="space-y-1 text-muted-foreground">
                      <div>חוג: {selectedCourseDetails?.name}</div>
                      <div>יום: {dayNames[selectedLessonDetails.day_of_week]}</div>
                      <div>שעה: {selectedLessonDetails.start_time} - {selectedLessonDetails.end_time}</div>
                      <div>סניף: {selectedLessonDetails.branch_name}</div>
                      {selectedLessonDetails.instructor_name && (
                        <div>מדריך: {selectedLessonDetails.instructor_name}</div>
                      )}
                      {(() => {
                        const seats = lessonSeatsLeft(selectedLessonDetails);
                        if (seats == null) return null;
                        if (seats <= 0) return <div className="text-red-600 font-medium">השיעור מלא</div>;
                        return <div>מקומות פנויים: {seats}</div>;
                      })()}
                      {displayPrice !== null && (
                        <div className="text-lg font-bold text-green-600 mt-2">
                          מחיר לשיעור ה-{lessonIndex}: ₪{displayPrice}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-6 mt-6 border-t">
              <button 
                type="button" 
                onClick={onClose} 
                className="btn-secondary" 
                disabled={loading}
              >
                ביטול
              </button>
              <button 
                type="button"
                onClick={handleTrialRegistration} 
                className="btn-secondary bg-orange-500 text-white hover:bg-orange-600" 
                disabled={loading || !selectedLesson}
              >
                {loading ? 'מבצע רישום...' : 'הרשם לניסיון'}
              </button>
              <button 
                type="button"
                onClick={handleSubscriptionRegistration} 
                className="btn-primary" 
                disabled={loading || !selectedLesson}
              >
                הרשם כמנוי
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Dialog */}
      {paymentModalOpen && selectedLessonDetails && (
        <SubscriptionPaymentDialog
          child={child}
          lesson={{
            id: selectedLessonDetails.id,
            name: courses.find(c => c.id === selectedCourse)?.name || '',
            day_of_week: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][selectedLessonDetails.day_of_week],
            time: selectedLessonDetails.start_time,
            price: selectedLessonDetails.price
          }}
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
}
