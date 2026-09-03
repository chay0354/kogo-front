'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import api from '@/lib/api';

interface GapLesson {
  lesson_id: string;
  course_name: string;
  course_display_id?: number | null;
  branch_name: string;
  occurrence_date: string;
  start_time: string;
  days_open: number;
  roster: number;
  marked: number;
}

interface GapInstructor {
  instructor_id: string;
  instructor_name: string;
  instructor_phone: string;
  branch_name: string;
  open_count: number;
  oldest_days_open: number;
  needs_attention: boolean;
  lessons: GapLesson[];
}

interface RegisterGapsResponse {
  days: number;
  alert_after_days: number;
  open_count: number;
  needs_attention_count: number;
  instructors: GapInstructor[];
}

type GapFilter = 'attention' | 'all';

function formatDay(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

/** מדריכים שלא הקריאו נוכחות — התראה קטנה שנפתחת לרשימה מסוננת. */
export default function RegisterGapsAlert() {
  const [data, setData] = useState<RegisterGapsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<GapFilter>('attention');
  const [branch, setBranch] = useState('all');

  useEffect(() => {
    let live = true;
    api
      .get('/enrollments/register-gaps/')
      .then((response) => {
        if (live) setData(response.data as RegisterGapsResponse);
      })
      .catch(() => {
        if (live) setData(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const branches = useMemo(() => {
    const names = new Set<string>();
    data?.instructors.forEach((row) => row.lessons.forEach((lesson) => {
      if (lesson.branch_name) names.add(lesson.branch_name);
    }));
    return [...names].sort((a, b) => a.localeCompare(b, 'he'));
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const minDays = filter === 'attention' ? data.alert_after_days : 0;
    return data.instructors
      .map((row) => ({
        ...row,
        lessons: row.lessons.filter(
          (lesson) =>
            lesson.days_open >= minDays && (branch === 'all' || lesson.branch_name === branch),
        ),
      }))
      .filter((row) => row.lessons.length > 0);
  }, [data, filter, branch]);

  if (!data || data.needs_attention_count === 0) return null;

  const lessonsShown = rows.reduce((sum, row) => sum + row.lessons.length, 0);

  return (
    <div className="card mb-4 border-r-4 border-amber-500 py-3 px-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-right"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span className="font-medium">
            {data.needs_attention_count} מדריכים לא הקריאו נוכחות
          </span>
          <span className="text-xs text-muted-foreground">
            ({data.open_count} שיעורים פתוחים, מ־{data.alert_after_days} ימים ומעלה)
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as GapFilter)}
              className="input max-w-[220px]"
            >
              <option value="attention">פתוח {data.alert_after_days} ימים ומעלה</option>
              <option value="all">כל מה שלא הוקרא ({data.days} ימים אחרונים)</option>
            </select>
            {branches.length > 1 && (
              <select
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="input max-w-[220px]"
              >
                <option value="all">כל הסניפים</option>
                {branches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-muted-foreground">{lessonsShown} שיעורים</span>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              אין שיעורים פתוחים בסינון הזה
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.instructor_id}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{row.instructor_name}</span>
                    <span className="text-xs text-muted-foreground">{row.instructor_phone}</span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {row.lessons.map((lesson) => (
                      <li
                        key={`${lesson.lesson_id}-${lesson.occurrence_date}`}
                        className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1"
                      >
                        <span>{lesson.course_name}</span>
                        <span className="text-muted-foreground">{lesson.branch_name}</span>
                        <span className="text-muted-foreground" dir="ltr">
                          {lesson.start_time}
                        </span>
                        <span className="text-muted-foreground">{formatDay(lesson.occurrence_date)}</span>
                        <span className="badge-info">
                          {lesson.marked}/{lesson.roster} סומנו
                        </span>
                        <span
                          className={
                            lesson.days_open >= data.alert_after_days ? 'badge-warning' : 'badge-info'
                          }
                        >
                          {lesson.days_open === 1 ? 'מאתמול' : `${lesson.days_open} ימים`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
