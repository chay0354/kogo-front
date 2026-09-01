import { Skeleton, StatCardsSkeleton } from '@/components/ui/skeleton';

/**
 * Shown while a screen's own code is still on its way.
 *
 * Only reachable because the shell sits above this: the sidebar and the menu
 * stay on screen and it is the page area alone that waits. Deliberately a
 * heading and a row of cards and nothing more — every office screen opens on
 * one or the other, and a shape closer to any single screen would be wrong on
 * all the rest.
 */
export default function CrmLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="טוען עמוד">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <StatCardsSkeleton cards={4} />
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
