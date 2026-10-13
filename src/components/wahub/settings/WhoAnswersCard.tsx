'use client';

import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { AlertCircle, AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, MessagesSquare, PauseCircle } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import {
  GO_LIVE_CLOSED,
  WHO_ANSWERS_CARD_ID,
  WHO_ANSWERS_TEXT,
  goLiveStep,
  logLines,
  showToday,
  todayFigures,
  warningToShow,
  whoAnswersAction,
  whoAnswersHeadline,
  type GoLiveEvent,
  type GoLiveStep,
  type WhoAnswersTone,
} from '@/lib/wahub/botMode';
import { formatClock, formatDateTime } from '@/lib/wahub/format';
import { hebrewOr } from '@/lib/wahub/leadsAutomation';
import type { WahubBotMode, WahubBotModeProblem } from '@/types/wahubBotMode';
import { useBotMode, useBotModeChanges } from '../hooks/useBotMode';
import { useNow } from '../hooks/useNow';
import { InlineConfirm, Skeleton, Spinner } from '../shared/bits';
import { RefreshNote } from '../shared/loading';
import { CountUp, Fold } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import GoLiveDialog, { GoLiveDialogView } from './GoLiveDialog';
import g from './whoAnswers.module.css';

const TONE_CLASS: Record<WhoAnswersTone, string> = {
  test: g.toneTest,
  live: g.toneLive,
  held: g.toneHeld,
};

function ToneIcon({ tone }: { tone: WhoAnswersTone }) {
  if (tone === 'live') return <CheckCircle2 aria-hidden="true" />;
  if (tone === 'held') return <PauseCircle aria-hidden="true" />;
  return <FlaskConical aria-hidden="true" />;
}

export type WhoAnswersFold = 'failure' | 'log';

export interface WhoAnswersViewProps {
  status: 'loading' | 'ready' | 'error';
  error: string;
  /** What the server said; null until it has. */
  state: WahubBotMode | null;
  /** What is on screen is being read again. */
  refreshing?: boolean;
  /** The server could not be asked again just now: the hour of what is on screen. Empty when it is fresh. */
  staleAt?: string;
  now: Date;
  /** The change that is on its way to the server. */
  busy: 'all' | 'test' | null;
  /** The window of going live. */
  goLive: GoLiveStep;
  goLiveProblems: WahubBotModeProblem[];
  goLiveError: string;
  /** "לחזור לבדיקה בלבד" was pressed, and waits for its yes. */
  confirmingBack: boolean;
  /** A change that was refused, or whose outcome is not known — said on the card. */
  notice: string;
  /** Went back to "בדיקה בלבד" on this visit: the reminder about the old bot stays. */
  wentBack: boolean;
  /** The folds that are open to begin with. */
  defaultOpen?: WhoAnswersFold[];
  onGoLive: (event: GoLiveEvent) => void;
  onConfirmGoLive: () => void;
  onAskBack: () => void;
  onCancelBack: () => void;
  onConfirmBack: () => void;
  onRetry: () => void;
  /** Draws the window of going live. The card with its reading hands one that knows where on the page to stand. */
  renderDialog?: (dialog: WhoAnswersDialogProps) => ReactNode;
  cardRef?: Ref<HTMLElement>;
}

