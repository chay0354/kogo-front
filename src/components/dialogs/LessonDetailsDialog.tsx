'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  RotateCcw,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { LessonDetail, AttendanceStatus } from '@/types/schedule';
import { fetchLessonDetail, cancelLesson, restoreLesson, markAttendance, formatTime } from '@/lib/scheduleUtils';
import { useAuth } from '@/components/AuthProvider';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type LessonDetailsDialogProps = {
  lessonId: string | null;
  occurrenceDate: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

function splitChildName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    initials: (parts[0]?.[0] || '?') + (parts[1]?.[0] || ''),
  };
}

function formatLessonDate(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type StudentFilter = 'all' | 'active' | 'trial';

function isTrialEnrollment(
  enrollment: {
    trial_lesson_date?: string | null;
    is_trial?: boolean;
    child_status?: string;
    child_name?: string;
  },
  occurrenceDate: string | null,
) {
  return (
    enrollment.is_trial === true ||
    (enrollment.trial_lesson_date === occurrenceDate &&
      (enrollment.child_status === 'trial_signed' ||
        enrollment.child_status === 'trial_completed'))
  );
}

function isGhostEnrollment(
  enrollment: { child_status?: string; child_name?: string },
  attendanceRecord?: { child_status?: string },
) {
  return (
    enrollment.child_status === 'ghost' ||
    attendanceRecord?.child_status === 'ghost' ||
    /רפאים/.test(enrollment.child_name || '')
  );
}

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
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');

  const isManager = user?.role === 'manager';
  const isOpen = Boolean(lessonId && occurrenceDate);

  const visibleEnrollments = useMemo(() => {
    if (!lesson?.enrollments || !occurrenceDate) return [];
    return lesson.enrollments.filter((enrollment) => {
      if (enrollment.trial_lesson_date) {
        return enrollment.trial_lesson_date === occurrenceDate;
      }
      if (enrollment.child_status === 'trial_signed') {
        return false;
      }
      return true;
    });
  }, [lesson?.enrollments, occurrenceDate]);

  const filteredEnrollments = useMemo(() => {
    if (!occurrenceDate) return visibleEnrollments;
    return visibleEnrollments.filter((enrollment) => {
      const attendanceRecord = lesson?.attendance.find(
        (a) => a.child_id === enrollment.child_id,
      );
      const trial = isTrialEnrollment(enrollment, occurrenceDate);
      const ghost = isGhostEnrollment(enrollment, attendanceRecord);

      if (studentFilter === 'trial') return trial && !ghost;
      if (studentFilter === 'active') return !trial && !ghost;
      return true;
    });
  }, [visibleEnrollments, studentFilter, occurrenceDate, lesson?.attendance]);

  useEffect(() => {
    if (lessonId && occurrenceDate) {
      loadLessonDetails();
    }
  }, [lessonId, occurrenceDate]);

  useEffect(() => {
    setStudentFilter('all');
  }, [lessonId, occurrenceDate]);

  const loadLessonDetails = async () => {
    if (!lessonId || !occurrenceDate) return;

    setIsLoading(true);
    setError('');
    try {
      const data = await fetchLessonDetail(lessonId, occurrenceDate);
      setLesson(data);

      const attendanceMap: Record<string, AttendanceStatus> = {};
      data.attendance.forEach((record) => {
        const childId = record.child_id || record.child;
        if (childId) {
          attendanceMap[childId] = record.status;
        }
      });
      data.enrollments.forEach((enrollment) => {
        if (!attendanceMap[enrollment.child_id]) {
          attendanceMap[enrollment.child_id] = 'not_marked';
        }
      });

      setAttendance(attendanceMap);
    } catch {
      setError('שגיאה בטעינת פרטי השיעור');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttendanceChange = (childId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [childId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    if (!lesson) return;
    const next: Record<string, AttendanceStatus> = {};
    lesson.enrollments.forEach((e) => {
      next[e.child_id] = status;
    });
    setAttendance(next);
  };

  const handleSaveAttendance = async () => {
    if (!lesson || !occurrenceDate) return;

    setIsSaving(true);
    setError('');

    try {
      const enrolledChildIds = new Set(lesson.enrollments.map((e) => e.child_id));
      const marks = Object.entries(attendance)
        .filter(([child_id]) => enrolledChildIds.has(child_id))
        .map(([child_id, status]) => ({ child_id, status }));

      await markAttendance(lesson.id, occurrenceDate, marks);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'שגיאה בשמירת נוכחות');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelLesson = async () => {
    if (!lesson || !occurrenceDate) return;

    setIsSaving(true);
    setError('');

    try {
      await cancelLesson(lesson.id, occurrenceDate, cancelReason);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'שגיאה בביטול השיעור');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreLesson = async () => {
    if (!lesson || !occurrenceDate) return;

    setIsSaving(true);
    setError('');
    try {
      const updated = await restoreLesson(lesson.id, occurrenceDate);
      setLesson(updated);
      setCancelReason('');
      setShowCancelConfirm(false);
      onSuccess?.();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'שגיאה בהחזרת השיעור');
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

      setGhostChildName('');
      setGhostFamilyName('');
      setGhostPhoneNumber('');
      setShowGhostChildForm(false);
      await loadLessonDetails();
      onSuccess?.();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'שגיאה ביצירת תלמיד רפאים');
    } finally {
      setIsCreatingGhost(false);
    }
  };

  const stats = useMemo(() => {
    const present = Object.values(attendance).filter((s) => s === 'present').length;
    const absent = Object.values(attendance).filter((s) => s === 'absent').length;
    const total = lesson?.enrollments.length ?? 0;
    const notMarked = Math.max(0, total - present - absent);
    const markedPct = total ? Math.round(((present + absent) / total) * 100) : 0;
    const presentPct = total ? Math.round((present / total) * 100) : 0;
    return { present, absent, notMarked, total, markedPct, presentPct };
  }, [attendance, lesson?.enrollments.length]);

  const isCancelled = lesson?.status === 'cancelled';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl mx-4 max-h-[92vh] flex flex-col overflow-hidden p-0">
          {/* Header */}
          <div className="shrink-0 border-b bg-gradient-to-l from-teal-50 to-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="px-0 pt-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant={isCancelled ? 'destructive' : 'default'}>
                    {isCancelled ? 'שיעור מבוטל' : 'נוכחות שיעור'}
                  </Badge>
                  {lesson?.lesson_date ? (
                    <Badge variant="outline">{formatLessonDate(lesson.lesson_date)}</Badge>
                  ) : null}
                </div>
                <DialogTitle className="text-2xl text-gray-900 leading-tight">
                  {lesson ? (
                    <>
                      {lesson.course_type_name} · {lesson.course_name}
                      <GroupIdBadge displayId={lesson.course_display_id} />
                    </>
                  ) : (
                    'פרטי שיעור'
                  )}
                </DialogTitle>
                {lesson ? (
                  <DialogDescription className="text-gray-600">
                    {lesson.day_of_week_display}
                    {lesson.branch_name ? ` · ${lesson.branch_name}` : ''}
                  </DialogDescription>
                ) : null}
              </DialogHeader>
              <DialogCloseButton />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-24 rounded-xl bg-gray-100" />
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-gray-100" />
                  ))}
                </div>
                <div className="h-40 rounded-xl bg-gray-100" />
              </div>
            ) : !lesson ? (
              <div className="py-16 text-center text-gray-500">
                {error || 'לא נמצאו פרטי שיעור'}
              </div>
            ) : (
              <>
                {error ? (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                    <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-sm">{error}</p>
                  </div>
                ) : null}

                {isCancelled && (lesson.cancellation_reason || '').trim() ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-red-800 mb-1">
                      <Ban className="h-4 w-4" />
                      השיעור בוטל
                    </div>
                    <p className="text-sm text-red-700 whitespace-pre-wrap">
                      {lesson.cancellation_reason}
                    </p>
                  </div>
                ) : null}

                {/* Lesson meta */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetaCard
                    icon={<Clock className="h-4 w-4 text-teal-600" />}
                    label="שעות"
                    value={`${formatTime(lesson.start_time)} – ${formatTime(lesson.end_time)}`}
                  />
                  <MetaCard
                    icon={<MapPin className="h-4 w-4 text-teal-600" />}
                    label="סטודיו"
                    value={lesson.room_name || 'לא צוין'}
                  />
                  <MetaCard
                    icon={<User className="h-4 w-4 text-teal-600" />}
                    label="מדריך"
                    value={lesson.instructor_name}
                  />
                  <MetaCard
                    icon={<Users className="h-4 w-4 text-teal-600" />}
                    label="רשומים"
                    value={`${lesson.enrollments.length} / ${lesson.room_capacity || 20}`}
                  />
                </div>

                {/* Attendance summary */}
                <div className="rounded-xl border bg-gray-50/80 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900">סיכום נוכחות</h3>
                    {!isCancelled && stats.total > 0 ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markAll('present')}
                        >
                          <Check className="h-3.5 w-3.5 ml-1.5" />
                          סמן הכל נוכח
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markAll('absent')}
                        >
                          <X className="h-3.5 w-3.5 ml-1.5" />
                          סמן הכל נעדר
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <StatPill label="נוכחים" value={stats.present} tone="green" />
                    <StatPill label="נעדרים" value={stats.absent} tone="red" />
                    <StatPill label="לא סומנו" value={stats.notMarked} tone="gray" />
                  </div>

                  {stats.total > 0 ? (
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                        <span>{stats.markedPct}% סומנו</span>
                        <span>{stats.presentPct}% נוכחות</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{ width: `${stats.presentPct}%` }}
                        />
                        <div
                          className="bg-red-400 transition-all"
                          style={{ width: `${stats.total ? (stats.absent / stats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Students */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-gray-900">
                        תלמידים ({filteredEnrollments.length}
                        {studentFilter !== 'all' && visibleEnrollments.length !== filteredEnrollments.length
                          ? ` / ${visibleEnrollments.length}`
                          : ''}
                        )
                      </h3>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0">
                        {(
                          [
                            ['all', 'הכל'],
                            ['active', 'פעילים'],
                            ['trial', 'בניסיון'],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setStudentFilter(value)}
                            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                              studentFilter === value
                                ? value === 'trial'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-teal-100 text-teal-900'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!isCancelled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowGhostChildForm((v) => !v)}
                      >
                        <UserPlus className="h-4 w-4 ml-1.5" />
                        {showGhostChildForm ? 'סגור טופס' : 'הוסף תלמיד רפאים'}
                      </Button>
                    ) : null}
                  </div>

                  {showGhostChildForm && !isCancelled ? (
                    <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/60 p-4 space-y-4">
                      <div className="flex items-center gap-2 text-amber-900 font-medium">
                        <UserPlus className="h-4 w-4" />
                        תלמיד רפאים חדש
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field
                          label="שם פרטי"
                          required
                          value={ghostChildName}
                          onChange={setGhostChildName}
                          placeholder="שם פרטי"
                          autoFocus
                        />
                        <Field
                          label="שם משפחה"
                          value={ghostFamilyName}
                          onChange={setGhostFamilyName}
                          placeholder="אופציונלי"
                        />
                        <Field
                          label="טלפון"
                          value={ghostPhoneNumber}
                          onChange={setGhostPhoneNumber}
                          placeholder="אופציונלי"
                          type="tel"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowGhostChildForm(false);
                            setGhostChildName('');
                            setGhostFamilyName('');
                            setGhostPhoneNumber('');
                          }}
                          disabled={isCreatingGhost}
                        >
                          ביטול
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCreateGhostChild}
                          disabled={isCreatingGhost || !ghostChildName.trim()}
                        >
                          {isCreatingGhost ? 'שומר...' : 'הוסף תלמיד'}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {filteredEnrollments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-12 text-center">
                      <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">
                        {visibleEnrollments.length === 0
                          ? 'אין תלמידים רשומים לשיעור זה'
                          : studentFilter === 'trial'
                            ? 'אין תלמידים בניסיון לשיעור זה'
                            : studentFilter === 'active'
                              ? 'אין תלמידים פעילים לשיעור זה'
                              : 'אין תלמידים להצגה'}
                      </p>
                      {!isCancelled && !showGhostChildForm && visibleEnrollments.length === 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => setShowGhostChildForm(true)}
                        >
                          <UserPlus className="h-4 w-4 ml-1.5" />
                          הוסף תלמיד רפאים
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredEnrollments.map((enrollment) => {
                        const { firstName, lastName, initials } = splitChildName(enrollment.child_name);
                        const currentStatus = attendance[enrollment.child_id] || 'not_marked';
                        const attendanceRecord = lesson.attendance.find(
                          (a) => a.child_id === enrollment.child_id
                        );
                        const isGhost = isGhostEnrollment(enrollment, attendanceRecord);
                        const isTrial = isTrialEnrollment(enrollment, occurrenceDate);

                        return (
                          <div
                            key={enrollment.id}
                            className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-4 transition-colors ${
                              isGhost
                                ? 'border-red-100 bg-red-50/40'
                                : isTrial
                                  ? 'border-amber-100 bg-amber-50/40'
                                : currentStatus === 'present'
                                  ? 'border-emerald-100 bg-emerald-50/30'
                                  : currentStatus === 'absent'
                                    ? 'border-red-100 bg-red-50/20'
                                    : 'border-gray-200 bg-white hover:bg-gray-50/60'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div
                                className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                                  isGhost
                                    ? 'bg-red-100 text-red-700'
                                    : isTrial
                                      ? 'bg-amber-100 text-amber-800'
                                    : 'bg-teal-100 text-teal-700'
                                }`}
                              >
                                {initials.toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">
                                  {firstName} {lastName}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={isGhost ? 'destructive' : 'outline'}
                                    className={`text-[11px] ${isTrial && !isGhost ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}`}
                                  >
                                    {isGhost ? 'רפאים' : isTrial ? 'בניסיון' : 'רשום'}
                                  </Badge>
                                  {currentStatus === 'present' ? (
                                    <span className="text-xs text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      נוכח
                                    </span>
                                  ) : currentStatus === 'absent' ? (
                                    <span className="text-xs text-red-700">נעדר</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">טרם סומן</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex rounded-lg border border-gray-200 overflow-hidden shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(enrollment.child_id, 'present')}
                                disabled={isCancelled}
                                className={`px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  currentStatus === 'present'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                <Check className="h-4 w-4 inline ml-1" />
                                נוכח
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAttendanceChange(enrollment.child_id, 'absent')}
                                disabled={isCancelled}
                                className={`px-4 py-2.5 text-sm font-medium border-r border-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  currentStatus === 'absent'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white text-red-700 hover:bg-red-50'
                                }`}
                              >
                                <X className="h-4 w-4 inline ml-1" />
                                נעדר
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {lesson && !isLoading ? (
            <div className="shrink-0 border-t bg-gray-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={isSaving || isCancelled}
                >
                  {isSaving ? 'שומר...' : 'שמור נוכחות'}
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  סגור
                </Button>
              </div>

              {isManager && !isCancelled ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <Ban className="h-4 w-4 ml-1.5" />
                  ביטול שיעור
                </Button>
              ) : null}

              {isManager && isCancelled ? (
                <Button
                  type="button"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleRestoreLesson}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4 ml-1.5" />
                  {isSaving ? 'מחזיר...' : 'החזר שיעור'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-md mx-4 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-xl">ביטול שיעור</DialogTitle>
            <DialogDescription>
              האם אתה בטוח שברצונך לבטל את השיעור? ניתן להוסיף סיבת ביטול.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2">
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="סיבת ביטול (אופציונלי)"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => setShowCancelConfirm(false)}>
              חזור
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelLesson}
              disabled={isSaving}
            >
              {isSaving ? 'מבטל...' : 'אשר ביטול'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-gray-900 truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'green' | 'red' | 'gray';
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    red: 'bg-red-50 text-red-800 border-red-100',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-center ${tones[tone]}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
      />
    </div>
  );
}
