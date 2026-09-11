'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import { filterBranchesByCity } from '@/lib/scopedFilters';
import type { LedgerDimensions, LedgerFilterKey } from './types';
import { LEDGER_BUSINESS_BRANCHES, LEDGER_BUSINESS_FIXED_OPTIONS } from './constants';
import {
  ledgerRowOptions,
  withSelectedOption,
  type LedgerOption,
  type LedgerRowDimension,
} from './utils';
import { useLedgerFilterOptions, type LedgerFiltersState } from './useLedgerFilters';
import styles from './ledgerFilterBar.module.css';

const NO_ROWS: readonly LedgerDimensions[] = [];
const NOTHING_HIDDEN: readonly LedgerFilterKey[] = [];

/** The selects whose options are read off the rows the tab loaded. */
const ROW_SELECTS: ReadonlyArray<{ key: LedgerRowDimension; label: string; all: string }> = [
  { key: 'courseTypeId', label: 'סוג חוג', all: 'כל סוגי החוגים' },
  { key: 'ageKey', label: 'גיל', all: 'כל הגילים' },
  { key: 'instructorId', label: 'מדריך', all: 'כל המדריכים' },
];

/** The class the shared controls wear — give it to a tab's own input so it matches them. */
export const ledgerControlClass = styles.control;

interface LedgerFieldProps {
  /** The id of the control inside; the label points at it. */
  id: string;
  /** Always visible: what is being filtered has to be readable at a glance. */
  label: string;
  /** Takes the room a free-text field needs. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}

/** One labelled cell of the bar. A tab's own fields go in these so they line up with the shared ones. */
export function LedgerField({ id, label, wide = false, className = '', children }: LedgerFieldProps) {
  return (
    <div className={`${styles.field} ${wide ? styles.wide : ''} ${className}`}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {children}
    </div>
  );
}

interface LedgerSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<LedgerOption>;
  /** The first option, valued '' — "all". Omit when the options already start with it. */
  allLabel?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}

/** A labelled select in the bar's look. A chosen value tints it, so the filters in force stand out. */
export function LedgerSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled = false,
  title,
  className,
}: LedgerSelectProps) {
  return (
    <LedgerField id={id} label={label} className={className}>
      <select
        id={id}
        className={`${styles.control} ${value ? styles.controlOn : ''}`}
        value={value}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      >
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </LedgerField>
  );
}

export interface LedgerFilterBarProps {
  /** The page's shared filters — what useLedgerFilters() returned. */
  ledger: LedgerFiltersState;
  /**
   * The rows the tab loaded. סוג חוג, גיל and מדריך offer the distinct values
   * found in them, so they need no endpoint of their own.
   */
  rows?: readonly LedgerDimensions[];
  /** While the rows load, those three say so rather than "nothing in range". */
  rowsLoading?: boolean;
  /**
   * Shared fields this tab has no use for (e.g. the dates, on a list that is
   * not dated). Hiding removes the control only: a value chosen on another tab
   * stays in ledger.filters, so a tab that hides a field must not match on it.
   */
  hide?: readonly LedgerFilterKey[];
  /** Say what this tab's search looks at. */
  searchPlaceholder?: string;
  /** The tab's own fields — LedgerSelect / LedgerField — placed after the shared ones. */
  children?: ReactNode;
  /** How many of the tab's own fields are narrowing now; they count toward "נקה סינון". */
  extraActiveCount?: number;
  /** Clears the tab's own fields. "נקה סינון" calls it together with ledger.reset(). */
  onClearExtra?: () => void;
  /** The result line, "מציג {shown} מתוך {total} {noun}". Leave it out while there is nothing to count. */
  result?: { shown: number; total: number; noun: string };
  /** The footer's far side — an export, a report. */
  footerActions?: ReactNode;
  /** Prefix of the fields' ids, so they stay unique. Default 'ledger'. */
  idPrefix?: string;
}

