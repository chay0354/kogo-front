'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchTrialLessonsOnDate, type TrialLessonOnDate } from '@/lib/api';

type Scope = 'all' | 'specific';

interface Props {
  /** YYYY-MM-DD, the day the office clicked. */
  date: string;
  dateLabel: string;
  onCancel: () => void;
  onConfirm: (choice: { reason: string; lessonIds: string[] }) => Promise<void> | void;
}

const ALL = 'all';

/**
 * Sort key for an age band '5-6': by its youngest stage, then its oldest, so
 * 'גן 3-4.5' comes before 'גן 3-4.5–גן 4.5-6'. Unknowns last.
 */
function ageOrder(key: string): number {
  const [lowRaw, highRaw] = key.split('-');
  const low = Number.parseInt(lowRaw ?? '', 10);
  const high = Number.parseInt(highRaw ?? '', 10);
  if (!Number.isFinite(low)) return 1_000_000;
  return low * 100 + (Number.isFinite(high) ? high : 99);
}

/**
 * Closing a date for trials — for everything, or for chosen lessons.
 *
 * The two answers are asked before anything is written, because they are not
 * variations of one action: closing the whole day is a holiday, and closing
 * three lessons is a room being used. The screen that only ever did the first
 * made the second impossible to express, so the office closed the entire day
 * and hand-moved the trials that should never have moved.
 *
 * The list is the lessons that genuinely meet that day, so a block cannot name
 * a lesson that was never going to run — a row nobody could explain later.
 */
export default function BlockTrialDateDialog({ date, dateLabel, onCancel, onConfirm }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [reason, setReason] = useState('');
  const [lessons, setLessons] = useState<TrialLessonOnDate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [branch, setBranch] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [age, setAge] = useState(ALL);

  // Loaded once for the date; the filters below narrow it in the browser so
  // ticking a lesson and then changing a filter never loses the tick.
  useEffect(() => {
    if (scope !== 'specific' || lessons.length > 0) return;
    let cancelled = false;
    setLoading(true);
    fetchTrialLessonsOnDate(date)
      .then((rows) => {
        if (!cancelled) setLessons(rows);
      })
      .catch(() => {
        if (!cancelled) setError('טעינת השיעורים של היום הזה נכשלה');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, date, lessons.length]);

  // The filters narrow in order — branch, then kind of class, then age — and
  // each one offers only what is left after the ones before it. Independent
  // lists let the office pick a class that does not run in the chosen branch
  // and be told "no lessons match", with no hint why.
  const inBranch = useMemo(
    () => lessons.filter((l) => branch === ALL || l.branch_id === branch),
    [lessons, branch],
  );
  const inKind = useMemo(
    () => inBranch.filter((l) => kind === ALL || l.course_type_id === kind),
    [inBranch, kind],
  );
  const shown = useMemo(
    () => inKind.filter((l) => age === ALL || l.age_key === age),
    [inKind, age],
  );

  const options = useMemo(() => {
    const unique = (rows: { id: string; label: string }[]) =>
      [...new Map(rows.map((r) => [r.id, r])).values()];
    return {
      branches: unique(
        lessons.filter((l) => l.branch_id).map((l) => ({ id: l.branch_id as string, label: l.branch_name })),
      ).sort((a, b) => a.label.localeCompare(b.label, 'he')),
      kinds: unique(
        inBranch.filter((l) => l.course_type_id).map((l) => ({ id: l.course_type_id as string, label: l.course_type_name })),
      ).sort((a, b) => a.label.localeCompare(b.label, 'he')),
      // Youngest first, the order a timetable reads in — not alphabetical,
      // which would put כיתה א after גן.
      ages: unique(inKind.filter((l) => l.age_key).map((l) => ({ id: l.age_key, label: l.age_label })))
        .sort((a, b) => ageOrder(a.id) - ageOrder(b.id)),
    };
  }, [lessons, inBranch, inKind]);

  // A narrower choice upstream can leave a later filter pointing at something
  // no longer on offer; drop it rather than show an empty list.
  useEffect(() => {
    if (kind !== ALL && !options.kinds.some((o) => o.id === kind)) setKind(ALL);
  }, [kind, options.kinds]);
  useEffect(() => {
    if (age !== ALL && !options.ages.some((o) => o.id === age)) setAge(ALL);
  }, [age, options.ages]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    const ids = shown.map((l) => l.id);
    const allPicked = ids.length > 0 && ids.every((id) => picked.has(id));
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allPicked ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  const canSave = scope === 'all' || picked.size > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm({ reason: reason.trim(), lessonIds: scope === 'all' ? [] : [...picked] });
    } catch {
      setError('החסימה נכשלה');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`חסימת ${dateLabel} לשיעורי ניסיון`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <CalendarX2 className="h-5 w-5 text-primary" />
          <h2 className="flex-1 text-base font-semibold">חסימת {dateLabel} לשיעורי ניסיון</h2>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="סגירה" className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">מה לחסום ביום הזה?</legend>
            {([
              ['all', 'כל החוגים', 'היום כולו סגור לשיעורי ניסיון.'],
              ['specific', 'חוגים מסוימים', 'רק השיעורים שתבחרו. השאר ימשיכו כרגיל.'],
            ] as const).map(([value, title, hint]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${scope === value ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    disabled={saving}
                  />
                  <span className="font-medium">{title}</span>
                </div>
                <p className="mt-1 pr-6 text-xs text-muted-foreground">{hint}</p>
              </label>
            ))}
          </fieldset>

          {scope === 'specific' && (
            <div className="mt-4">
              {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> טוען את השיעורים של היום הזה…
                </div>
              ) : lessons.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">אין שיעורים שמתקיימים בתאריך הזה.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      ['סניף', branch, setBranch, options.branches],
                      ['חוג', kind, setKind, options.kinds],
                      ['גיל', age, setAge, options.ages],
                    ] as const).map(([label, value, set, opts]) => (
                      <label key={label} className="text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <select
                          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          disabled={saving}
                        >
                          <option value={ALL}>הכל</option>
                          {opts.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {shown.length} שיעורים · נבחרו {picked.size}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={toggleShown} disabled={saving || shown.length === 0}>
                      {shown.length > 0 && shown.every((l) => picked.has(l.id)) ? 'נקה את המסומנים' : 'בחר את כל המוצגים'}
                    </Button>
                  </div>

                  <ul className="mt-2 divide-y rounded-lg border">
                    {shown.map((lesson) => (
                      <li key={lesson.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={picked.has(lesson.id)}
                            onChange={() => toggle(lesson.id)}
                            disabled={saving}
                          />
                          <span className="flex-1">
                            <span className="font-medium">{lesson.course_name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[lesson.branch_name, `${lesson.start_time}–${lesson.end_time}`, lesson.age_label, lesson.instructor_name]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                    {shown.length === 0 && (
                      <li className="px-3 py-4 text-sm text-muted-foreground">אין שיעורים שתואמים לסינון.</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}

          <label className="mt-4 block text-sm">
            <span className="text-muted-foreground">סיבה (לא חובה)</span>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="למשל: ראש השנה, אירוע בסטודיו"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>ביטול</Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : scope === 'all' ? 'חסום את כל היום' : `חסום ${picked.size} שיעורים`}
          </Button>
        </footer>
      </div>
    </div>
  );
}
