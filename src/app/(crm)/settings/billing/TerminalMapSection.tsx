'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import theme from '@/components/dashboard/theme/dashboard.module.css';

/**
 * Which Tranzila terminal each money flow runs through.
 *
 * Five terminal settings accumulated over the years and nothing ever said
 * which was which, so the only way to answer "what is this terminal for" was
 * to read the code. The server answers it now; this shows the answer.
 *
 * Terminal names only — the endpoint never returns a key.
 */

type Flow = {
  id: string;
  title: string;
  detail: string;
  setting: string;
  method: string;
  code: string;
  terminal: string;
  configured: boolean;
};

type SettingRow = {
  setting: string;
  terminal: string;
  configured: boolean;
  note: string;
  used_by: string[];
  in_use: boolean;
};

type TerminalRow = {
  terminal: string;
  settings: string[];
  flows: string[];
};

type TerminalMap = {
  environment: string;
  flows: Flow[];
  settings: SettingRow[];
  terminals: TerminalRow[];
  unused_settings: string[];
  flows_without_a_terminal: string[];
};

export default function TerminalMapSection() {
  const [data, setData] = useState<TerminalMap | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/core/tranzila/terminals/')
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('לא ניתן לטעון את מיפוי המסופים');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={`${theme.scope} ${theme.card}`}>
        <p className={theme.kpiFoot}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`${theme.scope} ${theme.card}`}>
        <p className={theme.kpiFoot}>
          <Loader2 className="h-4 w-4 animate-spin inline-block align-[-3px] ml-1" aria-hidden="true" />
          טוען מיפוי מסופים…
        </p>
      </div>
    );
  }

  return (
    <section className={theme.scope} aria-labelledby="terminal-map-heading">
      <div className={theme.card}>
        <h2 id="terminal-map-heading" className={theme.cardTitle}>
          מיפוי מסופים — מה רץ דרך מה
        </h2>
        <p className={theme.cardSub}>
          כל מסלול כסף במערכת והמסוף שסולק אותו בפועל. שמות מסופים בלבד — מפתחות לא נחשפים כאן.
        </p>

        {/* ---- one card per physical terminal ---- */}
        {data.terminals.length === 0 ? (
          <p className={theme.note}>לא הוגדר אף מסוף.</p>
        ) : (
          <div className={`${theme.grid} ${theme.g2}`}>
            {data.terminals.map((row) => (
              <div key={row.terminal} className={theme.kpi}>
                <div className={theme.kpiLbl}>מסוף</div>
                <div className={`${theme.kpiVal} ${theme.kpiValS}`} style={{ direction: 'ltr', textAlign: 'right' }}>
                  {row.terminal}
                </div>
                <div style={{ marginTop: 8 }}>
                  {row.flows.map((flow) => (
                    <div key={flow} className={theme.kpiFoot} style={{ lineHeight: 1.7 }}>
                      · {flow}
                    </div>
                  ))}
                </div>
                <div className={theme.note} style={{ marginTop: 8 }}>
                  {row.settings.length > 1
                    ? `${row.settings.length} הגדרות מצביעות על המסוף הזה — זה מסוף אחד, לא כמה.`
                    : row.settings[0]}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- what is missing ---- */}
        {data.flows_without_a_terminal.length > 0 && (
          <div
            className={theme.note}
            style={{
              marginTop: 14,
              background: '#fff6f6',
              border: '1px solid #f8d7d8',
              borderRadius: 12,
              padding: '11px 13px',
              color: '#a92f34',
              fontWeight: 700,
            }}
          >
            <AlertTriangle className="h-4 w-4 inline-block align-[-3px] ml-1" aria-hidden="true" />
            אין מסוף מוגדר ל: {data.flows_without_a_terminal.join(' · ')}
          </div>
        )}
      </div>

      {/* ---- flow by flow ---- */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h3 className={theme.cardTitle}>מסלול אחרי מסלול</h3>
        <p className={theme.cardSub}>מה קורה, איפה זה נסלק, ואיזו הגדרה קובעת</p>
        <div className={theme.tableScroll}>
          <table className={theme.table}>
            <thead>
              <tr>
                <th>מסלול</th>
                <th>מסוף</th>
                <th>הגדרה</th>
                <th>מצב</th>
              </tr>
            </thead>
            <tbody>
              {data.flows.map((flow) => (
                <tr key={flow.id}>
                  <td>
                    <div className={theme.name}>{flow.title}</div>
                    <div className={theme.kpiFoot} style={{ fontWeight: 600, marginTop: 3 }}>
                      {flow.detail}
                    </div>
                  </td>
                  <td style={{ direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {flow.terminal || '—'}
                  </td>
                  <td style={{ direction: 'ltr', textAlign: 'right', fontSize: 11, color: 'var(--kg-muted)' }}>
                    {flow.setting}
                  </td>
                  <td>
                    <span className={`${theme.tag} ${flow.configured ? theme.tagOk : theme.tagLow}`}>
                      {flow.configured ? 'מוגדר' : 'חסר'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- every setting, including the ones nothing reads ---- */}
      <div className={`${theme.card} ${theme.mt}`}>
        <h3 className={theme.cardTitle}>כל הגדרות המסופים</h3>
        <p className={theme.cardSub}>כולל הגדרות שאף מסלול לא קורא — אלה מיותרות</p>
        <div className={theme.tableScroll}>
          <table className={theme.table}>
            <thead>
              <tr>
                <th>הגדרה</th>
                <th>ערך</th>
                <th>משמש ל</th>
                <th>מצב</th>
              </tr>
            </thead>
            <tbody>
              {data.settings.map((row) => (
                <tr key={row.setting}>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>
                    <div className={theme.name} style={{ fontSize: 12 }}>{row.setting}</div>
                    <div
                      className={theme.kpiFoot}
                      style={{ fontWeight: 600, marginTop: 3, direction: 'rtl', textAlign: 'right' }}
                    >
                      {row.note}
                    </div>
                  </td>
                  <td style={{ direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.terminal || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--kg-ink2)' }}>
                    {row.used_by.length > 0 ? row.used_by.join(', ') : '—'}
                  </td>
                  <td>
                    {!row.in_use ? (
                      <span className={`${theme.tag} ${theme.tagOff}`}>לא בשימוש</span>
                    ) : (
                      <span className={`${theme.tag} ${row.configured ? theme.tagOk : theme.tagLow}`}>
                        {row.configured ? 'פעיל' : 'חסר'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.unused_settings.length === 0 && (
          <p className={theme.note}>
            <CheckCircle2 className="h-4 w-4 inline-block align-[-3px] ml-1" aria-hidden="true" />
            כל ההגדרות בשימוש.
          </p>
        )}
      </div>
    </section>
  );
}
