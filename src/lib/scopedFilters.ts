import type { CurrentUser } from '@/lib/auth';

export type BranchOption = {
  id: string;
  name: string;
  city?: string;
  city_name?: string;
};

export function unwrapApiList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'results' in data) {
    return ((data as { results?: T[] }).results) ?? [];
  }
  return [];
}

/** Extra safety: limit branch pickers to the partner's assigned branches. */
export function filterBranchesForUser(
  branches: BranchOption[],
  user: CurrentUser | null | undefined,
): BranchOption[] {
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

export function filterBranchesByCity(branches: BranchOption[], cityId: string) {
  if (cityId === 'all') return branches;
  return branches.filter((b) => b.city === cityId);
}
