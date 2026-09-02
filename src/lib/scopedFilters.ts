import type { CurrentUser } from '@/lib/auth';

export type BranchOption = {
  id: string;
  name: string;
  city?: string | null;
  city_name?: string | null;
};

export function unwrapApiList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data) {
    return ((data as { results?: T[] }).results) ?? [];
  }
  return [];
}

/** Extra safety: limit branch pickers to the partner's assigned branches. */
export function filterBranchesForUser<T extends BranchOption>(
  branches: T[],
  user: CurrentUser | null | undefined,
): T[] {
  if (!user || user.role !== 'partner' || !user.branch_ids?.length) {
    return branches;
  }
  const allowed = new Set(user.branch_ids);
  return branches.filter((b) => allowed.has(b.id));
}

export function citiesFromBranches(branches: BranchOption[]) {
  const map = new Map<string, string>();
  branches.forEach((b) => {
    if (b.city && b.city_name) {
      map.set(b.city, b.city_name);
    }
  });
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function filterBranchesByCity<T extends BranchOption>(branches: T[], cityId: string): T[] {
  if (cityId === 'all') return branches;
  return branches.filter((b) => b.city === cityId);
}

/**
 * Filter options taken from rows the screen already holds, for roles that
 * cannot read the list endpoints — a worker gets 403 on branches, cities,
 * instructors, courses and course types alike.
 */
export function optionsFromRows<T>(
  rows: T[],
  getValue: (row: T) => string | null | undefined,
  getLabel: (row: T) => string | null | undefined,
): Array<{ value: string; label: string }> {
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const value = getValue(row);
    const label = getLabel(row);
    if (value && label) {
      map.set(value, label);
    }
  });
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
}
