import { useState, useEffect } from 'react';
import { Lesson, LessonDetail, AttendanceStatus } from '@/types/schedule';
import { fetchLessonDetail, cancelLesson, restoreLesson, markAttendance } from '@/lib/scheduleUtils';
import { formatTime } from '@/lib/scheduleUtils';
import { useAuth } from '@/components/AuthProvider';
import api from '@/lib/api';

type LessonDetailsDialogProps = {
  lessonId: string | null;
  occurrenceDate: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function LessonDetailsDialog({
  lessonId,
  occurrenceDate,
  onClose,
  onSuccess,
}: LessonDetailsDialogProps) {
  const { user } = useAuth();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showGhostChildForm, setShowGhostChildForm] = useState(false);
  const [ghostChildName, setGhostChildName] = useState('');
  const [ghostFamilyName, setGhostFamilyName] = useState('');
  const [ghostPhoneNumber, setGhostPhoneNumber] = useState('');
  const [isCreatingGhost, setIsCreatingGhost] = useState(false);

  const isManager = user?.role === 'manager';

  useEffect(() => {
    if (lessonId) {
      loadLessonDetails();
    }
  }, [lessonId, occurrenceDate]);

  const loadLessonDetails = async () => {
    if (!lessonId) return;
    if (!occurrenceDate) return;

    setIsLoading(true);
    setError('');
    try {
      const data = await fetchLessonDetail(lessonId, occurrenceDate);
      setLesson(data);
      
      // Build attendance map
      const attendanceMap: Record<string, AttendanceStatus> = {};
      data.attendance.forEach((record) => {
        // The API returns 'child' not 'child_id' for the UUID field
        const childId = record.child_id || record.child;
        if (childId) {
          attendanceMap[childId] = record.status;
        }
      });
      // Ensure every enrollment has an entry (default not_marked)
      data.enrollments.forEach((enrollment) => {
        if (!attendanceMap[enrollment.child_id]) {
          attendanceMap[enrollment.child_id] = 'not_marked';
        }
      });
      
      setAttendance(attendanceMap);
    } catch (err) {
      setError('שגיאה בטעינת פרטי השיעור');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttendanceChange = (childId: string, status: AttendanceStatus) => {
    // Update local state only - save happens on button click
    setAttendance((prev) => ({
      ...prev,
      [childId]: status,
    }));
  };

  const handleSaveAttendance = async () => {
    if (!lesson) return;
    if (!occurrenceDate) return;

    setIsSaving(true);
    setError('');

    try {
      // Only send marks for enrolled children (filter out any invalid entries)
      const enrolledChildIds = new Set(lesson.enrollments.map(e => e.child_id));
      const marks = Object.entries(attendance)
        .filter(([child_id]) => enrolledChildIds.has(child_id))
        .map(([child_id, status]) => ({
          child_id,
          status,
        }));

      await markAttendance(lesson.id, occurrenceDate, marks);
      
      onSuccess?.();
      // Close popup on successful save
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בשמירת נוכחות');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!lesson) return;
    if (!occurrenceDate) return;

    setIsSaving(true);
    setError('');

    try {
      await cancelLesson(lesson.id, occurrenceDate, cancelReason);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בביטול השיעור');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreLesson = async () => {
    if (!lesson) return;
    if (!occurrenceDate) return;

    setIsSaving(true);
    setError('');
    try {
      const updated = await restoreLesson(lesson.id, occurrenceDate);
      setLesson(updated);
      setCancelReason('');
      setShowCancelConfirm(false);
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בהחזרת השיעור');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateGhostChild = async () => {
    if (!lesson || !ghostChildName.trim()) {
      setError('שם פרטי נדרש');
      return;
    }

    setIsCreatingGhost(true);
    setError('');

    try {
      await api.post('/customers/children/create_ghost/', {
        first_name: ghostChildName.trim(),
        family_name: ghostFamilyName.trim() || undefined,
        phone_number: ghostPhoneNumber.trim() || undefined,
        lesson_id: lesson.id,
      });

      // Reset form and reload lesson details
      setGhostChildName('');
      setGhostFamilyName('');
      setGhostPhoneNumber('');
      setShowGhostChildForm(false);
      await loadLessonDetails();
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה ביצירת תלמיד רפאים');
    } finally {
      setIsCreatingGhost(false);
    }
  };

  if (!lessonId || !occurrenceDate) return null;

  const isCancelled = lesson?.status === 'cancelled';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold">נוכחות שיעור</h2>
            {lesson && (
              <p className="text-sm text-gray-600 mt-1">
                {lesson.day_of_week_display}, {lesson.lesson_date || ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">טוען...</div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 mb-4">
            {error}
          </div>
        ) : lesson ? (
          <div className="space-y-6">
            {/* Cancellation reason banner */}
            {isCancelled && (lesson.cancellation_reason || '').trim() && (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
                <div className="font-bold mb-1">השיעור בוטל</div>
                <div className="text-sm whitespace-pre-wrap">
                  סיבה: {lesson.cancellation_reason}
                </div>
              </div>
            )}

            {/* Lesson Info Card */}
            <div className="bg-teal-50 rounded-lg p-4">
              <h3 className="text-xl font-bold text-teal-700 mb-3">
                {lesson.course_type_name} - {lesson.course_name}
              </h3>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">🕐</span>
                  <span>{formatTime(lesson.start_time)} - {formatTime(lesson.end_time)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">📍</span>
                  <span>{lesson.room_name || 'חדר 1'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">👤</span>
                  <span>{lesson.instructor_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">👥</span>
                  <span>{lesson.enrollments.length}/{lesson.room_capacity || 20} רשומים</span>
                </div>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">סיכום נוכחות:</span>
              </div>
              <div className="flex gap-3">
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  נוכחים: {Object.values(attendance).filter(s => s === 'present').length}
                </span>
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                  נעדרים: {Object.values(attendance).filter(s => s === 'absent').length}
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  לא סומנו: {lesson.enrollments.length - Object.values(attendance).filter(s => s !== 'not_marked').length}
                </span>
              </div>
            </div>

            {/* Add Ghost Child Button */}
            {!isCancelled && (
              <button 
                onClick={() => setShowGhostChildForm(true)}
                disabled={showGhostChildForm}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-xl">👤+</span>
                <span>הוסף תלמיד רפאים</span>
              </button>
            )}

            {/* Attendance Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right px-4 py-3 text-sm font-medium">שם התלמיד</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">משפחה</th>
                    <th className="text-center px-4 py-3 text-sm font-medium">סוג</th>
                    <th className="text-center px-4 py-3 text-sm font-medium w-24">✅</th>
                    <th className="text-center px-4 py-3 text-sm font-medium w-24">❌</th>
                    <th className="text-center px-4 py-3 text-sm font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lesson.enrollments.map((enrollment) => {
                    // Note: Ghost children visibility (30 days) is handled by the backend
                    // The backend serializer (ChildSerializer) includes is_ghost_visible field
                    // which returns False for ghost children older than 30 days
                    const nameParts = enrollment.child_name.split(' ');
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';
                    const currentStatus = attendance[enrollment.child_id] || 'not_marked';
                    const attendanceRecord = lesson.attendance.find((a) => a.child_id === enrollment.child_id);
                    const isGhost =
                      enrollment.child_status === 'ghost' ||
                      attendanceRecord?.child_status === 'ghost' ||
                      /רפאים/.test(enrollment.child_name);

                    return (
                      <tr key={enrollment.id} className={`hover:bg-gray-100 ${isGhost ? 'bg-red-50' : ''}`}>
                        <td className={`px-4 py-3 text-sm ${isGhost ? 'bg-red-50' : ''}`}>{firstName}</td>
                        <td className={`px-4 py-3 text-sm ${isGhost ? 'bg-red-50' : ''}`}>{lastName}</td>
                        <td className={`px-4 py-3 text-center ${isGhost ? 'bg-red-50' : ''}`}>
                          <span className={`px-2 py-1 rounded text-xs ${
                            isGhost 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-teal-100 text-teal-700'
                          }`}>
                            {isGhost ? 'רפאים' : 'רשום'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-center ${isGhost ? 'bg-red-50' : ''}`}>
                          <button
                            onClick={() => handleAttendanceChange(enrollment.child_id, 'present')}
                            disabled={isCancelled}
                            className={`w-10 h-10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              currentStatus === 'present'
                                ? 'bg-green-600 text-white'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                            title="סמן כנוכח"
                          >
                            ✓
                          </button>
                        </td>
                        <td className={`px-4 py-3 text-center ${isGhost ? 'bg-red-50' : ''}`}>
                          <button
                            onClick={() => handleAttendanceChange(enrollment.child_id, 'absent')}
                            disabled={isCancelled}
                            className={`w-10 h-10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              currentStatus === 'absent'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                            title="סמן כנעדר"
                          >
                            ✗
                          </button>
                        </td>
                        <td className={`px-4 py-3 text-center ${isGhost ? 'bg-red-50' : ''}`}>
                          <button className="text-gray-400 hover:text-gray-600">•••</button>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Ghost Child Form Row */}
                  {showGhostChildForm && !isCancelled && (
                    <>
                      <tr className="bg-yellow-50">
                        <td className="px-4 py-3" colSpan={6}>
                          <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1">
                                  שם פרטי <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={ghostChildName}
                                  onChange={(e) => setGhostChildName(e.target.value)}
                                  placeholder="שם פרטי"
                                  className="w-full px-2 py-1 border rounded text-sm"
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">
                                  שם משפחה <span className="text-gray-400">(אופציונלי)</span>
                                </label>
                                <input
                                  type="text"
                                  value={ghostFamilyName}
                                  onChange={(e) => setGhostFamilyName(e.target.value)}
                                  placeholder="שם משפחה"
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">
                                  טלפון <span className="text-gray-400">(אופציונלי)</span>
                                </label>
                                <input
                                  type="tel"
                                  value={ghostPhoneNumber}
                                  onChange={(e) => setGhostPhoneNumber(e.target.value)}
                                  placeholder="מספר טלפון"
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setShowGhostChildForm(false);
                                  setGhostChildName('');
                                  setGhostFamilyName('');
                                  setGhostPhoneNumber('');
                                }}
                                disabled={isCreatingGhost}
                                className="px-4 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                              >
                                ביטול
                              </button>
                              <button
                                onClick={handleCreateGhostChild}
                                disabled={isCreatingGhost || !ghostChildName.trim()}
                                className="px-4 py-1 bg-teal-500 text-white rounded text-sm hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCreatingGhost ? 'שומר...' : 'שמור'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                  
                  {lesson.enrollments.length === 0 && !showGhostChildForm && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        אין תלמידים רשומים לשיעור זה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-between">
              <div className="flex gap-3">
                <button
                  onClick={handleSaveAttendance}
                  disabled={isSaving || isCancelled}
                  className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'שומר...' : 'שמור נוכחות'}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  סגור
                </button>
              </div>
              
              {isManager && !isCancelled && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
                >
                  <span>🚫</span>
                  <span>ביטול שיעור</span>
                </button>
              )}

              {isManager && isCancelled && (
                <button
                  onClick={handleRestoreLesson}
                  disabled={isSaving}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span>↩️</span>
                  <span>החזר שיעור</span>
                </button>
              )}
            </div>

            {/* Cancel Confirmation */}
            {showCancelConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCancelConfirm(false)}>
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-xl font-bold mb-4">ביטול שיעור</h3>
                  <p className="text-gray-600 mb-4">האם אתה בטוח שברצונך לבטל את השיעור?</p>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="סיבת ביטול (אופציונלי)"
                    className="w-full px-3 py-2 border rounded-lg mb-4"
                    rows={3}
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={handleCancelLesson}
                      disabled={isSaving}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                      {isSaving ? 'מבטל...' : 'אשר ביטול'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

