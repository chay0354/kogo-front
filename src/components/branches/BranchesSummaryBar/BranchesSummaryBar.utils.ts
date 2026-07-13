import { BranchFinancialRow } from './BranchesSummaryBar.types';

export function sumTotalIncome(branchList: BranchFinancialRow[]): number {
  return branchList.reduce((sum, row) => sum + (row.revenue || 0), 0);
}

export function sumTotalExpenses(branchList: BranchFinancialRow[]): number {
  return branchList.reduce((sum, row) => sum + (row.spending || 0), 0);
}
