import * as React from 'react';

/**
 * The placeholders the office screens show while data is in flight.
 *
 * Every one of them is built from the same block, and each takes the shape of
 * the content that replaces it — a table skeleton gets the real column count, a
 * card grid gets the real breakpoints. A placeholder of the wrong shape is
 * worse than none, because the page jumps once the data lands.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={`block rounded-md skeleton-block ${className || ''}`} />;
}

interface TableSkeletonProps {
  /** Column count of the table being waited on. */
  columns: number;
  rows?: number;
  className?: string;
  /** Table classes of the screen being waited on, where it styles its own. */
  tableClassName?: string;
  label?: string;
}

export function TableSkeleton({
  columns,
  rows = 8,
  className,
  tableClassName = 'table table-compact',
  label = 'טוען נתונים',
}: TableSkeletonProps) {
  return (
    <div className={`table-scroll ${className || ''}`} aria-busy="true" aria-label={label}>
      <table className={tableClassName}>
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, col) => (
              <th key={col}>
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((_, col) => (
                <td key={col}>
                  <Skeleton className="h-4" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CardGridSkeletonProps {
  cards?: number;
  /** The grid classes of the real list, so the placeholder reflows identically. */
  gridClassName?: string;
  /** Height of one placeholder card, matched to the real card. */
  cardClassName?: string;
  className?: string;
  label?: string;
}

export function CardGridSkeleton({
  cards = 6,
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  cardClassName = 'h-44',
  className,
  label = 'טוען נתונים',
}: CardGridSkeletonProps) {
  return (
    <div className={`${gridClassName} ${className || ''}`} aria-busy="true" aria-label={label}>
      {Array.from({ length: cards }).map((_, card) => (
        <div key={card} className={`card flex flex-col gap-3 ${cardClassName}`}>
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

interface FormSkeletonProps {
  fields?: number;
  /** The grid classes of the real form, so the fields land in the same columns. */
  gridClassName?: string;
  className?: string;
  label?: string;
}

export function FormSkeleton({
  fields = 6,
  gridClassName = 'grid grid-cols-1 sm:grid-cols-2 gap-4',
  className,
  label = 'טוען נתונים',
}: FormSkeletonProps) {
  return (
    <div className={`${gridClassName} ${className || ''}`} aria-busy="true" aria-label={label}>
      {Array.from({ length: fields }).map((_, field) => (
        <div key={field} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

interface ListSkeletonProps {
  rows?: number;
  className?: string;
  label?: string;
}

/** Rows that are not a table — the settings lists, partners, automations. */
export function ListSkeleton({ rows = 5, className, label = 'טוען נתונים' }: ListSkeletonProps) {
  return (
    <div className={`flex flex-col gap-3 ${className || ''}`} aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 rounded-lg border border-gray-100 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

interface StatCardsSkeletonProps {
  cards?: number;
  gridClassName?: string;
  className?: string;
  label?: string;
}

/** The small figure tiles that head the dashboards. */
export function StatCardsSkeleton({
  cards = 4,
  gridClassName = 'grid grid-cols-1 md:grid-cols-4 gap-4',
  className,
  label = 'טוען נתונים',
}: StatCardsSkeletonProps) {
  return (
    <div className={`${gridClassName} ${className || ''}`} aria-busy="true" aria-label={label}>
      {Array.from({ length: cards }).map((_, card) => (
        <div key={card} className="card flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
