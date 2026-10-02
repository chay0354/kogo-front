'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './newLook.module.css';
import { TRIAL_INFO_LABEL, trialInfoArrow, trialInfoLines, trialInfoOpenAfter } from './trialInfoCopy';

interface Props {
  /** The trial costs money: the explanation also says the cost comes off the first payment. */
  paid: boolean;
  /** Open from the start. For a first render only; the parent's presses take over. */
  defaultOpen?: boolean;
  /** What the same line says before "worth knowing" — the consent to the terms, on the free trial's summary. */
  children?: React.ReactNode;
}

/**
 * Two dotted words where a trial registration is approved. A press opens a
 * short explanation, the same way the yearly fee explains itself on the
 * payment summary; a press anywhere else closes it. The explanation opens
 * upwards, so it never covers the button that approves.
 */
export default function TrialInfo({ paid, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [arrow, setArrow] = useState<number | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wordsRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen((now) => trialInfoOpenAfter(now, 'elsewhere'));
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const press = () => {
    const line = lineRef.current?.getBoundingClientRect();
    const words = wordsRef.current?.getBoundingClientRect();
    // The explanation is as wide as the line, up to 300, and hangs 4 past its right edge.
    if (line && words) setArrow(trialInfoArrow(line.right + 4, Math.min(300, line.width), words.left, words.width));
    setOpen((now) => trialInfoOpenAfter(now, 'line'));
  };

  return (
    <div className={styles.infoLine} ref={lineRef}>
      {children}
      <button ref={wordsRef} type="button" className={styles.infoLink} aria-expanded={open} onClick={press}>
        {TRIAL_INFO_LABEL}
      </button>
      {open ? (
        <div
          ref={popRef}
          className={styles.infoPop}
          role="note"
          style={arrow === null ? undefined : ({ '--arrow': `${arrow}px` } as React.CSSProperties)}
        >
          {trialInfoLines(paid).map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
    </div>
  );
}
