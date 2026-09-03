import type { City } from './types';

/** These cities do not show the "standing order starts 1.9" widget note. */
export const HIDE_SEPTEMBER_STANDING_ORDER_NOTE_CITIES = [
  'יהוד',
  'אור יהודה',
  'רמת גן',
  'פתח תקווה',
] as const;

/** Branch name fragments that also hide that note (e.g. Kfar Ganim in Petah Tikva). */
export const HIDE_SEPTEMBER_STANDING_ORDER_NOTE_BRANCH_FRAGMENTS = ['כפר גנים', 'מרכז זמיר'] as const;

export function hideSeptemberStandingOrderNote(
  cityName?: string | null,
  branchName?: string | null,
): boolean {
  const city = (cityName || '').trim();
  if ((HIDE_SEPTEMBER_STANDING_ORDER_NOTE_CITIES as readonly string[]).includes(city)) {
    return true;
  }
  const branch = (branchName || '').trim();
  return (HIDE_SEPTEMBER_STANDING_ORDER_NOTE_BRANCH_FRAGMENTS as readonly string[]).some(
    (fragment) => branch.includes(fragment),
  );
}

export const CITY_DISPLAY_ORDER = [
  'פתח תקווה',
  'ראש העין',
  'כפר סבא',
  'שוהם',
  'יהוד',
  'אור יהודה',
  'רמת גן',
  'רמלה',
  'הוד השרון',
  'עפולה',
  'האלה',
];

// Hardcoded so the city dropdown is selectable instantly on page load, with
// no dependency on the branches/courses fetch. IDs must match the `cities`
// table exactly (branch filtering relies on Branch.city_id === city.id).
// Adding/renaming a city in the admin panel requires updating this list too.
export const STATIC_CITIES: City[] = [
  { id: '2a96b847-4d86-46d9-9bd4-2ebe3125af9a', name: 'פתח תקווה' },
  { id: '315ebe0c-430d-4574-9284-9a1780510a63', name: 'ראש העין' },
  { id: 'b46d8df6-543d-4a93-b567-336e9cdea724', name: 'כפר סבא' },
  { id: '2c5f8b4e-f6a2-4b8b-bc8f-2cca492b7f87', name: 'שוהם' },
  { id: '9031809d-2ceb-4bc5-a2f4-500623fc8fd5', name: 'יהוד' },
  { id: '02a051cc-75ac-4237-89ce-1a1a81625efb', name: 'אור יהודה' },
  { id: '211afb74-f3a7-4872-aa3d-2e2764ade514', name: 'רמת גן' },
  { id: 'a1a2126a-743f-48c3-b25c-a6937c25c0a3', name: 'רמלה' },
  { id: 'e893378c-d588-43a8-8584-097afebb2eb8', name: 'הוד השרון' },
  { id: 'cf06a03f-2901-43bb-8be3-180a6ed11d93', name: 'עפולה' },
];

export function sortCitiesByFixedOrder(cities: City[]): City[] {
  return [...cities].sort((a, b) => {
    const rankA = CITY_DISPLAY_ORDER.indexOf(a.name);
    const rankB = CITY_DISPLAY_ORDER.indexOf(b.name);
    if (rankA === -1 && rankB === -1) return 0;
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  });
}

/** Ensure external branch/course links open correctly when stored without a scheme. */
export function normalizeExternalLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Course link wins; branch link is only a fallback for branches marked external. */
export function resolveWidgetExternalLink(
  courseLink?: string | null,
  branch?: { is_external?: boolean; external_link?: string | null } | null,
): string {
  const fromCourse = (courseLink || '').trim();
  if (fromCourse) return normalizeExternalLink(fromCourse);
  if (!branch?.is_external) return '';
  const fromBranch = (branch.external_link || '').trim();
  return fromBranch ? normalizeExternalLink(fromBranch) : '';
}
