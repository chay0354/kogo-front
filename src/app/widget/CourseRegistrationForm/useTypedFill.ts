'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../widgetMotion';

export interface FillStep {
  key: string;
  text: string;
}

export interface FieldFill {
  /** How much of the hidden value is on show. Undefined: all of it (no fill running). */
  shown: string | undefined;
  filling: boolean;
  /** The value is in and ticked. */
  settled: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The form filling itself in front of the parent: each hidden value types in,
 * field after field, and gets its tick. Purely a show — what is typed is the
 * hidden value the server sent, never a real detail.
 *
 * A new `runKey` starts over; null steps mean nothing is being filled.
 */
export function useTypedFill(
  steps: FillStep[] | null,
  runKey: string,
  onField?: (key: string) => void,
  onDone?: () => void,
): (key: string) => FieldFill {
  const [shown, setShown] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const callbacks = useRef({ onField, onDone });
  callbacks.current = { onField, onDone };
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    const list = stepsRef.current;
    if (!list || list.length === 0) {
      setShown({});
      setActive(null);
      setRunning(false);
      return undefined;
    }
    if (prefersReducedMotion()) {
      setShown(Object.fromEntries(list.map((step) => [step.key, step.text])));
      setActive(null);
      setRunning(false);
      callbacks.current.onDone?.();
      return undefined;
    }
    let cancelled = false;
    setShown({});
    setActive(null);
    setRunning(true);
    const run = async () => {
      // The fields are still opening.
      await sleep(820);
      for (const step of list) {
        if (cancelled) return;
        setActive(step.key);
        callbacks.current.onField?.(step.key);
        const each = Math.max(18, Math.min(42, 280 / Math.max(1, step.text.length)));
        let text = '';
        for (const char of step.text) {
          if (cancelled) return;
          text += char;
          const upTo = text;
          setShown((prev) => ({ ...prev, [step.key]: upTo }));
          await sleep(each);
        }
        if (cancelled) return;
        setActive(null);
        await sleep(110);
      }
      if (cancelled) return;
      setRunning(false);
      callbacks.current.onDone?.();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [runKey]);

  return (key: string) => {
    const step = stepsRef.current?.find((item) => item.key === key);
    // Not one of the fields being filled: it shows whatever it holds.
    if (!step || (!running && !(key in shown))) return { shown: undefined, filling: false, settled: true };
    const text = shown[key] ?? '';
    return { shown: text, filling: active === key, settled: active !== key && text === step.text };
  };
}
