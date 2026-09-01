'use client';

import { Skeleton } from '@/components/ui/skeleton';
import theme from './theme/dashboard.module.css';

interface SectionSkeletonProps {
  label: string;
  /** The two sections that open on a headline figure rather than on tiles. */
  hero?: boolean;
  kpis?: number;
}

/**
 * What every dashboard tab looks like before its figures arrive: the same
 * surface, the same tile grid, the same chart card, so the numbers drop into
 * place instead of pushing the tab around as they land.
 */
export function SectionSkeleton({ label, hero = false, kpis = 4 }: SectionSkeletonProps) {
  return (
    <div className={theme.scope} aria-busy="true" aria-label={label}>
      {hero && (
        <div className={theme.hero}>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-9 w-56" />
          <Skeleton className="mt-4 h-4 w-72" />
        </div>
      )}

      <div className={`${theme.grid} ${theme.g4} ${hero ? theme.mt : ''}`}>
        {Array.from({ length: kpis }).map((_, kpi) => (
          <div key={kpi} className={theme.card}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
          </div>
        ))}
      </div>

      <div className={`${theme.card} ${theme.mt}`}>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
