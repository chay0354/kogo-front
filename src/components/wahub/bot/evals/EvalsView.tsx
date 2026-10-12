'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, Minus, Play, RotateCcw, Square, X } from 'lucide-react';
import {
  EVALS_TEXT,
  evalHeadline,
  inGroup,
  lastCheckedText,
  needsRecheck,
  passedFoldTitle,
  runEndLine,
  runFraction,
  runHint,
  runLine,
  runTurnLine,
  scenarioBucket,
  sortScenarios,
  uncheckedFoldTitle,
  uncheckedLabel,
  type EvalRunState,
  type EvalScope,
} from '@/lib/wahub/evals';
import type { WahubEvalGroup, WahubEvalListing, WahubEvalRun, WahubEvalScenario } from '@/types/wahubTeach';
import { ErrorState, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { Dots, NotYet } from '../teach/parts';
import EvalDetail from './EvalDetail';
import e from './evals.module.css';
import type { EvalDetailState, EvalsAvailability } from './useEvals';

export interface EvalsViewProps {
  availability: EvalsAvailability;
  loadError: string;
  onRetry: () => void;
  listing: WahubEvalListing | null;
  run: EvalRunState;
  /** The group the list is narrowed to. */
  group: string | null;
  /** The open row, and what is known of its conversation. */
  openId: string | null;
  detail: EvalDetailState;
  now: Date;
  onGroup: (group: string | null) => void;
  onOpen: (id: string) => void;
  onRun: (scope: EvalScope) => void;
  onStop: () => void;
  onRetryDetail: () => void;
  onTeach: (run: WahubEvalRun) => void;
}

/** ✓ / ✗ / – — or the dots of the conversation being checked right now. */
function Mark({ scenario, now }: { scenario: WahubEvalScenario; now: boolean }) {
  if (now) {
    return (
      <span className={cx(e.mark, e.markNow)}>
        <Dots label="נבדקת עכשיו" />
      </span>
    );
  }
  const bucket = scenarioBucket(scenario);
  // Keyed by the run: a result that just arrived comes in, one that was there stays still.
  const key = scenario.last?.run_id ?? 0;
  if (bucket === 'passed') {
    return (
      <span key={key} className={cx(e.mark, e.markPassed)} role="img" aria-label="עברה">
        <Check aria-hidden="true" />
      </span>
    );
  }
  if (bucket === 'failed') {
    return (
      <span key={key} className={cx(e.mark, e.markFailed)} role="img" aria-label="נכשלה">
        <X aria-hidden="true" />
      </span>
    );
  }
  return (
    <span key={key} className={cx(e.mark, e.markNone)} role="img" aria-label={uncheckedLabel(scenario)}>
      <Minus aria-hidden="true" />
    </span>
  );
}

interface RowsProps {
  scenarios: ReadonlyArray<WahubEvalScenario>;
  failed?: boolean;
  /** One group is on screen: its name on every row would only repeat. */
  oneGroup: boolean;
  nowId: string | null;
  openId: string | null;
  detail: EvalDetailState;
  onOpen: (id: string) => void;
  onRetryDetail: () => void;
  onTeach: (run: WahubEvalRun) => void;
}

/** A row is the conversation's name in plain words and its mark; a press opens it. */
function Rows({ scenarios, failed = false, oneGroup, nowId, openId, detail, onOpen, onRetryDetail, onTeach }: RowsProps) {
  return (
    <ul className={cx(e.rows, failed && e.rowsFailed)}>
      {scenarios.map((scenario) => {
        const open = scenario.id === openId;
        const bucket = scenarioBucket(scenario);
        const why = bucket === 'failed' ? scenario.last?.headline : bucket === 'unchecked' ? [uncheckedLabel(scenario), scenario.last?.headline].filter(Boolean).join(': ') : '';
        return (
          <li key={scenario.id}>
            <button
              type="button"
              onClick={() => onOpen(scenario.id)}
              aria-expanded={open}
              aria-controls={open ? `wahub-eval-${scenario.id}` : undefined}
              className={cx(e.row, open && e.rowOpen)}
            >
              <Mark scenario={scenario} now={scenario.id === nowId} />
              <span className={e.rowMain}>
                <span className={e.rowTitle} dir="auto">
                  {scenario.title}
                </span>
                {why && (
                  <span className={e.rowWhy} dir="auto">
                    {why}
                  </span>
                )}
              </span>
              <span className={e.rowSide}>
                {!oneGroup && scenario.group_title && <span className={e.rowGroup}>{scenario.group_title}</span>}
                <ChevronDown aria-hidden="true" />
              </span>
            </button>
            {open && <EvalDetail scenario={scenario} detail={detail} onRetry={onRetryDetail} onTeach={onTeach} />}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A piece of the list folded to its title: "84 עברו — הצג". He opens and closes
 * it; it opens by itself only when the row he is reading is inside it.
 */
function FoldedRows({ title, startOpen, holdsOpenRow, children }: { title: string; startOpen: boolean; holdsOpenRow: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen || holdsOpenRow);
  useEffect(() => {
    if (holdsOpenRow) setOpen(true);
  }, [holdsOpenRow]);
  return (
    <details className={e.fold} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>{title}</span>
        <em>הצג</em>
        <ChevronDown aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/** The run under way: a live bar, which conversation is being checked, and "עצור". */
function Running({ run, onStop }: { run: EvalRunState; onStop: () => void }) {
  const fraction = runFraction(run);
  const turn = runTurnLine(run);
  return (
    <div className={e.running} role="status" aria-live="polite">
      <div
        className={e.bar}
        role="progressbar"
        aria-label="התקדמות הבדיקה"
        aria-valuemin={0}
        aria-valuemax={run.queue.length}
        aria-valuenow={Object.keys(run.outcomes).length}
      >
        <span className={e.barFill} style={{ transform: `scaleX(${fraction.toFixed(4)})` } as CSSProperties} />
      </div>
      <div className={e.runRow}>
        <div className={e.runText}>
          <p className={e.runLine} dir="auto">
            {runLine(run)}
          </p>
          <p className={e.runTurn}>{turn}</p>
        </div>
        <button type="button" onClick={onStop} className={s.btn}>
          <Square aria-hidden="true" />
          {EVALS_TEXT.stop}
        </button>
      </div>
    </div>
  );
}

function GroupChips({ groups, group, total, onGroup }: { groups: ReadonlyArray<WahubEvalGroup>; group: string | null; total: number; onGroup: (group: string | null) => void }) {
  if (groups.length < 2) return null;
  return (
    <div className={e.groups} role="group" aria-label="סינון לפי נושא">
      <button type="button" aria-pressed={group === null} onClick={() => onGroup(null)} className={cx(e.chip, group === null && e.chipOn)}>
        הכול
        <span className={cx(e.chipCount, s.num)}>{total}</span>
      </button>
      {groups.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={group === entry.id}
          onClick={() => onGroup(group === entry.id ? null : entry.id)}
          title={entry.failed > 0 ? `${entry.failed} נכשלו` : undefined}
          className={cx(e.chip, group === entry.id && e.chipOn)}
        >
          {entry.failed > 0 && <i className={e.chipDot} aria-hidden="true" />}
          {entry.title}
          <span className={cx(e.chipCount, s.num)}>{entry.total}</span>
          {entry.failed > 0 && <span className={e.srOnly}>, {entry.failed} נכשלו</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * "בדיקות": one big sentence — how many test conversations pass — when they
 * were last checked, and one button. Under it the list: what failed first, what
 * passed folded away. Nothing runs by itself: a run asks the real bot.
 */
export default function EvalsView({
  availability,
  loadError,
  onRetry,
  listing,
  run,
  group,
  openId,
  detail,
  now,
  onGroup,
  onOpen,
  onRun,
  onStop,
  onRetryDetail,
  onTeach,
}: EvalsViewProps) {
  if (availability === 'unavailable') {
    return (
      <div className={e.evals}>
        <NotYet title={EVALS_TEXT.notBuiltTitle} text={EVALS_TEXT.notBuiltText} />
      </div>
    );
  }

  if (availability === 'loading' || (availability === 'ready' && !listing)) {
    return (
      <div className={e.evals} aria-busy="true" aria-label="טוען את הבדיקות">
        <Skeleton className={e.skHero} />
        <Skeleton className={e.skRows} />
      </div>
    );
  }

  if (availability === 'failed' || !listing) {
    return (
      <div className={e.evals}>
        <div className={s.card}>
          <ErrorState title={EVALS_TEXT.loadFailed} text={loadError} onRetry={onRetry} tight />
        </div>
      </div>
    );
  }

  const running = run.phase === 'running';
  const headline = evalHeadline(listing.summary);
  const chosen = group ? (listing.groups.find((entry) => entry.id === group) ?? null) : null;
  const shown = inGroup(listing.scenarios, chosen?.id ?? null);
  const sections = sortScenarios(shown);
  const recheck = shown.filter(needsRecheck).length;
  const ended = runEndLine(run);
  const nowId = run.current?.id ?? null;
  const rows = { oneGroup: chosen !== null, nowId, openId, detail, onOpen, onRetryDetail, onTeach };
  const { total, passed, failed } = listing.summary;

  return (
    <div className={e.evals}>
      <section className={e.hero} aria-label="בדיקות הבוט">
        <div>
          <p className={e.sentence}>
            {headline.passed !== null ? (
              <>
                {/* Keyed by the figure: it lands again each time a run moves it. */}
                <span key={headline.passed} className={cx(e.figure, s.num)}>
                  {headline.passed}
                </span>{' '}
                מתוך <span className={cx(e.figure, s.num)}>{headline.total}</span> {headline.text}
              </>
            ) : (
              headline.text
            )}
          </p>
          {headline.rest && <p className={cx(e.rest, 'mt-2')}>{headline.rest}</p>}
        </div>

        {headline.passed !== null && total > 0 && (
          <div className={e.ratio} aria-hidden="true">
            <i className={e.ratioPassed} style={{ flexGrow: passed }} />
            <i className={e.ratioFailed} style={{ flexGrow: failed }} />
            <i style={{ flexGrow: Math.max(0, total - passed - failed) }} />
          </div>
        )}

        <p className={e.when}>{lastCheckedText(listing.summary.last_run_at, now)}</p>

        {running ? (
          <Running run={run} onStop={onStop} />
        ) : (
          <>
            {ended && (
              <p className={e.ended} role="status">
                {run.phase === 'finished' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                <span>{ended}</span>
              </p>
            )}
            <div className={e.heroActions}>
              <button type="button" onClick={() => onRun('all')} disabled={shown.length === 0} className={cx(s.btn, s.btnP, e.big)}>
                <Play aria-hidden="true" />
                {EVALS_TEXT.runNow}
              </button>
              {recheck > 0 && (
                <button type="button" onClick={() => onRun('failed')} className={cx(s.btn, e.big)}>
                  <RotateCcw aria-hidden="true" />
                  {EVALS_TEXT.runFailed}
                </button>
              )}
            </div>
            <p className={e.hint}>{runHint(listing.scenarios, chosen)}</p>
          </>
        )}
      </section>

      {!listing.engine.configured && (
        <p className={e.stub} role="status">
          <AlertTriangle aria-hidden="true" />
          <span>{EVALS_TEXT.stub}</span>
        </p>
      )}

      <GroupChips groups={listing.groups} group={chosen?.id ?? null} total={total} onGroup={onGroup} />

      {sections.failed.length > 0 ? (
        <section className={e.section} aria-label="שיחות שלא עברו">
          <h3 className={cx(e.sectionTitle, e.sectionFailed)}>
            לא עברו <span className={s.num}>{sections.failed.length}</span>
          </h3>
          <Rows scenarios={sections.failed} failed {...rows} />
        </section>
      ) : (
        sections.passed.length > 0 && (
          <p className={e.allGood} role="status">
            <CheckCircle2 aria-hidden="true" />
            {sections.unchecked.length > 0 ? 'אין שיחה שנכשלה בין אלה שנבדקו' : 'כל השיחות עוברות'}
          </p>
        )
      )}

      {sections.unchecked.length > 0 && (
        <FoldedRows
          title={uncheckedFoldTitle(sections.unchecked.length)}
          // Open from the start when it is all there is to see.
          startOpen={sections.failed.length + sections.passed.length === 0}
          holdsOpenRow={sections.unchecked.some((scenario) => scenario.id === openId)}
        >
          <Rows scenarios={sections.unchecked} {...rows} />
        </FoldedRows>
      )}

      {sections.passed.length > 0 && (
        <FoldedRows title={passedFoldTitle(sections.passed.length)} startOpen={false} holdsOpenRow={sections.passed.some((scenario) => scenario.id === openId)}>
          <Rows scenarios={sections.passed} {...rows} />
        </FoldedRows>
      )}
    </div>
  );
}
