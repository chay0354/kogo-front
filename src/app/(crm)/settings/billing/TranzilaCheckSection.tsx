'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import styles from './TerminalMap.module.css';

/**
 * One transaction as Tranzila's own report has it, beside what we recorded.
 *
 * The server asks the terminal's report with the keys it holds, so nobody
 * logs in to Tranzila to answer "did this payment really happen, for this
 * sum, with this approval number, after this order?". Read only; the answer
 * carries no card, token or expiry.
 */

type Comparison = { check: string; label: string; ok: boolean; tranzila: string | null; ours: string };

type CheckResult = {
  terminal: string;
  index: string;
  tranzila:
    | { reachable: false; error: string }
    | { reachable: true; found: false }
    | {
        reachable: true;
        found: true;
        amount: string | null;
        approved: boolean;
        is_charge: boolean;
        made_at: string | null;
        tranmode: string;
        authorization_number: string;
      };
  ours: { kind: string; reference: string; amount: string; status: string; approval_number: string; created_at: string } | null;
  comparison: Comparison[];
};

export default function TranzilaCheckSection() {
  const [invoice, setInvoice] = useState('');
  const [terminal, setTerminal] = useState('cogolive');
  const [index, setIndex] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);

  async function check() {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const params = invoice.trim() ? { invoice: invoice.trim() } : { terminal: terminal.trim(), index: index.trim() };
      const res = await api.get('/core/tranzila/transaction-check/', { params });
      setResult(res.data);
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setErr(message || 'הבדיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  const canCheck = Boolean(invoice.trim() || (terminal.trim() && index.trim()));
  const allOk = result?.comparison.length ? result.comparison.every((c) => c.ok) : null;

  return (
    <section className={theme.scope} aria-labelledby="tranzila-check-heading">
      <div className={theme.card}>
        <h2 id="tranzila-check-heading" className={theme.cardTitle}>
          בדיקת עסקה מול טרנזילה
        </h2>
        <p className={theme.cardSub}>
          מה טרנזילה אומרת על העסקה, ליד מה שרשום אצלנו. קריאה בלבד — בלי פרטי כרטיס, ובלי כניסה לטרנזילה.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 10 }}>
          <label className={theme.kpiFoot} style={{ display: 'grid', gap: 4 }}>
            מספר חשבונית חנות
            <input
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="ST-2026-000021"
              dir="ltr"
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '7px 10px', minWidth: 170 }}
            />
          </label>
          <span className={theme.kpiFoot}>או</span>
          <label className={theme.kpiFoot} style={{ display: 'grid', gap: 4 }}>
            מסוף
            <input
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              dir="ltr"
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '7px 10px', width: 150 }}
            />
          </label>
          <label className={theme.kpiFoot} style={{ display: 'grid', gap: 4 }}>
            מספר עסקה
            <input
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '7px 10px', width: 120 }}
            />
          </label>
          <button type="button" className={styles.verifyBtn} onClick={check} disabled={!canCheck || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            בדוק מול טרנזילה
          </button>
        </div>

        {err && (
          <p className={theme.note} style={{ color: '#c93b40', fontWeight: 700, marginTop: 12 }} role="alert">
            {err}
          </p>
        )}

        {result && (
          <div style={{ marginTop: 14 }}>
            <p className={theme.kpiFoot}>
              מסוף <b dir="ltr">{result.terminal}</b> · עסקה <b dir="ltr">{result.index}</b>
              {result.ours ? (
                <>
                  {' '}
                  · אצלנו: <b dir="ltr">{result.ours.reference}</b> ({result.ours.status})
                </>
              ) : (
                ' · לא נמצאה אצלנו הזמנה עם המספר הזה'
              )}
            </p>

            {!result.tranzila.reachable && (
              <p className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginTop: 8 }}>
                טרנזילה לא ענתה: {result.tranzila.error}
              </p>
            )}
            {result.tranzila.reachable && !result.tranzila.found && (
              <p className={`${styles.badge} ${styles.badgeBad}`} style={{ marginTop: 8 }}>
                העסקה לא נמצאה בדוח של המסוף
              </p>
            )}

            {allOk !== null && (
              <p className={`${styles.badge} ${allOk ? styles.badgeOk : styles.badgeBad}`} style={{ marginTop: 8 }}>
                {allOk ? 'הכול תואם' : 'יש אי־התאמה'}
              </p>
            )}

            {result.comparison.length > 0 && (
              <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr className={theme.kpiFoot}>
                    <th style={{ textAlign: 'right', padding: '6px 4px' }}>בדיקה</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px' }}>בטרנזילה</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px' }}>אצלנו</th>
                    <th style={{ padding: '6px 4px' }} />
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.map((c) => (
                    <tr key={c.check} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '6px 4px' }}>{c.label}</td>
                      <td style={{ padding: '6px 4px' }} dir="ltr">{c.tranzila || '—'}</td>
                      <td style={{ padding: '6px 4px' }} dir="ltr">{c.ours || '—'}</td>
                      <td style={{ padding: '6px 4px' }}>
                        {c.ok ? (
                          <CheckCircle2 className="h-4 w-4" style={{ color: '#0b8a4c' }} aria-label="תואם" />
                        ) : (
                          <XCircle className="h-4 w-4" style={{ color: '#c93b40' }} aria-label="לא תואם" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
