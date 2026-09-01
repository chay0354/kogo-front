'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import api from '@/lib/api';
import { AGE_OPTIONS, formatAge, formatAgeRange, getDayName } from '@/lib/courseUtils';
import { sortWidgetCourseTypes } from '@/app/widget/courseTypeOrder';
import { unwrapApiList } from '@/lib/scopedFilters';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
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
  must_attend_all_lessons?: boolean;
  day_of_week: number;
  day_name?: string;
  start_time: string;
  end_time: string;
  status?: string;
};

type BundleRow = {
  id: string;
  course: string;
  course_name?: string;
  name?: string;
  is_active?: boolean;
  lessons_detail?: Array<{
    id: string;
    day_of_week: number;
    day_name?: string;
    start_time: string;
    end_time: string;
  }>;
};

type Offering = {
  key: string;
  kind: 'lesson' | 'bundle' | 'course';
  courseId: string;
  courseName: string;
  lessonId?: string;
  bundleId?: string;
  slots: LessonOption[];
  branch_id: string | null;
  branch_name: string | null;
  course_type: string | null;
  course_type_name: string | null;
  min_age: number | null;
  max_age: number | null;
  frequencyLabel: string;
};

type TrialDateOption = {
  date: string;
  label: string;
  is_current?: boolean;
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

function timesPerWeekLabel(count: number): string {
  if (count <= 1) return 'פעם בשבוע';
  if (count === 2) return 'פעמיים בשבוע';
  return `${count} פעמים בשבוע`;
}

function formatSlots(slots: Array<Pick<LessonOption, 'day_of_week' | 'day_name' | 'start_time'>>): string {
  return [...slots]
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0) || slotTime(a.start_time).localeCompare(slotTime(b.start_time)))
    .map((lesson) => {
      const day = lesson.day_name || getDayName(lesson.day_of_week);
      const time = slotTime(lesson.start_time);
      return [day, time].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' · ');
}

