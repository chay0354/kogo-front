'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api, { fetchBranchesList, fetchCourseTypesList } from '@/lib/api';
import type { TrialRegistrationChoice } from '@/types/course';

/**
 * Who may book a trial, and where.
 *
 * The rule at the top answers for every lesson that has no answer of its
 * own. The drill-down below it — branch, course type, age — narrows the
 * lessons to the one whose trial button should go, and sets that lesson's
 * own answer, which then survives the rule being flipped.
 */

type Option = { id: string; name: string };

type LessonRow = {
  lesson_id: string;
  course_id: string;
  course_name: string;
  course_display_id: number;
  course_type_name: string;
  branch_id: string;
  branch_name: string;
  min_age: number | null;
  max_age: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor_name: string;
  override: boolean | null;
  effective: boolean;
};

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const AGE_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'כל הגילאים' },
  ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 3), label: `גיל ${i + 3}` })),
  { value: '19', label: 'בוגרים (18+)' },
];

function choiceOf(override: boolean | null): TrialRegistrationChoice {
  if (override === true) return 'open';
  if (override === false) return 'closed';
  return 'rule';
}

function flagOf(choice: TrialRegistrationChoice): boolean | null {
  if (choice === 'open') return true;
  if (choice === 'closed') return false;
  return null;
}

function ageLabel(row: LessonRow): string {
  if (row.min_age == null && row.max_age == null) return 'כל הגילאים';
  if (row.max_age == null) return `${row.min_age}+`;
  if (row.min_age == null) return `עד ${row.max_age}`;
  return `${row.min_age}–${row.max_age}`;
}

export default function TrialRegistrationSection() {
  const [rule, setRule] = useState<boolean | null>(null);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [branches, setBranches] = useState<Option[]>([]);
  const [courseTypes, setCourseTypes] = useState<Option[]>([]);
  const [branch, setBranch] = useState('');
  const [courseType, setCourseType] = useState('');
  const [age, setAge] = useState('');
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busyLesson, setBusyLesson] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [policy, branchList, typeList] = await Promise.all([
          api.get('/enrollments/trial-registration-policy/'),
          fetchBranchesList(),
          fetchCourseTypesList(),
        ]);
        if (cancelled) return;
        setRule(Boolean(policy.data?.trials_open));
        setBranches((branchList as Option[]).map((b) => ({ id: b.id, name: b.name })));
        setCourseTypes((typeList as Option[]).map((t) => ({ id: t.id, name: t.name })));
      } catch {
        if (!cancelled) setError('טעינת ההגדרות נכשלה');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    setError('');
    try {
      const { data } = await api.get('/enrollments/trial-registration/lessons/', {
        params: {
          branch: branch || undefined,
          course_type: courseType || undefined,
          age: age || undefined,
        },
      });
      setRows(data?.results ?? []);
      if (typeof data?.trials_open_by_default === 'boolean') setRule(data.trials_open_by_default);
    } catch {
      setError('טעינת השיעורים נכשלה');
    } finally {
      setLoadingRows(false);
    }
  }, [branch, courseType, age]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function flipRule(next: boolean) {
    setRuleBusy(true);
    setError('');
    try {
      const { data } = await api.put('/enrollments/trial-registration-policy/', { trials_open: next });
      setRule(Boolean(data?.trials_open));
      await loadRows();
    } catch {
      setError('שינוי הכלל נכשל');
    } finally {
      setRuleBusy(false);
    }
  }

  async function setLesson(row: LessonRow, choice: TrialRegistrationChoice) {
    setBusyLesson(row.lesson_id);
    setError('');
    try {
      await api.patch(`/courses/lessons/${row.lesson_id}/`, { trial_registration_open: flagOf(choice) });
      await loadRows();
    } catch {
      setError('שמירת השיעור נכשלה');
    } finally {
      setBusyLesson(null);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="trial-registration-heading">
      <div>
        <h2 id="trial-registration-heading" className="text-lg font-semibold text-gray-900">
          הרשמה לשיעור ניסיון
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          הכלל חל על כל שיעור שלא נקבע לו אחרת. שיעור שסומן כאן או בעריכת השיעור שומר על ההגדרה שלו גם כשהכלל משתנה.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-gray-900">הכלל הכללי</div>
          <div className="text-sm text-gray-500">
            {rule === null ? 'טוען…' : rule ? 'ההרשמה לשיעור ניסיון פתוחה בכל השיעורים' : 'ההרשמה לשיעור ניסיון סגורה — הכפתור לא מוצג בווידג\'ט'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rule === true}
          disabled={rule === null || ruleBusy}
          onClick={() => rule !== null && flipRule(!rule)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${rule ? 'bg-emerald-500' : 'bg-gray-300'}`}
          aria-label="הרשמה לשיעור ניסיון פתוחה"
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${rule ? '-translate-x-6' : '-translate-x-1'}`} />
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <div className="font-medium text-gray-900">סגירה או פתיחה לשיעור מסוים</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">סניף</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="">כל הסניפים</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">סוג חוג</span>
            <select value={courseType} onChange={(e) => setCourseType(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="">כל סוגי החוגים</option>
              {courseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">גיל</span>
            <select value={age} onChange={(e) => setAge(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2">
              {AGE_CHOICES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        {loadingRows ? (
          <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> טוען שיעורים…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500">אין שיעורים שמתאימים לסינון.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-gray-500 border-b">
                  <th className="py-2 pe-2 font-medium">חוג</th>
                  <th className="py-2 pe-2 font-medium">סניף</th>
                  <th className="py-2 pe-2 font-medium">גילאים</th>
                  <th className="py-2 pe-2 font-medium">מועד</th>
                  <th className="py-2 pe-2 font-medium">מדריך/ה</th>
                  <th className="py-2 pe-2 font-medium">ניסיון בפועל</th>
                  <th className="py-2 font-medium">הגדרה לשיעור</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.lesson_id} className="border-b last:border-0">
                    <td className="py-2 pe-2">
                      <div className="font-medium text-gray-900">{row.course_name}</div>
                      <div className="text-xs text-gray-500">#{row.course_display_id}{row.course_type_name ? ` · ${row.course_type_name}` : ''}</div>
                    </td>
                    <td className="py-2 pe-2">{row.branch_name}</td>
                    <td className="py-2 pe-2">{ageLabel(row)}</td>
                    <td className="py-2 pe-2 whitespace-nowrap">{DAY_NAMES[row.day_of_week] ?? ''} {row.start_time}–{row.end_time}</td>
                    <td className="py-2 pe-2">{row.instructor_name || '—'}</td>
                    <td className="py-2 pe-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${row.effective ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {row.effective ? 'פתוח' : 'סגור'}
                      </span>
                    </td>
                    <td className="py-2">
                      <select
                        value={choiceOf(row.override)}
                        disabled={busyLesson === row.lesson_id}
                        onChange={(e) => setLesson(row, e.target.value as TrialRegistrationChoice)}
                        className="rounded-md border border-gray-300 px-2 py-1"
                        aria-label={`הרשמה לניסיון — ${row.course_name}, ${DAY_NAMES[row.day_of_week] ?? ''} ${row.start_time}`}
                      >
                        <option value="rule">לפי הכלל</option>
                        <option value="open">פתוח</option>
                        <option value="closed">סגור</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
