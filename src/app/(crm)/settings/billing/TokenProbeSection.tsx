'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import styles from './TerminalMap.module.css';

/**
 * The 1 ₪ saved-card test, as buttons (POST /core/tranzila/token-probe/).
 *
 * 1. Open Tranzila's page on the hosted terminal in card-check mode: the card
 *    is checked and saved, nothing is charged.
 * 2. List today's card checks from the terminal's report.
 * 3. Charge 1 ₪ from one of them on a terminal of the pair — once; the server
 *    refuses a second try on the same check and terminal.
 * 4. Refund that 1 ₪ — once.
 * The manager presses every money button; each asks first. Nothing here shows
 * the card, the token or its expiry.
 */

type CheckRow = {
  index: string;
  tranmode: string;
  txn_type: string;
  approved: boolean;
  amount: string | null;
  made_at: string | null;
  has_token: boolean;
  has_expiry: boolean;
};

type Outcome = { tone: 'ok' | 'bad' | 'warn'; text: string };

const TERMINALS = ['cogolivetok', 'cogolive'];

function errorText(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

function timeOf(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function TokenProbeSection() {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [terminal, setTerminal] = useState(TERMINALS[0]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  async function openPage() {
    setBusy('page');
    setNote('');
    // Opened before the request so the browser does not block it as a pop-up.
    const tab = window.open('', '_blank');
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'page', tranmode: 'NK' });
      if (tab) tab.location.href = res.data.url;
      else window.location.href = res.data.url;
      setNote(`עמוד טרנזילה נפתח בלשונית חדשה (מסוף ${res.data.terminal}). הקלידו שם את הכרטיס — לא יורד כסף. אחר כך חזרו לכאן ולחצו "הצג בדיקות מהיום".`);
    } catch (e) {
      tab?.close();
      setNote(errorText(e, 'העמוד לא נפתח'));
    } finally {
      setBusy('');
    }
  }

  async function findRows() {
    setBusy('find');
    setNote('');
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'find' });
      if (!res.data.reachable) {
        setNote(`טרנזילה לא ענתה: ${res.data.error || ''}`);
        setRows(null);
      } else {
        setRows(res.data.rows || []);
      }
    } catch (e) {
      setNote(errorText(e, 'הבדיקה נכשלה'));
    } finally {
      setBusy('');
    }
  }

  async function charge(index: string) {
    if (!window.confirm(`לחייב 1 ₪ מהכרטיס של בדיקה ${index}, במסוף ${terminal}?\nזה חיוב אמיתי.`)) return;
    const key = `charge-${index}-${terminal}`;
    setBusy(key);
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'charge', index, terminal });
      const d = res.data;
      const outcome: Outcome =
        d.outcome === 'charged'
          ? { tone: 'ok', text: `החיוב עבר במסוף ${d.terminal}. מספר עסקה ${d.transaction_id || '—'}.` }
          : d.outcome === 'uncertain'
            ? { tone: 'warn', text: 'לא התקבלה תשובה מטרנזילה. לא לנסות שוב — לבדוק בדוח של המסוף.' }
            : { tone: 'bad', text: `החיוב נדחה, לא ירד כסף. ${d.message || ''}${d.response_code ? ` (קוד ${d.response_code})` : ''}` };
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: outcome }));
    } catch (e) {
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: { tone: 'warn', text: errorText(e, 'הבקשה נכשלה') } }));
    } finally {
      setBusy('');
    }
  }

  async function refund(index: string) {
    if (!window.confirm(`לזכות את ה־1 ₪ של בדיקה ${index}, במסוף ${terminal}?`)) return;
    const key = `refund-${index}-${terminal}`;
    setBusy(key);
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'refund', index, terminal });
      const d = res.data;
      const outcome: Outcome = d.refunded
        ? { tone: 'ok', text: `הזיכוי עבר. מספר עסקה ${d.transaction_id || '—'}.` }
        : d.uncertain
          ? { tone: 'warn', text: 'לא התקבלה תשובה על הזיכוי. לא לנסות שוב — לבדוק בדוח של המסוף.' }
          : { tone: 'bad', text: `הזיכוי נדחה. ${d.message || ''}${d.response_code ? ` (קוד ${d.response_code})` : ''}` };
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: outcome }));
    } catch (e) {
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: { tone: 'warn', text: errorText(e, 'הבקשה נכשלה') } }));
    } finally {
      setBusy('');
    }
  }

  const badge = { ok: styles.badgeOk, bad: styles.badgeBad, warn: styles.badgeWarn };

  return (
    <section className={theme.scope} aria-labelledby="token-probe-heading">
      <div className={theme.card}>
        <h2 id="token-probe-heading" className={theme.cardTitle}>
          בדיקת כרטיס שמור (1 ₪)
        </h2>
        <p className={theme.cardSub}>
          בודק שכרטיס שנשמר בעמוד טרנזילה אפשר לחייב אחר כך מהשרת — כמו חיוב חודשי. כל חיוב וזיכוי כאן אמיתי, פעם אחת
          בלבד לכל בדיקה, ורק אחרי אישור.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
          <button type="button" className={styles.verifyBtn} onClick={openPage} disabled={Boolean(busy)}>
            {busy === 'page' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            1. פתח עמוד בדיקה
          </button>
          <button type="button" className={styles.verifyBtn} onClick={findRows} disabled={Boolean(busy)}>
            {busy === 'find' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            2. הצג בדיקות מהיום
          </button>
          <label className={theme.kpiFoot} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            מסוף לחיוב
            <select
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              dir="ltr"
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: '6px 8px' }}
            >
              {TERMINALS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        {note && (
          <p className={theme.note} style={{ marginTop: 12 }} role="status">
            {note}
          </p>
        )}

        {rows && rows.length === 0 && (
          <p className={theme.note} style={{ marginTop: 12 }}>
            אין היום בדיקות כרטיס בדוח של המסוף.
          </p>
        )}

        {rows && rows.length > 0 && (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr className={theme.kpiFoot}>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>בדיקה</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>שעה</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>מצב</th>
                <th style={{ padding: '6px 4px' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const usable = row.approved && row.has_token && row.has_expiry;
                const outcome = outcomes[`${row.index}-${terminal}`];
                return (
                  <tr key={row.index} style={{ borderTop: '1px solid #eee', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 4px' }} dir="ltr">{row.index}</td>
                    <td style={{ padding: '8px 4px' }}>{timeOf(row.made_at)}</td>
                    <td style={{ padding: '8px 4px' }}>
                      {usable ? 'אושרה, הכרטיס נשמר' : row.approved ? 'אושרה, בלי כרטיס שמור' : 'לא אושרה'}
                    </td>
                    <td style={{ padding: '8px 4px' }}>
                      {usable && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className={styles.verifyBtn}
                            onClick={() => charge(row.index)}
                            disabled={Boolean(busy)}
                          >
                            {busy === `charge-${row.index}-${terminal}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            3. חייב 1 ₪
                          </button>
                          <button
                            type="button"
                            className={styles.verifyBtn}
                            onClick={() => refund(row.index)}
                            disabled={Boolean(busy)}
                          >
                            {busy === `refund-${row.index}-${terminal}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            4. זכה 1 ₪
                          </button>
                        </div>
                      )}
                      {outcome && (
                        <p className={`${styles.badge} ${badge[outcome.tone]}`} style={{ marginTop: 8 }} role="alert">
                          {outcome.text}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
