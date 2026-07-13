import { formatCurrency } from '@/lib/branchUtils';
import { DonutSegment } from './BranchFinancialDonut.types';

export function isZeroData(revenue: number, spending: number): boolean {
  return revenue === 0 && spending === 0;
}

export function buildDonutSegments(revenue: number, spending: number): DonutSegment[] {
  if (isZeroData(revenue, spending)) {
    return [{ name: 'empty', value: 1 }];
  }
  return [
    { name: 'income', value: revenue },
    { name: 'spending', value: spending },
  ];
}

export function buildDonutAriaLabel(
  branchName: string,
  revenue: number,
  spending: number,
  profit: number
): string {
  return `${branchName}: הכנסות ${formatCurrency(revenue)}, הוצאות ${formatCurrency(spending)}, רווח ${formatCurrency(profit)}`;
}
