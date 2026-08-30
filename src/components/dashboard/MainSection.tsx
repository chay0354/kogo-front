'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchFinancialData, fetchStudentsData, fetchCoursesData } from '@/lib/api';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import EmptyState from './EmptyState';
import theme from './theme/dashboard.module.css';

interface Props {
  globalDateRange: DateRange;
}

/**
 * "ראשי" — the overview tab introduced in the v5 mockup.
 *
 * Shows real numbers wherever the existing dashboard API already provides them
 * (revenue / expenses / profit / active students / active courses). Every
 * widget whose data does not yet exist in the API renders an EmptyState instead
 * of a fabricated value. Those become real in Stage 2 (backend work).
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

  const fin = financial.data?.kpis ?? {};
  const stu = students.data?.kpis ?? {};
  const crs = courses.data?.kpis ?? {};

  const revenue = Number(fin.total_revenue ?? 0);
  const expenses = Number(fin.total_expenses ?? 0);
  const profit = Number(fin.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return (
    <div className={theme.scope}>
      {/* hero — real financial numbers */}
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

      {/* KPI row — real where available */}
      <div className={`${theme.grid} ${theme.g4} ${theme.mt}`}>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>רווח נקי</div>
          <div className={`${theme.kpiVal} ${profit >= 0 ? theme.up : theme.down}`}>
            {formatCurrency(profit)}
          </div>
          <div className={theme.kpiFoot}>לתקופה שנבחרה</div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>תלמידים פעילים</div>
          <div className={theme.kpiVal}>{Number(stu.active_students ?? 0)}</div>
          <div className={theme.kpiFoot}>
            {Number(stu.signed_for_trial ?? 0)} בניסיון · {Number(stu.credit_problems ?? 0)} בעיות אשראי
          </div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>חוגים פעילים</div>
          <div className={theme.kpiVal}>{Number(crs.active_courses ?? 0)}</div>
          <div className={theme.kpiFoot}>
            מתוך {Number(crs.total_courses ?? 0)} · {Number(crs.low_occupancy ?? 0)} בתפוסה נמוכה
          </div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>סה״כ הוצאות</div>
          <div className={`${theme.kpiVal} ${theme.down}`}>{formatCurrency(expenses)}</div>
          <div className={theme.kpiFoot}>שכר, בונוסים ותפעול</div>
        </div>
      </div>

      {/* widgets whose data does not exist yet */}
      <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>הימים החזקים בשבוע</h2>
          <p className={theme.cardSub}>שיעורים שהתקיימו לפי יום</p>
          <EmptyState title="פילוח לפי יום בשבוע" icon="📅" />
        </div>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>שעות שיא</h2>
          <p className={theme.cardSub}>נוכחות לפי שעת תחילת שיעור</p>
          <EmptyState title="פילוח לפי שעה" icon="🕒" />
        </div>
      </div>

      <div className={`${theme.grid} ${theme.g23} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>מאיפה מגיע הכסף</h2>
          <p className={theme.cardSub}>פילוח ההכנסות לפי מקור</p>
          <EmptyState title="מקורות הכנסה" icon="💰" />
        </div>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>בריאות העסק</h2>
          <p className={theme.cardSub}>ציון משוקלל</p>
          <EmptyState title="ציון בריאות" icon="❤️" />
        </div>
      </div>

      <div className={`${theme.card} ${theme.mt}`}>
        <h2 className={theme.cardTitle}>מה דורש ממך החלטה השבוע</h2>
        <p className={theme.cardSub}>ממוין לפי גודל ההשפעה על הכסף</p>
        <EmptyState title="רשימת החלטות" icon="🎯" />
      </div>
    </div>
  );
}
