'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import api from '@/lib/api';
import { AGE_OPTIONS, formatAge, formatAgeRange, formatTimeRange, getDayName } from '@/lib/courseUtils';
import { sortWidgetCourseTypes } from '@/app/widget/courseTypeOrder';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EnrollmentDetail } from '@/types/customer';

type LessonOption = {
  id: string;
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

type Props = {
  enrollment: EnrollmentDetail | null;
  childName: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (enrollmentId: string, lesson: EnrollmentDetail) => void;
};

function lessonLabel(lesson: Pick<LessonOption, 'course_name' | 'day_of_week' | 'day_name' | 'start_time' | 'end_time'>): string {
  const day = lesson.day_name || getDayName(lesson.day_of_week);
  const time = formatTimeRange(lesson.start_time || '', lesson.end_time || '');
  return [lesson.course_name, day, time].filter(Boolean).join(' · ');
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

export default function ChangeChildLessonDialog({
  enrollment,
  childName,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setTypeFilter('all');
    setAgeFilter('all');
    setSelectedId(enrollment?.lesson_id || '');
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
      .catch(() => setError('לא ניתן לטעון את רשימת השיעורים'))
      .finally(() => setLoading(false));
  }, [isOpen, enrollment?.lesson_id]);

  const branchOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const lesson of lessons) {
      if (!lesson.branch_id || !lesson.branch_name) continue;
      byId.set(lesson.branch_id, lesson.branch_name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [lessons]);

  const typeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const lesson of lessons) {
      if (!lesson.course_type || !lesson.course_type_name) continue;
      byId.set(String(lesson.course_type), lesson.course_type_name);
    }
    return sortWidgetCourseTypes(
      [...byId.entries()].map(([id, name]) => ({ id, name })),
    );
  }, [lessons]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lessons
      .filter((lesson) => {
        if (branchFilter !== 'all' && lesson.branch_id !== branchFilter) return false;
        if (typeFilter !== 'all' && String(lesson.course_type || '') !== typeFilter) return false;
        if (!lessonMatchesAge(lesson, ageFilter)) return false;
        if (!q) return true;
        const haystack = [
          lessonLabel(lesson),
          lesson.branch_name,
          lesson.course_type_name,
          formatAgeRange(lesson.min_age, lesson.max_age),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .map((lesson) => ({ lesson, label: lessonLabel(lesson) }));
  }, [lessons, search, branchFilter, typeFilter, ageFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; rows: typeof filtered }>();
    for (const row of filtered) {
      const id = row.lesson.branch_id || 'none';
      const name = row.lesson.branch_name?.trim() || 'ללא סניף';
      const existing = groups.get(id);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(id, { id, name, rows: [row] });
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [filtered]);

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
        course_name: info?.course_name || picked?.course_name || enrollment.course_name,
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
        day_of_week: enrollment.day_of_week,
        start_time: enrollment.start_time,
        end_time: enrollment.end_time,
      })
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:max-h-[min(90vh,720px)]" dir="rtl">
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

          <input
            type="search"
            className="input w-full"
            placeholder="חיפוש שיעור..."
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
            <p className="text-sm text-muted-foreground">טוען שיעורים…</p>
          ) : (
            <div className="max-h-[min(48vh,360px)] space-y-3 overflow-y-auto pe-1">
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא נמצאו שיעורים.</p>
              ) : grouped.map((group) => (
                <section key={group.id} className="space-y-2">
                  <h3 className="sticky top-0 z-[1] bg-white py-1 text-xs font-semibold text-muted-foreground">
                    {group.name}
                  </h3>
                  {group.rows.map(({ lesson, label }) => {
                    const active = selectedId === lesson.id;
                    const isCurrent = lesson.id === enrollment?.lesson_id;
                    const ageLabel = formatAgeRange(lesson.min_age, lesson.max_age);
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
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                            }`}
                          >
                            {active ? <Check className="h-3 w-3" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium leading-snug">{label}</span>
                            {ageLabel || lesson.course_type_name ? (
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {[lesson.course_type_name, ageLabel].filter(Boolean).join(' · ')}
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
