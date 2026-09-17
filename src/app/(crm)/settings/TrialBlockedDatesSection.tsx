'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BlockTrialDateDialog from './BlockTrialDateDialog';
import {
  createTrialBlockedDate,
  deleteTrialBlockedDate,
  fetchConfiguredTrialBlockedDates,
  fetchTrialBlockedDates,
  type TrialBlockedDate,
} from '@/lib/api';

const DAY_HEADERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function ymd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function todayYmd(): string {
  return ymd(new Date());
}

/** 'YYYY-MM-DD' as a local date — `new Date('YYYY-MM-DD')` would parse it as UTC midnight. */
function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function hebrewDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return parseYmd(value).toLocaleDateString('he-IL', options);
}

/**
 * תאריכים חסומים לשיעורי ניסיון — the office's calendar of days a trial
 * cannot be booked on. A blocked day disappears from the widget's date picker,
 * is refused on submit, and cannot be set from the CRM. Blocking a day that
 * already holds trial bookings moves them to the next open date and says how
 * many moved — so no parent stays booked on a day the studio is closed.
 */
export default function TrialBlockedDatesSection() {
  const [rows, setRows] = useState<TrialBlockedDate[]>([]);
  const [configured, setConfigured] = useState<string[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** The day the office clicked, waiting on "all courses or some of them". */
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [office, fixed] = await Promise.all([fetchTrialBlockedDates(), fetchConfiguredTrialBlockedDates()]);
      setRows(office);
      setConfigured(fixed);
      setError('');
    } catch {
      setError('טעינת התאריכים החסומים נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const officeByDate = useMemo(() => new Map(rows.map((row) => [row.date, row])), [rows]);
  const configuredSet = useMemo(() => new Set(configured), [configured]);
  const today = todayYmd();

  // The month grid: leading blanks so the 1st lands on its weekday (Sunday first).
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const blanks = Array.from({ length: first.getDay() }, () => null);
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));
    return [...blanks, ...days];
  }, [month]);

  async function block(date: string, choice: { reason: string; lessonIds: string[] }) {
    setBusy(date);
    setNotice('');
    try {
      const created = await createTrialBlockedDate({
        date,
        reason: choice.reason,
        lesson_ids: choice.lessonIds,
      });
      setRows((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setPending(null);
      const parts = [];
      if (choice.lessonIds.length) {
        parts.push(`${choice.lessonIds.length} שיעורים נחסמו ביום הזה`);
      }
      if (created.moved === 1) parts.push('שיעור ניסיון אחד הועבר לתאריך הבא');
      if (created.moved > 1) parts.push(`${created.moved} שיעורי ניסיון הועברו לתאריך הבא`);
      if (created.unmoved === 1) parts.push('שיעור ניסיון אחד לא ניתן היה להעביר — יש לטפל ידנית');
      if (created.unmoved > 1) parts.push(`${created.unmoved} לא ניתן היה להעביר — יש לטפל ידנית`);
      setNotice(parts.length ? parts.join(' · ') : 'התאריך נחסם');
      setError('');
    } catch (err) {
      setError('חסימת התאריך נכשלה');
      // Another manager may have blocked it meanwhile — show what is really there.
      void load();
      // Back to the dialog, which keeps the tick list: re-picking a dozen
      // lessons because the save failed once is its own small punishment.
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function unblock(row: TrialBlockedDate) {
    if (!confirm(`לפתוח מחדש את ${hebrewDate(row.date)} לשיעורי ניסיון?`)) return;
    setBusy(row.date);
    setNotice('');
    try {
      await deleteTrialBlockedDate(row.id);
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setError('');
    } catch {
      setError('פתיחת התאריך נכשלה');
    } finally {
      setBusy(null);
    }
  }

  const upcoming = rows.filter((row) => row.date >= today);
  const monthLabel = month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  return (
    <section className="rounded-xl border bg-white p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <CalendarX2 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">לוח שיעורי ניסיון</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        לחצו על יום כדי לסגור אותו לשיעורי ניסיון — לכל החוגים או לחלקם. יום סגור לא יוצע להורים, ומי שכבר נרשם אליו יועבר לתאריך הבא. לחיצה על יום סגור פותחת אותו מחדש.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> טוען…</div>
      ) : (
        <div className="grid gap-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="חודש קודם">
                <ChevronRight className="h-5 w-5" />
              </Button>
              <span className="text-xl font-semibold">{monthLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="חודש הבא">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-muted-foreground mb-2">
              {DAY_HEADERS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} />;
                const key = ymd(day);
                const office = officeByDate.get(key);
                const fixed = configuredSet.has(key);
                const past = key < today;
                const partial = Boolean(office?.lessons_detail?.length);
                const classes = [
                  'h-14 sm:h-20 rounded-lg text-base sm:text-lg border transition-colors',
                  office && !partial ? 'bg-red-100 border-red-300 text-red-800 font-medium' : '',
                  partial ? 'bg-amber-100 border-amber-300 text-amber-900 font-medium' : '',
                  fixed ? 'bg-gray-200 border-gray-300 text-gray-500' : '',
                  !office && !fixed && !past ? 'hover:bg-red-50 border-transparent' : '',
                  past && !office && !fixed ? 'text-gray-300 border-transparent' : '',
                ].join(' ');
                return (
                  <button
                    key={key}
                    type="button"
                    className={classes}
                    disabled={busy !== null || fixed || (past && !office)}
                    title={
                      fixed ? 'מוגדר בקונפיגורציה'
                        : partial ? `${office?.lessons_detail?.length} שיעורים חסומים${office?.reason ? ` — ${office.reason}` : ''}`
                        : office ? (office.reason || 'חסום') : ''
                    }
                    aria-label={`${hebrewDate(key)}${partial ? ' — חלק מהשיעורים חסומים' : office ? ' — חסום לכל החוגים' : fixed ? ' — מוגדר בקונפיגורציה' : ''}`}
                    aria-pressed={Boolean(office)}
                    onClick={() => (office ? unblock(office) : setPending(key))}
                  >
                    {busy === key ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-block h-3 w-3 rounded bg-red-100 border border-red-300" /> כל החוגים
              <span className="inline-block h-3 w-3 rounded bg-amber-100 border border-amber-300" /> חלק מהשיעורים
              <span className="inline-block h-3 w-3 rounded bg-gray-200 border border-gray-300" /> מוגדר בקונפיגורציה
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">ימים סגורים קרובים</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין ימים סגורים קדימה.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {upcoming.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{hebrewDate(row.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      {row.reason && <span className="text-muted-foreground"> · {row.reason}</span>}
                      {/* A row that names lessons closed only those. Saying so
                          here is the whole point: "blocked" on its own would
                          read as the day being shut. */}
                      {row.lessons_detail && row.lessons_detail.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.lessons_detail.length} שיעורים ·{' '}
                          {row.lessons_detail.map((l) => l.course_name).slice(0, 3).join(', ')}
                          {row.lessons_detail.length > 3 ? ' ועוד' : ''}
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-xs text-muted-foreground">כל החוגים</span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => unblock(row)} disabled={busy !== null} aria-label="פתיחה מחדש">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {configured.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                מוגדר בקונפיגורציה (לא ניתן לשינוי מכאן): {configured.map((d) => hebrewDate(d)).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {pending && (
        <BlockTrialDateDialog
          date={pending}
          dateLabel={hebrewDate(pending, { weekday: 'long', day: 'numeric', month: 'long' })}
          onCancel={() => setPending(null)}
          onConfirm={(choice) => block(pending, choice)}
        />
      )}

      {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </section>
  );
}
