/**
 * A sentence a manager can act on.
 *
 * DRF answers field errors as {field: ["message"]}, so a real reason — a name
 * already taken, a missing permission — used to reach the screen as a generic
 * "failed", leaving nothing to act on.
 */
export function readableError(e: unknown, fallback = 'השמירה נכשלה'): string {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data.trim() || fallback;
  const body = data as Record<string, unknown>;
  if (body.detail) return String(body.detail);
  if (body.error) return String(body.error);
  const messages = Object.values(body)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v).trim())
    .filter(Boolean);
  return messages.length ? messages.join(' · ') : fallback;
}
