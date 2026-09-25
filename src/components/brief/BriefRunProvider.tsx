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
import {
  advanceSystemAudit,
  fetchBriefChecks,
  MAX_CHECK_SLICES,
  runBriefCheck,
  type AuditDay,
  type DailyBrief,
} from '@/lib/dailyBriefApi';

interface BriefRunState {
  running: boolean;
  /** What is running: the brief's checks, or today's slice of the weekly audit. */
  mode: 'brief' | 'audit';
  /** The audit day as it stood after the last slice. */
  audit: AuditDay | null;
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
  mode: 'brief',
  audit: null,
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
  /** Run today's weekly audit to the end, a slice per request. */
  startAudit: () => Promise<void>;
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
          let data = await runBriefCheck(check.key);
          // The morning fixes do a slice per request and say when they are not
          // finished; the next request carries on from where this one stopped.
          for (let slice = 1; data.item?.continues && slice < MAX_CHECK_SLICES; slice += 1) {
            const progress = data;
            setState((prev) => ({
              ...prev,
              brief: progress.brief,
              storedAt: progress.stored_at,
              current: `${check.title} — ${progress.item.summary}`,
            }));
            data = await runBriefCheck(check.key);
          }
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

  const startAudit = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState({ ...EMPTY, running: true, mode: 'audit', startedAt: Date.now(), current: 'בדיקת עומק' });
    try {
      // Each call moves the day forward by what fits in one request. The server
      // keeps the progress, so a slice that fails loses only itself.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const day = await advanceSystemAudit();
        setState((prev) => ({
          ...prev,
          audit: day,
          done: day.checked_routes ?? 0,
          total: day.total_routes ?? 0,
          current: day.title,
        }));
        if (day.verdict !== 'running') break;
      }
      toast.success('בדיקת העומק של היום הסתיימה');
    } catch (err) {
      toast.error(readableError(err, 'בדיקת העומק נעצרה'));
    } finally {
      running.current = false;
      setState((prev) => ({ ...prev, running: false }));
    }
  }, []);

  const clearFailures = useCallback(() => setState((prev) => ({ ...prev, failed: [] })), []);

  const value = useMemo(
    () => ({ ...state, start, startAudit, clearFailures }),
    [state, start, startAudit, clearFailures],
  );

  return (
    <BriefRunContext.Provider value={value}>
      {children}
      {state.running && (
        <BriefRunDock
          label={state.mode === 'audit' ? 'בדיקת עומק' : 'בריף יומי'}
          unit={state.mode === 'audit' ? 'מסכים' : ''}
          done={state.done}
          total={state.total}
          current={state.current}
          startedAt={state.startedAt}
        />
      )}
    </BriefRunContext.Provider>
  );
}

export function useBriefRun(): BriefRunContextValue {
  const ctx = useContext(BriefRunContext);
  if (!ctx) throw new Error('useBriefRun must be used within BriefRunProvider');
  return ctx;
}
