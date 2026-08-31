'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchInstructorsData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import theme from './theme/dashboard.module.css';

interface Props {
  globalDateRange: DateRange;
}

/**
 * "מדריכים" — pay against what each instructor brings in.
 *
 * Note: the API also returns `occupancy` and `attendance` on every instructor
 * row, but those are hardcoded placeholder values in the backend (75 / 85 for
 * everyone). They are deliberately not rendered — a plausible-looking number
 * that is not real is worse than no number.
 */
export default function InstructorsSection({ globalDateRange }: Props) {
  const { branches } = useScopedBranches();
  const [branchId, setBranchId] = useState('all');

  const apiFilters = useMemo(
    () => ({
      branch_id: branchId,
      date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
      date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
    }),
    [branchId, globalDateRange],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-instructors', apiFilters],
    queryFn: () => fetchInstructorsData(apiFilters),
  });

  const kpis = data?.kpis ?? {};
  const top = data?.top_performers ?? {};
  const comparison: any[] = data?.instructor_comparison ?? [];
  const details: any[] = data?.instructor_details ?? [];

  const totalRevenue = details.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const salary = Number(kpis.total_salary ?? 0);
  const payShare = totalRevenue > 0 ? (salary / totalRevenue) * 100 : 0;

  if (isLoading) {
    return <div className={theme.scope}><div className={theme.card}>טוען נתוני מדריכים…</div></div>;
  }

  return (
    <div className={theme.scope}>
      {/* branch scope */}
      <div className={theme.card}>
        <label className={theme.kpiLbl} htmlFor="ins-branch">סניף</label>
        <select
          id="ins-branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          style={selectStyle}
        >
          <option value="all">כל הסניפים</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* KPI row */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>סיכום מדריכים</h2>
        <p className={theme.cardSub}>עלות מול תרומה בתקופה שנבחרה</p>
        <div className={`${theme.grid} ${theme.g4}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מדריכים פעילים</div>
            <div className={theme.kpiVal}>{Number(kpis.active_instructors ?? 0)}</div>
            <div className={theme.kpiFoot}>{details.length} מוצגים</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>סה״כ שכר</div>
            <div className={`${theme.kpiVal} ${theme.down}`}>{formatCurrency(salary)}</div>
            <div className={theme.kpiFoot}>
              {totalRevenue > 0 ? `${formatPercent(payShare, 1)} מההכנסות` : 'לתקופה שנבחרה'}
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>בונוסים</div>
            <div className={theme.kpiVal}>{formatCurrency(kpis.total_bonuses)}</div>
            <div className={theme.kpiFoot}>מעבר לשכר הבסיס</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>רווח כולל</div>
            <div className={`${theme.kpiVal} ${Number(kpis.total_profit ?? 0) >= 0 ? theme.up : theme.down}`}>
              {formatCurrency(kpis.total_profit)}
            </div>
            <div className={theme.kpiFoot}>הכנסות פחות שכר</div>
          </div>
        </div>
      </div>

      {/* highlights */}
      {(top.highest_profit || top.most_students || top.most_lessons) ? (
        <div className={theme.mt}>
          <h2 className={theme.cardTitle}>נקודות בולטות</h2>
          <p className={theme.cardSub}>המובילים בתקופה</p>
          <div className={`${theme.grid} ${theme.g3}`}>
            <Highlight
              label="הרווח הגבוה ביותר"
              name={top.highest_profit?.name}
              value={formatCurrency(top.highest_profit?.profit)}
              tone="up"
            />
            <Highlight
              label="הכי הרבה תלמידים"
              name={top.most_students?.name}
              value={`${Number(top.most_students?.students ?? 0)} תלמידים`}
            />
            <Highlight
              label="הכי הרבה שיעורים"
              name={top.most_lessons?.name}
              value={`${Number(top.most_lessons?.lessons ?? 0)} שיעורים`}
            />
          </div>
        </div>
      ) : null}

      {/* comparison */}
      {comparison.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>הכנסה מול שכר</h2>
          <p className={theme.cardSub}>כמה מכניס, כמה עולה, מה נשאר</p>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison} margin={{ top: 8, right: 12, left: 4, bottom: 56 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={64}
                />
                <YAxis tick={{ fontSize: 11 }} width={72} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="revenue" name="הכנסות" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="salary" name="שכר" fill="hsl(var(--warning))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="רווח" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* ranking */}
      {details.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>רווחיות מדריכים</h2>
          <p className={theme.cardSub}>ממוין לפי רווח</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>מדריך</th>
                  <th>סניף</th>
                  <th className={theme.n}>שיעורים</th>
                  <th className={theme.n}>תלמידים</th>
                  <th className={theme.n}>הכנסות</th>
                  <th className={theme.n}>שכר</th>
                  <th className={theme.n}>רווח</th>
                  <th className={theme.n}>עלות שכר</th>
                </tr>
              </thead>
              <tbody>
                {[...details]
                  .sort((a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0))
                  .map((r, i) => {
                    const rev = Number(r.revenue ?? 0);
                    const cost = rev > 0 ? (Number(r.salary ?? 0) / rev) * 100 : 0;
                    return (
                      <tr key={r.instructor_id ?? i}>
                        <td className={theme.name}>
                          <span className={`${theme.rank} ${i === 0 ? theme.rankTop : ''}`}>{i + 1}</span>
                          {r.name}
                        </td>
                        <td style={{ color: 'var(--kg-muted)', fontSize: 12 }}>{r.branch || '—'}</td>
                        <td className={theme.n}>{Number(r.lessons ?? 0)}</td>
                        <td className={theme.n}>{Number(r.students ?? 0)}</td>
                        <td className={theme.n}>{formatCurrency(r.revenue)}</td>
                        <td className={theme.n}>{formatCurrency(r.salary)}</td>
                        <td className={`${theme.n} ${Number(r.profit ?? 0) >= 0 ? theme.up : theme.down}`}>
                          {formatCurrency(r.profit)}
                        </td>
                        <td className={`${theme.n} ${cost >= 44 ? theme.down : ''}`}>
                          {rev > 0 ? formatPercent(cost, 0) : '—'}
                        </td>
                      </tr>
                    );
                  })}
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
  maxWidth: 320,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  font: 'inherit',
  fontWeight: 700,
};

function Highlight({
  label,
  name,
  value,
  tone,
}: {
  label: string;
  name?: string;
  value: string;
  tone?: 'up';
}) {
  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      <div className={`${theme.kpiVal} ${theme.kpiValS}`}>{name || '—'}</div>
      <div className={`${theme.kpiFoot} ${tone === 'up' ? theme.up : ''}`}>{value}</div>
    </div>
  );
}
