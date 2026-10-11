'use client';

import { useId, useState, type ReactNode } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import { agoText, formatDateTime } from '@/lib/wahub/format';
import {
  connectionMissing,
  sendingState,
  systemStatusRows,
  type StatusLevel,
  type SystemStatusKey,
  type SystemStatusRow,
} from '@/lib/wahub/systemStatus';
import type { WahubStatus } from '@/types/wahub';
import { useNow } from '../hooks/useNow';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

const LEVEL_PILL: Record<StatusLevel, string> = {
  ok: s.pGood,
  warn: s.pWarn,
  off: s.pBad,
  unknown: s.pMute,
};

const B = ({ children }: { children: ReactNode }) => <strong className="font-extrabold">{children}</strong>;

function Line({ children }: { children: ReactNode }) {
  return <li className="text-[13.5px] leading-relaxed">{children}</li>;
}

/** What stands behind a row's word, in a few short lines — the point of each in bold. */
function Details({ row, status, now }: { row: SystemStatusKey; status: WahubStatus; now: Date }) {
  if (row === 'connection') {
    const missing = connectionMissing(status);
    return (
      <>
        {missing.length > 0 && (
          <Line>
            <B>חסר:</B> {missing.join(' · ')}
          </Line>
        )}
        <Line>
          הודעות נכנסות:{' '}
          {status.last_inbound_at ? (
            <>
              <B>מתקבלות</B> · האחרונה {agoText(status.last_inbound_at, now)} ({formatDateTime(status.last_inbound_at, now)})
            </>
          ) : status.inbound_configured ? (
            <>
              <B>עוד לא התקבלה הודעה</B> – יש מפתח; בדקו שההעתק מחובר ב-ManyChat
            </>
          ) : (
            <B>עוד לא מחובר</B>
          )}
        </Line>
        <Line>
          תשובות הבוט:{' '}
          {status.bot_replies_seen ? (
            <B>מתקבלות</B>
          ) : (
            <>
              <B>לא התקבלו בשבוע האחרון</B> – בלי זה “מחכים לתשובה” אינו מדויק: גם מי שהבוט כבר ענה לו נספר כמחכה
            </>
          )}
        </Line>
        <Line>
          בסך הכול: {status.contacts_total.toLocaleString('he-IL')} אנשי קשר ·{' '}
          {status.messages_last_24h.toLocaleString('he-IL')} הודעות ב-24 השעות האחרונות
        </Line>
      </>
    );
  }

  if (row === 'summary') {
    return status.ai_configured ? (
      <>
        <Line>
          <B>פעיל.</B> כמה דקות אחרי שהשיחה נרגעת, המערכת מסכמת אותה.
        </Line>
        <Line>
          ממלא רק את <B>“מה ידוע”</B>: נושא, סניף, גיל ורמת עניין. סימוני המעקב שלך בלבד.
        </Line>
      </>
    ) : (
      <>
        <Line>
          <B>כבוי.</B> חסר מפתח לשירות הסיכום; הוא מוגדר בהגדרות המערכת.
        </Line>
        <Line>
          בינתיים “מה ידוע” מתמלא <B>לפי מילים בשיחה</B>, בלי סיכום כתוב.
        </Line>
      </>
    );
  }

  if (row === 'shadow') {
    return status.shadow_configured ? (
      <>
        <Line>
          הבוט החדש מנסח תשובה לכל הודעת לקוח, <B>ולא שולח אותה</B>.
        </Line>
        <Line>
          רואים אותה מתחת להודעה בשיחה, ובלשונית “הבוט” ← <B>“תשובות בצל”</B>.
        </Line>
      </>
    ) : (
      <>
        <Line>
          <B>חסר מפתח למודל.</B> עד שיוגדר לא נוצרות הצעות.
        </Line>
        <Line>
          “נסה שאלה” עונה <B>בדמה</B> – לא תשובה אמיתית.
        </Line>
      </>
    );
  }

  if (row === 'transcribe') {
    const transcribe = status.transcribe;
    if (!transcribe?.configured) {
      return (
        <Line>
          <B>חסר מפתח לתמלול.</B> עד שיוגדר, הבוט מבקש מהלקוח לכתוב במקום להקליט.
        </Line>
      );
    }
    if (transcribe.ok === false) {
      return (
        <>
          <Line>
            <B>ההקלטה האחרונה לא תומללה:</B> {transcribe.reason || 'השירות לא ענה'}
          </Line>
          <Line>
            בינתיים הבוט <B>עונה על מה שנכתב</B> ומבקש לכתוב את מה שהוקלט. כשהתמלול יחזור לעבוד, ההקלטות האחרונות יתומללו לבד.
          </Line>
        </>
      );
    }
    return (
      <Line>
        {transcribe.ok ? <B>פעיל.</B> : <B>עוד לא נוסה.</B>} הקלטה של לקוח הופכת לטקסט, והבוט עונה על מה שנאמר בה.
      </Line>
    );
  }

  if (row === 'sending') {
    const sending = sendingState(status);
    if (sending === 'simulated') {
      return (
        <Line>
          <B>מצב הדמיה</B> – הודעות נרשמות ולא נשלחות.
        </Line>
      );
    }
    if (sending === 'off') {
      return (
        <>
          <Line>
            <B>כבויה</B> – שום הודעה לא יוצאת ללקוחות, ו“קח שיחה” לא נוגע בבוט.
          </Line>
          <Line>
            מפעילים בהגדרות המערכת (<span dir="ltr">WAHUB_SENDING_ENABLED</span>) כשמוכנים.
          </Line>
        </>
      );
    }
    return sending === 'on' ? (
      <Line>
        <B>פעילה</B>, דרך ManyChat.
      </Line>
    ) : (
      <Line>
        <B>לא מוגדרת</B> – חסר מפתח ManyChat, ולכן אי אפשר לשלוח מכאן.
      </Line>
    );
  }

  return (
    <>
      <Line>
        למי שמסומן הבוט החדש <B>עונה באמת</B>, בוואטסאפ, והבוט הישן מושתק. לכל השאר שום דבר לא משתנה.
      </Line>
      <Line>
        הרשימה בכרטיס <B>“בדיקה חיה”</B>, כאן למטה. מפעילים מפרטי איש הקשר, בתוך השיחה שלו.
      </Line>
    </>
  );
}

function StatusRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: SystemStatusRow;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <li className={open ? s.foldOpen : undefined}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={s.statusHead}>
        <span className={s.statusTitle}>{row.title}</span>
        <span className={cx(s.pill, LEVEL_PILL[row.level], s.statusValue)}>
          <i className={s.pillDot} aria-hidden="true" />
          <span dir={row.ltr ? 'ltr' : undefined} className={cx(row.ltr && s.num, 'truncate')}>
            {row.value}
          </span>
        </span>
        <ChevronDown className={s.foldChevron} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className={s.statusBody}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{children}</ul>
        </div>
      )}
    </li>
  );
}

/**
 * "מצב המערכת" — at the top of the settings (docs/WAHUB-CONTRACT-POLISH-1.md, ג):
 * the connection to WhatsApp and what it is short of, the automatic summary,
 * the shadow bot, sending to customers and the live test. A title and a word
 * each; pressing a row opens a few short lines under it.
 */
export default function SystemStatusCard({ status, defaultOpen }: { status: WahubStatus; defaultOpen?: SystemStatusKey[] }) {
  const now = useNow();
  const [open, setOpen] = useState<ReadonlySet<SystemStatusKey>>(() => new Set(defaultOpen ?? []));
  const toggle = (key: SystemStatusKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className={s.card} aria-label="מצב המערכת">
      <div className="mb-1 flex items-center gap-3">
        <span aria-hidden="true" className={s.iconBox}>
          <Activity className="h-[18px] w-[18px]" />
        </span>
        <h3 className="text-[15px] font-extrabold">מצב המערכת</h3>
      </div>
      <ul className={cx(s.rows, 'm-0 list-none p-0')}>
        {systemStatusRows(status).map((row) => (
          <StatusRow key={row.key} row={row} open={open.has(row.key)} onToggle={() => toggle(row.key)}>
            <Details row={row.key} status={status} now={now} />
          </StatusRow>
        ))}
      </ul>
    </section>
  );
}
