'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing, CalendarClock, Hourglass, UserPlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { readableError } from '@/lib/apiError';
import { fetchWahubContacts } from '@/lib/wahubApi';
import type { Tone } from '@/lib/wahub/boxes';
import { callbackLine, followupDueLine } from '@/lib/wahub/followup';
import { dayTick, displayName, israelToday, plainDayLabel, previewText, waitingLabel } from '@/lib/wahub/format';
import { longestWaiting } from '@/lib/wahub/live';
import { WAHUB_MAX_PAGE_SIZE } from '@/lib/wahub/params';
import type { WahubBox, WahubContact, WahubQueue, WahubStatus, WahubTab } from '@/types/wahub';
import { useNow } from './hooks/useNow';
import { useWahubSummary } from './hooks/useWahubQueries';
import { ContactAvatar, EmptyState, ErrorState, Skeleton } from './shared/bits';
import { NUMBER_TONE, cx } from './shared/tones';
import s from './wahub.module.css';

const LIST_LIMIT = 10;

/**
 * Who has waited longest. The list endpoint sorts by the last message, not by
 * how long someone has waited, so the first page and the last page of the
 * "waiting" box are read and sorted here. Up to 200 people waiting that is
 * exact; beyond it the list says it may be partial.
 */
async function fetchLongestWaiting(): Promise<{ rows: WahubContact[]; exact: boolean }> {
  const size = WAHUB_MAX_PAGE_SIZE;
  const first = await fetchWahubContacts({ view: 'chats', box: 'waiting', page: 1, pageSize: size });
  let pool = first.results;
  const lastPage = Math.ceil(first.count / size);
  if (first.next && lastPage > 1) {
    const last = await fetchWahubContacts({ view: 'chats', box: 'waiting', page: lastPage, pageSize: size }).catch(
      () => null,
    );
    if (last) pool = pool.concat(last.results);
  }
  return { rows: longestWaiting(pool, LIST_LIMIT), exact: first.count <= size * 2 };
}

async function fetchDueToday(): Promise<{ rows: WahubContact[]; total: number }> {
  const page = await fetchWahubContacts({ view: 'leads', queue: 'due', page: 1, pageSize: LIST_LIMIT });
  return { rows: page.results.slice(0, LIST_LIMIT), total: page.count };
}

function Tile({
  label,
  value,
  note,
  tone,
  icon,
  onClick,
}: {
  label: string;
  value: number | null;
  note?: string;
  tone: Tone;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={cx(s.card, s.kpi)}>
      <span className={s.kpiLabel}>{label}</span>
      <span className={cx(s.kpiValue, s.num, value ? NUMBER_TONE[tone] : '')}>
        {value === null ? '–' : value.toLocaleString('he-IL')}
      </span>
      {note && <span className={cx(s.kpiNote, s.warnText)}>{note}</span>}
      <span aria-hidden="true" className={s.kpiIcon}>
        {icon}
      </span>
    </button>
  );
}

function PersonRow({
  contact,
  line,
  loud,
  onOpen,
}: {
  contact: WahubContact;
  line: string;
  loud?: boolean;
  onOpen: (id: number) => void;
}) {
  const quote = previewText(contact.last_message);
  return (
    <li>
      <button type="button" onClick={() => onOpen(contact.id)} className={s.listRow}>
        <ContactAvatar contact={contact} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={cx(s.t1, 'block truncate')} dir="auto">
            {displayName(contact)}
          </span>
          {quote && (
            <span className={cx(s.t2, 'block truncate')} dir="auto">
              {quote}
            </span>
          )}
        </span>
        <span className={cx(s.pill, loud ? s.pBad : s.pWarn, 'shrink-0')}>{line}</span>
      </button>
    </li>
  );
}

function ListCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx(s.card, s.cardFlush)}>
      <div className={cx(s.ct, s.ctFlush)}>
        <h3>{title}</h3>
        {sub && <span>{sub}</span>}
      </div>
      {children}
    </section>
  );
}

