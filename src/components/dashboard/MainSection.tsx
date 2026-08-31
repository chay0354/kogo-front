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
} from '@/lib/api';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import EmptyState from './EmptyState';
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

  const fin = financial.data?.kpis ?? {};
  const stu = students.data?.kpis ?? {};
  const crs = courses.data?.kpis ?? {};
  const ins = instructors.data?.kpis ?? {};

  const revenue = Number(fin.total_revenue ?? 0);
  const expenses = Number(fin.total_expenses ?? 0);
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
            <span>הוצאות</span>
            <b>{formatCurrency(expenses)}</b>
          </div>
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

      {/* ---------- 5 · פירוט ההוצאות ---------- */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h2 className={theme.cardTitle}>לאן הולכות ההוצאות</h2>
        <p className={theme.cardSub}>פילוח {formatCurrency(expenses)}</p>
        {expenses > 0 ? (
          <ExpenseBars breakdown={financial.data?.expense_breakdown ?? {}} total={expenses} />
        ) : (
          <div className={theme.kpiFoot}>אין הוצאות רשומות לתקופה שנבחרה</div>
        )}
      </div>

      {/* ---------- 6 · לא קיים ב-API ---------- */}
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

/** Expense split as labelled bars, largest first. */
function ExpenseBars({ breakdown, total }: { breakdown: any; total: number }) {
  const rows = [
    { label: 'שכר מדריכים', value: Number(breakdown.instructor_salaries ?? 0) },
    { label: 'בונוסים למדריכים', value: Number(breakdown.instructor_bonuses ?? 0) },
    { label: 'עלויות תפעול (סניף)', value: Number(breakdown.operational_costs ?? 0) },
  ]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (!rows.length) return <div className={theme.kpiFoot}>אין פירוט הוצאות לתקופה</div>;

  const max = rows[0].value;
  return (
    <>
      {rows.map((r, i) => (
        <div className={theme.hbar} key={r.label} style={i === rows.length - 1 ? { marginBottom: 0 } : undefined}>
          <div className={theme.hbarName}>{r.label}</div>
          <div className={theme.hbarNum}>
            {formatCurrency(r.value)} · {((r.value / total) * 100).toFixed(1)}%
          </div>
          <div className={theme.track}>
            <div className={theme.fill} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}
