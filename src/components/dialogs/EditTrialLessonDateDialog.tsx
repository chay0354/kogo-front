'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import api from '@/lib/api';
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type TrialDateOption = {
  date: string;
  label: string;
  is_current?: boolean;
};

type Props = {
  enrollmentId: string | null;
  childName: string;
  courseName?: string;
  currentDate?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (nextDate: string) => void;
};

function formatHeDate(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function EditTrialLessonDateDialog({
  enrollmentId,
  childName,
  courseName,
  currentDate,
  isOpen,
  onClose,
  onSaved,
}: Props) {
  const [dates, setDates] = useState<TrialDateOption[]>([]);
  const [dayName, setDayName] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [lessonTitle, setLessonTitle] = useState(courseName || '');
  const [selected, setSelected] = useState(currentDate || '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (!enrollmentId) {
      setDates([]);
      setError('לא נמצא שיעור ניסיון רשום לילד זה');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setSelected(currentDate || '');
    api.get(`/enrollments/lesson-enrollments/${enrollmentId}/trial-dates/`)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data?.dates) ? res.data.dates as TrialDateOption[] : [];
        setDates(rows);
        setLessonTitle(res.data?.course_name || courseName || '');
        setDayName(res.data?.day_name || '');
        const start = res.data?.start_time || '';
        const end = res.data?.end_time || '';
        setTimeRange(start && end ? `${start}–${end}` : start);
        setSelected(res.data?.current_date || currentDate || rows[0]?.date || '');
      })
      .catch(() => {
        if (!cancelled) setError('לא ניתן לטעון תאריכי שיעור ניסיון');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, enrollmentId, currentDate, courseName]);

  const handleSave = async () => {
    if (!enrollmentId || !selected) {
      setError('יש לבחור תאריך');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/enrollments/lesson-enrollments/${enrollmentId}/`, {
        trial_lesson_date: selected,
      });
      onSaved(selected);
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { trial_lesson_date?: string | string[]; error?: string } } })?.response?.data;
      const field = data?.trial_lesson_date;
      setError(
        (Array.isArray(field) ? field[0] : field) ||
        data?.error ||
        'לא ניתן לשמור את תאריך שיעור הניסיון',
      );
    } finally {
      setSaving(false);
    }
  };

  const unchanged = Boolean(currentDate && selected === currentDate);
  const meta = [dayName ? `ימי ${dayName}` : '', timeRange].filter(Boolean).join(' · ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:max-h-[min(90vh,640px)]" dir="rtl">
        <div className="absolute left-3 top-3 z-10">
          <DialogCloseButton />
        </div>
        <DialogHeader className="px-5 pt-5 pe-12 sm:px-6 sm:pt-6">
          <DialogTitle className="text-lg">שיעור ניסיון</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{childName}</p>
        </DialogHeader>

        <div className="px-5 sm:px-6 pb-4 space-y-4">
          {lessonTitle || meta ? (
            <div className="flex items-start gap-3 rounded-xl bg-muted/50 px-3 py-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                {lessonTitle ? <p className="font-semibold leading-snug">{lessonTitle}</p> : null}
                {meta ? <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p> : null}
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">טוען תאריכים…</p>
          ) : dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תאריכי שיעור זמינים.</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">בחרו תאריך</p>
              <div className="max-h-[min(48vh,360px)] space-y-2 overflow-y-auto pe-1">
                {dates.map((row) => {
                  const active = selected === row.date;
                  const isCurrent = Boolean(row.is_current || row.date === currentDate);
                  return (
                    <button
                      key={row.date}
                      type="button"
                      onClick={() => setSelected(row.date)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition-colors ${
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                          }`}
                        >
                          {active ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="font-medium">{formatHeDate(row.date)}</span>
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
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4 sm:px-6">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>ביטול</button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={saving || loading || !selected || unchanged}
            onClick={handleSave}
          >
            {saving ? 'שומר...' : 'שמור תאריך'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
