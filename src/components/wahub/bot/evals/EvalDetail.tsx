'use client';

import { ChevronDown, GraduationCap } from 'lucide-react';
import { EVALS_TEXT, customerLine, failuresByTurn, uncheckedLabel } from '@/lib/wahub/evals';
import type { WahubEvalCheck, WahubEvalRun, WahubEvalScenario } from '@/types/wahubTeach';
import { ErrorState, Skeleton } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { Bubble, Dots } from '../teach/parts';
import e from './evals.module.css';
import type { EvalDetailState } from './useEvals';

const CHECK_MARK: Record<WahubEvalCheck['status'], { sign: string; tone: string }> = {
  passed: { sign: '✓', tone: e.checkPassed },
  failed: { sign: '✗', tone: e.checkFailed },
  not_judged: { sign: '–', tone: e.checkNone },
};

/**
 * The conversation as it was played, turn after turn, as bubbles. Under an
 * answer that did not pass: what was expected of it, and why it did not — in a
 * sentence each. That is the whole of "what we expected, what the bot answered,
 * and why it failed".
 */
function Talk({ run }: { run: WahubEvalRun }) {
  const failed = failuresByTurn(run);
  if (!run.conversation.length) return null;
  return (
    <section aria-label={EVALS_TEXT.conversation}>
      <h4 className={e.label}>{EVALS_TEXT.conversation}</h4>
      <div className={e.talk}>
        {run.conversation.map((turn) => {
          const fails = failed.get(turn.turn) ?? [];
          return (
            <div key={turn.turn} className="contents">
              {turn.last_outbound && <Bubble who="לפני כן נשלח ללקוח" tone="system" text={turn.last_outbound} />}
              {turn.customer.map((message, index) => (
                <Bubble key={index} who={index === 0 ? 'הלקוח כתב' : ''} tone="customer" text={customerLine(message)} />
              ))}
              <Bubble who="הבוט ענה" tone="today" text={turn.bot || '(הבוט לא ענה)'} marked={fails.length > 0}>
                {turn.request_human && (
                  <span className={e.asked}>ביקש להעביר לנציג{turn.request_human_reason ? ` · ${turn.request_human_reason}` : ''}</span>
                )}
              </Bubble>
              {fails.length > 0 && (
                <ul className={e.fails}>
                  {fails.map((failure) => (
                    <li key={failure.id || failure.title} className={e.fail}>
                      <small>{EVALS_TEXT.expected}</small>
                      <b dir="auto">{failure.title}</b>
                      {failure.explain && <span dir="auto">{failure.explain}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {/* A conversation of several turns that is being played now: the next answer is on its way. */}
        {!run.done && <Bubble who="הבוט עונה" tone="today" coming />}
      </div>
    </section>
  );
}

/** Everything a developer would ask about a run. Folded at the foot: the only place a model or a code name is written. */
function Technical({ run }: { run: WahubEvalRun }) {
  const byTurn = new Map<number, WahubEvalCheck[]>();
  for (const check of run.checks) byTurn.set(check.turn, [...(byTurn.get(check.turn) ?? []), check]);
  const turns = [...byTurn.keys()].sort((a, b) => a - b);
  return (
    <details className={e.more}>
      <summary>
        {EVALS_TEXT.technical}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={e.moreBody}>
        <dl className={e.tech}>
          <dt>מי ענה</dt>
          <dd>
            <span className={e.code}>{run.engine || '—'}</span>
            {run.engine_is_stub ? ' (בוט מדומה)' : ''}
          </dd>
          <dt>כמה זמן</dt>
          <dd>
            <span className={s.num}>{(run.took_ms / 1000).toFixed(1)}</span> שנ׳
          </dd>
          <dt>מספר הריצה</dt>
          <dd>
            <span className={e.code}>{run.run_id}</span> · <span className={e.code}>{run.scenario.id}</span>
          </dd>
          <dt>נבדקו</dt>
          <dd>
            {run.counts.passed} עברו · {run.counts.failed} נכשלו · {run.counts.not_judged} לא נשפטו
          </dd>
          {run.scenario.rules.length > 0 && (
            <>
              <dt>הכללים</dt>
              <dd>
                {run.scenario.rules.map((rule) => (
                  <span key={rule.id || rule.title} className="block">
                    {rule.id && <span className={e.code}>{rule.id}</span>} {rule.title}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
        {run.conversation.map((turn) =>
          turn.reasoning || turn.tools.length || turn.tags.length ? (
            <div key={`why-${turn.turn}`}>
              <p className={e.turnHead}>תשובה {turn.turn}: למה ככה</p>
              {turn.reasoning && <p className="m-0">{turn.reasoning}</p>}
              {turn.tools.map((tool, index) => (
                <p key={index} className="m-0">
                  <span className={e.code}>{tool.name}</span> {tool.summary}
                </p>
              ))}
              {turn.tags.map((tag) => (
                <p key={tag.tag} className="m-0">
                  סומן: {tag.tag}
                  {tag.details ? ` — ${tag.details}` : ''}
                </p>
              ))}
            </div>
          ) : null,
        )}
        {turns.length > 0 && (
          <details className={e.more}>
            <summary>
              {EVALS_TEXT.allChecks} <span className={s.num}>({run.checks.length})</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className={e.moreBody}>
              {turns.map((turn) => (
                <div key={turn}>
                  <p className={e.turnHead}>תשובה {turn}</p>
                  <ul className={e.checks}>
                    {(byTurn.get(turn) ?? []).map((check, index) => (
                      <li key={`${check.id}-${index}`} className={CHECK_MARK[check.status].tone}>
                        <i aria-hidden="true">{CHECK_MARK[check.status].sign}</i>
                        <span>
                          <span className={e.srOnly}>{check.status_label}: </span>
                          {check.title}
                          {check.status !== 'passed' && check.explain ? ` — ${check.explain}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

interface EvalDetailProps {
  scenario: WahubEvalScenario;
  detail: EvalDetailState;
  onRetry: () => void;
  onTeach: (run: WahubEvalRun) => void;
}

/**
 * An open row: what is checked, the conversation as bubbles, what was expected
 * and why it did not pass — and "ללמד את הבוט", which opens "ללמד" with the
 * words to start from.
 */
export default function EvalDetail({ scenario, detail, onRetry, onTeach }: EvalDetailProps) {
  const run = detail.state === 'ready' ? detail.run : null;
  const status = run?.status ?? scenario.last?.status ?? null;
  const reason = run?.detail || (status === 'skipped' || status === 'error' ? (scenario.last?.headline ?? '') : '');

  return (
    <div className={e.detail} id={`wahub-eval-${scenario.id}`}>
      {scenario.what && (
        <div>
          <h4 className={e.label}>{EVALS_TEXT.what}</h4>
          <p className={e.text} dir="auto">
            {scenario.what}
          </p>
        </div>
      )}

      {detail.state === 'none' && <p className={cx(e.text, e.quiet)}>{uncheckedLabel(scenario)}. לחיצה על &quot;{EVALS_TEXT.runNow}&quot; תבדוק גם אותה.</p>}

      {detail.state === 'loading' && (
        <div aria-busy="true" aria-label="טוען את השיחה">
          <Skeleton className={e.skDetail} />
        </div>
      )}

      {detail.state === 'failed' && <ErrorState title={EVALS_TEXT.runFailedToOpen} text={detail.text} onRetry={onRetry} tight />}

      {run && (
        <>
          {(status === 'skipped' || status === 'error') && reason && (
            <p className={cx(e.text, e.quiet)} dir="auto">
              <strong>{run.status_label}:</strong> {reason}
            </p>
          )}
          {!run.done && !run.conversation.length && (
            <p className={cx(e.text, e.quiet, 'flex items-center gap-2')}>
              השיחה נבדקת עכשיו <Dots />
            </p>
          )}
          <Talk run={run} />
          {run.done && run.status === 'failed' && (
            <div className={e.detailActions}>
              <button type="button" onClick={() => onTeach(run)} className={cx(s.btn, s.btnP, e.big)}>
                <GraduationCap aria-hidden="true" />
                {EVALS_TEXT.teach}
              </button>
            </div>
          )}
          {run.done && <Technical run={run} />}
        </>
      )}
    </div>
  );
}
