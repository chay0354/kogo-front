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
