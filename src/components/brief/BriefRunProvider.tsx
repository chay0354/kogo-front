'use client';

/**
 * The daily brief's run, held above the pages so it survives leaving the screen.
 *
 * The checks are asked for one at a time, and the whole thing takes long enough
 * that the office should not have to stand and watch it: the run lives here, a
 * button in the corner says how far it has got and how long is left, and a
 * click on it goes back to the brief.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import BriefRunDock from './BriefRunDock';
import { readableError } from '@/lib/apiError';
import { fetchBriefChecks, runBriefCheck, type DailyBrief } from '@/lib/dailyBriefApi';

interface BriefRunState {
  running: boolean;
  done: number;
  total: number;
  current: string;
  startedAt: number;
  failed: string[];
  brief: DailyBrief | null;
  storedAt: string | null;
}

const EMPTY: BriefRunState = {
  running: false,
  done: 0,
  total: 0,
  current: '',
  startedAt: 0,
  failed: [],
  brief: null,
  storedAt: null,
};

interface BriefRunContextValue extends BriefRunState {
  start: (includeExternal: boolean) => Promise<void>;
  /** Cleared when the brief screen has taken the result. */
  clearFailures: () => void;
}

const BriefRunContext = createContext<BriefRunContextValue | null>(null);

export function BriefRunProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BriefRunState>(EMPTY);
  const running = useRef(false);

  const start = useCallback(async (includeExternal: boolean) => {
    if (running.current) return;
    running.current = true;
    const startedAt = Date.now();
    setState({ ...EMPTY, running: true, startedAt });
    try {
      const checks = (await fetchBriefChecks()).filter((c) => includeExternal || !c.external);
      setState((prev) => ({ ...prev, total: checks.length, current: checks[0]?.title ?? '' }));
      for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        setState((prev) => ({ ...prev, done: index, current: check.title }));
        try {
          const data = await runBriefCheck(check.key);
          setState((prev) => ({ ...prev, brief: data.brief, storedAt: data.stored_at }));
        } catch (err) {
          // One check that will not answer must not stop the rest.
          const line = `${check.title}: ${readableError(err, 'לא הסתיימה')}`;
          setState((prev) => ({ ...prev, failed: [...prev.failed, line] }));
        }
      }
      setState((prev) => ({ ...prev, done: prev.total, current: '' }));
      toast.success('הבדיקה הסתיימה');
    } catch (err) {
      toast.error(readableError(err, 'לא ניתן להתחיל את הבדיקה'));
    } finally {
      running.current = false;
      setState((prev) => ({ ...prev, running: false }));
    }
  }, []);

  const clearFailures = useCallback(() => setState((prev) => ({ ...prev, failed: [] })), []);

  const value = useMemo(
    () => ({ ...state, start, clearFailures }),
    [state, start, clearFailures],
  );

  return (
    <BriefRunContext.Provider value={value}>
      {children}
      {state.running && <BriefRunDock done={state.done} total={state.total} current={state.current} startedAt={state.startedAt} />}
    </BriefRunContext.Provider>
  );
}

export function useBriefRun(): BriefRunContextValue {
  const ctx = useContext(BriefRunContext);
  if (!ctx) throw new Error('useBriefRun must be used within BriefRunProvider');
  return ctx;
}
