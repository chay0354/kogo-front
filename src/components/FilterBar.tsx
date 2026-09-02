'use client';

import { Search } from 'lucide-react';

export interface FilterBarOption {
  value: string;
  label: string;
}

export interface FilterBarField<K extends string = string> {
  key: K;
  /** Doubles as the unselected option, so the row reads as labels without a legend. */
  label: string;
  options: FilterBarOption[];
}

interface FilterBarProps<K extends string> {
  fields: Array<FilterBarField<K>>;
  values: Record<K, string>;
  onChange: (key: K, value: string) => void;
  onClear?: () => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
}

/** The unselected value every screen agrees on. */
export const FILTER_ALL = 'all';

/**
 * The one filter row. Options arrive as props rather than being fetched here:
 * a worker gets 403 on every option endpoint (branches, cities, instructors,
 * courses, course types), so screens they reach must derive options from the
 * rows already returned instead. Fetching inside this component would break
 * every instructor-facing screen.
 */
export default function FilterBar<K extends string>({
  fields,
  values,
  onChange,
  onClear,
  search,
}: FilterBarProps<K>) {
  const hasActiveFilters =
    fields.some((field) => {
      const value = values[field.key];
      return value && value !== FILTER_ALL;
    }) || Boolean(search?.value);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" dir="rtl">
      {search && (
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'חיפוש...'}
            className="input w-full pr-9 text-sm"
          />
        </div>
      )}

      {fields.map((field) => (
        <select
          key={field.key}
          className="input w-full sm:w-40 text-sm"
          value={values[field.key] ?? FILTER_ALL}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          <option value={FILTER_ALL}>{field.label}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      {hasActiveFilters && onClear && (
        <button
          onClick={onClear}
          className="text-sm text-primary hover:text-primary/80 underline mr-2"
        >
          נקה סינון ✕
        </button>
      )}
    </div>
  );
}
