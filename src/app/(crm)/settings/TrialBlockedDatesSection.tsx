'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  async function block(date: string) {
    setBusy(date);
    setNotice('');
    try {
      const created = await createTrialBlockedDate({ date, reason: reason.trim() });
      setRows((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setReason('');
      const parts = [];
      if (created.moved === 1) parts.push('שיעור ניסיון אחד הועבר לתאריך הבא');
      if (created.moved > 1) parts.push(`${created.moved} שיעורי ניסיון הועברו לתאריך הבא`);
      if (created.unmoved === 1) parts.push('שיעור ניסיון אחד לא ניתן היה להעביר — יש לטפל ידנית');
      if (created.unmoved > 1) parts.push(`${created.unmoved} לא ניתן היה להעביר — יש לטפל ידנית`);
      setNotice(parts.length ? parts.join(' · ') : 'התאריך נחסם');
      setError('');
    } catch {
      setError('חסימת התאריך נכשלה');
      // Another manager may have blocked it meanwhile — show what is really there.
      void load();
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
    <section className="mt-10 rounded-xl border bg-white p-6" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <CalendarX2 className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">תאריכים חסומים לשיעורי ניסיון</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        לחצו על יום כדי לחסום אותו. יום חסום לא יוצע להורים לשיעור ניסיון, ומי שכבר נרשם אליו יועבר לתאריך הבא.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> טוען…</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Button variant="ghost" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="חודש קודם">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="font-medium">{monthLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="חודש הבא">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {DAY_HEADERS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} />;
                const key = ymd(day);
                const office = officeByDate.get(key);
                const fixed = configuredSet.has(key);
                const past = key < today;
                const classes = [
                  'h-10 rounded-md text-sm border transition-colors',
                  office ? 'bg-red-100 border-red-300 text-red-800 font-medium' : '',
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
                    title={fixed ? 'מוגדר בקונפיגורציה' : office ? (office.reason || 'חסום') : ''}
                    aria-label={`${hebrewDate(key)}${office ? ' — חסום' : fixed ? ' — מוגדר בקונפיגורציה' : ''}`}
                    aria-pressed={Boolean(office)}
                    onClick={() => (office ? unblock(office) : block(key))}
                  >
                    {busy === key ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-block h-3 w-3 rounded bg-red-100 border border-red-300" /> נחסם במשרד
              <span className="inline-block h-3 w-3 rounded bg-gray-200 border border-gray-300" /> מוגדר בקונפיגורציה
            </div>
            <label className="block mt-4">
              <span className="text-sm">סיבה לחסימה הבאה (לא חובה)</span>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="למשל: ראש השנה"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>

          <div>
            <h3 className="font-medium mb-2">תאריכים חסומים קרובים</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תאריכים חסומים קדימה.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {upcoming.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{hebrewDate(row.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      {row.reason && <span className="text-muted-foreground"> · {row.reason}</span>}
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

      {notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </section>
  );
}
