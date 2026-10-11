'use client';

import { RefreshCw } from 'lucide-react';
import s from '../wahub.module.css';
import { ErrorState, Skeleton } from './bits';
import { cx } from './tones';

/**
 * How every area of the section waits, reads again and fails
 * (docs/WAHUB-CONTRACT-LAYOUT.md, ג).
 *
 * Waiting is a grey shape of what is coming — rows where a list will be,
 * sections where the card will be, tiles where the numbers will be — at the
 * height the real thing has, so nothing jumps when the data lands. Reading
 * again never puts the shape back: a quiet "מתעדכן…" is all there is. A
 * failure is one sentence and "נסה שוב", in the area that failed and nowhere else.
 */

/**
 * "מתעדכן…" — what is on screen is being read again. Always in the page, so
 * its row keeps its height; it only shows after a moment, so a read that
 * answers at once says nothing at all.
 */
export function RefreshNote({ active, className }: { active: boolean; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cx(s.refreshNote, active && s.refreshOn, className)}>
      {active && (
        <>
          <RefreshCw aria-hidden="true" />
          מתעדכן…
        </>
      )}
    </span>
  );
}

/** One failed area: a sentence and a way to try again, inside the area's own frame. */
export function AreaError({
  title,
  text,
  onRetry,
  className,
}: {
  title: string;
  text?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return <ErrorState title={title} text={text} onRetry={onRetry} tight className={className} />;
}

/** Rows of a conversations list on their way: the mark, the name, the last message. */
export function ListRowsSkeleton({ rows = 9, label = 'טוען שיחות' }: { rows?: number; label?: string }) {
  return (
    <ul className={cx(s.list, s.skList)} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, row) => (
        <li key={row} className={cx(s.skRow, s.skRowChat)}>
          <Skeleton className={s.skAvatar} />
          <span className={s.skLines}>
            <Skeleton className={s.skLine} style={{ width: `${38 + ((row * 17) % 30)}%` }} />
            <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: `${62 + ((row * 11) % 30)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The contact's card on its way: who, then the sections under it. */
export function CardSkeleton() {
  return (
    <div className={s.skCard} aria-busy="true" aria-label="טוען את פרטי איש הקשר">
      <div className={cx(s.sect, 'flex items-center gap-3')}>
        <Skeleton className={s.skAvatarLg} />
        <span className={s.skLines}>
          <Skeleton className={s.skLine} style={{ width: '55%' }} />
          <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: '40%' }} />
        </span>
      </div>
      {[92, 44, 84, 48].map((height, index) => (
        <div key={index} className={s.sect}>
          <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: 56 }} />
          <Skeleton className="mt-2.5 !rounded-xl" style={{ height }} />
        </div>
      ))}
      {[0, 1, 2, 3].map((index) => (
        <div key={`fold-${index}`} className={cx(s.sect, s.skFold)}>
          <Skeleton className={s.skLine} style={{ width: `${30 + index * 6}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Number tiles on their way, at a tile's own height. */
export function TilesSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cx(s.tiles, className)} aria-busy="true" aria-label="טוען">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cx(s.card, s.kpi, s.skTile)}>
          <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: '55%' }} />
          <Skeleton className={s.skNumber} />
        </div>
      ))}
    </div>
  );
}

/** Short rows inside a card: a state and its number, a person and a line. */
export function RowsSkeleton({ rows = 4, tall = false, label = 'טוען' }: { rows?: number; tall?: boolean; label?: string }) {
  return (
    <ul className={cx(s.list, s.skList)} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, row) => (
        <li key={row} className={cx(s.skRow, tall && s.skRowTall)}>
          <span className={s.skLines}>
            <Skeleton className={s.skLine} style={{ width: `${34 + ((row * 13) % 28)}%` }} />
            {tall && (
              <>
                <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: `${70 + ((row * 7) % 22)}%` }} />
                <Skeleton className={cx(s.skLine, s.skLineSm)} style={{ width: `${40 + ((row * 9) % 20)}%` }} />
              </>
            )}
          </span>
          {!tall && <Skeleton className={s.skCount} />}
        </li>
      ))}
    </ul>
  );
}

/** A whole tab on its way (its code is still being fetched): tiles, and a card under them. */
export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען">
      <TilesSkeleton />
      <div className={cx(s.card, s.cardFlush)}>
        <RowsSkeleton rows={6} />
      </div>
    </div>
  );
}
