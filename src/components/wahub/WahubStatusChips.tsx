'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Plug, Sparkles, X } from 'lucide-react';
import { agoText } from '@/lib/wahub/format';
import type { WahubStatus } from '@/types/wahub';
import { useNow } from './hooks/useNow';
import { useDismiss } from './shared/bits';
import { cx } from './shared/tones';
import s from './wahub.module.css';

type Level = 'ok' | 'warn' | 'off' | 'unknown';

const LEVEL_CHIP: Record<Level, string> = {
  ok: s.chipOk,
  warn: s.chipWarn,
  off: s.chipBad,
  unknown: '',
};

/** How the connection as a whole reads: a word for the chip, never a colour alone. */
export function connectionLevel(status: WahubStatus | undefined): { level: Level; word: string } {
  if (!status) return { level: 'unknown', word: '' };
  if (!status.inbound_configured) return { level: 'off', word: 'לא מחובר' };
  if (!status.last_inbound_at) return { level: 'warn', word: 'ממתין להודעה ראשונה' };
  if (!status.bot_replies_seen || !status.send_configured || !status.sending_enabled || status.simulate_send) {
    return { level: 'warn', word: 'חלקי' };
  }
  return { level: 'ok', word: 'תקין' };
}

function Line({ children }: { children: ReactNode }) {
  return <li className="text-[13.5px] leading-relaxed">{children}</li>;
}

const B = ({ children }: { children: ReactNode }) => <strong className="font-extrabold">{children}</strong>;

interface ChipDef {
  key: string;
  title: string;
  icon: typeof Plug;
  level: Level;
  word: string;
  lines: ReactNode;
}

/**
 * Two small status chips beside the page title. A chip is a title and a word;
 * pressing it opens a bubble with a few short lines, the point of each in bold.
 */
export default function WahubStatusChips({
  status,
  failed,
  onOpenSettings,
}: {
  status: WahubStatus | undefined;
  /** The status could not be read at all. */
  failed: boolean;
  onOpenSettings: () => void;
}) {
  const now = useNow();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const bubbleId = useId();
  const wrapper = useDismiss(openKey !== null, () => setOpenKey(null));

  const connection = connectionLevel(status);
  const chips: ChipDef[] = [
    {
      key: 'connection',
      title: 'חיבור הוואטסאפ',
      icon: Plug,
      level: failed && !status ? 'unknown' : connection.level,
      word: failed && !status ? 'לא ידוע' : connection.word,
      lines: !status ? (
        <Line>
          <B>לא הצלחנו לקרוא את מצב החיבור.</B> נסו שוב בעוד רגע.
        </Line>
      ) : (
        <>
          <Line>
            הודעות נכנסות:{' '}
            {status.last_inbound_at ? (
              <>
                <B>מתקבלות</B> · האחרונה {agoText(status.last_inbound_at, now)}
              </>
            ) : status.inbound_configured ? (
              <B>עוד לא התקבלה הודעה</B>
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
                <B>לא מתקבלות</B> – “מחכים לתשובה” לא מדויק
              </>
            )}
          </Line>
          <Line>
            שליחה:{' '}
            {status.simulate_send ? (
              <>
                <B>הדמיה</B> – לא נשלח באמת
              </>
            ) : !status.sending_enabled ? (
              <>
                <B>כבויה</B> – כלום לא יוצא ללקוחות עד שתפעיל
              </>
            ) : status.send_configured ? (
              <B>פעילה</B>
            ) : (
              <B>לא מוגדרת</B>
            )}
          </Line>
        </>
      ),
    },
    {
      key: 'summary',
      title: 'סיכום אוטומטי',
      icon: Sparkles,
      level: !status ? 'unknown' : status.ai_configured ? 'ok' : 'unknown',
      word: !status ? '' : status.ai_configured ? 'פעיל' : 'כבוי',
      lines: !status ? (
        <Line>
          <B>לא ידוע כרגע.</B>
        </Line>
      ) : status.ai_configured ? (
        <>
          <Line>
            <B>פעיל.</B> כל שיחה מסוכמת כמה דקות אחרי שנרגעה.
          </Line>
          <Line>
            ממלא רק את <B>“מה ידוע”</B>. הסימונים שלך בלבד.
          </Line>
        </>
      ) : (
        <>
          <Line>
            <B>כבוי.</B> חסר מפתח לשירות הסיכום.
          </Line>
          <Line>
            בינתיים “מה ידוע” מתמלא <B>לפי מילים בשיחה</B>.
          </Line>
        </>
      ),
    },
  ];

  const open = chips.find((chip) => chip.key === openKey) ?? null;

  return (
    <div ref={wrapper} className="relative">
      <div className={s.chips}>
        {chips.map((chip) => {
          const isOpen = open?.key === chip.key;
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls={bubbleId}
              onClick={() => setOpenKey(isOpen ? null : chip.key)}
              className={cx(s.chipbtn, LEVEL_CHIP[chip.level])}
            >
              <Icon aria-hidden="true" />
              <span>{chip.title}</span>
              {chip.word && <span className="font-extrabold">· {chip.word}</span>}
              <ChevronDown className={cx('transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {open && (
        <div
          id={bubbleId}
          role="region"
          aria-label={open.title}
          className={cx(
            s.pop,
            s.popDown,
            'absolute start-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] sm:start-auto sm:end-0',
          )}
        >
          <div className={cx(s.popTitle, 'flex items-center justify-between gap-3')}>
            <span className="flex items-center gap-1.5">
              <open.icon className="h-4 w-4" aria-hidden="true" />
              {open.title}
            </span>
            <button
              type="button"
              onClick={() => setOpenKey(null)}
              aria-label="סגירת הפרטים"
              className={cx(s.ib, s.ibSm, '-m-1')}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="p-3.5">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{open.lines}</ul>
            {open.key === 'connection' && (
              <button
                type="button"
                onClick={() => {
                  setOpenKey(null);
                  onOpenSettings();
                }}
                className={cx(s.link, 'mt-3 text-[13px]')}
              >
                להגדרות החיבור
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
