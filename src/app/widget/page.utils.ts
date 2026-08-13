import type { City } from './types';

export const CITY_DISPLAY_ORDER = [
  'פתח תקווה',
  'ראש העין',
  'כפר סבא',
  'שוהם',
  'יהוד',
  'אור יהודה',
  'רמת גן',
  'רמלה',
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