function lessonMatchesAge(lesson: Pick<LessonOption, 'min_age' | 'max_age'>, ageValue: string): boolean {
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

function offeringFromLesson(lesson: LessonOption): Offering {
  const courseId = String(lesson.course || '');
  return {
    key: `lesson:${lesson.id}`,
    kind: 'lesson',
    courseId,
    courseName: lesson.course_name || '',
    lessonId: lesson.id,
    slots: [lesson],
    branch_id: lesson.branch_id || null,
    branch_name: lesson.branch_name || null,
    course_type: lesson.course_type ? String(lesson.course_type) : null,
    course_type_name: lesson.course_type_name || null,
    min_age: lesson.min_age ?? null,
    max_age: lesson.max_age ?? null,
    frequencyLabel: timesPerWeekLabel(1),
  };
}

function offeringFromBundle(bundle: BundleRow, courseLessons: LessonOption[]): Offering | null {
  const courseId = String(bundle.course || '');
  const meta = courseLessons[0];
  const slots: LessonOption[] = (bundle.lessons_detail || []).map((row) => {
    const match = courseLessons.find((lesson) => lesson.id === row.id);
    return match || {
      id: row.id,
      course: courseId,
      course_name: bundle.course_name || meta?.course_name,
      course_type: meta?.course_type,
      course_type_name: meta?.course_type_name,
      branch_id: meta?.branch_id,
      branch_name: meta?.branch_name,
      min_age: meta?.min_age,
      max_age: meta?.max_age,
      day_of_week: row.day_of_week,
      day_name: row.day_name,
      start_time: row.start_time,
      end_time: row.end_time,
    };
  });
  if (!slots.length) return null;
  return {
    key: `bundle:${bundle.id}`,
    kind: 'bundle',
    courseId,
    courseName: bundle.course_name || meta?.course_name || '',
    bundleId: bundle.id,
    slots,
    branch_id: meta?.branch_id || null,
    branch_name: meta?.branch_name || null,
    course_type: meta?.course_type ? String(meta.course_type) : null,
    course_type_name: meta?.course_type_name || null,
    min_age: meta?.min_age ?? null,
    max_age: meta?.max_age ?? null,
    frequencyLabel: timesPerWeekLabel(slots.length),
  };
}

function buildOfferings(lessons: LessonOption[], bundles: BundleRow[]): Offering[] {
  const byCourse = new Map<string, LessonOption[]>();
  for (const lesson of lessons) {
    const id = String(lesson.course || '');
    if (!id) continue;
    const existing = byCourse.get(id);
    if (existing) existing.push(lesson);
    else byCourse.set(id, [lesson]);
  }

  const offerings: Offering[] = [];
  for (const [courseId, courseLessons] of byCourse.entries()) {
    const mustAttend = courseLessons.some((lesson) => lesson.must_attend_all_lessons);
    const courseBundles = bundles.filter((bundle) => String(bundle.course) === courseId && bundle.is_active !== false);
    if (!mustAttend) {
      for (const lesson of courseLessons) {
        offerings.push(offeringFromLesson(lesson));
      }
    }
    for (const bundle of courseBundles) {
      const offering = offeringFromBundle(bundle, courseLessons);
      if (offering) offerings.push(offering);
    }
    if (mustAttend && courseBundles.length === 0 && courseLessons.length) {
      const first = courseLessons[0];
      offerings.push({
        key: `course:${courseId}`,
        kind: 'course',
        courseId,
        courseName: first.course_name || '',
        slots: courseLessons,
        branch_id: first.branch_id || null,
        branch_name: first.branch_name || null,
        course_type: first.course_type ? String(first.course_type) : null,
        course_type_name: first.course_type_name || null,
        min_age: first.min_age ?? null,
        max_age: first.max_age ?? null,
        frequencyLabel: timesPerWeekLabel(courseLessons.length),
      });
    }
  }
  return offerings;
}

function currentOfferingKey(
  enrollment: EnrollmentDetail | null,
  slots: EnrollmentDetail[],
  offerings: Offering[],
): string {
  if (!enrollment) return '';
  if (enrollment.bundle_id) return `bundle:${enrollment.bundle_id}`;
  if (slots.length > 1) {
    const slotIds = new Set(slots.map((slot) => slot.lesson_id));
    const match = offerings.find((offering) => (
      offering.kind === 'bundle'
      && offering.slots.length === slotIds.size
      && offering.slots.every((slot) => slotIds.has(slot.id))
    ));
    if (match) return match.key;
    const courseMatch = offerings.find((offering) => (
      offering.kind === 'course' && offering.courseId === enrollment.course_id
    ));
    if (courseMatch) return courseMatch.key;
  }
  return enrollment.lesson_id ? `lesson:${enrollment.lesson_id}` : '';
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
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedDate, setSelectedDate] = useState(enrollment?.trial_lesson_date || '');
  const [trialDates, setTrialDates] = useState<TrialDateOption[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isTrial = Boolean(enrollment?.trial_lesson_date);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setTypeFilter('all');
    setAgeFilter('all');
    setError('');
    setLoading(true);
    Promise.all([
      api.get('/courses/lessons/'),
      api.get('/courses/bundles/?is_active=true'),
    ])
      .then(([lessonRes, bundleRes]) => {
        const rows = unwrapApiList<LessonOption>(lessonRes.data).filter((row) => row.status !== 'cancelled');
        const bundleRows = unwrapApiList<BundleRow>(bundleRes.data);
        setLessons(rows);
        setBundles(bundleRows);
        const current = rows.find((row) => row.id === enrollment?.lesson_id);
        setBranchFilter(current?.branch_id || 'all');
      })
      .catch(() => setError('לא ניתן לטעון את רשימת החוגים'))
      .finally(() => setLoading(false));
  }, [isOpen, enrollment?.lesson_id, enrollment?.course_id]);

  const offerings = useMemo(() => {
    if (isTrial) {
      return lessons.map((lesson) => offeringFromLesson(lesson));
    }
    return buildOfferings(lessons, bundles);
  }, [lessons, bundles, isTrial]);
  const currentKey = useMemo(
    () => currentOfferingKey(enrollment, slots, offerings),
    [enrollment, slots, offerings],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedKey(currentKey);
    setSelectedDate(enrollment?.trial_lesson_date || '');
  }, [isOpen, currentKey, enrollment?.trial_lesson_date]);

  const branchOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const offering of offerings) {
      if (!offering.branch_id || !offering.branch_name) continue;
      byId.set(offering.branch_id, offering.branch_name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [offerings]);

  const typeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const offering of offerings) {
      if (!offering.course_type || !offering.course_type_name) continue;
      byId.set(offering.course_type, offering.course_type_name);
    }
    return sortWidgetCourseTypes(
      [...byId.entries()].map(([id, name]) => ({ id, name })),
    );
  }, [offerings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offerings.filter((offering) => {
      if (branchFilter !== 'all' && offering.branch_id !== branchFilter) return false;
      if (typeFilter !== 'all' && String(offering.course_type || '') !== typeFilter) return false;
      if (!offering.slots.some((slot) => lessonMatchesAge(offering, ageFilter) || lessonMatchesAge(slot, ageFilter))) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        offering.courseName,
        offering.frequencyLabel,
        formatSlots(offering.slots),
        offering.branch_name,
        offering.course_type_name,
        formatAgeRange(offering.min_age, offering.max_age),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [offerings, search, branchFilter, typeFilter, ageFilter]);

  const grouped = useMemo(() => {
    const branches = new Map<string, {
      id: string;
      name: string;
      courses: Map<string, { id: string; name: string; rows: Offering[] }>;
    }>();
    for (const offering of filtered) {
      const branchId = offering.branch_id || 'none';
      const branchName = offering.branch_name?.trim() || 'ללא סניף';
      let branch = branches.get(branchId);
      if (!branch) {
        branch = { id: branchId, name: branchName, courses: new Map() };
        branches.set(branchId, branch);
      }
      let course = branch.courses.get(offering.courseId);
      if (!course) {
        course = { id: offering.courseId, name: offering.courseName, rows: [] };
        branch.courses.set(offering.courseId, course);
      }
      course.rows.push(offering);
    }
    const frequencyRank = (label: string) => (
      label === 'פעם בשבוע' ? 1 : label === 'פעמיים בשבוע' ? 2 : 3
    );
    return [...branches.values()]
      .map((branch) => ({
        ...branch,
        courses: [...branch.courses.values()].map((course) => ({
          ...course,
          rows: [...course.rows].sort((a, b) => {
            const freq = frequencyRank(a.frequencyLabel) - frequencyRank(b.frequencyLabel);
            if (freq !== 0) return freq;
            return formatSlots(a.slots).localeCompare(formatSlots(b.slots), 'he');
          }),
        })).sort((a, b) => a.name.localeCompare(b.name, 'he')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [filtered]);

  const selected = offerings.find((offering) => offering.key === selectedKey);
  const currentDate = enrollment?.trial_lesson_date || '';
  const trialChanged = isTrial && (selectedKey !== currentKey || selectedDate !== currentDate);
  const canSave = Boolean(selectedKey) && (isTrial ? trialChanged : selectedKey !== currentKey);

  useEffect(() => {
    if (!isOpen || !isTrial || !enrollment?.enrollment_id || !selected?.lessonId) {
      setTrialDates([]);
      return;
    }
    let cancelled = false;
    setLoadingDates(true);
    api.get(`/enrollments/lesson-enrollments/${enrollment.enrollment_id}/trial-dates/`, {
      params: { lesson_id: selected.lessonId },
    })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data?.dates) ? res.data.dates as TrialDateOption[] : [];
        setTrialDates(rows);
        setSelectedDate((prev) => {
          if (prev && rows.some((row) => row.date === prev)) return prev;
          return rows.find((row) => row.is_current)?.date || rows[0]?.date || '';
        });
      })
      .catch(() => {
        if (!cancelled) setError('לא ניתן לטעון תאריכי שיעור ניסיון');
      })
      .finally(() => {
        if (!cancelled) setLoadingDates(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, isTrial, enrollment?.enrollment_id, selected?.lessonId]);

  const handleSave = async () => {
    if (!enrollment?.enrollment_id || !selected) {
      setError('יש לבחור חוג');
      return;
    }
    if (!canSave) {
      onClose();
      return;
    }
    if (isTrial && !selectedDate) {
      setError('יש לבחור תאריך לשיעור ניסיון');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = isTrial
        ? { lesson_id: selected.lessonId, trial_lesson_date: selectedDate }
        : selected.kind === 'bundle'
          ? { bundle_id: selected.bundleId }
          : selected.kind === 'course'
            ? { course_id: selected.courseId }
            : { lesson_id: selected.lessonId };
      const res = await api.post(
        `/enrollments/lesson-enrollments/${enrollment.enrollment_id}/change-lesson/`,
        body,
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
    ? [
        enrollment.course_name,
        isTrial ? 'ניסיון' : timesPerWeekLabel(slots.length),
        formatSlots(slots.map((slot) => ({
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
        }))),
        isTrial && enrollment.trial_lesson_date
          ? enrollment.trial_lesson_date.split('-').reverse().join('/')
          : '',
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:max-h-[min(90vh,720px)]" overlayClassName="z-[60]" dir="rtl">
        <div className="absolute left-3 top-3 z-10">
          <DialogCloseButton />
        </div>
        <DialogHeader className="px-5 pt-5 pe-12 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg">{isTrial ? 'החלפת שיעור ניסיון' : 'החלפת חוג'}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{childName}</p>
        </DialogHeader>

        <div className="px-5 sm:px-6 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {isTrial
              ? 'אפשר להחליף יום או חוג ולבחור תאריך לשיעור הניסיון.'
              : 'המחיר החודשי לא משתנה. אפשר לבחור פעם, פעמיים או שלוש פעמים בשבוע לאותו חוג.'}
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
            <div className="max-h-[min(48vh,360px)] space-y-3 overflow-hidden pe-1" aria-busy="true" aria-label="טוען חוגים">
              {Array.from({ length: 2 }).map((_, group) => (
                <section key={group} className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-[68px] rounded-xl" />
                  <Skeleton className="h-[68px] rounded-xl" />
                </section>
              ))}
            </div>
          ) : (
            <div className="max-h-[min(48vh,360px)] space-y-3 overflow-y-auto pe-1">
              {grouped.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא נמצאו חוגים.</p>
              ) : grouped.map((branch) => (
                <section key={branch.id} className="space-y-3">
                  <h3 className="sticky top-0 z-[1] bg-white py-1 text-xs font-semibold text-muted-foreground">
                    {branch.name}
                  </h3>
                  {branch.courses.map((course) => (
                    <div key={course.id} className="space-y-2">
                      <p className="text-sm font-semibold">{course.name}</p>
                      {course.rows.map((offering) => {
                        const active = selectedKey === offering.key;
                        const isCurrent = offering.key === currentKey;
                        const ageLabel = formatAgeRange(offering.min_age, offering.max_age);
                        return (
                          <button
                            key={offering.key}
                            type="button"
                            onClick={() => setSelectedKey(offering.key)}
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
                                <span className="block font-medium leading-snug">{offering.frequencyLabel}</span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {formatSlots(offering.slots)}
                                </span>
                                {ageLabel || offering.course_type_name ? (
                                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                    {[offering.course_type_name, ageLabel].filter(Boolean).join(' · ')}
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
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {isTrial ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">תאריך שיעור ניסיון</p>
              {loadingDates ? (
                <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="טוען תאריכים">
                  {Array.from({ length: 4 }).map((_, slot) => (
                    <Skeleton key={slot} className="h-[38px] rounded-xl" />
                  ))}
                </div>
              ) : trialDates.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין תאריכים פנויים לשיעור שנבחר.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {trialDates.map((row) => {
                    const active = selectedDate === row.date;
                    return (
                      <button
                        key={row.date}
                        type="button"
                        onClick={() => setSelectedDate(row.date)}
                        className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                          active ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        {row.label}
                        {row.is_current ? (
                          <span className="mt-0.5 block text-[11px] text-orange-800">נוכחי</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4 sm:px-6">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={saving || loading || !canSave}
            onClick={handleSave}
          >
            {saving ? 'שומר...' : isTrial ? 'שמור' : 'החלף חוג'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
