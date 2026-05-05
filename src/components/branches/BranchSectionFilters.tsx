'use client';

import { X } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface BranchSectionFiltersProps {
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  filterOptions: Array<{
    key: string;
    label: string;
    options: FilterOption[];
  }>;
}

export default function BranchSectionFilters({
  filters,
  onFilterChange,
  onClearFilters,
  filterOptions,
}: BranchSectionFiltersProps) {
  const hasActiveFilters = Object.values(filters).some(value => value && value !== 'all');

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {filterOptions.map((filterConfig) => (
        <div key={filterConfig.key} className="min-w-[200px]">
          <select
            value={filters[filterConfig.key] || 'all'}
            onChange={(e) => onFilterChange(filterConfig.key, e.target.value)}
            className="input w-full text-sm"
          >
            <option value="all">{filterConfig.label}</option>
            {filterConfig.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          נקה פילטרים
        </button>
      )}
    </div>
  );
}

