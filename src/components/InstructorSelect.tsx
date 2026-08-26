'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type InstructorSelectOption = {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
};

type Props = {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  instructors: InstructorSelectOption[];
  extraOptions?: InstructorSelectOption[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
};

function displayName(row: InstructorSelectOption): string {
  return (row.full_name || `${row.first_name || ''} ${row.last_name || ''}`).trim();
}

function matchesQuery(row: InstructorSelectOption, query: string): boolean {
  const haystack = [displayName(row), row.first_name, row.last_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export default function InstructorSelect({
  id,
  value,
  onChange,
  instructors,
  extraOptions = [],
  disabled = false,
  required = false,
  className = '',
  placeholder = 'בחר מדריך',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const byId = new Map<string, InstructorSelectOption>();
    for (const row of extraOptions) byId.set(row.id, row);
    for (const row of instructors) byId.set(row.id, row);
    const list = [...byId.values()].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), 'he'),
    );
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => matchesQuery(row, q));
  }, [instructors, extraOptions, query]);

  const selected = options.find((row) => row.id === value)
    || instructors.find((row) => row.id === value)
    || extraOptions.find((row) => row.id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    searchRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {required ? (
        <input
          tabIndex={-1}
          value={value}
          required
          onChange={() => undefined}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          aria-hidden
        />
      ) : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setQuery('');
          setOpen((prev) => !prev);
        }}
        className={className || 'w-full rounded-lg border border-gray-300 px-4 py-2 text-right disabled:bg-gray-100'}
      >
        {selected ? displayName(selected) : placeholder}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש מדריך..."
            className="w-full border-b px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              className="block w-full px-3 py-2 text-right text-sm text-muted-foreground hover:bg-muted/40"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
            {options.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">לא נמצא מדריך בשם זה</p>
            ) : (
              options.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-right text-sm hover:bg-muted/40 ${
                    row.id === value ? 'bg-primary/5 font-medium' : ''
                  }`}
                  onClick={() => {
                    onChange(row.id);
                    setOpen(false);
                  }}
                >
                  {displayName(row)}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
