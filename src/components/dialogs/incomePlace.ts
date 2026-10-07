import { isBranchesBusiness } from './NewDocumentDialog/utils';

// ---------------------------------------------------------------------------
// Where a charge's income is filed — the rule the link windows share (business
// charge, card link, payment link), pure so incomePlace.test.ts pins it down.
//
// Under the business סניפים (owner, 7.10.2026) the money is a branch's: the
// branch is asked for right after the business and must be named, and a
// category there is an extra. Under any other business each window keeps its
// own rule. The server refuses the same things (kogo-back payment_links,
// customers/card_link_views).
// ---------------------------------------------------------------------------

export const BRANCH_NEEDED = 'יש לבחור סניף';

/** Whether the business picked from a list, by its id, is סניפים. */
export function pickedBranchesBusiness(
  businesses: readonly { id: string; name: string }[],
  businessId: string | null | undefined,
): boolean {
  if (!businessId) return false;
  return isBranchesBusiness(businesses.find((business) => business.id === businessId)?.name);
}

/**
 * What to say when סניפים was picked and no branch stands behind it — or ''
 * when nothing is missing. `fallbackBranch` is a branch the server falls back
 * to by itself (the family's, in the card link): with one, nothing is missing.
 */
export function branchMissing(
  branchesBusiness: boolean,
  branchId: string | null | undefined,
  fallbackBranch: string | null | undefined = null,
): string {
  return branchesBusiness && !branchId && !fallbackBranch ? BRANCH_NEEDED : '';
}

/** Whether a category must be chosen: never under סניפים, else as the window rules. */
export function categoryNeeded(branchesBusiness: boolean, neededOtherwise: boolean): boolean {
  return !branchesBusiness && neededOtherwise;
}