/**
 * The one filter bar of the invoices page.
 *
 * Every tab renders it over its own rows with the page's shared filters, so a
 * choice narrows every list the same way: the free text and the range first,
 * then where the income came from — עסק, and under סניפים a city and a branch
 * — then the class, the age group and the instructor, then whatever the tab
 * adds of its own. The rows are matched with matchesLedgerFilters (utils.ts).
 */
export default function LedgerFilterBar({
  ledger,
  rows = NO_ROWS,
  rowsLoading = false,
  hide = NOTHING_HIDDEN,
  searchPlaceholder = 'חיפוש חופשי…',
  children,
  extraActiveCount = 0,
  onClearExtra,
  result,
  footerActions,
  idPrefix = 'ledger',
}: LedgerFilterBarProps) {
  const { filters, setFilter, setFilters, reset, activeCount } = ledger;
  const { branches, cities, businesses } = useLedgerFilterOptions();
  const show = (key: LedgerFilterKey) => !hide.includes(key);
  // A tab without dates (standing orders, checks) has no range to be "in".
  const datesShown = show('dateFrom');
  const fieldId = (name: string) => `${idPrefix}-${name}`;

  const businessOptions = useMemo(
    () => withSelectedOption(
      [
        ...LEDGER_BUSINESS_FIXED_OPTIONS,
        ...businesses.map((business) => ({
          value: business.id,
          label: business.is_active === false ? `${business.name} (לא פעיל)` : business.name,
        })),
      ],
      filters.business,
      'עסק שנבחר',
    ),
    [businesses, filters.business],
  );

  const placeOpen = filters.business === LEDGER_BUSINESS_BRANCHES;

  const cityOptions = useMemo(
    () => withSelectedOption(
      cities.map((city) => ({ value: city.id, label: city.name })),
      filters.cityId,
      'עיר שנבחרה',
    ),
    [cities, filters.cityId],
  );

  const branchOptions = useMemo(
    () => withSelectedOption(
      filterBranchesByCity(branches, filters.cityId || 'all')
        .map((branch) => ({ value: branch.id, label: branch.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'he')),
      filters.branchId,
      'סניף שנבחר',
    ),
    [branches, filters.cityId, filters.branchId],
  );

  // The names of values seen so far, so a choice with no rows in a new range
  // still reads as itself rather than as a bare id.
  const seenLabels = useRef(new Map<string, string>());
  const rowOptions = useMemo(() => {
    const build = (dimension: LedgerRowDimension, selected: string) => {
      const options = ledgerRowOptions(rows, dimension);
      options.forEach((option) => seenLabels.current.set(`${dimension}:${option.value}`, option.label));
      const known = seenLabels.current.get(`${dimension}:${selected}`);
      const fallback = rowsLoading
        ? known ?? 'טוען…'
        : `${known ?? 'בחירה קודמת'} (${datesShown ? 'אין בטווח' : 'לא ברשימה'})`;
      return withSelectedOption(options, selected, fallback);
    };
    return {
      courseTypeId: build('courseTypeId', filters.courseTypeId),
      ageKey: build('ageKey', filters.ageKey),
      instructorId: build('instructorId', filters.instructorId),
    };
  }, [rows, rowsLoading, filters.courseTypeId, filters.ageKey, filters.instructorId]);

  function changeCity(cityId: string) {
    const chosen = branches.find((branch) => branch.id === filters.branchId);
    // A branch already chosen stays when it is in the new city. One that is
    // not would be a choice the branch list no longer offers.
    const keepBranch = Boolean(chosen) && (!cityId || chosen?.city === cityId);
    setFilters({ cityId, branchId: keepBranch ? filters.branchId : '' });
  }

  // Only what this tab applies and can clear: a filter chosen on another tab
  // that this one hides is not in force here, so it is not counted here either.
  const hiddenActive = hide.filter(
    (key) => key !== 'dateFrom' && key !== 'dateTo' && Boolean(filters[key]),
  ).length;
  const clearable = activeCount - hiddenActive + extraActiveCount;
  function clearAll() {
    reset();
    onClearExtra?.();
  }

  const showPrimary = show('search') || show('dateFrom') || show('dateTo');

  return (
    <section className={theme.card} aria-label="סינון">
      {showPrimary && (
        <div className={styles.primary}>
          {show('search') && (
            <LedgerField id={fieldId('search')} label="חיפוש" wide>
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  id={fieldId('search')}
                  type="search"
                  autoComplete="off"
                  className={`${styles.control} ${styles.searchControl} ${filters.search ? styles.controlOn : ''}`}
                  placeholder={searchPlaceholder}
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                />
              </div>
            </LedgerField>
          )}

          {show('dateFrom') && (
            <LedgerField id={fieldId('from')} label="מתאריך">
              <input
                id={fieldId('from')}
                type="date"
                className={styles.control}
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
              />
            </LedgerField>
          )}

          {show('dateTo') && (
            <LedgerField id={fieldId('to')} label="עד תאריך">
              <input
                id={fieldId('to')}
                type="date"
                className={styles.control}
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => setFilter('dateTo', e.target.value)}
              />
            </LedgerField>
          )}
        </div>
      )}

      <div className={styles.grid} style={showPrimary ? undefined : { marginTop: 0 }}>
        {show('business') && (
          <LedgerSelect
            id={fieldId('business')}
            label="עסק"
            value={filters.business}
            onChange={(value) => setFilter('business', value)}
            options={businessOptions}
          />
        )}

        {placeOpen && show('cityId') && (
          <LedgerSelect
            id={fieldId('city')}
            label="עיר"
            value={filters.cityId}
            onChange={changeCity}
            options={cityOptions}
            allLabel="כל הערים"
            className={styles.revealed}
          />
        )}

        {placeOpen && show('branchId') && (
          <LedgerSelect
            id={fieldId('branch')}
            label="סניף"
            value={filters.branchId}
            onChange={(value) => setFilter('branchId', value)}
            options={branchOptions}
            allLabel={filters.cityId ? 'כל הסניפים בעיר' : 'כל הסניפים'}
            className={styles.revealed}
          />
        )}

        {ROW_SELECTS.filter(({ key }) => show(key)).map(({ key, label, all }) => {
          const options = rowOptions[key];
          const empty = options.length === 0;
          return (
            <LedgerSelect
              key={key}
              id={fieldId(key)}
              label={label}
              value={filters[key]}
              onChange={(value) => setFilter(key, value)}
              options={options}
              allLabel={empty ? (rowsLoading ? 'טוען…' : (datesShown ? 'אין נתונים בטווח' : 'אין נתונים')) : all}
              disabled={empty}
              title={empty && !rowsLoading ? `אף שורה בטווח לא מציינת ${label}` : undefined}
            />
          );
        })}

        {children}
      </div>

      {(result || footerActions || clearable > 0) && (
        <div className={styles.footer}>
          <p className={styles.resultLine}>
            {result && (
              <span aria-live="polite">
                מציג <b>{result.shown.toLocaleString('he-IL')}</b> מתוך{' '}
                <b>{result.total.toLocaleString('he-IL')}</b> {result.noun}
              </span>
            )}
            {clearable > 0 && (
              <>
                {result && (
                  <span className={styles.sep} aria-hidden="true">
                    ·
                  </span>
                )}
                <span className={styles.activeCount}>
                  {clearable === 1 ? 'מסנן אחד פעיל' : `${clearable} מסננים פעילים`}
                </span>
                <button type="button" className={styles.clearLink} onClick={clearAll}>
                  <X size={13} aria-hidden="true" />
                  נקה סינון
                </button>
              </>
            )}
          </p>
          {footerActions ? <div className={styles.footerActions}>{footerActions}</div> : null}
        </div>
      )}
    </section>
  );
}
