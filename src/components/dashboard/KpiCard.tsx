'use client';

import theme from './theme/dashboard.module.css';
import styles from './KpiCard.module.css';

export interface KpiCardProps {
  label: string;
  /** Already formatted for display. */
  value: string;
  /** Small line under the value. */
  foot?: string;
  /** Percentage change against the previous period; omitted when unknown. */
  delta?: number | null;
  /** For a delta where going down is the good direction (e.g. costs). */
  invertDelta?: boolean;
  /** Series for the sparkline, oldest first. Needs at least two points. */
  series?: number[];
  tone?: 'up' | 'down' | 'neutral';
}

/**
 * A dashboard KPI: label, figure, change against the previous period, and a
 * sparkline of how it got there.
 *
 * The sparkline is a plain inline SVG polyline rather than a chart library —
 * these are 60px tall, there are four per row, and a full chart runtime per
 * card is wasted work on a phone.
 */
export default function KpiCard({
  label,
  value,
  foot,
  delta,
  invertDelta = false,
  series,
  tone = 'neutral',
}: KpiCardProps) {
  const toneClass = tone === 'up' ? theme.up : tone === 'down' ? theme.down : '';

  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const good = hasDelta ? (invertDelta ? delta < 0 : delta > 0) : false;
  const flat = hasDelta && Math.abs(delta as number) < 0.05;

  return (
    <div className={theme.kpi}>
      <div className={theme.kpiLbl}>{label}</div>
      <div className={`${theme.kpiVal} ${toneClass}`}>{value}</div>

      {series && series.length > 1 ? (
        <Sparkline points={series} positive={tone !== 'down'} />
      ) : null}

      <div className={theme.kpiFoot}>
        {hasDelta ? (
          <span
            className={`${styles.delta} ${
              flat ? styles.flat : good ? styles.good : styles.bad
            }`}
          >
            {flat ? '‎—' : good ? '▲' : '▼'} {Math.abs(delta as number).toFixed(1)}%
          </span>
        ) : null}
        {foot ? <span className={hasDelta ? styles.footAfter : ''}>{foot}</span> : null}
      </div>
    </div>
  );
}

/** Minimal sparkline. Flat series render as a centred line rather than dividing by zero. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const W = 100;
  const H = 26;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = span === 0 ? H / 2 : H - ((p - min) / span) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const stroke = positive ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
