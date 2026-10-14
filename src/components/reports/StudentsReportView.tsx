'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Download } from 'lucide-react';
import { fetchStudentsReport } from '@/lib/api';
import {
  branchesHeading,
  chartAxis,
  chartTicks,
  fillTier,
  formatDay,
  formatDayShort,
  groupLine,
  groupsByField,
  weakestFirst,
  percent,
  signed,
  type FillTier,
  type ReportBranch,
  type ReportGroup,
  type ReportRequest,
  type ReportScope,
  type StudentsReport,
} from '@/lib/studentsReport';
import css from './StudentsReport.module.css';

/** The inside of a card on an A4 sheet: 718px of page, less the card's border and padding. */
const CHART_W = 684;
const SHEET_W = 794;
/** How many of the weakest groups the summary page lists; each branch page lists all of its own. */
const SUMMARY_GROUPS = 10;

const TIER_CLASS: Record<FillTier, string> = {
  weak: css.tierWeak,
  mid: css.tierMid,
  good: css.tierGood,
  none: css.tierNone,
};

/**
 * The printable students report (owner, 14.10.2026): a summary of the chosen
 * branches, then a page for each — numbers first, the line over the period,
 * then weekdays, instructors and the groups against their capacity.
 */
export default function StudentsReportView({ request }: { request: ReportRequest }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['students-report', request],
    queryFn: () => fetchStudentsReport(request),
    staleTime: 60_000,
  });
  const zoom = useSheetZoom();

  const names = useMemo(() => (data?.branches ?? []).map((b) => b.branch_name), [data]);
  const heading = data ? branchesHeading(names, data.all_branches) : '';
  const period = data ? `${formatDay(data.date_from)} – ${formatDay(data.date_to)}` : '';

  // The tab's title is the file name a browser offers for the PDF.
  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = `דוח תלמידים · ${heading} · ${period}`;
    return () => {
      document.title = previous;
    };
  }, [data, heading, period]);

  const print = async () => {
    try {
      await document.fonts?.ready;
    } catch {
      // Print with whatever fonts there are.
    }
    window.print();
  };

  if (isLoading) {
    return (
      <div className={css.viewer}>
        <div className={css.state}>
          <div>
            <div className={css.spinner} />
            <h2 style={{ marginTop: 18 }}>מכין את הדוח…</h2>
            <p>סופר תלמידים לכל יום בתקופה, לכל סניף</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    const detail = (error as any)?.response?.data?.detail;
    return (
      <div className={css.viewer}>
        <div className={css.state}>
          <div>
            <h2>לא הצלחנו להפיק את הדוח</h2>
            <p>{typeof detail === 'string' ? detail : 'נסו שוב, או בחרו תקופה קצרה יותר.'}</p>
            <Link href="/" className={css.btn} style={{ marginTop: 16 }}>
              <ArrowRight className="h-4 w-4" aria-hidden />
              חזרה לדשבורד
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const many = data.branches.length > 1;
  const tabGap =
    data.students_tab_total !== null && data.students_tab_total > data.summary.students
      ? data.students_tab_total - data.summary.students
      : 0;

  return (
    <div className={css.viewer}>
      <header className={css.bar}>
        <div className={css.barTitle}>
          <span className={css.mark} aria-hidden />
          <b>דוח תלמידים</b>
          <span>
            {heading} · {period}
          </span>
        </div>
        <div className={css.barActions}>
          <Link href="/" className={css.btn}>
            <ArrowRight className="h-4 w-4" aria-hidden />
            <span className={css.btnText}>לדשבורד</span>
          </Link>
          <button type="button" className={`${css.btn} ${css.btnPrimary}`} onClick={print}>
            <Download className="h-4 w-4" aria-hidden />
            הורד PDF
          </button>
        </div>
      </header>

      <main className={css.sheets} style={{ ['--sheet-zoom' as any]: zoom }}>
        {many && (
          <Sheet
            index={0}
            report={data}
            scope={data.summary}
            title="סיכום הסניפים"
            subtitle={heading}
            tag="עמוד סיכום"
            branches={data.branches}
            note={
              tabGap > 0
                ? `בלשונית התלמידים מוצגים כרגע ${data.students_tab_total} תלמידים פעילים בכל הסניפים: ${tabGap} מהם מסומנים פעילים בלי מקום קבוע באף קבוצה בסניפים האלה, ולכן אינם בדוח.`
                : undefined
            }
          />
        )}
        {data.branches.map((branch, i) => (
          <Sheet
            key={branch.branch_id}
            index={many ? i + 1 : i}
            report={data}
            scope={branch}
            title={branch.branch_name}
            subtitle={[branch.city_name, `${branch.occupancy.groups} קבוצות`].filter(Boolean).join(' · ')}
            tag={many ? `סניף ${i + 1} מתוך ${data.branches.length}` : 'דוח סניף'}
            note={!many && tabGap > 0
              ? `בלשונית התלמידים מוצגים כרגע ${data.students_tab_total} תלמידים פעילים בכל הסניפים: ${tabGap} מהם מסומנים פעילים בלי מקום קבוע באף קבוצה, ולכן אינם בדוח.`
              : undefined}
          />
        ))}
      </main>
    </div>
  );
}

/** Narrow screens see the sheet scaled down whole, never reflowed — it is a page. */
function useSheetZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / SHEET_W));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return zoom;
}

