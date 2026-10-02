/**
 * "Add to calendar" for a booked trial lesson.
 *
 * The server builds the event — when, where, who teaches, what to bring — and
 * hands back a link that opens Google Calendar with it filled in, and the path
 * of the same event as an .ics file (Apple Calendar, and every other one).
 * The form only asks for it and shows the two doors. When the answer does not
 * come, nothing is shown: a button that leads nowhere is worse than none.
 */
import api from '@/lib/api';

export interface TrialCalendarLinks {
  title: string;
  /** Opens Google Calendar with the event filled in. */
  googleUrl: string;
  /** The event as a calendar file. */
  fileUrl: string;
}

/** The full address of a path the API answered with, whatever slashes either side carries. */
export function apiAddress(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function readCalendarLinks(data: unknown, apiBase: string): TrialCalendarLinks | null {
  const body = (data ?? {}) as { title?: unknown; google_url?: unknown; ics_path?: unknown };
  const googleUrl = typeof body.google_url === 'string' ? body.google_url : '';
  const path = typeof body.ics_path === 'string' ? body.ics_path : '';
  // Only the calendar we asked to open: never whatever address an answer happens to carry.
  if (!googleUrl.startsWith('https://calendar.google.com/') || !path || !apiBase) return null;
  return {
    title: typeof body.title === 'string' ? body.title : '',
    googleUrl,
    fileUrl: apiAddress(apiBase, path),
  };
}

export async function fetchTrialCalendarLinks(lessonId: string, date: string): Promise<TrialCalendarLinks | null> {
  if (!lessonId || !date) return null;
  try {
    const res = await api.get('/customers/widget/trial-event/', {
      params: { lesson_id: lessonId, date },
      timeout: 15_000,
    });
    return readCalendarLinks(res.data, String(api.defaults.baseURL ?? ''));
  } catch {
    return null;
  }
}
