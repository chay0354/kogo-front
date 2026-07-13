export interface BranchFinancialDonutProps {
  branchName: string;
  revenue: number;
  spending: number;
  profit: number;
  isLoading?: boolean;
}

export interface DonutSegment {
  name: string;
  value: number;
  [key: string]: string | number;
}