export interface WhoAnswersDialogProps {
  step: GoLiveStep;
  sendingEnabled: boolean;
  busy: boolean;
  problems: WahubBotModeProblem[];
  error: string;
  onTick: (on: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function CardHead({ refreshing = false }: { refreshing?: boolean }) {
  return (
    <div className={g.head}>
      <span aria-hidden="true" className={s.iconBox}>
        <MessagesSquare className="h-[18px] w-[18px]" />
      </span>
      <h3>{WHO_ANSWERS_TEXT.title}</h3>
      <RefreshNote active={refreshing} />
    </div>
  );
}

/** A title, and — a press away — what stands behind it. Keeps for itself whether it is open. */
export function WhoAnswersFold({ title, value, defaultOpen, children }: { title: string; value?: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <li className={open ? s.foldOpen : undefined}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((was) => !was)} className={s.statusHead}>
        <span className={s.statusTitle}>{title}</span>
        {value && <span className={g.foldValue}>{value}</span>}
        <ChevronDown className={s.foldChevron} aria-hidden="true" />
      </button>
      <Fold open={open} id={panelId} innerClassName={s.statusBody}>
        {children}
      </Fold>
    </li>
  );
}

/**
 * "מי עונה ללקוחות" (docs/WAHUB-CONTRACT-GO-LIVE.md, ג) — the first card of
 * the settings, and the one place where the owner moves every customer to the
 * new bot, or back.
 *
 * In this order: when the bot stopped itself, that first — what the server
 * says, and what is done now. Then who answers right now, large; and beside
 * it the one button, alone. Then the day in six small numbers. The last
 * failure and who changed what are a press away.
 *
 * The button never turns "כולם" on by itself: it opens a window, and in the
 * window a tick has to be put before "להדליק לכולם" can be pressed. Going back
 * is a press and a short yes, with a reminder about the old bot.
 *
 * Drawn from what it is given, so every state can be shown without a server.
 */
export function WhoAnswersView({
  status,
  error,
  state,
  refreshing,
  staleAt = '',
  now,
  busy,
  goLive,
  goLiveProblems,
  goLiveError,
  confirmingBack,
  notice,
  wentBack,
  defaultOpen,
  onGoLive,
  onConfirmGoLive,
  onAskBack,
  onCancelBack,
  onConfirmBack,
  onRetry,
  renderDialog = (dialog) => <GoLiveDialogView {...dialog} />,
  cardRef,
}: WhoAnswersViewProps) {
  if (!state) {
    return (
      <section id={WHO_ANSWERS_CARD_ID} ref={cardRef} className={cx(s.card, g.card)} aria-label={WHO_ANSWERS_TEXT.title}>
        <CardHead />
        {status === 'error' ? (
          // Nothing is guessed here: with no answer there is no state, and no button.
          <div role="alert" className={cx(s.emptyState, s.emptyTight)}>
            <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
              <AlertCircle />
            </div>
            <h3>{WHO_ANSWERS_TEXT.loadFailed}</h3>
            {error && <p>{error}</p>}
            <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
              נסו שוב
            </button>
          </div>
        ) : (
          <div className={g.sk} aria-busy="true" aria-label="טוען מי עונה ללקוחות">
            <Skeleton className="!rounded-[14px]" style={{ height: 74 }} />
          </div>
        )}
      </section>
    );
  }

  const headline = whoAnswersHeadline(state, now);
  const action = whoAnswersAction(state);
  const warning = warningToShow(state);
  const figures = showToday(state) ? todayFigures(state.today) : null;
  const log = logLines(state.log, now);
  const failure = state.last_failure;
  const stoppedWhen = state.stopped ? formatDateTime(state.stopped.at, now) : '';
  // Each of the two confirmations belongs to one mode only: a state that changed under it puts it away.
  const dialogOpen = goLive.open && action === 'go_live';
  const asking = confirmingBack && action === 'back_to_test';

  const dialog: WhoAnswersDialogProps = {
    step: goLive,
    sendingEnabled: state.sending_enabled,
    busy: busy === 'all',
    problems: goLiveProblems,
    error: goLiveError,
    onTick: (on) => onGoLive(on ? 'tick' : 'untick'),
    onConfirm: onConfirmGoLive,
    onClose: () => onGoLive('close'),
  };

  return (
    <section id={WHO_ANSWERS_CARD_ID} ref={cardRef} className={cx(s.card, g.card)} aria-label={WHO_ANSWERS_TEXT.title} data-mode={state.mode}>
      <CardHead refreshing={refreshing} />

      {/* The brake fired: what the server says, and what is done now. First, and the one thing here in red. */}
      {state.stopped && (
        <div role="alert" className={g.stopped}>
          <AlertOctagon aria-hidden="true" />
          <div className="min-w-0">
            <p className={g.stoppedText}>{state.stopped.text}</p>
            {stoppedWhen && <p className={g.stoppedWhen}>{stoppedWhen}</p>}
            <p className={g.stoppedLine}>{WHO_ANSWERS_TEXT.stoppedNobody}</p>
            <p className={g.stoppedLine}>
              <b>{WHO_ANSWERS_TEXT.stoppedNow}</b> {WHO_ANSWERS_TEXT.stoppedHow}
            </p>
          </div>
        </div>
      )}

      <div className={g.state}>
        {/* Who answers right now, large. */}
        <div className={cx(g.headline, TONE_CLASS[headline.tone])} data-tone={headline.tone}>
          <ToneIcon tone={headline.tone} />
          <div className="min-w-0">
            <p className={g.headText}>{headline.title}</p>
            {headline.sub && (
              <p className={g.headSub}>
                {/* Each part keeps to one line where it can: on a narrow screen the line breaks between the parts. */}
                {headline.sub.split(' · ').map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 && ' '}
                    <span className={g.headSubPart}>{index > 0 ? `· ${part}` : part}</span>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        </div>

        {/* The one button, by the state — alone at the end of the row. */}
        {!asking && (
          <div className={g.action}>
            {/* Two buttons that are never the same one: when the state turns over, the keyboard does not stay on
                what took the other's place. */}
            {action === 'go_live' ? (
              <button key="go" type="button" data-who-answers-action="go_live" onClick={() => onGoLive('open')} disabled={busy !== null} className={cx(s.btn, s.btnP)}>
                {WHO_ANSWERS_TEXT.goLive}
              </button>
            ) : (
              <button key="back" type="button" data-who-answers-action="back_to_test" onClick={onAskBack} disabled={busy !== null} className={s.btn}>
                {WHO_ANSWERS_TEXT.backToTest}
              </button>
            )}
          </div>
        )}

        {asking && (
          <div className={g.wide}>
            <InlineConfirm
              text={
                <>
                  <b>{WHO_ANSWERS_TEXT.backQuestion}</b> {WHO_ANSWERS_TEXT.backLine}
                  <br />
                  <b>{WHO_ANSWERS_TEXT.backReminder}</b>
                </>
              }
              confirmLabel={WHO_ANSWERS_TEXT.backConfirm}
              busy={busy === 'test'}
              onConfirm={onConfirmBack}
              onCancel={onCancelBack}
            />
          </div>
        )}

        {notice && (
          <p role="alert" className={g.error}>
            <AlertTriangle aria-hidden="true" />
            <span>{notice}</span>
          </p>
        )}

        {wentBack && state.mode === 'test' && !state.stopped && (
          <p role="status" className={g.note}>
            <AlertTriangle aria-hidden="true" />
            <span>
              {WHO_ANSWERS_TEXT.wentBack} <b>{WHO_ANSWERS_TEXT.wentBackReminder}</b>
            </span>
          </p>
        )}

        {/* What was chosen and what happens are not the same — in the server's words. */}
        {warning && (
          <p role="status" className={g.warning} data-warning="">
            <AlertTriangle aria-hidden="true" />
            <span>{warning}</span>
          </p>
        )}

        {staleAt && <p className={g.stale}>אין תשובה מהשרת כרגע. מה שמוצג כאן נכון לשעה {staleAt}.</p>}
      </div>

      {/* The day, in six small numbers. */}
      {figures && (
        <section className={g.today} aria-label="מה קרה היום">
          <h4 className={s.sectTitle}>{WHO_ANSWERS_TEXT.todayTitle}</h4>
          <ul className={g.figures}>
            {figures.map((figure) => (
              <li
                key={figure.key}
                className={cx(g.figure, figure.alert && g.figureAlert, figure.value === 0 && g.figureZero)}
                data-figure={figure.key}
              >
                <CountUp value={figure.value} once={`bot-mode-${figure.key}`} className={g.figureValue} />
                <span className={g.figureLabel}>{figure.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A press away. */}
      {(failure || log.length > 0) && (
        <ul className={cx(s.rows, g.folds)}>
          {failure && (
            <WhoAnswersFold title={WHO_ANSWERS_TEXT.failureTitle} value={formatDateTime(failure.at, now)} defaultOpen={defaultOpen?.includes('failure') ?? false}>
              <p className={g.foldText}>{failure.text}</p>
            </WhoAnswersFold>
          )}
          {log.length > 0 && (
            <WhoAnswersFold title={WHO_ANSWERS_TEXT.logTitle} defaultOpen={defaultOpen?.includes('log') ?? false}>
              <ul className={g.log}>
                {log.map((line, index) => (
                  <li key={index}>
                    {line.when && <span className={g.logWhen}>{line.when}</span>}
                    <span className={g.logText}>
                      {line.text}
                      {line.by && <span className={g.logBy}> · {line.by}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </WhoAnswersFold>
          )}
        </ul>
      )}

      {dialogOpen && renderDialog(dialog)}
    </section>
  );
}

/**
 * The card with its reading and its two changes. On a server that has no
 * `settings/bot-mode/` yet (404 / 405) it is simply not there.
 */
export default function WhoAnswersCard() {
  const now = useNow(60_000);
  const botMode = useBotMode();
  const changes = useBotModeChanges();
  const card = useRef<HTMLElement | null>(null);

  const [step, setStep] = useState<GoLiveStep>(GO_LIVE_CLOSED);
  const [goLiveProblems, setGoLiveProblems] = useState<WahubBotModeProblem[]>([]);
  const [goLiveError, setGoLiveError] = useState('');
  const [confirmingBack, setConfirmingBack] = useState(false);
  const [notice, setNotice] = useState('');
  const [wentBack, setWentBack] = useState(false);
  // "נסו שוב" was pressed and the read is on its way: the waiting shape comes back, so the press is seen to do something.
  const [retrying, setRetrying] = useState(false);

  const mode = botMode.data?.mode;
  // The state changed under an open confirmation (somebody else chose, or the brake fired): it is put away.
  useEffect(() => {
    if (mode === 'all') setStep(GO_LIVE_CLOSED);
    if (mode === 'test') setConfirmingBack(false);
  }, [mode]);

  // A server from before this was built: no card, and nothing in its place.
  if (botMode.data === null) return null;

  const onGoLive = (event: GoLiveEvent) => {
    if (changes.busy) return;
    if (event === 'open' || event === 'close') {
      setGoLiveProblems([]);
      setGoLiveError('');
    }
    if (event === 'open') setNotice('');
    setStep((current) => goLiveStep(current, event));
  };

  async function confirmGoLive() {
    // The tick, read at the moment of the press — and carried to the call, which refuses to go without it.
    if (!step.open || !step.disconnected) return;
    setGoLiveProblems([]);
    setGoLiveError('');
    const outcome = await changes.goLive({ oldBotDisconnected: true });
    if (outcome.ok) {
      setStep(GO_LIVE_CLOSED);
      setWentBack(false);
      return;
    }
    if (outcome.problems.length > 0) {
      setGoLiveProblems(outcome.problems);
      setGoLiveError(outcome.message);
      return;
    }
    if (outcome.unknown) {
      // Whether it was kept is not known: the window is put away, and the card — read again — says how it stands.
      setStep(GO_LIVE_CLOSED);
      setNotice(outcome.message);
      return;
    }
    setGoLiveError(outcome.message);
  }

  async function confirmBack() {
    setNotice('');
    const outcome = await changes.backToTest();
    setConfirmingBack(false);
    if (outcome.ok) setWentBack(true);
    else setNotice(outcome.message);
  }

  const state = botMode.data ?? null;
  const stale = Boolean(state) && botMode.isError && !botMode.isFetching;

  return (
    <WhoAnswersView
      cardRef={card}
      status={state ? 'ready' : botMode.isError && !retrying ? 'error' : 'loading'}
      error={botMode.isError ? hebrewOr(readableError(botMode.error, ''), '') : ''}
      state={state}
      refreshing={Boolean(state) && botMode.isFetching}
      staleAt={stale ? formatClock(new Date(botMode.dataUpdatedAt)) : ''}
      now={now}
      busy={changes.busy === 'all' || changes.busy === 'test' ? changes.busy : null}
      goLive={step}
      goLiveProblems={goLiveProblems}
      goLiveError={goLiveError}
      confirmingBack={confirmingBack}
      notice={notice}
      wentBack={wentBack}
      onGoLive={onGoLive}
      onConfirmGoLive={() => void confirmGoLive()}
      onAskBack={() => {
        setNotice('');
        setConfirmingBack(true);
      }}
      onCancelBack={() => setConfirmingBack(false)}
      onConfirmBack={() => void confirmBack()}
      onRetry={() => {
        setRetrying(true);
        void botMode.refetch().finally(() => setRetrying(false));
      }}
      renderDialog={(dialog) => <GoLiveDialog anchor={card.current} {...dialog} />}
    />
  );
}
