'use client';

import { useEffect, useId, useState, type CSSProperties } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, PartyPopper, Sparkle, TrendingDown, TrendingUp } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import {
  UNKNOWN_TEXT,
  askedWhen,
  shownTopics,
  timesText,
  trendWords,
  unknownsTitle,
  unsortedText,
  withoutTopic,
} from '@/lib/wahub/unknowns';
import { dismissWahubUnknown, fetchWahubUnknowns, restoreWahubUnknown } from '@/lib/wahub/unknownsApi';
import type { WahubUnknownExample, WahubUnknownTopic, WahubUnknownWeek, WahubUnknowns } from '@/types/wahubUnknowns';
import { botKeys } from '../../hooks/useBotQueries';
import { Skeleton, Spinner } from '../../shared/bits';
import { Fold } from '../../shared/motion';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import u from './unknowns.module.css';
import { teachKeys } from './useTeach';

/**
 * "מה הבוט לא ידע השבוע" — at the head of "ללמד"
 * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.3). The owner, 13.10.2026: "מצוין;
 * לרכז במקום מסודר בדף הבוט".
 *
 * Titles first: every topic is one row — its name, how often it was asked this
 * week (and, small, how that compares with the week before), and "ללמד". A
 * press on the topic shows up to three of the questions in the customers' own
 * words, what the bot answered, and when it was last asked; "לא רלוונטי" stands
 * there, quietly, and what it took off can be brought back from "הוסרו".
 *
 * "ללמד" opens the very card of "ללמד" with the context ready — he only writes
 * the right answer. Nothing here changes what the bot knows, and nothing is
 * sent to anybody.
 */

