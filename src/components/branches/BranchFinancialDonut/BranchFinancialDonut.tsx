'use client';

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/branchUtils';
import { BranchFinancialDonutProps } from './BranchFinancialDonut.types';
import { DONUT_COLORS } from './BranchFinancialDonut.constants';
import { buildDonutSegments, buildDonutAriaLabel, isZeroData } from './BranchFinancialDonut.utils';
import styles from './BranchFinancialDonut.module.css';

export function BranchFinancialDonut({
  branchName,
  revenue,
  spending,
  profit,
  isLoading = false,
}: BranchFinancialDonutProps) {
  if (isLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeletonDonut} />
        <div className={styles.statRow}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      </div>
    );
  }

  const zeroData = isZeroData(revenue, spending);
  const segments = buildDonutSegments(revenue, spending);
  const ariaLabel = buildDonutAriaLabel(branchName, revenue, spending, profit);

  return (
    <div className={styles.wrapper}>
      <div className={styles.donutContainer} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={zeroData ? 0 : 2}
              stroke="none"
            >
              {zeroData ? (
                <Cell fill="hsl(var(--muted))" strokeWidth={0} />
              ) : (
                <>
                  <Cell fill={DONUT_COLORS.income} strokeWidth={0} />
                  <Cell fill={DONUT_COLORS.spending} strokeWidth={0} />
                </>
              )}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.centerOverlay}>
          <span className={`${styles.centerValue} ${zeroData ? styles.colorMuted : styles.colorProfit}`}>
            {formatCurrency(profit)}
          </span>
          <span className={styles.centerLabel}>רווח</span>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.statColumn}>
          <span className={styles.statLabel}>רווח</span>
          <span className={`${styles.statValue} ${zeroData ? styles.colorMuted : styles.colorProfit}`}>
            {formatCurrency(profit)}
          </span>
        </div>
        <div className={styles.statColumn}>
          <span className={styles.statLabel}>הוצאות</span>
          <span className={`${styles.statValue} ${zeroData ? styles.colorMuted : styles.colorSpending}`}>
            {formatCurrency(spending)}
          </span>
        </div>
        <div className={styles.statColumn}>
          <span className={styles.statLabel}>הכנסות</span>
          <span className={`${styles.statValue} ${zeroData ? styles.colorMuted : styles.colorIncome}`}>
            {formatCurrency(revenue)}
          </span>
        </div>
      </div>
    </div>
  );
}
