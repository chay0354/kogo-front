'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchStudentsData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import type { DateRange } from './GlobalDateFilter';
import { MONTHS } from './filters/monthYearUtils';
import { formatPercent } from './format';
import theme from './theme/dashboard.module.css';

interface Props {
  globalDateRange: DateRange;
}

/**
 * "תלמידים" — how many are active, how they attend, and who is drifting away.
 */
export default function StudentsSection({ globalDateRange }: Props) {
  const router = useRouter();
  const { branches: scopedBranches, cities } = useScopedBranches();
  const [cityId, setCityId] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [quitBy, setQuitBy] = useState<'course_type' | 'course'>('course_type');

  const apiFilters = useMemo(
    () => ({
      city_id: cityId,
      branch_id: branchId,
      date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
      date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
    }),
    [cityId, branchId, globalDateRange],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-students', apiFilters],
    queryFn: () => fetchStudentsData(apiFilters),
  });

  const kpis = data?.kpis ?? {};
  const abnormalByBranch: any[] = data?.abnormal_attendance_by_branch ?? [];
  const quit = data?.quit_percentage ?? { total_quit: 0, by_status: [], by_course_type: [], by_course: [] };
  const quitRows: any[] = (quitBy === 'course_type' ? quit.by_course_type : quit.by_course) ?? [];

  const branchesForFilter = useMemo(
    () => filterBranchesByCity(scopedBranches, cityId),
    [scopedBranches, cityId],
  );

  const attendance = useMemo(
    () =>
      (data?.attendance_by_month ?? []).map((row: any) => {
        const [year, month] = String(row.month).split('-');
        const name = MONTHS.find((m) => m.value === Number(month))?.label ?? month;
        return {
          label: `${name} ${year}`,
          rate: Number(row.attendance_rate ?? 0),
          present: Number(row.present_count ?? 0),
          total: Number(row.total_records ?? 0),
        };
      }),
    [data?.attendance_by_month],
  );

  if (isLoading) {
    return <div className={theme.scope}><div className={theme.card}>טוען נתוני תלמידים…</div></div>;
  }

  const maxAbnormal = Math.max(...abnormalByBranch.map((b: any) => Number(b.count) || 0), 1);
  const maxQuit = Math.max(...quitRows.map((r: any) => Number(r.count) || 0), 1);

  return (
    <div className={theme.scope}>
      {/* filters */}
      <div className={theme.card}>
        <div className={`${theme.grid} ${theme.g2}`}>
          <div>
            <label className={theme.kpiLbl} htmlFor="st-city">עיר</label>
            <select
              id="st-city"
              value={cityId}
              onChange={(e) => { setCityId(e.target.value); setBranchId('all'); }}
              style={selectStyle}
            >
              <option value="all">כל הערים</option>
              {cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={theme.kpiLbl} htmlFor="st-branch">סניף</label>
            <select
              id="st-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={selectStyle}
            >
              <option value="all">כל הסניפים</option>
              {branchesForFilter.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סיכום תלמידים</h2>
        <p className={theme.cardSub}>מצב הרישום בתקופה שנבחרה</p>
        <div className={`${theme.grid} ${theme.g3}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>תלמידים פעילים</div>
            <div className={`${theme.kpiVal} ${theme.up}`}>{Number(kpis.active_students ?? 0)}</div>
            <div className={theme.kpiFoot}>משלמים ומשתתפים</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>בעיות אשראי</div>
            <div className={`${theme.kpiVal} ${theme.down}`}>{Number(kpis.credit_problems ?? 0)}</div>
            <div className={theme.kpiFoot}>חיוב שנכשל וטרם טופל</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>תלמידי רפאים</div>
            <div className={theme.kpiVal}>{Number(kpis.ghost_students ?? 0)}</div>
            <div className={theme.kpiFoot}>לא נמצאו בשיבוץ</div>
          </div>
        </div>
      </div>

      {/* trial funnel from what the API does provide */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h2 className={theme.cardTitle}>שיעורי ניסיון</h2>
        <p className={theme.cardSub}>מהרשמה לניסיון ועד ביצוע בפועל</p>
        <div className={theme.counts} style={{ marginTop: 0 }}>
          <div>
            <b>{Number(kpis.signed_for_trial ?? 0)}</b>
            <span>נרשמו לניסיון</span>
          </div>
          <div>
            <b>{Number(kpis.done_trial ?? 0)}</b>
            <span>ביצעו ניסיון</span>
          </div>
          <div>
            <b>
              {Number(kpis.signed_for_trial ?? 0) > 0
                ? formatPercent(
                    (Number(kpis.done_trial ?? 0) / Number(kpis.signed_for_trial)) * 100,
                    0,
                  )
                : '—'}
            </b>
            <span>שיעור הגעה</span>
          </div>
        </div>
      </div>

      {/* attendance trend */}
      {attendance.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מגמת נוכחות</h2>
          <p className={theme.cardSub}>אחוז נוכחות חודשי</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendance} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} domain={[0, 100]} unit="%" />
                <Tooltip
                  formatter={(v: any, _n: any, p: any) =>
                    [`${v}% (${p.payload.present}/${p.payload.total})`, 'נוכחות']
                  }
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="נוכחות"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* dropout risk */}
      <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>נוכחות חריגה לפי סניף</h2>
          <p className={theme.cardSub}>תלמידים שמפסיקים להגיע — לחצו לרשימה</p>
          {abnormalByBranch.length > 0 ? (
            abnormalByBranch.map((b: any, i: number) => (
              <div
                className={theme.hbar}
                key={b.branch_id ?? i}
                style={{
                  cursor: 'pointer',
                  ...(i === abnormalByBranch.length - 1 ? { marginBottom: 0 } : {}),
                }}
                onClick={() => router.push('/customers?abnormal_attendance=true')}
              >
                <div className={theme.hbarName}>{b.branch_name}</div>
                <div className={theme.hbarNum}>{Number(b.count ?? 0)}</div>
                <div className={theme.track}>
                  <div
                    className={`${theme.fill} ${theme.fillRed}`}
                    style={{ width: `${(Number(b.count ?? 0) / maxAbnormal) * 100}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className={theme.kpiFoot}>אין נוכחות חריגה בתקופה שנבחרה</div>
          )}
        </div>

        <div className={theme.card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <h2 className={theme.cardTitle}>נושרים</h2>
              <p className={theme.cardSub}>סה״כ {Number(quit.total_quit ?? 0)} בתקופה</p>
            </div>
            <select
              value={quitBy}
              onChange={(e) => setQuitBy(e.target.value as 'course_type' | 'course')}
              style={{ ...selectStyle, marginTop: 0, width: 'auto' }}
            >
              <option value="course_type">לפי תחום</option>
              <option value="course">לפי חוג</option>
            </select>
          </div>
          {quitRows.length > 0 ? (
            quitRows.slice(0, 8).map((r: any, i: number) => (
              <div
                className={theme.hbar}
                key={i}
                style={i === Math.min(quitRows.length, 8) - 1 ? { marginBottom: 0 } : undefined}
              >
                <div className={theme.hbarName}>
                  {r.course_type_name ?? r.course_name ?? '—'}
                </div>
                <div className={theme.hbarNum}>{Number(r.count ?? 0)}</div>
                <div className={theme.track}>
                  <div
                    className={`${theme.fill} ${theme.fillAmber}`}
                    style={{ width: `${(Number(r.count ?? 0) / maxQuit) * 100}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className={theme.kpiFoot}>אין נתוני נשירה לתקופה שנבחרה</div>
          )}
        </div>
      </div>

      {/* quit by status */}
      {(quit.by_status ?? []).length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>נשירה לפי סטטוס</h2>
          <p className={theme.cardSub}>לאן עברו התלמידים שעזבו</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>סטטוס</th>
                  <th className={theme.n}>תלמידים</th>
                  <th className={theme.n}>אחוז</th>
                </tr>
              </thead>
              <tbody>
                {quit.by_status.map((s: any, i: number) => (
                  <tr key={s.status_key ?? i}>
                    <td className={theme.name}>{s.status}</td>
                    <td className={theme.n}>{Number(s.count ?? 0)}</td>
                    <td className={theme.n}>{formatPercent(Number(s.percentage ?? 0), 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  font: 'inherit',
  fontWeight: 700,
};
