'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import api from '@/lib/api';
import { getDayName, formatTimeRange } from '@/lib/courseUtils';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EnrollmentDetail } from '@/types/customer';

type LessonOption = {
  id: string;
  course?: string;
  course_name?: string;
  course_display_id?: number | null;
  course_type?: string | null;
  course_type_name?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  day_of_week: number;
  day_name?: string;
  start_time: string;
  end_time: string;
  status?: string;
};

type FilterOption = { id: string; name: string };

type Props = {
  enrollment: EnrollmentDetail | null;
  childName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (enrollmentId: string, lesson: EnrollmentDetail) => void;
};

function asId(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

function lessonLabel(lesson: Pick<LessonOption, 'course_name' | 'course_display_id' | 'day_of_week' | 'day_name' | 'start_time' | 'end_time'>): string {
  const title = lesson.course_display_id
    ? `${lesson.course_name ?? ''} #${lesson.course_display_id}`.trim()
    : (lesson.course_name || '');
  const day = lesson.day_name || getDayName(lesson.day_of_week);
  const time = formatTimeRange(lesson.start_time || '', lesson.end_time || '');
  return [title, day, time].filter(Boolean).join(' · ');
}

function uniqueNamedOptions(
  lessons: LessonOption[],
  getId: (lesson: LessonOption) => string,
  getName: (lesson: LessonOption) => string,
): FilterOption[] {
  const map = new Map<string, string>();
  for (const lesson of lessons) {
    const id = getId(lesson);
    const name = getName(lesson);
    if (id && name) map.set(id, name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export default function ChangeChildLessonDialog({
  enrollment,
  childName,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [courseTypeId, setCourseTypeId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setCourseTypeId('');
    setCourseId('');
    setDayOfWeek('');
    setSelectedId(enrollment?.lesson_id || '');
    setError('');
    setLoading(true);
    api.get('/courses/lessons/')
      .then((res) => {
        const rows = (Array.isArray(res.data) ? res.data : res.data?.results ?? []) as LessonOption[];
        const active = rows.filter((row) => row.status !== 'cancelled');
        setLessons(active);
        const current = active.find((row) => row.id === enrollment?.lesson_id);
        setBranchId(asId(current?.branch_id));
      })
      .catch(() => setError('לא ניתן לטעון את רשימת השיעורים'))
      .finally(() => setLoading(false));
  }, [isOpen, enrollment?.lesson_id]);

  const branchOptions = useMemo(
    () => uniqueNamedOptions(lessons, (lesson) => asId(lesson.branch_id), (lesson) => lesson.branch_name || ''),
    [lessons],
  );

  const typeOptions = useMemo(() => {
    const scoped = branchId
      ? lessons.filter((lesson) => asId(lesson.branch_id) === branchId)
      : lessons;
    return uniqueNamedOptions(
      scoped,
      (lesson) => asId(lesson.course_type),
      (lesson) => lesson.course_type_name || '',
    );
  }, [lessons, branchId]);

  const courseOptions = useMemo(() => {
    const scoped = lessons.filter((lesson) => {
      if (branchId && asId(lesson.branch_id) !== branchId) return false;
      if (courseTypeId && asId(lesson.course_type) !== courseTypeId) return false;
      return true;
    });
    return uniqueNamedOptions(
      scoped,
      (lesson) => asId(lesson.course),
      (lesson) => {
        const name = lesson.course_name || '';
        return lesson.course_display_id ? `${name} #${lesson.course_display_id}` : name;
      },
    );
  }, [lessons, branchId, courseTypeId]);

  const dayOptions = useMemo(() => {
    const scoped = lessons.filter((lesson) => {
      if (branchId && asId(lesson.branch_id) !== branchId) return false;
      if (courseTypeId && asId(lesson.course_type) !== courseTypeId) return false;
      if (courseId && asId(lesson.course) !== courseId) return false;
      return true;
    });
    const days = [...new Set(scoped.map((lesson) => lesson.day_of_week))]
      .filter((day) => Number.isInteger(day))
      .sort((a, b) => a - b);
    return days.map((day) => ({ id: String(day), name: getDayName(day) }));
  }, [lessons, branchId, courseTypeId, courseId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lessons
      .filter((lesson) => {
        if (branchId && asId(lesson.branch_id) !== branchId) return false;
        if (courseTypeId && asId(lesson.course_type) !== courseTypeId) return false;
        if (courseId && asId(lesson.course) !== courseId) return false;
        if (dayOfWeek !== '' && String(lesson.day_of_week) !== dayOfWeek) return false;
        if (!q) return true;
        const haystack = [
          lessonLabel(lesson),
          lesson.branch_name,
          lesson.course_type_name,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .map((lesson) => ({ lesson, label: lessonLabel(lesson) }));
  }, [lessons, search, branchId, courseTypeId, courseId, dayOfWeek]);

  const hasActiveFilters = Boolean(search.trim() || branchId || courseTypeId || courseId || dayOfWeek !== '');

  const clearFilters = () => {
    setSearch('');
    setBranchId('');
    setCourseTypeId('');
    setCourseId('');
    setDayOfWeek('');
  };

  const handleSave = async () => {
    if (!enrollment?.enrollment_id || !selectedId) {
      setError('יש לבחור שיעור');
      return;
    }
    if (selectedId === enrollment.lesson_id) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(
        `/enrollments/lesson-enrollments/${enrollment.enrollment_id}/change-lesson/`,
        { lesson_id: selectedId },
      );
      const info = res.data?.lesson_info;
      const picked = lessons.find((lesson) => lesson.id === selectedId);
      onSaved(enrollment.enrollment_id, {
        ...enrollment,
        lesson_id: selectedId,
        course_id: asId(picked?.course) || enrollment.course_id,
        course_name: info?.course_name || picked?.course_name || enrollment.course_name,
        course_display_id: picked?.course_display_id ?? enrollment.course_display_id,
        day_of_week: info?.day_of_week ?? picked?.day_of_week ?? enrollment.day_of_week,
        start_time: info?.start_time || picked?.start_time || enrollment.start_time,
        end_time: info?.end_time || picked?.end_time || enrollment.end_time,
        branch_name: picked?.branch_name ?? enrollment.branch_name,
      });
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; lesson?: string | string[] } } })?.response?.data;
      const lessonErr = data?.lesson;
      setError(
        data?.error ||
        (Array.isArray(lessonErr) ? lessonErr[0] : lessonErr) ||
        'לא ניתן להחליף שיעור',
      );
    } finally {
      setSaving(false);
    }
  };

  const currentLabel = enrollment
    ? lessonLabel({
        course_name: enrollment.course_name,
        course_display_id: enrollment.course_display_id,
        day_of_week: enrollment.day_of_week,
        start_time: enrollment.start_time,
        end_time: enrollment.end_time,
      })
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg overflow-hidden p-0 sm:max-h-[min(90vh,720px)]" dir="rtl">
        <div className="absolute left-3 top-3 z-10">
          <DialogCloseButton />
        </div>
        <DialogHeader className="px-5 pt-5 pe-12 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg">החלפת שיעור</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{childName}</p>
        </DialogHeader>

        <div className="px-5 sm:px-6 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            המחיר החודשי לא משתנה. רק השיעור שאליו הילד רשום.
          </p>
          {currentLabel ? (
            <p className="text-sm">
              <span className="text-muted-foreground">נוכחי: </span>
              <span className="font-medium">{currentLabel}</span>
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <select
              className="input w-full text-sm"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setCourseTypeId('');
                setCourseId('');
                setDayOfWeek('');
              }}
              aria-label="סניף"
            >
              <option value="">כל הסניפים</option>
              {branchOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
            <select
              className="input w-full text-sm"
              value={courseTypeId}
              onChange={(e) => {
                setCourseTypeId(e.target.value);
                setCourseId('');
                setDayOfWeek('');
              }}
              aria-label="תחום"
            >
              <option value="">כל התחומים</option>
              {typeOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
            <select
              className="input w-full text-sm"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setDayOfWeek('');
              }}
              aria-label="חוג"
            >
              <option value="">כל החוגים</option>
              {courseOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
            <select
              className="input w-full text-sm"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              aria-label="יום"
            >
              <option value="">כל הימים</option>
              {dayOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              className="input w-full"
              placeholder="חיפוש שיעור..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {hasActiveFilters ? (
              <button
                type="button"
                className="shrink-0 text-sm text-primary underline whitespace-nowrap"
                onClick={clearFilters}
              >
                נקה סינון
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">טוען שיעורים…</p>
          ) : (
            <div className="max-h-[min(42vh,320px)] space-y-2 overflow-y-auto pe-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא נמצאו שיעורים.</p>
              ) : filtered.map(({ lesson, label }) => {
                const active = selectedId === lesson.id;
                const isCurrent = lesson.id === enrollment?.lesson_id;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => setSelectedId(lesson.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        }`}
                      >
                        {active ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="font-medium leading-snug">{label}</span>
                    </span>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                        נוכחי
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4 sm:px-6">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={saving || loading || !selectedId || selectedId === enrollment?.lesson_id}
            onClick={handleSave}
          >
            {saving ? 'שומר...' : 'החלף שיעור'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
