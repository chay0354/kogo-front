'use client';

import { useMemo, useState } from 'react';
import { Bot, RefreshCw } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import { SHADOW_FILTERS, filterShadowReplies, mergeShadowReplies, type ShadowFilter } from '@/lib/wahub/bot';
import type { WahubStatus } from '@/types/wahub';
import { useShadowBad, useShadowRecent, useShadowSummary } from '../../hooks/useBotQueries';
import { useNow } from '../../hooks/useNow';
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../shared/bits';
import { NUMBER_TONE, cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import ShadowReplyCard from './ShadowReplyCard';
import { useVerdict } from './useVerdict';

interface ShadowTabProps {
  status: WahubStatus | undefined;
  onOpenChat: (contactId: number) => void;
  onOpenItem: (id: number) => void;
}

function Tile({ label, value, tone = 'neutral' as const }: { label: string; value: string; tone?: keyof typeof NUMBER_TONE }) {
  return (
    <div className={cx(s.card, s.kpi)}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={cx(s.kpiValue, s.num, NUMBER_TONE[tone], '!pe-0')}>{value}</span>
    </div>
  );
}

/**
 * "תשובות בצל": every answer the new bot would have given, beside what the
 * old one did, with 👍/👎. The filters are the verdicts; "לתקן" is the list
 * the server keeps of bad ones with a note.
 */
export default function ShadowTab({ status, onOpenChat, onOpenItem }: ShadowTabProps) {
  const now = useNow(60_000);
  const [filter, setFilter] = useState<ShadowFilter>('all');
  const summary = useShadowSummary(true);
  const recent = useShadowRecent(true);
  const bad = useShadowBad(filter === 'bad');
  const { verdict, busyId } = useVerdict();

  const replies = useMemo(() => {
    const merged = mergeShadowReplies([recent.data ?? [], filter === 'bad' ? bad.data ?? [] : []]);
    return filterShadowReplies(merged, filter);
  }, [recent.data, bad.data, filter]);

  const loading = recent.isLoading || (filter === 'bad' && bad.isLoading);
  const configured = status?.shadow_configured;
  const sum = summary.data;

  return (
    <div className="flex flex-col gap-3.5">
      {configured === false && (
        <p className={cx(s.strip, 'm-0')} role="status">
          <Bot aria-hidden="true" />
          הבוט בצל כבוי: חסר מפתח (ANTHROPIC_API_KEY). עד שיוגדר לא נוצרות הצעות, ו“נסה שאלה” עונה בדמה.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="סיכום">
        <Tile label="הצעות ב-7 ימים" value={sum ? sum.proposed_7d.toLocaleString('he-IL') : '–'} />
        <Tile label="ממתינות לסימון" value={sum ? sum.awaiting_verdict.toLocaleString('he-IL') : '–'} tone={sum?.awaiting_verdict ? 'warning' : 'neutral'} />
        <Tile label="סומנו טוב" value={sum ? sum.judged_good.toLocaleString('he-IL') : '–'} tone="success" />
        <Tile label="לתקן" value={sum ? sum.judged_bad.toLocaleString('he-IL') : '–'} tone={sum?.judged_bad ? 'danger' : 'neutral'} />
        <Tile label="זמן תשובה ממוצע" value={sum?.avg_ms ? `${(sum.avg_ms / 1000).toFixed(1)} שנ׳` : '–'} />
      </section>

      <section className={cx(s.card, 'flex flex-wrap items-center gap-2.5')} aria-label="סינון">
        <div className={s.chips} role="group" aria-label="סינון לפי סימון">
          {SHADOW_FILTERS.map((def) => (
            <button key={def.key} type="button" aria-pressed={filter === def.key} onClick={() => setFilter(def.key)} className={cx(s.chipbtn, filter === def.key && s.on)}>
              {def.label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            void recent.refetch();
            void summary.refetch();
            if (filter === 'bad') void bad.refetch();
          }}
          disabled={recent.isFetching}
          className={cx(s.btn, s.btnSm)}
        >
          {recent.isFetching ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw aria-hidden="true" />}
          רענן
        </button>
      </section>

      <p className={cx(s.t2, 'm-0 px-1 !text-[12.5px]')}>
        ההצעות של השיחות האחרונות. שום דבר מכאן לא נשלח ללקוח – זה מה שהבוט החדש <strong className="font-extrabold">היה</strong> עונה.
      </p>

      {loading ? (
        <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="טוען הצעות">
          {[0, 1].map((card) => (
            <div key={card} className={s.card}>
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-24 !rounded-xl" />
            </div>
          ))}
        </div>
      ) : recent.isError ? (
        <div className={s.card}>
          <ErrorState title="לא הצלחנו לטעון את ההצעות" text={readableError(recent.error, '')} onRetry={() => void recent.refetch()} />
        </div>
      ) : replies.length === 0 ? (
        <div className={s.card}>
          <EmptyState
            icon={<Bot />}
            title={filter === 'all' ? 'עוד אין הצעות' : 'אין הצעות בסינון הזה'}
            text={filter === 'all' ? 'כשלקוח כותב, הבוט החדש מציע תשובה בצל כמה דקות אחרי. ההצעות מופיעות כאן ובתוך השיחה.' : undefined}
          />
        </div>
      ) : (
        <section className="flex flex-col gap-3.5" aria-label="הצעות">
          {replies.map((reply) => (
            <ShadowReplyCard
              key={reply.id}
              reply={reply}
              now={now}
              busy={busyId === reply.id}
              showContact
              onVerdict={(value, note) => void verdict(reply, value, note)}
              onOpenItem={onOpenItem}
              onOpenChat={onOpenChat}
            />
          ))}
        </section>
      )}
    </div>
  );
}
