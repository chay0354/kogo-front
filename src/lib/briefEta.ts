/**
 * How much of the brief is done, and roughly how long the rest will take.
 *
 * The office asked to be able to walk away from the screen while it runs, so
 * the button in the corner has to answer "is it still thinking, and for how
 * long?" — from the checks that have already answered, never from a guess made
 * in advance: the first run of the day is slower than the next.
 */

export interface BriefProgress {
  done: number;
  total: number;
  /** Milliseconds since the run started. */
  elapsedMs: number;
}

export function briefPercent({ done, total }: Pick<BriefProgress, 'done' | 'total'>): number {
  if (total <= 0) return 0;
  // Floored: a run that says 100% while a check is still out is telling the
  // office it can stop looking.
  return Math.min(Math.floor((done / total) * 100), 99);
}

/** Seconds left, or null while there is nothing to base it on. */
export function briefSecondsLeft({ done, total, elapsedMs }: BriefProgress): number | null {
  if (done <= 0 || total <= 0 || done >= total) return null;
  const perCheck = elapsedMs / done;
  const remaining = Math.round((perCheck * (total - done)) / 1000);
  return Math.max(remaining, 1);
}

export function briefEtaText(progress: BriefProgress): string {
  const seconds = briefSecondsLeft(progress);
  if (seconds === null) return '';
  if (seconds < 60) return `עוד כ-${seconds} שניות`;
  const minutes = Math.ceil(seconds / 60);
  return `עוד כ-${minutes} דקות`;
}