function RowsSkeleton() {
  return (
    <ul className={s.list} aria-busy="true" aria-label="טוען">
      {Array.from({ length: 4 }).map((_, row) => (
        <li key={row} className="flex items-center gap-2.5 px-2.5 py-2">
          <Skeleton className="h-[30px] w-[30px] shrink-0" />
          <Skeleton className="h-3.5 flex-1" />
        </li>
      ))}
    </ul>
  );
}

interface TodayTabProps {
  status: WahubStatus | undefined;
  onGo: (target: { tab: WahubTab; box?: WahubBox; queue?: WahubQueue }) => void;
  onOpenChat: (id: number) => void;
}

/** The day at a glance: four numbers that lead to their lists, a week of traffic, and who to get back to first. */
export default function TodayTab({ status, onGo, onOpenChat }: TodayTabProps) {
  const now = useNow();
  const today = israelToday(now);
  const summary = useWahubSummary({ intervalMs: 15_000 });
  const waiting = useQuery({
    queryKey: ['wahub', 'today', 'longest-waiting'],
    queryFn: fetchLongestWaiting,
    refetchInterval: 20_000,
    staleTime: 5_000,
    retry: false,
  });
  const due = useQuery({
    queryKey: ['wahub', 'today', 'due'],
    queryFn: fetchDueToday,
    refetchInterval: 30_000,
    staleTime: 5_000,
    retry: false,
  });

  const data = summary.data;
  const waitingUnreliable = status ? !status.bot_replies_seen : false;
  const chart = (data?.by_day ?? []).map((day) => ({
    date: day.date,
    tick: dayTick(day.date),
    inbound: day.inbound,
    new_contacts: day.new_contacts,
  }));
  const chartEmpty = chart.every((day) => !day.inbound && !day.new_contacts);

  if (summary.isError && !data) {
    return (
      <div className={s.card}>
        <ErrorState
          title="לא הצלחנו לטעון את נתוני היום"
          text={readableError(summary.error, '')}
          onRetry={() => void summary.refetch()}
        />
      </div>
    );
  }

  return (
    <div className={cx(s.pg, 'flex flex-col gap-3.5')}>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="מה מחכה עכשיו">
        <Tile
          label="מחכים לתשובה"
          value={data ? data.waiting : null}
          note={waitingUnreliable ? 'לא מדויק – תשובות הבוט לא מתקבלות' : undefined}
          tone="warning"
          icon={<Hourglass className="h-[18px] w-[18px]" />}
          onClick={() => onGo({ tab: 'chats', box: 'waiting' })}
        />
        <Tile
          label="מבקשים נציג"
          value={data ? data.needs_human : null}
          tone="danger"
          icon={<BellRing className="h-[18px] w-[18px]" />}
          onClick={() => onGo({ tab: 'chats', box: 'needs_human' })}
        />
        <Tile
          label="לחזור אליהם היום"
          value={data ? data.due_followups : null}
          tone="primary"
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          onClick={() => onGo({ tab: 'leads', queue: 'due' })}
        />
        <Tile
          label="פניות חדשות היום"
          value={data ? data.new_contacts_today : null}
          tone="primary"
          icon={<UserPlus className="h-[18px] w-[18px]" />}
          onClick={() => onGo({ tab: 'leads', queue: 'all' })}
        />
      </section>

      <section className={s.card}>
        <div className={cx(s.ct, 'flex-wrap')}>
          <h3>7 הימים האחרונים</h3>
          {data && (
            <p>
              היום: <strong className={s.navyInk}>{data.inbound_today.toLocaleString('he-IL')}</strong> נכנסות ·{' '}
              <strong className={s.navyInk}>{data.outbound_today.toLocaleString('he-IL')}</strong> יוצאות · בשבוע:{' '}
              <strong className={s.navyInk}>{data.new_contacts_7d.toLocaleString('he-IL')}</strong> פניות חדשות
            </p>
          )}
        </div>
        <div className="h-64">
          {!data ? (
            <Skeleton className="h-full !rounded-xl" />
          ) : chartEmpty ? (
            <EmptyState
              icon={<Hourglass />}
              title="עוד אין תנועה בשבוע האחרון"
              text="הודעות נכנסות ופניות חדשות יופיעו כאן לפי יום."
              tight
              className="h-full"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="tick" tick={{ fontSize: 12, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  width={36}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'var(--lav-2)' }}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    boxShadow: 'var(--float)',
                    color: 'var(--ink)',
                    direction: 'rtl',
                  }}
                  labelStyle={{ fontWeight: 800 }}
                  labelFormatter={(_label, payload) => {
                    const date = payload?.[0]?.payload?.date as string | undefined;
                    return date ? plainDayLabel(date) : '';
                  }}
                />
                <Legend />
                {/* The sketch's own two: navy, and gold for what is worth noticing. Gold is pale
                    on white, so it carries a darker edge; the legend, the hover and the table
                    below say the rest. */}
                <Bar dataKey="inbound" name="הודעות נכנסות" fill="var(--navy)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar
                  dataKey="new_contacts"
                  name="פניות חדשות"
                  fill="var(--gold)"
                  stroke="var(--gold-ink)"
                  strokeWidth={1}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* The same numbers as a table, for a reader who cannot use the picture. */}
        {data && !chartEmpty && (
          <table className="sr-only">
            <caption>הודעות נכנסות ופניות חדשות לפי יום</caption>
            <thead>
              <tr>
                <th scope="col">יום</th>
                <th scope="col">הודעות נכנסות</th>
                <th scope="col">פניות חדשות</th>
              </tr>
            </thead>
            <tbody>
              {chart.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{plainDayLabel(day.date)}</th>
                  <td>{day.inbound}</td>
                  <td>{day.new_contacts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ListCard
          title="מחכים הכי הרבה זמן"
          sub={waiting.data && !waiting.data.exact ? 'ייתכן שהרשימה חלקית – יש הרבה ממתינים' : undefined}
        >
          {waiting.isLoading ? (
            <RowsSkeleton />
          ) : waiting.isError ? (
            <ErrorState title="לא הצלחנו לטעון" onRetry={() => void waiting.refetch()} tight />
          ) : !waiting.data?.rows.length ? (
            <EmptyState icon={<Hourglass />} title="אף אחד לא מחכה לתשובה" tight />
          ) : (
            <ul className={s.list}>
              {waiting.data.rows.map((contact) => (
                <PersonRow
                  key={contact.id}
                  contact={contact}
                  line={waitingLabel(contact.chat.waiting_since, now)}
                  loud={contact.chat.needs_human}
                  onOpen={onOpenChat}
                />
              ))}
            </ul>
          )}
        </ListCard>

        <ListCard
          title="לחזור אליהם היום"
          sub={
            due.data && due.data.total > due.data.rows.length
              ? `מוצגים ${due.data.rows.length} מתוך ${due.data.total.toLocaleString('he-IL')}`
              : undefined
          }
        >
          {due.isLoading ? (
            <RowsSkeleton />
          ) : due.isError ? (
            <ErrorState title="לא הצלחנו לטעון" onRetry={() => void due.refetch()} tight />
          ) : !due.data?.rows.length ? (
            <EmptyState icon={<CalendarClock />} title="אין למי לחזור היום" tight />
          ) : (
            <>
              <ul className={s.list}>
                {due.data.rows.map((contact) => {
                  const line =
                    followupDueLine(contact.followup, today, now)?.text ??
                    (contact.followup.status === 'waiting_us'
                      ? 'לחזור אליו'
                      : callbackLine(contact.known.callback_on, today, now)?.text ?? 'לחזור אליו');
                  return <PersonRow key={contact.id} contact={contact} line={line} loud onOpen={onOpenChat} />;
                })}
              </ul>
              {due.data.total > due.data.rows.length && (
                <div className="p-2 text-center" style={{ borderTop: '1px solid var(--line-2)' }}>
                  <button type="button" onClick={() => onGo({ tab: 'leads', queue: 'due' })} className={cx(s.btn, s.btnSm)}>
                    לכל הרשימה
                  </button>
                </div>
              )}
            </>
          )}
        </ListCard>
      </div>
    </div>
  );
}
