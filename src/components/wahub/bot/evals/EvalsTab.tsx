'use client';

import { teachSeed } from '@/lib/wahub/evals';
import { useNow } from '../../hooks/useNow';
import EvalsView from './EvalsView';
import { useEvals } from './useEvals';

interface EvalsTabProps {
  /** "ללמד את הבוט" on a conversation that did not pass: "ללמד" opens with these words in its box. */
  onTeach: (text: string) => void;
}

/**
 * "בדיקות" — a sub-tab of "הבוט" (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ג).
 * The written test conversations and how each last came out. Nothing is run on
 * opening the screen: a run asks the real bot, so it starts on a press only.
 * A test conversation is played in memory — no customer is touched, nothing is sent.
 */
export default function EvalsTab({ onTeach }: EvalsTabProps) {
  const evals = useEvals();
  const now = useNow(60_000);
  return (
    <EvalsView
      availability={evals.availability}
      loadError={evals.loadError}
      onRetry={evals.retry}
      listing={evals.listing}
      run={evals.run}
      group={evals.group}
      openId={evals.openId}
      detail={evals.detail}
      now={now}
      onGroup={evals.setGroup}
      onOpen={evals.open}
      onRun={evals.startRun}
      onStop={evals.stopRun}
      onRetryDetail={evals.retryDetail}
      onTeach={(run) => onTeach(teachSeed(run))}
    />
  );
}
