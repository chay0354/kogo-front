'use client';

interface FilterOption {
  value: string;
  label: string;
}

interface PageFiltersProps {
  primaryLabel?: string;
  primaryValue: string;
  primaryOptions: FilterOption[];
  onPrimaryChange: (value: string) => void;
  secondaryLabel?: string;
  secondaryValue: string;
  secondaryOptions: FilterOption[];
  onSecondaryChange: (value: string) => void;
}

export default function PageFilters({
  primaryLabel = 'עסק / סניף',
  primaryValue,
  primaryOptions,
  onPrimaryChange,
  secondaryLabel = 'קטגוריה',
  secondaryValue,
  secondaryOptions,
  onSecondaryChange,
}: PageFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {primaryLabel}:
        </label>
        <select
          value={primaryValue}
          onChange={(e) => {
            onPrimaryChange(e.target.value);
            onSecondaryChange('');
          }}
          className="h-9 w-full sm:w-auto rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">הכל</option>
          {primaryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {secondaryOptions.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            {secondaryLabel}:
          </label>
          <select
            value={secondaryValue}
            onChange={(e) => onSecondaryChange(e.target.value)}
            className="h-9 w-full sm:w-auto rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">הכל</option>
            {secondaryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
