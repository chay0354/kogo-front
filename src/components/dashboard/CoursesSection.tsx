'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchCoursesData, fetchCourseTypesList } from '@/lib/api';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import type { DateRange } from './GlobalDateFilter';
import { formatCurrency, formatPercent } from './format';
import theme from './theme/dashboard.module.css';
import { SectionSkeleton } from './SectionSkeleton';

interface Props {
  globalDateRange: DateRange;
}

/**
 * "חוגים" — which courses fill up, which are emptying out.
 *
 * Occupancy comes from the backend, where it is now measured against the real
 * course capacity (and the room's, whichever is smaller) summed across the
 * course's lessons — not a fixed assumption.
 */
export default function CoursesSection({ globalDateRange }: Props) {
  const { branches: scopedBranches, cities } = useScopedBranches();
  const [cityId, setCityId] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [courseTypeId, setCourseTypeId] = useState('all');

  const apiFilters = useMemo(
    () => ({
      city_id: cityId,
      branch_id: branchId,
      course_type_id: courseTypeId,
      date_from: format(globalDateRange.date_from, 'yyyy-MM-dd'),
      date_to: format(globalDateRange.date_to, 'yyyy-MM-dd'),
    }),
    [cityId, branchId, courseTypeId, globalDateRange],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-courses', apiFilters],
    queryFn: () => fetchCoursesData(apiFilters),
  });

  // Disciplines for the filter. Only active ones — the table carries retired
  // and test entries that would clutter the list.
  const { data: courseTypesRaw } = useQuery({
    queryKey: ['course-types-list'],
    queryFn: fetchCourseTypesList,
  });
  const courseTypes = useMemo(() => {
    const list = Array.isArray(courseTypesRaw)
      ? courseTypesRaw
      : (courseTypesRaw as any)?.results ?? [];
    return list.filter((t: any) => t?.is_active !== false);
  }, [courseTypesRaw]);

  const kpis = data?.kpis ?? {};
  const courseList: any[] = data?.course_list ?? [];
  const lowOccupancy: any[] = data?.low_occupancy_courses ?? [];

  const branchesForFilter = useMemo(
    () => filterBranchesByCity(scopedBranches, cityId),
    [scopedBranches, cityId],
  );

  const nearlyFull = useMemo(
    () =>
      [...courseList]
        .filter((c) => Number(c.occupancy ?? 0) >= 85)
        .sort((a, b) => Number(b.occupancy) - Number(a.occupancy))
        .slice(0, 5),
    [courseList],
  );

  const byStudents = useMemo(
    () =>
      [...courseList]
        .filter((c) => Number(c.students ?? 0) > 0)
        .sort((a, b) => Number(b.students) - Number(a.students))
        .slice(0, 8),
    [courseList],
  );

  if (isLoading) {
    return <SectionSkeleton label="טוען נתוני חוגים" />;
  }

  const maxStudents = byStudents.length ? Number(byStudents[0].students) : 1;

  return (
    <div className={theme.scope}>
      {/* filters */}
      <div className={theme.card}>
        <div className={`${theme.grid} ${theme.g3}`}>
          <div>
            <label className={theme.kpiLbl} htmlFor="cl-city">עיר</label>
            <select
              id="cl-city"
              value={cityId}
              onChange={(e) => { setCityId(e.target.value); setBranchId('all'); }}
              style={selectStyle}
            >
              <option value="all">כל הערים</option>
              {cities.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={theme.kpiLbl} htmlFor="cl-type">תחום</label>
            <select
              id="cl-type"
              value={courseTypeId}
              onChange={(e) => setCourseTypeId(e.target.value)}
              style={selectStyle}
            >
              <option value="all">כל התחומים</option>
              {courseTypes.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={theme.kpiLbl} htmlFor="cl-branch">סניף</label>
            <select
              id="cl-branch"
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
        <h2 className={theme.cardTitle}>סיכום חוגים</h2>
        <p className={theme.cardSub}>תפוסה ורווחיות בתקופה שנבחרה</p>
        <div className={`${theme.grid} ${theme.g4}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>סה״כ חוגים</div>
            <div className={theme.kpiVal}>{Number(kpis.total_courses ?? 0)}</div>
            <div className={theme.kpiFoot}>רשומים במערכת</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>חוגים פעילים</div>
            <div className={`${theme.kpiVal} ${theme.up}`}>{Number(kpis.active_courses ?? 0)}</div>
            <div className={theme.kpiFoot}>עם פעילות בתקופה</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>תפוסה מלאה</div>
            <div className={theme.kpiVal}>{Number(kpis.full_capacity ?? 0)}</div>
            <div className={theme.kpiFoot}>90% ומעלה</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>תפוסה נמוכה</div>
            <div className={`${theme.kpiVal} ${theme.down}`}>{Number(kpis.low_occupancy ?? 0)}</div>
            <div className={theme.kpiFoot}>מתחת ל־50%</div>
          </div>
        </div>
      </div>

      {/* most subscribed */}
      {byStudents.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>החוגים הכי נכנסים</h2>
          <p className={theme.cardSub}>מספר תלמידים משלמים</p>
          {byStudents.map((c, i) => (
            <div
              className={theme.hbar}
              key={c.course_id ?? i}
              style={i === byStudents.length - 1 ? { marginBottom: 0 } : undefined}
            >
              <div className={theme.hbarName}>{c.name}</div>
              <div className={theme.hbarNum}>
                {Number(c.students ?? 0)} · {formatPercent(Number(c.occupancy ?? 0), 0)} תפוסה
              </div>
              <div className={theme.track}>
                <div
                  className={`${theme.fill} ${
                    Number(c.occupancy) >= 85 ? theme.fillAmber : Number(c.occupancy) < 40 ? theme.fillRed : ''
                  }`}
                  style={{ width: `${(Number(c.students ?? 0) / maxStudents) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* action pair */}
      <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
        <div className={theme.card}>
          <h2 className={theme.cardTitle}>קרובים למלא</h2>
          <p className={theme.cardSub}>תפוסה 85% ומעלה — שווה לשקול קבוצה נוספת</p>
          {nearlyFull.length > 0 ? (
            nearlyFull.map((c, i) => (
              <div className={theme.hbar} key={c.course_id ?? i} style={i === nearlyFull.length - 1 ? { marginBottom: 0 } : undefined}>
                <div className={theme.hbarName}>{c.name}</div>
                <div className={theme.hbarNum}>{formatPercent(Number(c.occupancy ?? 0), 0)}</div>
                <div className={theme.track}>
                  <div className={`${theme.fill} ${theme.fillAmber}`} style={{ width: `${Math.min(100, Number(c.occupancy ?? 0))}%` }} />
                </div>
              </div>
            ))
          ) : (
            <div className={theme.kpiFoot}>אין חוגים בתפוסה גבוהה בתקופה שנבחרה</div>
          )}
        </div>

        <div className={theme.card}>
          <h2 className={theme.cardTitle}>תפוסה נמוכה</h2>
          <p className={theme.cardSub}>מתחת ל־50% — שווה לשקול איחוד</p>
          {lowOccupancy.length > 0 ? (
            lowOccupancy.map((c, i) => (
              <div className={theme.hbar} key={c.course_id ?? i} style={i === lowOccupancy.length - 1 ? { marginBottom: 0 } : undefined}>
                <div className={theme.hbarName}>{c.name}</div>
                <div className={theme.hbarNum}>
                  {formatPercent(Number(c.occupancy ?? 0), 0)} · {c.branch}
                </div>
                <div className={theme.track}>
                  <div className={`${theme.fill} ${theme.fillRed}`} style={{ width: `${Math.min(100, Number(c.occupancy ?? 0))}%` }} />
                </div>
              </div>
            ))
          ) : (
            <div className={theme.kpiFoot}>אין חוגים בתפוסה נמוכה</div>
          )}
        </div>
      </div>

      {/* full ranking */}
      {courseList.length > 0 ? (
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>דירוג חוגים</h2>
          <p className={theme.cardSub}>ממוין לפי רווח</p>
          <div className={theme.tableScroll}>
            <table className={theme.table}>
              <thead>
                <tr>
                  <th>חוג</th>
                  <th>תחום</th>
                  <th>סניף</th>
                  <th className={theme.n}>שיעורים</th>
                  <th className={theme.n}>תלמידים</th>
                  <th className={theme.n}>תפוסה</th>
                  <th className={theme.n}>הכנסות</th>
                  <th className={theme.n}>רווח</th>
                </tr>
              </thead>
              <tbody>
                {[...courseList]
                  .sort((a, b) => Number(b.profit ?? 0) - Number(a.profit ?? 0))
                  .map((c, i) => {
                    const occ = Number(c.occupancy ?? 0);
                    return (
                      <tr key={c.course_id ?? i}>
                        <td className={theme.name}>
                          <span className={`${theme.rank} ${i === 0 ? theme.rankTop : ''}`}>{i + 1}</span>
                          {c.name}
                        </td>
                        <td>
                          {c.course_type ? <span className={theme.tagType}>{c.course_type}</span> : '—'}
                        </td>
                        <td style={{ color: 'var(--kg-muted)', fontSize: 12 }}>{c.branch || '—'}</td>
                        <td className={theme.n}>{Number(c.lessons ?? 0)}</td>
                        <td className={theme.n}>{Number(c.students ?? 0)}</td>
                        <td className={theme.n}>
                          {formatPercent(occ, 0)}
                          <span className={theme.mini}>
                            <i
                              className={occ >= 80 ? '' : occ >= 50 ? theme.miniW : theme.miniB}
                              style={{ width: `${Math.min(100, occ)}%` }}
                            />
                          </span>
                        </td>
                        <td className={theme.n}>{formatCurrency(c.revenue)}</td>
                        <td className={`${theme.n} ${Number(c.profit ?? 0) >= 0 ? theme.up : theme.down}`}>
                          {formatCurrency(c.profit)}
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
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  font: 'inherit',
  fontWeight: 700,
};