function Examples({ examples, now }: { examples: ReadonlyArray<WahubUnknownExample>; now: Date }) {
  return (
    <ul className={u.examples}>
      {examples.map((example, index) => (
        <li key={`${example.at ?? 'q'}-${index}`} className={u.example}>
          <q dir="auto">{example.question}</q>
          {example.at && <span className={u.when}>{askedWhen(example.at, now)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Trend({ topic }: { topic: WahubUnknownTopic }) {
  const words = trendWords(topic);
  if (!words) return null;
  return (
    <span className={u.trend} data-trend={words.trend} title={words.text}>
      {words.trend === 'up' ? <TrendingUp aria-hidden="true" /> : words.trend === 'down' ? <TrendingDown aria-hidden="true" /> : <Sparkle aria-hidden="true" />}
      <span aria-hidden="true">{words.short}</span>
      <span className="sr-only">{words.text}</span>
    </span>
  );
}

interface TopicRowProps {
  topic: WahubUnknownTopic;
  week: WahubUnknownWeek;
  order: number;
  open: boolean;
  /** Its card of "ללמד" is being opened. */
  teaching: boolean;
  /** "לא רלוונטי" is on its way for it. */
  dismissing: boolean;
  /** Something is on its way for some topic: nothing else is pressed meanwhile. */
  locked: boolean;
  error: string;
  now: Date;
  onOpen: (open: boolean) => void;
  onTeach: () => void;
  onDismiss: () => void;
}

function TopicRow({ topic, week, order, open, teaching, dismissing, locked, error, now, onOpen, onTeach, onDismiss }: TopicRowProps) {
  const panelId = useId();
  const last = askedWhen(topic.last_asked_at, now);
  return (
    <li className={cx(u.topic, open && u.topicOpen)} style={{ '--i': Math.min(order, 8) } as CSSProperties} data-topic={topic.id}>
      <div className={u.topicRow}>
        <button type="button" onClick={() => onOpen(!open)} aria-expanded={open} aria-controls={panelId} className={u.topicMain}>
          <span className={u.topicTitle} dir="auto">
            {topic.title}
          </span>
          <span className={u.topicMeta}>
            <span>{timesText(topic.count, week)}</span>
            <Trend topic={topic} />
            {topic.still_asked && <span className={u.still}>{UNKNOWN_TEXT.stillAsked}</span>}
          </span>
          <ChevronDown className={u.topicChevron} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onTeach}
          disabled={locked}
          aria-label={`${UNKNOWN_TEXT.teach}: ${topic.title}`}
          className={cx(s.btn, s.btnSm, s.btnP, u.teachBtn)}
        >
          {teaching && <Spinner className="h-3.5 w-3.5" />}
          {UNKNOWN_TEXT.teach}
        </button>
      </div>
      <Fold open={open} id={panelId} innerClassName={u.body}>
        {topic.examples.length > 0 && (
          <div>
            <h4 className={u.bodyLabel}>{UNKNOWN_TEXT.asked}</h4>
            <Examples examples={topic.examples} now={now} />
          </div>
        )}
        {topic.bot_said && (
          <div>
            <h4 className={u.bodyLabel}>{UNKNOWN_TEXT.botSaid}</h4>
            <p className={u.said} dir="auto">
              {topic.bot_said}
            </p>
          </div>
        )}
        <p className={u.bodyFoot}>
          <span>{last ? `${UNKNOWN_TEXT.lastTime}: ${last}` : ''}</span>
          <button type="button" onClick={onDismiss} disabled={locked} className={u.footLink}>
            {dismissing && <Spinner className="h-3.5 w-3.5" />}
            {UNKNOWN_TEXT.dismiss}
          </button>
        </p>
      </Fold>
      {error && (
        <p className={u.rowError} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** What is on its way for a topic: marking it as not relevant, or bringing it back. */
export interface UnknownsBusy {
  id: number;
  action: 'dismiss' | 'restore';
}

export interface UnknownsViewProps {
  week: WahubUnknownWeek;
  data: WahubUnknowns;
  /** Another week is being read: the rows that are there stay, paler. */
  reading: boolean;
  /** Only the title row — a card of "ללמד" stands under the block, and it is the one thing being done now. */
  folded: boolean;
  /** The topic whose questions are open. */
  openId: number | null;
  /** The whole list, past the first few. */
  showAll: boolean;
  /** The topic whose card of "ללמד" is being opened. */
  teachingId: number | null;
  busy: UnknownsBusy | null;
  /** Why the last press on a topic did not happen. */
  rowError: { id: number; text: string } | null;
  /** The topics that were taken off the list ("לא רלוונטי"); null — not read yet, or the server could not say. */
  dismissed: ReadonlyArray<WahubUnknownTopic> | null;
  /** What is open under the topics: the questions not sorted yet, or the topics that were taken off. */
  panel: 'unsorted' | 'dismissed' | null;
  now: Date;
  onWeek: (week: WahubUnknownWeek) => void;
  onFold: (folded: boolean) => void;
  onOpen: (id: number | null) => void;
  onShowAll: () => void;
  onPanel: (panel: 'unsorted' | 'dismissed' | null) => void;
  onTeach: (topic: WahubUnknownTopic) => void;
  onDismiss: (topic: WahubUnknownTopic) => void;
  onRestore: (topic: WahubUnknownTopic) => void;
}

/**
 * The block as it is drawn. Everything comes in from outside, so it can be drawn — and pressed — without a
 * server. With nothing to show it is one glad line, with the way to the other week still on it.
 */
export function UnknownsView({
  week,
  data,
  reading,
  folded,
  openId,
  showAll,
  teachingId,
  busy,
  rowError,
  dismissed,
  panel,
  now,
  onWeek,
  onFold,
  onOpen,
  onShowAll,
  onPanel,
  onTeach,
  onDismiss,
  onRestore,
}: UnknownsViewProps) {
  const bodyId = useId();
  const panelId = useId();
  const topics = data.results;
  const shown = shownTopics(topics, showAll);
  const hidden = topics.length - shown.length;
  const unsorted = data.unsorted.count;
  const gone = dismissed ?? [];
  const locked = teachingId !== null || busy !== null;
  const title = unknownsTitle(week);
  const otherWeek: WahubUnknownWeek = week === 'this' ? 'last' : 'this';
  const weekLink = (
    <button type="button" onClick={() => onWeek(otherWeek)} className={u.week}>
      {week === 'this' ? UNKNOWN_TEXT.toLast : UNKNOWN_TEXT.toThis}
    </button>
  );
  const dismissedLink = gone.length > 0 && (
    <button type="button" onClick={() => onPanel(panel === 'dismissed' ? null : 'dismissed')} aria-expanded={panel === 'dismissed'} aria-controls={panelId} className={u.footLink}>
      {UNKNOWN_TEXT.dismissed} <span className={s.num}>({gone.length})</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );
  const dismissedPanel = (
    <ul className={u.gone} aria-label={UNKNOWN_TEXT.dismissed}>
      {gone.map((topic) => (
        <li key={topic.id}>
          <span className={u.goneTitle} dir="auto" title={topic.title}>
            {topic.title}
          </span>
          <button type="button" onClick={() => onRestore(topic)} disabled={locked} className={u.footLink}>
            {busy?.id === topic.id && busy.action === 'restore' && <Spinner className="h-3.5 w-3.5" />}
            {UNKNOWN_TEXT.restore}
          </button>
          {rowError?.id === topic.id && (
            <span className={u.rowError} role="alert">
              {rowError.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  );

  // Nothing the bot did not know, and nothing waiting to be sorted: one glad line, never an empty frame.
  if (topics.length === 0 && unsorted === 0) {
    return (
      <section aria-label={title} data-unknowns="none" className={cx(reading && u.reading)}>
        <p className={u.glad}>
          <PartyPopper aria-hidden="true" />
          <span className={u.gladText}>{week === 'last' ? UNKNOWN_TEXT.noneLast : UNKNOWN_TEXT.noneThis}</span>
          {dismissedLink}
          {weekLink}
        </p>
        <Fold open={panel === 'dismissed' && gone.length > 0} id={panelId} innerClassName={u.gladPanel}>
          {dismissedPanel}
        </Fold>
      </section>
    );
  }

  return (
    <section className={u.block} aria-label={title} data-unknowns={week}>
      <header className={u.head}>
        <button type="button" onClick={() => onFold(!folded)} aria-expanded={!folded} aria-controls={bodyId} className={u.headMain}>
          <h3 className={u.title}>
            {title} <span className={cx(s.num, u.titleCount)}>({data.counts.topics.toLocaleString('he-IL')})</span>
          </h3>
          <ChevronDown className={u.headChevron} aria-hidden="true" />
        </button>
        {weekLink}
      </header>
      <Fold open={!folded} id={bodyId}>
        <div className={cx(reading && u.reading)} aria-busy={reading || undefined}>
          {shown.length > 0 && (
            <ul className={u.topics}>
              {shown.map((topic, index) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  week={week}
                  order={index}
                  open={openId === topic.id}
                  teaching={teachingId === topic.id}
                  dismissing={busy?.id === topic.id && busy.action === 'dismiss'}
                  locked={locked}
                  error={rowError?.id === topic.id ? rowError.text : ''}
                  now={now}
                  onOpen={(open) => onOpen(open ? topic.id : null)}
                  onTeach={() => onTeach(topic)}
                  onDismiss={() => onDismiss(topic)}
                />
              ))}
            </ul>
          )}
          {(hidden > 0 || unsorted > 0 || gone.length > 0) && (
            <div className={u.foot}>
              {hidden > 0 && (
                <button type="button" onClick={onShowAll} className={u.footLink}>
                  {UNKNOWN_TEXT.more} <span className={s.num}>({hidden})</span>
                </button>
              )}
              {unsorted > 0 &&
                // The questions the sorting has not reached yet: said, and — when there is one to show — a press away.
                (data.unsorted.examples.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPanel(panel === 'unsorted' ? null : 'unsorted')}
                    aria-expanded={panel === 'unsorted'}
                    aria-controls={panelId}
                    className={u.footLink}
                  >
                    {unsortedText(unsorted)}
                    <ChevronDown aria-hidden="true" />
                  </button>
                ) : (
                  <span className={u.when}>{unsortedText(unsorted)}</span>
                ))}
              <span className="flex-1" />
              {dismissedLink}
            </div>
          )}
          <Fold open={panel !== null} id={panelId} innerClassName={u.footPanel}>
            {panel === 'unsorted' && <Examples examples={data.unsorted.examples} now={now} />}
            {panel === 'dismissed' && (gone.length > 0 ? dismissedPanel : <p className={u.goneNone}>אין נושאים שהוסרו.</p>)}
          </Fold>
        </div>
      </Fold>
    </section>
  );
}

interface UnknownsProps {
  /** The sub-tab can ask the server at all (its own list was read). */
  enabled: boolean;
  /**
   * The server is known to have the list (it counts it in `review/summary/`): the block's place is then held
   * while its first read is out, so nothing under it jumps when it lands. Not known — nothing is drawn until it does.
   */
  known?: boolean;
  /** A card of "ללמד" stands under the block: it folds to its title, so there is one thing to do at a time. */
  cardOpen: boolean;
  /** The topic whose card is being opened, and why the last one could not be. */
  teachingId: number | null;
  teachError: { id: number; text: string } | null;
  now: Date;
  onTeach: (topic: WahubUnknownTopic) => void;
}

/**
 * The block with its reads and what it keeps: which week, which topic is open, and the two presses that change
 * the list — "לא רלוונטי" and "להחזיר". A server built before the list answers 404: nothing is drawn, and
 * "ללמד" is exactly the screen it was.
 */
export default function Unknowns({ enabled, known = false, cardOpen, teachingId, teachError, now, onTeach }: UnknownsProps) {
  const queryClient = useQueryClient();
  const [week, setWeek] = useState<WahubUnknownWeek>('this');
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [panel, setPanel] = useState<'unsorted' | 'dismissed' | null>(null);
  const [busy, setBusy] = useState<UnknownsBusy | null>(null);
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null);
  // Folded by itself while a card stands under it; a press on the title is his own word, until the card comes or goes.
  const [foldedByHand, setFoldedByHand] = useState<boolean | null>(null);
  useEffect(() => setFoldedByHand(null), [cardOpen]);

  const listKey = [...teachKeys.unknowns, 'list', week] as const;
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => fetchWahubUnknowns(week, 'active'),
    enabled,
    staleTime: 30_000,
    // A server that has no such list is not asked again every minute.
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const built = list.data !== undefined;
  // What was taken off, so "הוסרו" is offered only when there is something behind it.
  const goneKey = [...teachKeys.unknowns, 'dismissed'] as const;
  const gone = useQuery({
    queryKey: goneKey,
    queryFn: () => fetchWahubUnknowns('this', 'dismissed'),
    enabled: enabled && built,
    staleTime: 60_000,
    retry: false,
  });

  // The server has no such list (404), or the first read is still out: nothing is drawn — "ללמד" is what it was.
  if (!enabled || (list.isError && !list.data)) return null;
  if (!list.data) return known && list.isPending ? <Skeleton className={u.sk} /> : null;

  const refreshCounts = () => {
    void queryClient.invalidateQueries({ queryKey: teachKeys.unknowns });
    void queryClient.invalidateQueries({ queryKey: botKeys.reviewSummary });
  };

  async function dismiss(topic: WahubUnknownTopic) {
    if (busy) return;
    setBusy({ id: topic.id, action: 'dismiss' });
    setRowError(null);
    try {
      const saved = await dismissWahubUnknown(topic.id);
      // Off the list at once, in every week that is held; the reads that follow have the last word.
      queryClient.setQueriesData<WahubUnknowns>({ queryKey: [...teachKeys.unknowns, 'list'] }, (prev) => (prev ? withoutTopic(prev, topic.id) : prev));
      queryClient.setQueryData<WahubUnknowns>(goneKey, (prev) =>
        prev ? { ...prev, results: [saved ?? { ...topic, status: 'dismissed' }, ...prev.results.filter((row) => row.id !== topic.id)] } : prev,
      );
      setOpenId((current) => (current === topic.id ? null : current));
      refreshCounts();
    } catch (error) {
      setRowError({ id: topic.id, text: readableError(error, UNKNOWN_TEXT.dismissFailed) });
    } finally {
      setBusy(null);
    }
  }

  async function restore(topic: WahubUnknownTopic) {
    if (busy) return;
    setBusy({ id: topic.id, action: 'restore' });
    setRowError(null);
    try {
      await restoreWahubUnknown(topic.id);
      queryClient.setQueryData<WahubUnknowns>(goneKey, (prev) => (prev ? { ...prev, results: prev.results.filter((row) => row.id !== topic.id) } : prev));
      refreshCounts();
    } catch (error) {
      setRowError({ id: topic.id, text: readableError(error, UNKNOWN_TEXT.restoreFailed) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <UnknownsView
      week={week}
      data={list.data}
      reading={list.isPlaceholderData}
      folded={foldedByHand ?? cardOpen}
      openId={openId}
      showAll={showAll}
      teachingId={teachingId}
      busy={busy}
      rowError={rowError ?? teachError}
      dismissed={gone.data?.results ?? null}
      panel={panel}
      now={now}
      onWeek={(next) => {
        setWeek(next);
        setOpenId(null);
        setShowAll(false);
        setPanel(null);
        setRowError(null);
      }}
      onFold={setFoldedByHand}
      onOpen={setOpenId}
      onShowAll={() => setShowAll(true)}
      onPanel={setPanel}
      onTeach={onTeach}
      onDismiss={(topic) => void dismiss(topic)}
      onRestore={(topic) => void restore(topic)}
    />
  );
}
