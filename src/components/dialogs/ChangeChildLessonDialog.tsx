'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import api from '@/lib/api';
import { AGE_OPTIONS, formatAge, formatAgeRange, getDayName } from '@/lib/courseUtils';
import { sortWidgetCourseTypes } from '@/app/widget/courseTypeOrder';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EnrollmentDetail } from '@/types/customer';

type LessonOption = {
  id: string;
  course?: string;
  course_name?: string;
  course_type?: string | null;
  course_type_name?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  day_of_week: number;
  day_name?: string;
  start_time: string;
  end_time: string;
  status?: string;
};

type CourseUnit = {
  id: string;
  name: string;
  branch_id: string | null;
  branch_name: string | null;
  course_type: string | null;
  course_type_name: string | null;
  min_age: number | null;
  max_age: number | null;
  lessons: LessonOption[];
  label: string;
};

type Props = {
  enrollment: EnrollmentDetail | null;
  unitSlots?: EnrollmentDetail[];
  childName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (payload: {
    removedEnrollmentIds: string[];
    enrollments: EnrollmentDetail[];
  }) => void;
};

function slotTime(start?: string | null): string {
  return start ? start.slice(0, 5) : '';
}

function courseUnitLabel(name: string, lessons: LessonOption[]): string {
  const slots = [...lessons]
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0) || slotTime(a.start_time).localeCompare(slotTime(b.start_time)))
    .map((lesson) => {
      const day = lesson.day_name || getDayName(lesson.day_of_week);
      const time = slotTime(lesson.start_time);
      return [day, time].filter(Boolean).join(' ');
    })
    .filter(Boolean);
  return [name, ...slots].filter(Boolean).join(' · ');
}

function lessonMatchesAge(lesson: LessonOption, ageValue: string): boolean {
  if (ageValue === 'all') return true;
  const age = Number(ageValue);
  if (!Number.isFinite(age)) return true;
  if (lesson.min_age == null && lesson.max_age == null) return true;
  const min = lesson.min_age ?? 1;
  const max = lesson.max_age ?? 16;
  return age >= min && age <= max;
}

function asEnrollmentDetail(row: EnrollmentDetail, fallback: EnrollmentDetail): EnrollmentDetail {
  return {
    ...fallback,
    ...row,
    enrollment_id: row.enrollment_id || fallback.enrollment_id,
    lesson_id: row.lesson_id,
    course_id: row.course_id || fallback.course_id,
    course_name: row.course_name || fallback.course_name,
  };
}

