import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), defaults: { baseURL: 'https://api.example.test/api/v1' } } }));

import { apiAddress, readCalendarLinks } from './trialCalendar';

const API = 'https://api.example.test/api/v1';
const GOOGLE = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=x';
const PATH = 'customers/widget/trial-event.ics?lesson_id=abc&date=2026-10-05';

describe('the links of a trial lesson in a calendar', () => {
  it('joins the file path to the API, whatever slashes they carry', () => {
    expect(apiAddress(API, PATH)).toBe(`${API}/${PATH}`);
    expect(apiAddress(`${API}/`, `/${PATH}`)).toBe(`${API}/${PATH}`);
  });

  it('reads the title, the Google link and the file', () => {
    expect(readCalendarLinks({ title: 'שיעור ניסיון בקפוארה - 16:45', google_url: GOOGLE, ics_path: PATH }, API)).toEqual({
      title: 'שיעור ניסיון בקפוארה - 16:45',
      googleUrl: GOOGLE,
      fileUrl: `${API}/${PATH}`,
    });
  });

  it('shows nothing when a part is missing', () => {
    expect(readCalendarLinks({ google_url: GOOGLE }, API)).toBeNull();
    expect(readCalendarLinks({ ics_path: PATH }, API)).toBeNull();
    expect(readCalendarLinks({ google_url: GOOGLE, ics_path: PATH }, '')).toBeNull();
    expect(readCalendarLinks(null, API)).toBeNull();
  });

  it('opens Google Calendar only, never another address', () => {
    expect(readCalendarLinks({ google_url: 'https://evil.example/calendar', ics_path: PATH }, API)).toBeNull();
    expect(readCalendarLinks({ google_url: 'javascript:alert(1)', ics_path: PATH }, API)).toBeNull();
  });
});
