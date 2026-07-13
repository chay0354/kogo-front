/**
 * Reused verbatim from BranchesSection.tsx's BRANCH_COLORS — do not re-derive
 * from --success/--warning/--info tokens, they're visually close but distinct.
 */
export const DONUT_COLORS = {
  income: 'hsl(142, 76%, 36%)',
  spending: 'hsl(25, 95%, 53%)',
  profit: 'hsl(217, 91%, 60%)',
} as const;
