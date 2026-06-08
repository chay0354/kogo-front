/** Normalize API or input time to HH:mm */
export function normalizeTimeValue(value?: string | null, fallback = '09:00'): string {
  if (!value) return fallback;
  const [hourPart, minutePart = '0'] = value.split(':');
  const hours = Number.parseInt(hourPart, 10);
  const minutes = Number.parseInt(minutePart, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  const clampedHours = Math.max(0, Math.min(23, hours));
  const clampedMinutes = Math.max(0, Math.min(59, minutes));
  return `${String(clampedHours).padStart(2, '0')}:${String(clampedMinutes).padStart(2, '0')}`;
}

/** Add minutes to HH:mm, wraps at midnight */
export function addMinutesToTime(time: string, minutes: number): string {
  const normalized = normalizeTimeValue(time);
  const [hours, mins] = normalized.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHours = Math.floor(wrapped / 60);
  const nextMinutes = wrapped % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

export function compareTimes(a: string, b: string): number {
  return normalizeTimeValue(a).localeCompare(normalizeTimeValue(b));
}

export function generateHourOptions(minHour = 6, maxHour = 23): number[] {
  const min = Math.max(0, Math.min(23, minHour));
  const max = Math.max(min, Math.min(23, maxHour));
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function generateMinuteOptions(step = 5): number[] {
  const safeStep = Math.max(1, Math.min(30, step));
  const count = Math.ceil(60 / safeStep);
  return Array.from({ length: count }, (_, index) => index * safeStep).filter((m) => m < 60);
}

export function buildMinuteOptions(step: number, currentMinute: number): number[] {
  const base = generateMinuteOptions(step);
  if (base.includes(currentMinute)) return base;
  return [...base, currentMinute].sort((a, b) => a - b);
}

export function formatHourLabel(hour: number): string {
  return String(hour).padStart(2, '0');
}

export function formatMinuteLabel(minute: number): string {
  return String(minute).padStart(2, '0');
}
