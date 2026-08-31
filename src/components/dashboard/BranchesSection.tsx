'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchBranchesData } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import theme from './theme/dashboard.module.css';

interface Props {
  globalDateRange: DateRange;
}

const DISCOUNT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
];

/**
 * "סניפים" — every branch, then the comparison across them.
 *
 * Uses the shared dashboard theme so the tab matches the overview. Each branch
 * leads with its own profit ring, and the cross-branch chart sits underneath.
 */
export default function BranchesSection({ globalDateRange }: Props) {
  const router = useRouter();
  const { branches: scopedBranches, cities } = useScopedBranches();
  const [cityId, setCityId] = useState('all');
  const [branchId, setBranchId] = useState('all');

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
    queryKey: ['dashboard-branches', apiFilters],
    queryFn: () => fetchBranchesData(apiFilters),
  });

  const kpis = data?.kpis ?? {};
  const branchList: any[] = data?.branch_list ?? [];
  const discountBreakdown: any[] = data?.discount_breakdown ?? [];

  const branchesForFilter = useMemo(
    () => filterBranchesByCity(scopedBranches, cityId),
    [scopedBranches, cityId],
  );

  // Ranked by profit, and the headline totals are summed from the same rows.
  const rows = useMemo(
    () =>
      [...branchList]
        .filter((b) => (branchId === 'all' ? true : String(b.branch_id) === String(branchId)))
        .sort((a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0)),
    [branchList, branchId],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, b) => {
          acc.revenue += Number(b.revenue ?? 0);
          acc.spending += Number(b.spending ?? 0);
          acc.profit += Number(b.profit ?? 0);
          acc.students += Number(b.students ?? 0);
          return acc;
        },
        { revenue: 0, spending: 0, profit: 0, students: 0 },
      ),
    [rows],
  );

  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  if (isLoading) {
    return <div className={theme.scope}><div className={theme.card}>טוען נתוני סניפים…</div></div>;
  }

  return (
    <div className={theme.scope}>
      {/* filters */}
      <div className={theme.card}>
        <div className={`${theme.grid} ${theme.g2}`}>
          <div>
            <label className={theme.kpiLbl} htmlFor="br-city">עיר</label>
            <select
              id="br-city"
              value={cityId}
              onChange={(e) => {
                setCityId(e.target.value);
                setBranchId('all');
              }}
              style={selectStyle}
            >
              <option value="all">כל הערים</option>
              {cities.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={theme.kpiLbl} htmlFor="br-branch">סניף</label>
            <select
              id="br-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              style={selectStyle}
            >
              <option value="all">כל הסניפים</option>
              {branchesForFilter.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className={`${theme.grid} ${theme.g3} ${theme.mt}`}>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>הכנסות סניפים</div>
          <div className={`${theme.kpiVal} ${theme.up}`}>{formatCurrency(totals.revenue)}</div>
          <div className={theme.kpiFoot}>סך ההכנסות בתקופה</div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>רווח סניפים</div>
          <div className={`${theme.kpiVal} ${totals.profit >= 0 ? theme.up : theme.down}`}>
            {formatCurrency(totals.profit)}
          </div>
          <div className={theme.kpiFoot}>שיעור רווח {formatPercent(margin, 1)}</div>
        </div>
        <div className={theme.kpi}>
          <div className={theme.kpiLbl}>סה״כ תלמידים</div>
          <div className={theme.kpiVal}>{Number(kpis.total_students ?? 0)}</div>
          <div className={theme.kpiFoot}>{rows.length} סניפים מוצגים</div>
        </div>
      </div>

      {/* each branch */}
      <div className={theme.mt}>
        <h2 className={theme.cardTitle}>ביצועי סניפים</h2>
        <p className={theme.cardSub}>הכנסות, הוצאות ורווח לכל סניף</p>
        {rows.length > 0 ? (
          <div className={`${theme.grid} ${theme.g2}`}>
            {rows.map((b) => (
              <BranchCard
                key={b.branch_id}
                branch={b}
                onOpen={() => router.push(`/branches/${b.branch_id}`)}
              />
            ))}
          </div>
        ) : (
          <div className={theme.card}>אין סניפים שתואמים לסינון</div>
        )}
      </div>

      {/* comparison */}
      {rows.length > 1 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>השוואה בין סניפים</h2>
          <p className={theme.cardSub}>הכנסות מול רווח</p>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 56 }}>
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
                <Bar dataKey="profit" name="רווח" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* discounts */}
      {discountBreakdown.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>פילוח הנחות שניתנו</h2>
          <p className={theme.cardSub}>לפי סוג הנחה</p>
          <div className={`${theme.grid} ${theme.g2}`}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={discountBreakdown}
                    dataKey="amount"
                    nameKey="type"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {discountBreakdown.map((_, i) => (
                      <Cell key={i} fill={DISCOUNT_COLORS[i % DISCOUNT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              {discountBreakdown.map((d: any, i: number) => (
                <div
                  className={theme.hbar}
                  key={d.type}
                  style={i === discountBreakdown.length - 1 ? { marginBottom: 0 } : undefined}
                >
                  <div className={theme.hbarName}>{d.type}</div>
                  <div className={theme.hbarNum}>
                    {formatCurrency(d.amount)} · {d.count}
                  </div>
                  <div className={theme.track}>
                    <div
                      className={theme.fill}
                      style={{
                        width: `${
                          (Number(d.amount) /
                            Math.max(...discountBreakdown.map((x: any) => Number(x.amount) || 1))) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
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

/** One branch: its profit ring, then revenue / cost / students underneath. */
function BranchCard({ branch, onOpen }: { branch: any; onOpen: () => void }) {
  const revenue = Number(branch.revenue ?? 0);
  const spending = Number(branch.spending ?? 0);
  const profit = Number(branch.profit ?? 0);
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  // Ring shows the share of revenue kept as profit; nothing to show without revenue.
  const pct = revenue > 0 ? Math.max(0, Math.min(100, margin)) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (C * pct) / 100;
  const ringColor =
    profit <= 0 ? 'hsl(var(--destructive))' : margin >= 33 ? 'hsl(var(--success))' : 'hsl(var(--warning))';

  return (
    <div
      className={theme.card}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ cursor: 'pointer', textAlign: 'center' }}
    >
      <div className={theme.cardTitle} style={{ fontSize: 16, minHeight: 44, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
        {branch.name}
      </div>

      <div style={{ position: 'relative', width: 140, height: 140, margin: '14px auto' }}>
        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="15" />
          {revenue > 0 ? (
            <circle
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`}
            />
          ) : null}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {revenue > 0 ? (
            <>
              <b style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.5px' }}>{formatCurrency(profit)}</b>
              <span style={{ fontSize: 12, color: 'var(--kg-muted)', fontWeight: 700, marginTop: 2 }}>רווח</span>
              <i style={{ fontStyle: 'normal', fontSize: 14, fontWeight: 900, color: ringColor, marginTop: 3 }}>
                {margin}%
              </i>
            </>
          ) : (
            <b style={{ fontSize: 15, color: 'var(--kg-muted)', fontWeight: 800 }}>ללא פעילות</b>
          )}
        </div>
      </div>

      <div className={theme.counts} style={{ marginTop: 0, boxShadow: 'none', padding: '10px 0' }}>
        <div>
          <b style={{ fontSize: 15 }} className={theme.up}>{formatCurrency(revenue)}</b>
          <span>הכנסות</span>
        </div>
        <div>
          <b style={{ fontSize: 15 }} className={theme.down}>{formatCurrency(spending)}</b>
          <span>הוצאות</span>
        </div>
        <div>
          <b style={{ fontSize: 15 }}>{Number(branch.students ?? 0)}</b>
          <span>תלמידים</span>
        </div>
      </div>
    </div>
  );
}
