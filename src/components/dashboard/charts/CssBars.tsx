'use client';

import styles from './CssBars.module.css';

export interface CssBar {
  /** 0–100 height percentage. */
  pct: number;
  /** Axis label under the bar. */
  label?: string;
  /** Highlight style. */
  variant?: 'default' | 'hot' | 'dim';
  /** Tooltip / title text. */
  title?: string;
}

interface Props {
  bars: CssBar[];
  height?: number;
  gap?: number;
  /** Smaller axis text for dense charts (e.g. 24 hours). */
  denseAxis?: boolean;
}

/**
 * Lightweight pure-CSS bar chart for small categorical charts (weekday, hour).
 * Recharts is reserved for the larger analytical charts that need axes,
 * tooltips and responsive containers.
 */
export default function CssBars({ bars, height = 150, gap = 8, denseAxis = false }: Props) {
  const hasLabels = bars.some((b) => b.label);
  return (
    <>
      <div className={styles.bars} style={{ height, gap }}>
        {bars.map((b, i) => (
          <div className={styles.col} key={i}>
            <div
              className={`${styles.bar} ${b.variant === 'hot' ? styles.hot : ''} ${
                b.variant === 'dim' ? styles.dim : ''
              }`}
              style={{ height: `${Math.max(b.pct, 2)}%`, animationDelay: `${i * 0.02}s` }}
              title={b.title}
            />
          </div>
        ))}
      </div>
      {hasLabels ? (
        <div className={`${styles.axis} ${denseAxis ? styles.dense : ''}`} style={{ gap }}>
          {bars.map((b, i) => (
            <span key={i}>{b.label ?? ''}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}
