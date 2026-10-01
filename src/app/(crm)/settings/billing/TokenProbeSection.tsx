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
 * The manager presses every money button; each asks first, on the page itself
 * (a browser dialog does not open inside the desktop app's pane). Nothing here shows
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

type Outcome = { step: 'charge' | 'refund'; tone: 'ok' | 'bad' | 'warn'; text: string };

const TERMINALS = ['cogolivetok', 'cogolive'];

function errorText(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

// Tranzila's message often names its code already ("… (קוד 006)").
function withCode(message: string | undefined, code: string | undefined): string {
  const text = message || '';
  return code && !text.includes(code) ? `${text} (קוד ${code})` : text;
}

function timeOf(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function TokenProbeSection() {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [terminal, setTerminal] = useState(TERMINALS[0]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [asking, setAsking] = useState<{ step: 'charge' | 'refund'; index: string } | null>(null);

  async function openPage() {
    setBusy('page');
    setNote('');
    setPageUrl('');
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'page', tranmode: 'NK' });
      // A link the manager presses: a tab opened after the request is blocked as a pop-up.
      setPageUrl(res.data.url);
      setNote(`העמוד מוכן (מסוף ${res.data.terminal}). פתחו אותו, הקלידו את הכרטיס — לא יורד כסף — ואחר כך חזרו לכאן ולחצו "הצג בדיקות מהיום".`);
    } catch (e) {
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
    setAsking(null);
    const key = `charge-${index}-${terminal}`;
    setBusy(key);
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'charge', index, terminal });
      const d = res.data;
      const outcome: Outcome =
        d.outcome === 'charged'
          ? { step: 'charge', tone: 'ok', text: `החיוב עבר במסוף ${d.terminal}. מספר עסקה ${d.transaction_id || '—'}.` }
          : d.outcome === 'uncertain'
            ? { step: 'charge', tone: 'warn', text: 'לא התקבלה תשובה מטרנזילה. לא לנסות שוב — לבדוק בדוח של המסוף.' }
            : { step: 'charge', tone: 'bad', text: `החיוב נדחה, לא ירד כסף. ${withCode(d.message, d.response_code)}` };
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: outcome }));
    } catch (e) {
      // e.g. "already tried": the server keeps the first result and charges nothing.
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: { step: 'charge', tone: 'warn', text: errorText(e, 'הבקשה נכשלה') } }));
    } finally {
      setBusy('');
    }
  }

  async function refund(index: string) {
    setAsking(null);
    const key = `refund-${index}-${terminal}`;
    setBusy(key);
    try {
      const res = await api.post('/core/tranzila/token-probe/', { step: 'refund', index, terminal });
      const d = res.data;
      const outcome: Outcome = d.refunded
        ? { step: 'refund', tone: 'ok', text: `הזיכוי עבר. מספר עסקה ${d.transaction_id || '—'}.` }
        : d.uncertain
          ? { step: 'refund', tone: 'warn', text: 'לא התקבלה תשובה על הזיכוי. לא לנסות שוב — לבדוק בדוח של המסוף.' }
          : { step: 'refund', tone: 'bad', text: `הזיכוי נדחה. ${withCode(d.message, d.response_code)}` };
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: outcome }));
    } catch (e) {
      setOutcomes((o) => ({ ...o, [`${index}-${terminal}`]: { step: 'refund', tone: 'warn', text: errorText(e, 'הבקשה נכשלה') } }));
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
        {pageUrl && (
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.verifyBtn}
            style={{ display: 'inline-flex', marginTop: 8, textDecoration: 'none' }}
            onClick={() => setPageUrl('')}
          >
            פתחו את עמוד טרנזילה בלשונית חדשה
          </a>
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
                // One charge per check: once answered here, the button rests (the server refuses a second anyway).
                const chargeDone = Boolean(outcome && (outcome.step === 'refund' || outcome.tone !== 'warn'));
                const refundDone = Boolean(outcome && outcome.step === 'refund' && outcome.tone !== 'bad');
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
                            onClick={() => setAsking({ step: 'charge', index: row.index })}
                            disabled={Boolean(busy) || chargeDone}
                          >
                            {busy === `charge-${row.index}-${terminal}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            3. חייב 1 ₪
                          </button>
                          <button
                            type="button"
                            className={styles.verifyBtn}
                            onClick={() => setAsking({ step: 'refund', index: row.index })}
                            disabled={Boolean(busy) || refundDone}
                          >
                            {busy === `refund-${row.index}-${terminal}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : null}
                            4. זכה 1 ₪
                          </button>
                        </div>
                      )}
                      {asking?.index === row.index && (
                        <div
                          role="alertdialog"
                          aria-label="אישור"
                          style={{ marginTop: 8, padding: 10, border: '1px solid #f0c36d', borderRadius: 10, background: '#fff8e6' }}
                        >
                          <p style={{ margin: 0, fontWeight: 700 }}>
                            {asking.step === 'charge'
                              ? `לחייב 1 ₪ מהכרטיס של בדיקה ${row.index}, במסוף ${terminal}? זה חיוב אמיתי.`
                              : `לזכות את ה־1 ₪ של בדיקה ${row.index}, במסוף ${terminal}?`}
                          </p>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              type="button"
                              className={styles.verifyBtn}
                              onClick={() => (asking.step === 'charge' ? charge(row.index) : refund(row.index))}
                            >
                              {asking.step === 'charge' ? 'כן, לחייב 1 ₪' : 'כן, לזכות'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAsking(null)}
                              style={{ border: '1px solid #ccc', borderRadius: 8, padding: '6px 14px', background: '#fff' }}
                            >
                              ביטול
                            </button>
                          </div>
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
