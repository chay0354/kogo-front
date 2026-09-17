'use client';

/**
 * Holds the office's WhatsApp broadcast above the pages, so it outlives them.
 *
 * Mounted in the office layout, which stays put across navigation: a check or a
 * send carries on while the office moves to another screen, shrinks to a button
 * in the bottom-left corner, and opens back up on a click — onto the same run,
 * never onto a fresh one that could send the same children again.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import BroadcastWhatsAppDialog from '@/components/dialogs/BroadcastWhatsAppDialog';
import BroadcastRunDock from './BroadcastRunDock';
import {
  BroadcastRun,
  runIsBusy,
  runIsHeld,
  sentCounts,
  type RunSnapshot,
} from '@/lib/broadcastRun';
import {
  automationDisplayLabel,
  broadcastChunkSize,
  broadcastToChildren,
  type WhatsAppAutomation,
} from '@/lib/whatsappApi';

export interface BroadcastDraft {
  /** Selected child ids, in the order the office picked them. */
  childIds: string[];
  /** Names for the ids the page knows; the rest show the name the server returns. */
  childNames: Record<string, string>;
  /** The lesson / weekday the list was filtered by, so a child in several slots gets that lesson's details. */
  lessonHint?: string | null;
  dayHint?: number | null;
  /** Called once the real send starts: the run holds its own copy of the selection from then on. */
  onSent?: () => void;
}

interface BroadcastRunContextValue {
  /** Open the broadcast for a selection — or, while one is still running, bring that one back up. */
  openBroadcast: (draft: BroadcastDraft) => void;
  /** True while the minimised button sits in the corner, so floating bars can make room for it. */
  dockVisible: boolean;
}

const BroadcastRunContext = createContext<BroadcastRunContextValue | null>(null);

const noopUnsubscribe = () => {};

function useRunSnapshot(run: BroadcastRun | null): RunSnapshot | null {
  const subscribe = useCallback(
    (onChange: () => void) => (run ? run.subscribe(onChange) : noopUnsubscribe),
    [run],
  );
  return useSyncExternalStore(
    subscribe,
    () => run?.snapshot ?? null,
    () => null,
  );
}

export function BroadcastRunProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<BroadcastDraft | null>(null);
  const [run, setRun] = useState<BroadcastRun | null>(null);
  const [expanded, setExpanded] = useState(false);
  const snapshot = useRunSnapshot(run);

  const expandedRef = useRef(expanded);
  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  // A phase that ends while the run is minimised is said out loud once, so the
  // office does not have to keep glancing at the corner.
  useEffect(() => {
    if (!run) return;
    let previous = run.snapshot.phase;
    return run.subscribe((s) => {
      if (s.phase === previous) return;
      previous = s.phase;
      if (expandedRef.current) return;
      if (s.phase === 'preview') toast.info('בדיקת התפוצה הסתיימה — פתחו אותה כדי לאשר שליחה');
      else if (s.phase === 'paused') toast.warning('שליחת התפוצה נעצרה — פתחו אותה כדי להחליט איך להמשיך');
      else if (s.phase === 'failed') toast.error('בדיקת התפוצה נכשלה');
      else if (s.phase === 'done') {
        const { sent, failed } = sentCounts(s.sentRows);
        if (failed) toast.warning(`התפוצה הסתיימה · נשלחו ${sent} · נכשלו ${failed}`);
        else toast.success(`התפוצה הסתיימה · נשלחו ${sent}`);
      }
    });
  }, [run]);

  // A reload or a closed tab would cut the run off mid-chunk; the browser asks first.
  const busy = snapshot ? runIsBusy(snapshot.phase) : false;
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const openBroadcast = useCallback(
    (next: BroadcastDraft) => {
      if (run && runIsHeld(run.snapshot.phase)) {
        setExpanded(true);
        toast.info('יש תפוצה שעדיין רצה — אפשר להתחיל חדשה כשהיא תסתיים');
        return;
      }
      setRun(null);
      setDraft({ ...next, childIds: next.childIds.slice(), childNames: { ...next.childNames } });
      setExpanded(true);
    },
    [run],
  );

  const check = useCallback(
    (automation: WhatsAppAutomation) => {
      if (!draft) return;
      if (run && runIsHeld(run.snapshot.phase)) return;
      const hint = {
        ...(draft.lessonHint ? { lesson_id: draft.lessonHint } : {}),
        ...(draft.dayHint !== null && draft.dayHint !== undefined ? { day_of_week: draft.dayHint } : {}),
      };
      const next = new BroadcastRun({
        ids: draft.childIds,
        names: draft.childNames,
        automation: {
          automation_type: automation.automation_type,
          automation_id: automation.automation_id,
          label: automationDisplayLabel(automation),
        },
        chunkSize: broadcastChunkSize(automation.automation_type),
        sendChunk: (req) =>
          broadcastToChildren({
            ...req,
            automation_type: automation.automation_type,
            automation_id: automation.automation_id,
            ...hint,
          }),
      });
      setRun(next);
      void next.check();
    },
    [draft, run],
  );

  const start = useCallback(() => {
    if (!run) return;
    const before = run.snapshot.phase;
    void run.start();
    if (before === 'preview') draft?.onSent?.();
  }, [run, draft]);

  /** Back from the preview to choosing an automation. Nothing has been sent. */
  const back = useCallback(() => {
    if (run && runIsHeld(run.snapshot.phase)) return;
    setRun(null);
  }, [run]);

  const dismiss = useCallback(() => {
    if (run && runIsHeld(run.snapshot.phase)) return;
    setRun(null);
    setDraft(null);
    setExpanded(false);
  }, [run]);

  // Closing a run that is under way, or waiting on a decision, only tucks it
  // into the corner. Closing anything else ends it.
  const close = useCallback(() => {
    const phase = run?.snapshot.phase;
    if (phase === 'checking' || phase === 'preview' || phase === 'sending' || phase === 'paused') {
      setExpanded(false);
      return;
    }
    dismiss();
  }, [run, dismiss]);

  const dockVisible = Boolean(run && snapshot && !expanded);

  const value = useMemo(() => ({ openBroadcast, dockVisible }), [openBroadcast, dockVisible]);

  return (
    <BroadcastRunContext.Provider value={value}>
      {children}
      {/* Always mounted, so closing — or cancelling — plays the exit rather than vanishing. */}
      <BroadcastWhatsAppDialog
        open={expanded && Boolean(draft || run)}
        draft={draft}
        run={run}
        snapshot={snapshot}
        onClose={close}
        onMinimize={() => setExpanded(false)}
        onCheck={check}
        onBack={back}
        onCancel={dismiss}
        onStart={start}
        onDismiss={dismiss}
      />
      {dockVisible && snapshot && (
        <BroadcastRunDock
          snapshot={snapshot}
          onOpen={() => setExpanded(true)}
          onDismiss={snapshot.phase === 'done' || snapshot.phase === 'failed' ? dismiss : undefined}
        />
      )}
    </BroadcastRunContext.Provider>
  );
}

export function useBroadcastRun(): BroadcastRunContextValue {
  const ctx = useContext(BroadcastRunContext);
  if (!ctx) throw new Error('useBroadcastRun must be used within BroadcastRunProvider');
  return ctx;
}
