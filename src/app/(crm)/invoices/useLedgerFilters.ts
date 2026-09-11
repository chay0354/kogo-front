'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { useScopedBranches } from '@/hooks/useScopedBranches';
import { fetchBusinesses, type Business } from '@/lib/api';
import type { LedgerFilterKey, LedgerFilters } from './types';
import { applyLedgerFilterChange, countActiveLedgerFilters, defaultLedgerFilters } from './utils';

export interface LedgerFiltersState {
  /** The current values. Change them only through the setters below. */
  filters: LedgerFilters;
  /** Change one filter. */
  setFilter: <K extends LedgerFilterKey>(key: K, value: LedgerFilters[K]) => void;
  /** Change several in one step — e.g. both ends of the range. */
  setFilters: (patch: Partial<LedgerFilters>) => void;
  /**
   * Clear every narrowing filter — עסק, עיר, סניף, סוג חוג, גיל, מדריך and the
   * search. The date range stays: it is what was fetched, not a filter on it.
   * activeCount is 0 right after.
   */
  reset: () => void;
  /** Back to the window the page opens on: the last DEFAULT_RANGE_DAYS days. */
  resetRange: () => void;
  /** How many narrowing filters are in force. The dates are not counted. */
  activeCount: number;
}

/**
 * The filters every tab of the invoices page shares.
 *
 * The page calls this once and hands the result to whichever tab is open, so a
 * choice made on one tab is still in force on the next — switching tabs never
 * silently widens what is shown. Every change goes through
 * applyLedgerFilterChange, which keeps the model coherent however the change
 * arrives: a city or branch implies סניפים, leaving סניפים clears them, and the
 * range cannot invert.
 */
export function useLedgerFilters(initial?: Partial<LedgerFilters>): LedgerFiltersState {
  const [filters, setState] = useState<LedgerFilters>(
    () => applyLedgerFilterChange(defaultLedgerFilters(), initial ?? {}),
  );

  const setFilters = useCallback((patch: Partial<LedgerFilters>) => {
    setState((prev) => applyLedgerFilterChange(prev, patch));
  }, []);

  const setFilter = useCallback(<K extends LedgerFilterKey>(key: K, value: LedgerFilters[K]) => {
    setState((prev) => applyLedgerFilterChange(prev, { [key]: value } as Partial<LedgerFilters>));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({ ...defaultLedgerFilters(), dateFrom: prev.dateFrom, dateTo: prev.dateTo }));
  }, []);

  const resetRange = useCallback(() => {
    const { dateFrom, dateTo } = defaultLedgerFilters();
    setState((prev) => ({ ...prev, dateFrom, dateTo }));
  }, []);

  const activeCount = countActiveLedgerFilters(filters);

  return useMemo(
    () => ({ filters, setFilter, setFilters, reset, resetRange, activeCount }),
    [filters, setFilter, setFilters, reset, resetRange, activeCount],
  );
}

/**
 * What the shared bar offers for עסק, עיר and סניף.
 *
 * Both lists are cached queries, so a tab that mounts the bar again does not
 * ask again, and the businesses share NewDocumentDialog's cache. The branches
 * are the partner-scoped list from /core/branches/; each carries its city (an
 * id) and city_name, and the cities are read off them.
 */
export function useLedgerFilterOptions() {
  const { user } = useAuth();
  const { branches, cities, isLoading: branchesLoading } = useScopedBranches();
  const businessesQuery = useQuery({
    queryKey: ['businesses'],
    queryFn: fetchBusinesses,
    enabled: Boolean(user),
  });

  const businesses = useMemo<Business[]>(() => {
    const list = Array.isArray(businessesQuery.data) ? businessesQuery.data : [];
    return [...list].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'he'),
    );
  }, [businessesQuery.data]);

  return {
    branches,
    cities,
    businesses,
    isLoading: branchesLoading || businessesQuery.isLoading,
  };
}
