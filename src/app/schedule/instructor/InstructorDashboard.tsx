'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ChevronRight, UserCog, Users, X } from 'lucide-react';
import { fetchLinkedUsers, type LinkedUser } from '@/lib/api';
import { fetchInstructorDashboard, formatDateISO, type InstructorDashboard as Data } from '@/lib/scheduleUtils';
import styles from './InstructorDashboard.module.css';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const RANGES = [
  { key: '3m', label: '3 חודשים', months: 3 },
  { key: '6m', label: '6 חודשים', months: 6 },
  { key: '12m', label: 'שנה', months: 12 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/** Kept in step with the exit animation in the stylesheet. */
const EXIT_MS = 220;

type Props = {
  onClose: () => void;
  /** Jump to a lesson's attendance on a given date. */
  onOpenLesson: (lessonId: string, date: string) => void;
};

function monthLabel(month: string) {
  const [y, m] = month.split('-');
  return `${Number(m)}/${y.slice(2)}`;
}

/**
 * The instructor's own numbers, opened from the floating button on their home
 * screen. Everything shown is counted server-side from real enrolments — an
 * empty section means there is nothing to show, never a placeholder figure.
 */
export default function InstructorDashboard({ onClose, onOpenLesson }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeKey>('6m');
  const [branchId, setBranchId] = useState('all');
  /**
   * Every branch this teacher works in, not merely the ones left in the answer
   * on screen. A filtered answer names only the branch it was filtered to, so
   * reading the options off it would collapse the row to a single branch the
   * moment one is picked, with no way back to "הכל".
   */
  const [branchOptions, setBranchOptions] = useState<Data['branches']>([]);
  const [linkedUsers, setLinkedUsers] = useState<LinkedUser[]>([]);
  const [viewAs, setViewAs] = useState('self');
  const [isClosing, setIsClosing] = useState(false);

  const { dateFrom, dateTo } = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? 6;
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth() - (months - 1), 1);
    return { dateFrom: formatDateISO(from), dateTo: formatDateISO(to) };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    fetchLinkedUsers()
      .then((res) => {
        if (!cancelled) setLinkedUsers(res.linked_users ?? []);
      })
      .catch(() => {
        /* no links — the teacher switcher stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Switching teacher resets the branch: the branches are that teacher's, so
  // keeping the old id would filter to a branch they do not work in.
  useEffect(() => {
    setBranchId('all');
    setBranchOptions([]);
  }, [viewAs]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetchInstructorDashboard({
      date_from: dateFrom,
      date_to: dateTo,
      branch_id: branchId,
      as_user: viewAs === 'self' ? undefined : viewAs,
    })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        // Only an unfiltered answer names every branch, so the options come
        // from that one and are kept while a branch is selected.
        if (branchId === 'all') setBranchOptions(res.branches ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError('שגיאה בטעינת הנתונים');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, branchId, viewAs]);

  /** Let the sheet drop away before unmounting, so it does not just vanish. */
  const close = useCallback(() => {
    if (isClosing) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onClose();
      return;
    }
    setIsClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [isClosing, onClose]);

  // Escape closes it the same way the button does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const trend = useMemo(
    () => (data?.monthly_trend ?? []).map((p) => ({ ...p, label: monthLabel(p.month) })),
    [data],
  );
  const lowGroups = (data?.groups ?? []).filter((g) => g.is_low);
  const threshold = data?.low_group_threshold ?? 8;
  // Fall back to the answer only until the first unfiltered one has landed.
  const branches = branchOptions.length ? branchOptions : data?.branches ?? [];

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.overlayOut : ''}`}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="הנתונים שלי"
      onClick={(e) => {
        // Tapping the dim area outside the sheet closes it too.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={`${styles.sheet} ${isClosing ? styles.sheetOut : ''}`}>
        <header className={styles.header}>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="סגירה">
            <X size={22} />
          </button>
          <h2 className={styles.title}>
            {data && !data.subject.is_self ? `הנתונים של ${data.subject.name}` : 'הנתונים שלי'}
          </h2>
        </header>

        {/* Whose numbers these are. Only for an account a manager linked to
            colleagues; everyone else goes straight to the branch row. */}
        {linkedUsers.length > 0 && (
          <div className={styles.teacherRow}>
            <UserCog size={16} />
            <select
              className={styles.teacherSelect}
              value={viewAs}
              onChange={(e) => setViewAs(e.target.value)}
              aria-label="בחירת מדריך"
            >
              <option value="self">הנתונים שלי</option>
              {linkedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Branch switcher — only worth showing to someone who teaches in more
            than one, otherwise it is a control with a single option. */}
        {branches.length > 1 && (
          <div className={styles.island} role="tablist" aria-label="סניף">
            <button
              type="button"
              role="tab"
              aria-selected={branchId === 'all'}
              className={branchId === 'all' ? styles.islandOn : styles.islandBtn}
              onClick={() => setBranchId('all')}
            >
              הכל
            </button>
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={branchId === b.id}
                className={branchId === b.id ? styles.islandOn : styles.islandBtn}
                onClick={() => setBranchId(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {isLoading && (
            <div className={styles.skeletons} aria-busy="true" aria-label="טוען נתונים">
              {Array.from({ length: 3 }).map((_, i) => (
                <div className={styles.blockSkeleton} key={i} style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              {/* headline + trend */}
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.bigLabel}>תלמידים פעילים</div>
                    <div className={styles.big}>{data.total_active_students}</div>
                  </div>
                  <div className={styles.ranges}>
                    {RANGES.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className={range === r.key ? styles.rangeOn : styles.rangeBtn}
                        onClick={() => setRange(r.key)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {trend.length > 1 ? (
                  <div className={styles.chart}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="instructorTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f5c518" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#f5c518" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,42,110,0.10)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'rgba(30,42,110,0.6)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: 'rgba(30,42,110,0.6)' }}
                          axisLine={false}
                          tickLine={false}
                          width={44}
                        />
                        <Tooltip
                          formatter={(v) => [`${v ?? 0} תלמידים`, '']}
                          labelFormatter={(l) => `חודש ${l}`}
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid rgba(30,42,110,0.12)',
                            fontSize: 13,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="students"
                          stroke="#1e2a6e"
                          strokeWidth={2.5}
                          fill="url(#instructorTrend)"
                          dot={{ r: 3, fill: '#1e2a6e' }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className={styles.note}>בחרו טווח רחב יותר כדי לראות מגמה</p>
                )}
              </section>

              {/* groups needing attention */}
              {lowGroups.length > 0 && (
                <section className={`${styles.card} ${styles.alertCard}`}>
                  <div className={styles.alertHead}>
                    <AlertTriangle size={18} />
                    <span>קבוצות עם פחות מ־{threshold} תלמידים</span>
                  </div>
                  <div className={styles.alertList}>
                    {lowGroups.map((g) => (
                      <div className={styles.alertRow} key={g.lesson_id}>
                        <div className={styles.alertName}>
                          <span>{g.course_name}</span>
                          <small>
                            {g.branch_name} · יום {DAY_LETTERS[g.day_of_week] ?? '—'} {g.start_time}
                          </small>
                        </div>
                        <span className={styles.alertCount}>{g.active_students}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* attendance still owed */}
              {data.unmarked_lessons.length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardTitle}>
                    שיעורים שלא נקראה בהם נוכחות
                    <span className={styles.badge}>{data.unmarked_total}</span>
                  </div>
                  <p className={styles.note}>לחצו כדי לפתוח את רשימת הנוכחות באותו תאריך</p>
                  <div className={styles.missList}>
                    {data.unmarked_lessons.map((u) => (
                      <button
                        type="button"
                        className={styles.missRow}
                        key={`${u.lesson_id}-${u.date}`}
                        onClick={() => {
                          setIsClosing(true);
                          window.setTimeout(() => onOpenLesson(u.lesson_id, u.date), EXIT_MS);
                        }}
                      >
                        <ChevronRight size={18} className={styles.missChev} />
                        <div className={styles.missName}>
                          <span>{u.course_name}</span>
                          <small>
                            {u.date.split('-').reverse().join('.')} · {u.start_time} · {u.branch_name}
                          </small>
                        </div>
                        <span className={styles.missCount}>{u.missing}</span>
                      </button>
                    ))}
                  </div>
                  {data.unmarked_total > data.unmarked_lessons.length && (
                    <p className={styles.note}>
                      ועוד {data.unmarked_total - data.unmarked_lessons.length} שיעורים קודמים
                    </p>
                  )}
                </section>
              )}

              {/* headcount per group, compact */}
              {data.groups.length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardTitle}>
                    <Users size={16} /> תלמידים בכל קבוצה
                  </div>
                  <div className={styles.chips}>
                    {[...data.groups]
                      .sort((a, b) => b.active_students - a.active_students)
                      .map((g) => (
                        <span
                          className={`${styles.chip} ${g.is_low ? styles.chipLow : ''}`}
                          key={g.lesson_id}
                          title={`${g.course_name} · ${g.branch_name}`}
                        >
                          <b>{g.active_students}</b>
                          {g.course_name}
                        </span>
                      ))}
                  </div>
                </section>
              )}

              {data.groups.length === 0 && (
                <div className={styles.empty}>אין קבוצות פעילות בטווח שנבחר</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
