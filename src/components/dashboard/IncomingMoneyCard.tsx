'use client';

import type { IncomingMoney } from '@/lib/api';
import { formatCurrency } from './format';
import { formatPayoutDay } from './incomingMoney';
import theme from './theme/dashboard.module.css';
import styles from './IncomingMoney.module.css';

interface Props {
  data?: IncomingMoney;
  loading: boolean;
}

/**
 * "כסף שעומד להיכנס" — what the card company transfers on the 6th: the card
 * money the system recorded for the month before it, before clearing fees.
 *
 * The date, the month and whether the figure is final all come from the
 * server; nothing here works the rule out again. With no answer (an older
 * server, a failed read) it says so instead of showing a zero that would read
 * as "nothing is coming".
 */
export default function IncomingMoneyCard({ data, loading }: Props) {
  if (loading) {
    return (
      <div className={`${theme.kpi} ${styles.wide}`}>
        <div className={styles.wideMain}>
          <div className={theme.kpiLbl}>כסף שעומד להיכנס</div>
          <div className={theme.kpiFoot}>טוען…</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={`${theme.kpi} ${styles.wide}`}>
        <div className={styles.wideMain}>
          <div className={theme.kpiLbl}>כסף שעומד להיכנס</div>
          <div className={theme.kpiFoot}>אין נתונים</div>
        </div>
      </div>
    );
  }

  const next = data.next;

  return (
    <div className={`${theme.kpi} ${styles.wide}`}>
      <div className={styles.wideMain}>
        <div className={theme.kpiLbl}>כסף שעומד להיכנס</div>
        <div className={theme.kpiVal}>
          ב־{formatPayoutDay(data.payout_date)} — {formatCurrency(data.ours.total)}
          {data.is_closed ? null : <span className={styles.soFar}>עד עכשיו</span>}
        </div>
        <div className={theme.kpiFoot}>גבייה באשראי של {data.period.label} · לפני עמלות</div>
      </div>
      {next ? (
        <div className={styles.wideNext}>
          ובהעברה שאחריה ({formatPayoutDay(next.payout_date)}): <b>{formatCurrency(next.total)}</b>
          {next.is_closed ? '' : ' עד עכשיו'}
        </div>
      ) : null}
    </div>
  );
}
