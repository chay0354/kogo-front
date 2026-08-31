'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  fetchFinancialData,
  fetchStudentsData,
  fetchCoursesData,
  fetchInstructorsData,
  fetchBranchesData,
  fetchActivityData,
} from '@/lib/api';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import EmptyState from './EmptyState';
import CssBars from './charts/CssBars';
import theme from './theme/dashboard.module.css';

interface Props {
  globalDateRange: DateRange;
}

/**
 * "ראשי" — the overview tab.
 *
 * The information architecture follows the owner-dashboard spec: a headline
 * overview, then the month's key figures in one place, then business health,
 * then the insights that need a decision. The visual language stays the v5
 * dashboard theme.
 *
 * Every figure shown is read from the existing dashboard API. Anything the API
 * does not provide renders an EmptyState rather than a fabricated number.
 */
export default function MainSection({ globalDateRange }: Props) {
  const apiFilters = useMemo(
    () => ({
      branch_id: 'all',
      date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
      date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
    }),
    [globalDateRange],
  );

  const financial = useQuery({
    queryKey: ['dashboard-financial', apiFilters],
    queryFn: () => fetchFinancialData(apiFilters),
  });
  const students = useQuery({
    queryKey: ['dashboard-students', apiFilters],
    queryFn: () => fetchStudentsData(apiFilters),
  });
  const courses = useQuery({
    queryKey: ['dashboard-courses', apiFilters],
    queryFn: () => fetchCoursesData(apiFilters),
  });
  const instructors = useQuery({
    queryKey: ['dashboard-instructors', apiFilters],
    queryFn: () => fetchInstructorsData(apiFilters),
  });
  const branches = useQuery({
    queryKey: ['dashboard-branches', apiFilters],
    queryFn: () => fetchBranchesData(apiFilters),
  });

  const activity = useQuery({
    queryKey: ['dashboard-activity', apiFilters.branch_id],
    queryFn: () => fetchActivityData({ branch_id: 'all' }),
  });

  const fin = financial.data?.kpis ?? {};
  const stu = students.data?.kpis ?? {};
  const crs = courses.data?.kpis ?? {};
  const ins = instructors.data?.kpis ?? {};

  const revenue = Number(fin.total_revenue ?? 0);
  const profit = Number(fin.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const branchList: any[] = branches.data?.branch_list ?? [];
  const activeBranches = branchList.filter((b) => Number(b.revenue ?? 0) > 0);
  const topBranch = [...branchList].sort(
    (a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0),
  )[0];
  const weakBranch = [...branchList]
    .filter((b) => Number(b.revenue ?? 0) > 0)
    .sort((a, b) => Number(a.profit ?? 0) - Number(b.profit ?? 0))[0];

  const lowOccupancy = Number(crs.low_occupancy ?? 0);
  const creditProblems = Number(stu.credit_problems ?? 0);
  const ghosts = Number(stu.ghost_students ?? 0);

  return (
    <div className={theme.scope}>
      {/* ---------- 1 · headline ---------- */}
      <div className={theme.hero}>
        <div className={theme.heroLbl}>הכנסות בתקופה שנבחרה</div>
        <div className={theme.heroBig}>{formatCurrency(revenue)}</div>
        <div className={theme.heroRow}>
          <div>
            <span>רווח נקי</span>
            <b>{formatCurrency(profit)}</b>
          </div>
          <div>
            <span>שיעור רווח</span>
            <b>{formatPercent(margin, 1)}</b>
          </div>
        </div>
      </div>

      {/* ---------- 2 · סקירה כללית ---------- */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סקירה כללית</h2>
        <p className={theme.cardSub}>מבט מהיר על ביצועי העסק בתקופה שנבחרה</p>
        <div className={`${theme.grid} ${theme.g4}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>הכנסות</div>
            <div className={`${theme.kpiVal} ${theme.up}`}>{formatCurrency(revenue)}</div>
            <div className={theme.kpiFoot}>
              {Number(fin.registration_fees_collected ?? 0) > 0
                ? `מתוכם ${formatCurrency(fin.registration_fees_collected)} דמי רישום`
                : 'מרישום לשיעורים'}
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>רווח נקי</div>
            <div className={`${theme.kpiVal} ${profit >= 0 ? theme.up : theme.down}`}>
              {formatCurrency(profit)}
            </div>
            <div className={theme.kpiFoot}>שיעור רווח {formatPercent(margin, 1)}</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>תלמידים פעילים</div>
            <div className={theme.kpiVal}>{Number(stu.active_students ?? 0)}</div>
            <div className={theme.kpiFoot}>
              {Number(stu.signed_for_trial ?? 0)} נרשמו לניסיון · {Number(stu.done_trial ?? 0)} ביצעו
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מדריכים פעילים</div>
            <div className={theme.kpiVal}>{Number(ins.active_instructors ?? 0)}</div>
            <div className={theme.kpiFoot}>שכר {formatCurrency(ins.total_salary)}</div>
          </div>
        </div>
      </div>

      {/* ---------- 3 · סקירת העסק ---------- */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סקירת העסק</h2>
        <p className={theme.cardSub}>הנתונים המרכזיים במקום אחד</p>
        <div className={theme.counts}>
          <div>
            <b>
              {activeBranches.length}
              <span style={{ fontSize: 13, fontWeight: 700 }}> / {branchList.length}</span>
            </b>
            <span>סניפים פעילים</span>
          </div>
          <div>
            <b>{Number(crs.active_courses ?? 0)}</b>
            <span>חוגים פעילים מתוך {Number(crs.total_courses ?? 0)}</span>
          </div>
          <div>
            <b>{lowOccupancy}</b>
            <span>חוגים בתפוסה נמוכה</span>
          </div>
          <div>
            <b>{creditProblems}</b>
            <span>תלמידים עם בעיית אשראי</span>
          </div>
          <div>
            <b>{ghosts}</b>
            <span>תלמידי רפאים</span>
          </div>
        </div>
      </div>

      {/* ---------- 4 · מוביל וחלש ---------- */}
      {branchList.length > 0 ? (
        <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
          <div className={theme.card}>
            <h2 className={theme.cardTitle}>הסניף המוביל</h2>
            <p className={theme.cardSub}>הרווח הגבוה ביותר בתקופה</p>
            {topBranch ? (
              <>
                <div className={`${theme.kpiVal} ${theme.up}`}>{topBranch.name}</div>
                <div className={theme.kpiFoot}>
                  רווח {formatCurrency(topBranch.profit)} · הכנסות{' '}
                  {formatCurrency(topBranch.revenue)} · {Number(topBranch.students ?? 0)} תלמידים
                </div>
              </>
            ) : (
              <div className={theme.kpiFoot}>אין נתונים לתקופה</div>
            )}
          </div>
          <div className={theme.card}>
            <h2 className={theme.cardTitle}>הסניף שדורש תשומת לב</h2>
            <p className={theme.cardSub}>הרווח הנמוך ביותר מבין הפעילים</p>
            {weakBranch ? (
              <>
                <div className={`${theme.kpiVal} ${theme.down}`}>{weakBranch.name}</div>
                <div className={theme.kpiFoot}>
                  רווח {formatCurrency(weakBranch.profit)} · הכנסות{' '}
                  {formatCurrency(weakBranch.revenue)} · {Number(weakBranch.students ?? 0)} תלמידים
                </div>
              </>
            ) : (
              <div className={theme.kpiFoot}>אין נתונים לתקופה</div>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------- 5 · מתי השבוע עמוס ---------- */}
      <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>הימים החזקים בשבוע</h2>
          <p className={theme.cardSub}>מספר שיעורים שמתקיימים בכל יום</p>
          <WeekdayChart data={activity.data} />
        </div>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>שעות שיא</h2>
          <p className={theme.cardSub}>שיעורים לפי שעת התחלה</p>
          <HourChart data={activity.data} />
        </div>
      </div>

      {/* ---------- 6 · החוגים הכי נכנסים ---------- */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h2 className={theme.cardTitle}>החוגים — הכי נכנסים</h2>
        <p className={theme.cardSub}>מספר תלמידים משלמים לחוג</p>
        <TopCourses rows={courses.data?.course_list ?? []} />
      </div>

      {/* ---------- 7 · לא קיים ב-API ---------- */}
      <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>בריאות העסק</h2>
          <p className={theme.cardSub}>ציון משוקלל: גבייה, תפוסה, רווחיות ושימור</p>
          <EmptyState title="ציון בריאות העסק" icon="❤️" />
        </div>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>מאיפה מגיע הכסף</h2>
          <p className={theme.cardSub}>פילוח ההכנסות לפי מקור</p>
          <EmptyState
            title="מקורות הכנסה"
            icon="💰"
            reason="ה־API מפרק היום הוצאות בלבד. פילוח הכנסות דורש תוספת ב־Backend"
          />
        </div>
      </div>
    </div>
  );
}

/** The courses pulling the most students, as ranked horizontal bars. */
function TopCourses({ rows }: { rows: any[] }) {
  const top = [...rows]
    .map((c) => ({
      name: String(c.name ?? ''),
      students: Number(c.students ?? 0),
      occupancy: Number(c.occupancy ?? 0),
    }))
    .filter((c) => c.students > 0)
    .sort((a, b) => b.students - a.students)
    .slice(0, 6);

  if (!top.length) return <div className={theme.kpiFoot}>אין חוגים עם תלמידים בתקופה שנבחרה</div>;

  const max = top[0].students;
  return (
    <>
      {top.map((c, i) => (
        <div
          className={theme.hbar}
          key={c.name + i}
          style={i === top.length - 1 ? { marginBottom: 0 } : undefined}
        >
          <div className={theme.hbarName}>{c.name}</div>
          <div className={theme.hbarNum}>
            {c.students} · {c.occupancy}% תפוסה
          </div>
          <div className={theme.track}>
            <div
              className={`${theme.fill} ${c.occupancy >= 85 ? theme.fillAmber : ''} ${
                c.occupancy < 40 ? theme.fillRed : ''
              }`}
              style={{ width: `${(c.students / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const WEEKDAY_NAMES = [
  'יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת',
];

/** Lessons per weekday; the busiest day is highlighted. */
function WeekdayChart({ data }: { data: any }) {
  const rows: any[] = data?.by_weekday ?? [];
  if (!rows.length) return <div className={theme.kpiFoot}>אין שיעורים פעילים להצגה</div>;

  const counts = rows.map((r) => Number(r.lessons ?? 0));
  const max = Math.max(...counts, 1);
  const peak = data?.peak_weekday;

  return (
    <>
      {peak != null ? (
        <div className={theme.kpiFoot} style={{ marginBottom: 10 }}>
          היום החזק: <strong>{WEEKDAY_NAMES[peak]}</strong> · {counts[peak]} שיעורים
        </div>
      ) : null}
      <CssBars
        height={150}
        gap={9}
        bars={counts.map((c, i) => ({
          pct: (c / max) * 100,
          label: WEEKDAY_LABELS[i],
          variant: i === peak ? 'hot' : c === 0 ? 'dim' : 'default',
          title: `${WEEKDAY_NAMES[i]} · ${c} שיעורים`,
        }))}
      />
    </>
  );
}

/** Lessons per start hour across the day; the peak hour is highlighted. */
function HourChart({ data }: { data: any }) {
  const rows: any[] = data?.by_hour ?? [];
  if (!rows.length) return <div className={theme.kpiFoot}>אין שיעורים פעילים להצגה</div>;

  const counts = rows.map((r) => Number(r.lessons ?? 0));
  const max = Math.max(...counts, 1);
  const peak = data?.peak_hour;
  const hh = (h: number) => String(h).padStart(2, '0');

  return (
    <>
      {peak != null ? (
        <div className={theme.kpiFoot} style={{ marginBottom: 10 }}>
          השעה החמה: <strong>{hh(peak)}:00</strong> · {counts[peak]} שיעורים
        </div>
      ) : null}
      <CssBars
        height={150}
        gap={3}
        denseAxis
        bars={counts.map((c, i) => ({
          pct: (c / max) * 100,
          label: i % 3 === 0 ? hh(i) : '',
          variant: i === peak ? 'hot' : c === 0 ? 'dim' : 'default',
          title: `${hh(i)}:00 · ${c} שיעורים`,
        }))}
      />
    </>
  );
}
