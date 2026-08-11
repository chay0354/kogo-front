import { useMemo } from 'react';
import { BRANCHES_CATEGORY, BUSINESS_TYPE_OPTIONS } from './constants';

type BranchOption = { id: string; name: string };

/** Flat business types + branch names under a "סניפים" optgroup. */
export default function BusinessCategoryOptions({ branches }: { branches: BranchOption[] }) {
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [branches],
  );

  const flatOptions = useMemo(
    () => BUSINESS_TYPE_OPTIONS.filter((opt) => opt !== BRANCHES_CATEGORY),
    [],
  );

  return (
    <>
      {flatOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
      {sortedBranches.length > 0 ? (
        <optgroup label={BRANCHES_CATEGORY}>
          {sortedBranches.map((branch) => (
            <option key={branch.id} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </optgroup>
      ) : (
        <option disabled value="">
          {BRANCHES_CATEGORY} — אין סניפים זמינים
        </option>
      )}
    </>
  );
}
