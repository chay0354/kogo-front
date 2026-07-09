import { City } from '@/types/branch';

export function normalizeCityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function dedupeCitiesByName(cities: City[]): City[] {
  const byName = new Map<string, City>();

  for (const city of cities) {
    const key = normalizeCityName(city.name).toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, city);
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'he')
  );
}

export function findCityByName(cities: City[], name: string): City | undefined {
  const key = normalizeCityName(name).toLowerCase();
  return cities.find((city) => normalizeCityName(city.name).toLowerCase() === key);
}
