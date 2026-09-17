/**
 * Waiting on a server job, in one place.
 *
 * This is the third of these in the codebase — the widget waits for a card to
 * settle, the payment page waits for a gateway, and now the office waits for a
 * municipality sheet to be read. All three want the same three things and all
 * three got them slightly differently: a deadline, errors swallowed while the
 * work is still in flight, and a clean answer at the end.
 *
 * Transient failures are deliberately ignored rather than surfaced. Once a job
 * is running on the server, a dropped request says something about the network,
 * not about the job, and giving up on it would throw away work that is still
 * happening.
 */

export interface PollOptions<T> {
  /** Ask the server once. Rejections are treated as "not yet". */
  check: () => Promise<T>;
  /** True when the answer is final and polling should stop. */
  done: (value: T) => boolean;
  /** Gap between attempts. */
  intervalMs: number;
  /** How long to keep asking before giving up. */
  timeoutMs: number;
  /** Called after every successful check, for progress. */
  onTick?: (value: T) => void;
  /** Lets a caller stop early — a closed dialog, a cancelled import. */
  shouldStop?: () => boolean;
}

export interface PollResult<T> {
  value: T | null;
  /** Why polling ended, so the caller can tell "finished" from "gave up". */
  outcome: 'done' | 'timeout' | 'stopped';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollUntil<T>({
  check,
  done,
  intervalMs,
  timeoutMs,
  onTick,
  shouldStop,
}: PollOptions<T>): Promise<PollResult<T>> {
  const deadline = Date.now() + timeoutMs;
  let last: T | null = null;

  while (Date.now() < deadline) {
    if (shouldStop?.()) return { value: last, outcome: 'stopped' };
    try {
      last = await check();
      onTick?.(last);
      if (done(last)) return { value: last, outcome: 'done' };
    } catch {
      // Still in flight as far as we know. Keep asking.
    }
    await sleep(intervalMs);
  }

  return { value: last, outcome: 'timeout' };
}
