export interface BranchesSummaryBarProps {
  totalProfit: number;
  totalExpenses: number;
  totalIncome: number;
  isLoading?: boolean;
}

export interface BranchFinancialRow {
  revenue: number;
  spending: number;
}
