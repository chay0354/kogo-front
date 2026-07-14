'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/lib/branchUtils';
import { BranchesSummaryBarProps } from './BranchesSummaryBar.types';
import styles from './BranchesSummaryBar.module.css';

export function BranchesSummaryBar({
  totalProfit,
  totalExpenses,
  totalIncome,
  isLoading = false,
}: BranchesSummaryBarProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className={styles.bar}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.tile}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonValue} />
              <div className={styles.skeletonLabel} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className={styles.bar}>

        <div className={styles.tile}>
          <div className={`${styles.iconCircle} ${styles.iconIncome}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className={`${styles.value} ${styles.valueIncome}`}>{formatCurrency(totalIncome)}</span>
          <span className={styles.label}>הכנסות כוללות</span>
        </div>

        <div className={styles.tile}>
          <div className={`${styles.iconCircle} ${styles.iconExpenses}`}>
            <TrendingDown className="w-5 h-5" />
          </div>
          <span className={`${styles.value} ${styles.valueExpenses}`}>{formatCurrency(totalExpenses)}</span>
          <span className={styles.label}>הוצאות כוללות</span>
        </div>

        <div className={styles.tile}>
          <div className={`${styles.iconCircle} ${styles.iconProfit}`}>
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className={`${styles.value} ${styles.valueProfit}`}>{formatCurrency(totalProfit)}</span>
          <span className={styles.label}>רווח כולל</span>
        </div>


      </div>
    </div>
  );
}
