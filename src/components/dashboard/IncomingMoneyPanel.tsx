'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchIncomingMoney,
  refreshIncomingTerminal,
  type IncomingMoney,
  type IncomingTerminal,
} from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from './format';
import {
  PAYOUT_CHOICES,
  formatFetchedAt,
  formatPayoutDay,
  israelToday,
  shiftMonth,
  type PayoutChoice,
} from './incomingMoney';
import theme from './theme/dashboard.module.css';
import styles from './IncomingMoney.module.css';

interface Props {
  /** The finance tab's branch select: 'all' or a branch id. */
  branchId: string;
  scopeLabel: string;
}

/**
 * The full "כסף שעומד להיכנס" area of the finance tab: which transfer, how
 * much, where it came from (by source, by branch), and — for a manager looking
 * at the whole company — the same month as Tranzila's own report has it.
 *
 * Two figures side by side, never merged: ours (the system's records, the one
 * a branch narrows) and Tranzila's (read on demand, per terminal). The gap
 * between them is shown, not hidden.
 */
export default function IncomingMoneyPanel({ branchId, scopeLabel }: Props) {
  const [choice, setChoice] = useState<PayoutChoice>(0);

  // The upcoming transfer is the server's to name; the other two are the
  // months on either side of it.
  const upcoming = useQuery({
    queryKey: ['dashboard-incoming', { branch_id: branchId }],
    queryFn: () => fetchIncomingMoney({ branch_id: branchId }),
  });
  const upcomingMonth = upcoming.data?.month ?? '';
  const otherMonth = choice !== 0 && upcomingMonth ? shiftMonth(upcomingMonth, choice) : '';
  const other = useQuery({
    queryKey: ['dashboard-incoming', { branch_id: branchId, month: otherMonth }],
    queryFn: () => fetchIncomingMoney({ branch_id: branchId, month: otherMonth }),
    enabled: Boolean(otherMonth),
  });

  const current = choice === 0 ? upcoming : other;
  const data = current.data;

  return (
    <div className={`${theme.card} ${theme.mt}`}>
      <h2 className={theme.cardTitle}>כסף שעומד להיכנס</h2>
      <p className={theme.cardSub}>
        חברת האשראי מעבירה ב־6 לכל חודש את מה שנגבה בחודש הקודם · {scopeLabel}
      </p>

      <div className={styles.choices} role="group" aria-label="איזו העברה">
        {PAYOUT_CHOICES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.choice} ${choice === option.value ? styles.choiceOn : ''}`}
            aria-pressed={choice === option.value}
            onClick={() => setChoice(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {upcoming.isLoading || (choice !== 0 && other.isLoading) ? (
        <Skeleton className="h-24" />
      ) : !data ? (
        <div className={theme.kpiFoot}>אין נתונים</div>
      ) : (
        <IncomingBody key={`${data.month}-${branchId}`} data={data} onRefreshed={() => current.refetch()} />
      )}
    </div>
  );
}

function IncomingBody({ data, onRefreshed }: { data: IncomingMoney; onRefreshed: () => Promise<unknown> }) {
  const notStarted = data.period.start > israelToday();
  const sources = data.ours.by_source.filter((row) => row.charges !== 0 || row.refunds !== 0);
  const branches = data.ours.by_branch;
  const noBranch = data.ours.no_branch;
  const showNoBranch = Boolean(noBranch && (noBranch.charges !== 0 || noBranch.refunds !== 0));

  return (
    <>
      <div className={theme.counts} style={{ marginTop: 0, boxShadow: 'none', padding: 0 }}>
        <div>
          <b>
            {formatCurrency(data.ours.total)}
            {data.is_closed ? null : <span className={styles.soFar}>עד עכשיו</span>}
          </b>
          <span>
            ייכנס ב־{formatPayoutDay(data.payout_date)} · גבייה באשראי של {data.period.label} · לפני עמלות
          </span>
        </div>
        <div>
          <b>{formatCurrency(data.ours.charges)}</b>
          <span>חיובים</span>
        </div>
        <div>
          <b>{formatCurrency(data.ours.refunds)}</b>
          <span>זיכויים</span>
        </div>
      </div>

      {notStarted ? (
        <div className={theme.note}>החודש הזה עוד לא התחיל — אין עדיין מה להציג.</div>
      ) : (
        <>
          <h3 className={styles.subTitle}>לפי מקור</h3>
          {sources.length === 0 ? (
            <div className={theme.kpiFoot}>לא נרשמה גבייה באשראי בחודש הזה</div>
          ) : (
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>מקור</th>
                    <th className={theme.n}>תשלומים</th>
                    <th className={theme.n}>חיובים</th>
                    <th className={theme.n}>זיכויים</th>
                    <th className={theme.n}>נטו</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((row) => (
                    <tr key={row.key}>
                      <td className={theme.name}>
                        {row.label}
                        {row.note ? <span className={styles.rowNote}>{row.note}</span> : null}
                      </td>
                      <td className={theme.n}>{row.count}</td>
                      <td className={theme.n}>{formatCurrency(row.charges)}</td>
                      <td className={theme.n}>{formatCurrency(row.refunds)}</td>
                      <td className={theme.n}>{formatCurrency(row.net)}</td>
                    </tr>
                  ))}
                  <tr className={theme.tfootRow}>
                    <td>סה״כ</td>
                    <td className={theme.n} />
                    <td className={theme.n}>{formatCurrency(data.ours.charges)}</td>
                    <td className={theme.n}>{formatCurrency(data.ours.refunds)}</td>
                    <td className={theme.n}>{formatCurrency(data.ours.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <h3 className={styles.subTitle}>לפי סניף</h3>
          {branches.length === 0 && !showNoBranch ? (
            <div className={theme.kpiFoot}>לא נרשמה גבייה באשראי בחודש הזה</div>
          ) : (
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>סניף</th>
                    <th className={theme.n}>חיובים</th>
                    <th className={theme.n}>זיכויים</th>
                    <th className={theme.n}>נטו</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((row) => (
                    <tr key={row.branch_id}>
                      <td className={theme.name}>{row.branch_name}</td>
                      <td className={theme.n}>{formatCurrency(row.charges)}</td>
                      <td className={theme.n}>{formatCurrency(row.refunds)}</td>
                      <td className={theme.n}>{formatCurrency(row.net)}</td>
                    </tr>
                  ))}
                  {showNoBranch && noBranch ? (
                    <tr>
                      <td className={theme.name}>
                        ללא סניף
                        <span className={styles.rowNote}>
                          כסף שאינו שייך לסניף: משלוחי האתר, האתר של מיכל קגן, תשלום בלי שיוך
                        </span>
                      </td>
                      <td className={theme.n}>{formatCurrency(noBranch.charges)}</td>
                      <td className={theme.n}>{formatCurrency(noBranch.refunds)}</td>
                      <td className={theme.n}>{formatCurrency(noBranch.net)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {data.tranzila ? <TranzilaCheck data={data} onRefreshed={onRefreshed} /> : null}
        </>
      )}
    </>
  );
}

type RowState = { busy?: boolean; failed?: string; fresh?: IncomingTerminal };

/** Managers, whole company only: each terminal's month as Tranzila's report has it. */
function TranzilaCheck({ data, onRefreshed }: { data: IncomingMoney; onRefreshed: () => Promise<unknown> }) {
  const tranzila = data.tranzila!;
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);

  // One terminal after the other: each is several report pages, and a slow
  // one must not hide what the others already answered.
  const refreshAll = async () => {
    setRunning(true);
    setRows({});
    for (const terminal of tranzila.terminals) {
      setRows((prev) => ({ ...prev, [terminal.terminal]: { busy: true } }));
      try {
        const fresh = await refreshIncomingTerminal({ month: data.month, terminal: terminal.terminal });
        setRows((prev) => ({ ...prev, [terminal.terminal]: { fresh } }));
      } catch (err: any) {
        const reason =
          err?.response?.data?.error ||
          (err?.response?.status === 429 ? 'יותר מדי בקשות — נסו שוב בעוד דקה' : 'אין תשובה מהשרת');
        setRows((prev) => ({ ...prev, [terminal.terminal]: { failed: String(reason) } }));
      }
    }
    // The totals and the gap are the server's to work out from what was read.
    try {
      await onRefreshed();
    } finally {
      setRunning(false);
    }
  };

  const anyRead = tranzila.terminals.some((t) => t.fetched_at);

  return (
    <>
      <div className={styles.verifyHead}>
        <h3 className={styles.subTitle}>אימות מול טרנזילה</h3>
        <button type="button" className={styles.refresh} onClick={refreshAll} disabled={running}>
          {running ? 'קורא מטרנזילה…' : 'עדכן מטרנזילה'}
        </button>
      </div>
      {tranzila.terminals.length === 0 ? (
        <div className={theme.kpiFoot}>לא מוגדרים מסופים במערכת</div>
      ) : (
        <div className={theme.tableScroll}>
          <table className={theme.table}>
            <thead>
              <tr>
                <th>מסוף</th>
                <th className={theme.n}>חיובים</th>
                <th className={theme.n}>זיכויים</th>
                <th className={theme.n}>נטו</th>
                <th className={theme.n}>עסקאות</th>
                <th>עודכן</th>
              </tr>
            </thead>
            <tbody>
              {tranzila.terminals.map((stored) => {
                const state = rows[stored.terminal] ?? {};
                const row = state.fresh ?? stored;
                const read = Boolean(row.fetched_at);
                const money = (value: number | null) => (read && value != null ? formatCurrency(value) : '—');
                return (
                  <tr key={stored.terminal}>
                    <td className={theme.name}>
                      <span dir="ltr">{row.terminal}</span>
                      <span className={styles.rowNote}>{row.label}</span>
                      {row.error ? <span className={`${styles.rowNote} ${styles.rowError}`}>{row.error}</span> : null}
                      {state.failed ? (
                        <span className={`${styles.rowNote} ${styles.rowError}`}>העדכון נכשל: {state.failed}</span>
                      ) : null}
                    </td>
                    <td className={theme.n}>{money(row.charges)}</td>
                    <td className={theme.n}>{money(row.refunds)}</td>
                    <td className={theme.n}>{money(row.net)}</td>
                    <td className={theme.n}>{read && row.count != null ? row.count : '—'}</td>
                    <td>
                      {state.busy ? (
                        <span className={`${theme.tag} ${theme.tagType}`}>קורא…</span>
                      ) : !read ? (
                        <span className={`${theme.tag} ${theme.tagOff}`}>עוד לא נקרא</span>
                      ) : (
                        <>
                          עודכן ב־{formatFetchedAt(row.fetched_at)}
                          {row.complete ? null : (
                            <>
                              {' '}
                              <span className={`${theme.tag} ${theme.tagLow}`}>לא נקרא במלואו</span>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.summary}>
        {tranzila.complete && tranzila.gap != null ? (
          <>
            בטרנזילה {formatCurrency(tranzila.total)} · אצלנו {formatCurrency(data.ours.total)} · פער{' '}
            {formatCurrency(tranzila.gap)}
          </>
        ) : anyRead ? (
          <>
            בטרנזילה {formatCurrency(tranzila.total)} (לא סופי) · אצלנו {formatCurrency(data.ours.total)}
            <small>הפער יוצג אחרי שכל המסופים ייקראו במלואם.</small>
          </>
        ) : (
          <>
            אצלנו {formatCurrency(data.ours.total)}
            <small>הדוח של טרנזילה עוד לא נקרא לחודש הזה. ״עדכן מטרנזילה״ קורא אותו, מסוף אחרי מסוף.</small>
          </>
        )}
        {tranzila.installments_total > 0 ? (
          <small>מתוכם בתשלומים {formatCurrency(tranzila.installments_total)} — נכנסים בפריסה.</small>
        ) : null}
        {data.is_closed ? null : <small>החודש עוד פתוח: שני המספרים נכונים לרגע שבו נקראו.</small>}
      </div>
    </>
  );
}