export default function ChangeChildLessonDialog({
  enrollment,
  unitSlots,
  childName,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const slots = unitSlots?.length ? unitSlots : enrollment ? [enrollment] : [];
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setTypeFilter('all');
    setAgeFilter('all');
    setSelectedCourseId(enrollment?.course_id || '');
    setError('');
    setLoading(true);
    api.get('/courses/lessons/')
      .then((res) => {
        const rows = (Array.isArray(res.data) ? res.data : res.data?.results ?? []) as LessonOption[];
        const active = rows.filter((row) => row.status !== 'cancelled');
        setLessons(active);
        const current = active.find((row) => row.id === enrollment?.lesson_id);
        setBranchFilter(current?.branch_id || 'all');
      })
      .catch(() => setError('לא ניתן לטעון את רשימת החוגים'))
      .finally(() => setLoading(false));
  }, [isOpen, enrollment?.lesson_id, enrollment?.course_id]);

  const courseUnits = useMemo(() => {
    const byId = new Map<string, CourseUnit>();
    for (const lesson of lessons) {
      const id = String(lesson.course || '');
      if (!id) continue;
      const existing = byId.get(id);
      if (existing) {
        existing.lessons.push(lesson);
        continue;
      }
      byId.set(id, {
        id,
        name: lesson.course_name || '',
        branch_id: lesson.branch_id || null,
        branch_name: lesson.branch_name || null,
        course_type: lesson.course_type ? String(lesson.course_type) : null,
        course_type_name: lesson.course_type_name || null,
        min_age: lesson.min_age ?? null,
        max_age: lesson.max_age ?? null,
        lessons: [lesson],
        label: '',
      });
    }
    return [...byId.values()].map((unit) => ({
      ...unit,
      label: courseUnitLabel(unit.name, unit.lessons),
    }));
  }, [lessons]);

  const branchOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const unit of courseUnits) {
      if (!unit.branch_id || !unit.branch_name) continue;
      byId.set(unit.branch_id, unit.branch_name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [courseUnits]);

  const typeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const unit of courseUnits) {
      if (!unit.course_type || !unit.course_type_name) continue;
      byId.set(unit.course_type, unit.course_type_name);
    }
    return sortWidgetCourseTypes(
      [...byId.entries()].map(([id, name]) => ({ id, name })),
    );
  }, [courseUnits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courseUnits
      .filter((unit) => {
        if (branchFilter !== 'all' && unit.branch_id !== branchFilter) return false;
        if (typeFilter !== 'all' && String(unit.course_type || '') !== typeFilter) return false;
        if (!unit.lessons.some((lesson) => lessonMatchesAge(lesson, ageFilter))) return false;
        if (!q) return true;
        const haystack = [
          unit.label,
          unit.branch_name,
          unit.course_type_name,
          formatAgeRange(unit.min_age, unit.max_age),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
  }, [courseUnits, search, branchFilter, typeFilter, ageFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; rows: CourseUnit[] }>();
    for (const unit of filtered) {
      const id = unit.branch_id || 'none';
      const name = unit.branch_name?.trim() || 'ללא סניף';
      const existing = groups.get(id);
      if (existing) {
        existing.rows.push(unit);
      } else {
        groups.set(id, { id, name, rows: [unit] });
      }
    }
    for (const group of groups.values()) {
      group.rows.sort((a, b) => a.label.localeCompare(b.label, 'he'));
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [filtered]);

  const handleSave = async () => {
    if (!enrollment?.enrollment_id || !selectedCourseId) {
      setError('יש לבחור חוג');
      return;
    }
    if (selectedCourseId === enrollment.course_id) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(
        `/enrollments/lesson-enrollments/${enrollment.enrollment_id}/change-lesson/`,
        { course_id: selectedCourseId },
      );
      const fallback = enrollment;
      const nextRows = (res.data?.enrollments || []).map((row: EnrollmentDetail) =>
        asEnrollmentDetail(row, fallback),
      );
      onSaved({
        removedEnrollmentIds: (res.data?.removed_enrollment_ids || []).map(String),
        enrollments: nextRows.length ? nextRows : [fallback],
      });
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; lesson?: string | string[] } } })?.response?.data;
      const lessonErr = data?.lesson;
      setError(
        data?.error ||
        (Array.isArray(lessonErr) ? lessonErr[0] : lessonErr) ||
        'לא ניתן להחליף חוג',
      );
    } finally {
      setSaving(false);
    }
  };

  const currentLabel = enrollment
    ? courseUnitLabel(
        enrollment.course_name,
        slots.map((slot) => ({
          id: slot.lesson_id,
          course_name: slot.course_name,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
        })),
      )
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:max-h-[min(90vh,720px)]" dir="rtl">
        <div className="absolute left-3 top-3 z-10">
          <DialogCloseButton />
        </div>
        <DialogHeader className="px-5 pt-5 pe-12 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg">החלפת חוג</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{childName}</p>
        </DialogHeader>

        <div className="px-5 sm:px-6 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            המחיר החודשי לא משתנה. מחליפים את כל החוג, כולל כל הימים בשבוע.
          </p>
          {currentLabel ? (
            <p className="text-sm">
              <span className="text-muted-foreground">נוכחי: </span>
              <span className="font-medium">{currentLabel}</span>
            </p>
          ) : null}

          <input
            type="search"
            className="input w-full"
            placeholder="חיפוש חוג..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-2">
            <select
              className="input w-full px-2 text-sm"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="סניף"
            >
              <option value="all">סניף</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <select
              className="input w-full px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="תחום"
            >
              <option value="all">תחום</option>
              {typeOptions.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
            <select
              className="input w-full px-2 text-sm"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
              aria-label="גיל"
            >
              <option value="all">גיל</option>
              {AGE_OPTIONS.map((age) => (
                <option key={age} value={String(age)}>{formatAge(age)}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">טוען חוגים…</p>
          ) : (
            <div className="max-h-[min(48vh,360px)] space-y-3 overflow-y-auto pe-1">
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא נמצאו חוגים.</p>
              ) : grouped.map((group) => (
                <section key={group.id} className="space-y-2">
                  <h3 className="sticky top-0 z-[1] bg-white py-1 text-xs font-semibold text-muted-foreground">
                    {group.name}
                  </h3>
                  {group.rows.map((unit) => {
                    const active = selectedCourseId === unit.id;
                    const isCurrent = unit.id === enrollment?.course_id;
                    const ageLabel = formatAgeRange(unit.min_age, unit.max_age);
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setSelectedCourseId(unit.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition-colors ${
                          active
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                            }`}
                          >
                            {active ? <Check className="h-3 w-3" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium leading-snug">{unit.name}</span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              {unit.lessons
                                .slice()
                                .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
                                .map((lesson) => {
                                  const day = lesson.day_name || getDayName(lesson.day_of_week);
                                  const time = slotTime(lesson.start_time);
                                  return [day, time].filter(Boolean).join(' ');
                                })
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            {ageLabel || unit.course_type_name ? (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {[unit.course_type_name, ageLabel].filter(Boolean).join(' · ')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        {isCurrent ? (
                          <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                            נוכחי
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4 sm:px-6">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={saving || loading || !selectedCourseId || selectedCourseId === enrollment?.course_id}
            onClick={handleSave}
          >
            {saving ? 'שומר...' : 'החלף חוג'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
