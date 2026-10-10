'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWahubUpdates } from '@/lib/wahubApi';
import { isBatchTruncated, sameBoxCounts } from '@/lib/wahub/live';
import type { WahubBoxCounts, WahubContact } from '@/types/wahub';

/** How often the screen asks "what changed?" while its browser tab is in view. */
export const LIVE_INTERVAL_MS = 3000;
/** Away for longer than this, and coming back reads the lists again rather than trusting the gap. */
const RESYNC_AFTER_HIDDEN_MS = 20_000;
/** A list waits this long, at most, for the first cursor before it loads without one. */
const READY_TIMEOUT_MS = 1500;

export interface LiveBatch {
  contacts: WahubContact[];
}

/** Where the live update stood at some moment. Hand it back to `rewind` to hear everything since. */
export interface LiveSnapshot {
  cursor: string | null;
  seq: number;
}

export interface WahubLiveHandle {
  /** Contacts that changed, newest first. Called only when there are some. */
  subscribe(listener: (batch: LiveBatch) => void): () => void;
  /** The screen may have missed changes (long away, or a full batch): read the lists again, quietly. */
  onResync(listener: () => void): () => void;
  snapshot(): LiveSnapshot;
  /**
   * Ask the next poll to start from an earlier cursor.
   *
   * A list that was just read, or a contact that was just saved, shows the
   * server as it was when that request was answered — which may be older than
   * a poll that came back in between. Polling again from the cursor held when
   * the request began delivers every change since, and each is the contact's
   * state now, so applying one twice is harmless.
   */
  rewind(snapshot: LiveSnapshot): void;
  /** Resolves once the first cursor is in hand (or was given up on). */
  whenReady(): Promise<void>;
  /** Something changed that the poll cannot carry (a contact was deleted): every list reads itself again, quietly. */
  resync(): void;
}

export interface WahubLive {
  handle: WahubLiveHandle;
  boxes: WahubBoxCounts | null;
  /** The last poll failed: a small "no connection" strip is shown, and nothing on screen is dropped. */
  offline: boolean;
}

function retryDelay(failures: number): number {
  if (failures <= 1) return LIVE_INTERVAL_MS;
  if (failures === 2) return 5000;
  return 10_000;
}

/**
 * The live update of the whole section: one poll every three seconds while the
 * browser tab is in view, stopped when it is hidden, and run at once on return.
 */
export function useWahubLive(enabled = true): WahubLive {
  const [boxes, setBoxes] = useState<WahubBoxCounts | null>(null);
  const [offline, setOffline] = useState(false);

  const listeners = useRef(new Set<(batch: LiveBatch) => void>());
  const resyncListeners = useRef(new Set<() => void>());
  const cursor = useRef<LiveSnapshot>({ cursor: null, seq: 0 });
  const pendingRewind = useRef<LiveSnapshot | null>(null);
  const ready = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  if (!ready.current) {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    ready.current = { promise, resolve };
  }

  const handle = useMemo<WahubLiveHandle>(
    () => ({
      subscribe(listener) {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
      onResync(listener) {
        resyncListeners.current.add(listener);
        return () => {
          resyncListeners.current.delete(listener);
        };
      },
      snapshot() {
        return cursor.current;
      },
      rewind(snapshot) {
        // Without a cursor the server answers with nothing but a new one, which
        // would skip changes rather than repeat them.
        if (!snapshot.cursor) return;
        const waiting = pendingRewind.current;
        if (!waiting || snapshot.seq < waiting.seq) pendingRewind.current = snapshot;
      },
      resync() {
        resyncListeners.current.forEach((listener) => listener());
      },
      whenReady() {
        return Promise.race([
          ready.current!.promise,
          new Promise<void>((done) => {
            window.setTimeout(done, READY_TIMEOUT_MS);
          }),
        ]);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    let inFlight = false;
    let failures = 0;
    let hiddenAt = document.visibilityState === 'visible' ? 0 : Date.now();
    let first = true;

    const tick = async (): Promise<void> => {
      if (stopped || inFlight) return;
      // The first poll only fetches the cursor, and runs even in a background
      // tab so the lists have a point to count changes from.
      if (!first && document.visibilityState !== 'visible') return;
      first = false;
      inFlight = true;
      const rewound = pendingRewind.current;
      pendingRewind.current = null;
      const from = rewound ?? cursor.current;
      try {
        const data = await fetchWahubUpdates(from.cursor);
        if (stopped) return;
        cursor.current = { cursor: data.cursor || cursor.current.cursor, seq: cursor.current.seq + 1 };
        failures = 0;
        setOffline(false);
        setBoxes((prev) => (sameBoxCounts(prev, data.boxes) ? prev : data.boxes));
        if (data.contacts.length) {
          const batch: LiveBatch = { contacts: data.contacts };
          listeners.current.forEach((listener) => listener(batch));
          // A full batch may have left changes out; only a fresh read is sure.
          if (isBatchTruncated(data.contacts)) resyncListeners.current.forEach((listener) => listener());
        }
      } catch {
        if (stopped) return;
        failures += 1;
        setOffline(true);
        // The rewind was not served; keep it for the next attempt (unless an
        // earlier one was asked for while this request was out).
        const waiting = pendingRewind.current as LiveSnapshot | null;
        if (rewound && (!waiting || rewound.seq < waiting.seq)) pendingRewind.current = rewound;
      } finally {
        inFlight = false;
        ready.current?.resolve();
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      // Hidden: nothing is scheduled. Coming back into view starts it again.
      if (stopped || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(run, retryDelay(failures));
    };

    const run = async () => {
      await tick();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        hiddenAt = Date.now();
        window.clearTimeout(timer);
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away > RESYNC_AFTER_HIDDEN_MS) resyncListeners.current.forEach((listener) => listener());
      void run();
    };

    const onOnline = () => {
      failures = 0;
      void run();
    };

    void run();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled]);

  return { handle, boxes, offline };
}
