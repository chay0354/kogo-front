'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { fetchBranchesList } from '@/lib/api';
import {
  BranchOption,
  citiesFromBranches,
  filterBranchesForUser,
  unwrapApiList,
} from '@/lib/scopedFilters';

export function useScopedBranches() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['branches-list', user?.id, user?.role, ...(user?.branch_ids ?? [])],
    queryFn: fetchBranchesList,
    enabled: !!user,
  });

  const branches = useMemo(() => {
    const list = unwrapApiList<BranchOption>(data);
    return filterBranchesForUser(list, user);
  }, [data, user]);

  const cities = useMemo(() => citiesFromBranches(branches), [branches]);

  return { branches, cities, isLoading };
}