function Sheet({
  index,
  report,
  scope,
  title,
  subtitle,
  tag,
  branches,
  note,
}: {
  index: number;
  report: StudentsReport;
  scope: ReportScope;
  title: string;
  subtitle: string;
  tag: string;
  /** Set on the summary page: the branches to compare. */
  branches?: ReportBranch[];
  note?: string;
}) {
  const summary = !!branches;
  // How it was counted is said once: on the summary, or on the only page there is.
  const explain = summary || report.branches.length === 1;
  // The summary lists the weakest few across the branches; a branch page lists all of its own.
  // Either way they are shown under their field (groupsByField).
  const groups = summary
    ? (() => {
        const weakest = new Set(weakestFirst(scope.groups).slice(0, SUMMARY_GROUPS).map((g) => g.lesson_id));
        return scope.groups.filter((g) => weakest.has(g.lesson_id));
      })()
    : scope.groups;
  const untilToday = report.requested_date_to > report.date_to;

  return (
    <section className={css.sheet} style={{ ['--i' as any]: index }} aria-label={title}>
      <div className={css.head}>
        <div>
          <div className={css.brand}>
            <span className={css.mark} aria-hidden />
            קוגומלו · דוח תלמידים
          </div>
          <h1 className={css.title}>{title}</h1>
          <div className={css.subtitle}>{subtitle}</div>
        </div>
        <div className={css.headSide}>
          <div className={css.period}>
            {formatDay(report.date_from)} – {formatDay(report.date_to)}
          </div>
          <div className={css.pageTag}>
            {tag}
            {untilToday ? ' · עד היום' : ''}
          </div>
          <div className={css.pageTag} style={{ marginTop: 2 }}>
            הופק {formatGenerated(report.generated_at)}
          </div>
        </div>
      </div>

      <Kpis scope={scope} report={report} index={index} />
      {note && <p className={css.note} style={{ marginTop: -4, marginBottom: 12 }}>{note}</p>}

      <TrendCard scope={scope} report={report} chartId={`trend-${index}`} />
      {summary && <CompareCard branches={branches} />}
      <div className={css.pair}>
        <DaysCard scope={scope} />
        <TeachersCard scope={scope} />
      </div>
      <GroupsCard
        groups={groups}
        withBranch={summary}
        hidden={scope.groups.length - groups.length}
        scopeName={summary ? 'כל הסניפים שנבחרו' : title}
      />

      {explain && (
        <footer className={css.foot}>
          <div>
            <b>איך נספר:</b> תלמיד = ילד במצב פעיל או בעיה באשראי, עם מקום קבוע בקבוצה (לא ניסיון) — הכלל של לשונית התלמידים.
            {' '}ילד בכמה קבוצות נספר פעם אחת {summary ? 'בסיכום ובכל סניף' : 'בסניף'}, ובכל יום, מדריך וקבוצה שהוא בהם.
            {' '}הימים שעברו משוחזרים מתאריכי ההצטרפות והעזיבה ומהיסטוריית הסטטוסים.
          </div>
        </footer>
      )}
    </section>
  );
}

/** +13 / −4, kept whole in a right-to-left line (it would read "13+" otherwise). */
function Signed({ n, className }: { n: number; className?: string }) {
  return (
    <bdi dir="ltr" className={className} style={{ unicodeBidi: 'isolate' }}>
      {signed(n)}
    </bdi>
  );
}

function formatGenerated(iso: string): string {
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${formatDay(day)} ${time}`;
}

function Kpis({ scope, report, index }: { scope: ReportScope; report: StudentsReport; index: number }) {
  const delta = scope.students - scope.students_at_start;
  const occ = scope.occupancy;
  const isToday = report.requested_date_to >= report.date_to && report.date_to === report.generated_at.slice(0, 10);
  const tiles = [
    {
      hero: true,
      label: isToday ? 'תלמידים היום' : `תלמידים ב־${formatDay(report.date_to)}`,
      value: scope.students,
      foot: (
        <>
          <Signed n={delta} className={delta > 0 ? css.up : delta < 0 ? css.down : undefined} />
          {' '}מאז {formatDay(report.date_from)}
        </>
      ),
    },
    {
      label: 'הצטרפו בתקופה',
      value: scope.joined,
      foot: <>עזבו {scope.left}</>,
    },
    {
      label: 'תפוסת הקבוצות',
      value: percent(occ.fill),
      foot: occ.capacity ? <>{occ.seats} מתוך {occ.capacity} מקומות</> : <>לא הוגדרה קיבולת</>,
    },
    {
      label: 'חסרים להרשמה מלאה',
      value: occ.missing,
      foot: occ.weak_groups ? <>{occ.weak_groups} קבוצות מתחת לחצי</> : <>אין קבוצה מתחת לחצי</>,
    },
  ];
  return (
    <div className={css.kpis}>
      {tiles.map((t, k) => (
        <div
          key={t.label}
          className={`${css.kpi} ${t.hero ? css.kpiHero : ''}`}
          style={{ ['--i' as any]: index, ['--k' as any]: k }}
        >
          <div className={css.kpiLbl}>{t.label}</div>
          <div className={css.kpiVal}>{t.value}</div>
          <div className={css.kpiFoot}>{t.foot}</div>
        </div>
      ))}
    </div>
  );
}

function TrendCard({ scope, report, chartId }: { scope: ReportScope; report: StudentsReport; chartId: string }) {
  const series = scope.series;
  const values = series.map((p) => p.students);
  const axis = chartAxis(values);
  const max = series.reduce((a, b) => (b.students > a.students ? b : a), series[0]);
  const min = series.reduce((a, b) => (b.students < a.students ? b : a), series[0]);
  const stepDays =
    series.length > 1
      ? Math.round((Date.parse(series[1].date) - Date.parse(series[0].date)) / 86_400_000)
      : 1;
  const lastIndex = series.length - 1;

  return (
    <div className={css.card}>
      <div className={css.cardHead}>
        <div>
          <h2 className={css.cardTitle}>תלמידים לאורך התקופה</h2>
          <div className={css.cardSub}>
            {formatDay(report.date_from)} – {formatDay(report.date_to)}
            {stepDays > 1 ? ` · נקודה כל ${stepDays} ימים` : ' · נקודה לכל יום'}
          </div>
        </div>
        {max && min && max.students !== min.students && (
          <div className={css.chips}>
            <span className={css.chip}>שיא {max.students} · {formatDayShort(max.date)}</span>
            <span className={css.chip}>שפל {min.students} · {formatDayShort(min.date)}</span>
          </div>
        )}
      </div>
      <div className={css.chart}>
        <AreaChart width={CHART_W} height={156} data={series} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b54d6" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#5b54d6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eae7f8" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={chartTicks(series)}
            tickFormatter={formatDayShort}
            tick={{ fontSize: 11, fill: '#8b88b6', fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={0}
          />
          <YAxis
            domain={axis.domain}
            ticks={axis.ticks}
            interval={0}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#8b88b6', fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            formatter={(v: any) => [`${v} תלמידים`, '']}
            labelFormatter={(l: any) => formatDay(String(l))}
            separator=""
          />
          <Area
            type="monotone"
            dataKey="students"
            stroke="#3b34b8"
            strokeWidth={2.5}
            fill={`url(#${chartId})`}
            isAnimationActive={false}
            dot={(props: any) =>
              props.index === lastIndex ? (
                <circle
                  key="last"
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill="#f7c948"
                  stroke="#231f6e"
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </div>
    </div>
  );
}

function CompareCard({ branches }: { branches: ReportBranch[] }) {
  const rows = [...branches].sort((a, b) => b.students - a.students);
  return (
    <div className={`${css.card} ${css.cardLong}`}>
      <div className={css.cardHead}>
        <div>
          <h2 className={css.cardTitle}>השוואה בין הסניפים</h2>
          <div className={css.cardSub}>תלמידים היום, השינוי בתקופה ותפוסת הקבוצות</div>
        </div>
      </div>
      <div className={`${css.cmpRow} ${css.cmpHead}`}>
        <span>סניף</span>
        <span>מגמה</span>
        <span style={{ textAlign: 'center' }}>תלמידים</span>
        <span style={{ textAlign: 'center' }}>שינוי</span>
        <span>תפוסה</span>
      </div>
      {rows.map((b) => {
        const delta = b.students - b.students_at_start;
        const tier = fillTier(b.occupancy.fill);
        return (
          <div key={b.branch_id} className={css.cmpRow}>
            <div className={css.cmpName}>
              {b.branch_name}
              {b.city_name && <small>{b.city_name}</small>}
            </div>
            <div className={css.spark}>
              <LineChart width={112} height={30} data={b.series} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Line
                  type="monotone"
                  dataKey="students"
                  stroke="#5b54d6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </div>
            <div className={css.cmpNum}>{b.students}</div>
            <Signed n={delta} className={`${css.delta} ${delta > 0 ? css.deltaUp : delta < 0 ? css.deltaDown : ''}`} />
            <div>
              <div className={css.meterLbl}>
                <span>{percent(b.occupancy.fill)}</span>
                <span>{b.occupancy.groups} קבוצות</span>
              </div>
              <div className={css.meter}>
                <i
                  className={TIER_CLASS[tier]}
                  style={{ width: `${Math.min(b.occupancy.fill ?? 0, 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DaysCard({ scope }: { scope: ReportScope }) {
  const days = scope.by_weekday;
  const max = Math.max(1, ...days.map((d) => d.students));
  return (
    <div className={css.card}>
      <div className={css.cardHead}>
        <div>
          <h2 className={css.cardTitle}>לפי ימים בשבוע</h2>
          <div className={css.cardSub}>מי שמגיע ביומיים נספר בכל אחד מהם</div>
        </div>
      </div>
      {days.length === 0 ? (
        <div className={css.empty}>אין קבוצות פעילות בתאריך הזה</div>
      ) : (
        <div className={css.days}>
          {days.map((d, k) => (
            <div key={d.day} className={css.day}>
              <div className={css.dayNum}>{d.students}</div>
              <div className={css.dayTrack}>
                <div
                  className={css.dayBar}
                  style={{ height: `${Math.max((d.students / max) * 100, 6)}%`, ['--k' as any]: k }}
                />
              </div>
              <div className={css.dayLbl}>{d.label}</div>
              <div className={css.dayMeta}>
                {d.groups} קבוצות
                <br />
                {percent(d.fill)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeachersCard({ scope }: { scope: ReportScope }) {
  const rows = scope.by_instructor;
  const max = Math.max(1, ...rows.map((r) => r.students));
  return (
    <div className={`${css.card} ${css.cardLong}`}>
      <div className={css.cardHead}>
        <div>
          <h2 className={css.cardTitle}>לפי מדריכים</h2>
          <div className={css.cardSub}>תלמידים בקבוצות שלו · תפוסה מול הקיבולת</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={css.empty}>אין קבוצות פעילות בתאריך הזה</div>
      ) : (
        rows.map((r) => (
          <div key={r.instructor_id ?? r.name} className={css.teacher}>
            <div style={{ minWidth: 0 }}>
              <div className={css.teacherName}>{r.name}</div>
              <div className={css.teacherMeta}>
                {r.groups} קבוצות · תפוסה {percent(r.fill)}
              </div>
            </div>
            <div className={css.hbar}>
              <i style={{ width: `${(r.students / max) * 100}%` }} />
            </div>
            <div className={css.teacherNum}>{r.students}</div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * The groups under their field, the weakest first within each. A table, so that when a branch's list runs onto a
 * second sheet of paper its heading — with the branch's name — is printed again
 * at the top of it (a browser repeats a table's head on every printed page).
 */
function GroupsCard({
  groups,
  withBranch,
  hidden,
  scopeName,
}: {
  groups: ReportGroup[];
  withBranch: boolean;
  hidden: number;
  scopeName: string;
}) {
  return (
    <div className={`${css.card} ${css.cardLong}`}>
      <table className={css.groupTable}>
        <colgroup>
          <col style={{ width: 34 }} />
          <col />
          <col style={{ width: 250 }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={3}>
              <div className={css.cardHead}>
                <div>
                  <h2 className={css.cardTitle}>
                    {withBranch ? 'הקבוצות החלשות' : 'קבוצות מול הקיבולת'}
                    <span className={css.scopeName}> · {scopeName}</span>
                  </h2>
                  <div className={css.cardSub}>
                    לפי תחום · בכל תחום מהחלשה לחזקה · קיבולת = הנמוכה מבין השיעור, הקבוצה והחדר
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={3} className={css.empty}>אין קבוצות פעילות בתאריך הזה</td>
            </tr>
          ) : (
            groupsByField(groups).flatMap((field) => [
              <tr key={`field-${field.field}`} className={css.fieldRow}>
                <td colSpan={3}>
                  <span className={css.fieldName}>{field.field}</span>
                  <span className={css.fieldMeta}>
                    {field.groups.length === 1 ? 'קבוצה אחת' : `${field.groups.length} קבוצות`}
                    {field.fill !== null ? ` · תפוסה ${percent(field.fill)}` : ''}
                  </span>
                </td>
              </tr>,
              ...field.groups.map((g, i) => {
              const tier = fillTier(g.fill);
              return (
                <tr key={g.lesson_id} className={css.group}>
                  <td>
                    <span className={css.rank}>{i + 1}</span>
                  </td>
                  <td>
                    <div className={css.groupName}>{g.course_name}</div>
                    <div className={css.groupMeta}>
                      {[
                        `${g.day_label} ${g.start_time}`,
                        g.instructor_name,
                        withBranch ? g.branch_name : g.room_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td>
                    <SeatsMeter group={g} tier={tier} />
                    <div className={`${css.groupLine} ${tier === 'weak' ? css.groupLineWeak : ''}`}>
                      {groupLine(g)}
                    </div>
                  </td>
                </tr>
              );
              }),
            ])
          )}
        </tbody>
      </table>
      {hidden > 0 && <div className={css.more}>ועוד {hidden} קבוצות — בעמודי הסניפים</div>}
    </div>
  );
}

/** One square a seat, up to thirty; a bar beyond that, or with no capacity set. */
function SeatsMeter({ group, tier }: { group: ReportGroup; tier: FillTier }) {
  const cap = group.capacity;
  if (cap && cap <= 30) {
    const taken = Math.min(group.students, cap);
    return (
      <div className={css.seats} aria-hidden>
        {Array.from({ length: cap }, (_, s) => (
          <i key={s} className={s < taken ? TIER_CLASS[tier] : undefined} style={{ ['--s' as any]: s }} />
        ))}
      </div>
    );
  }
  return (
    <div className={css.meter} aria-hidden>
      <i className={TIER_CLASS[tier]} style={{ width: `${cap ? Math.min(group.fill ?? 0, 100) : 100}%` }} />
    </div>
  );
}
