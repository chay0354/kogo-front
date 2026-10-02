'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './newLook.module.css';
import { TRIAL_INFO_LABEL, trialInfoLines, trialInfoOpenAfter } from './trialInfoCopy';

interface Props {
  /** The trial costs money: the explanation also says the cost comes off the first payment. */
  paid: boolean;
  /** Open from the start. For a first render only; the parent's presses take over. */
  defaultOpen?: boolean;
}

/**
 * A small dotted line where a trial registration is approved. A press opens a
 * short explanation, the same way the yearly fee explains itself on the
 * payment summary; a press anywhere else closes it.
 */
export default function TrialInfo({ paid, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const lineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!lineRef.current?.contains(event.target as Node)) setOpen((now) => trialInfoOpenAfter(now, 'elsewhere'));
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={styles.infoLine} ref={lineRef}>
      <button
        type="button"
        className={styles.infoLink}
        aria-expanded={open}
        onClick={() => setOpen((now) => trialInfoOpenAfter(now, 'line'))}
      >
        {TRIAL_INFO_LABEL}
      </button>
      {open ? (
        <div className={styles.infoPop} role="note">
          {trialInfoLines(paid).map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : null}
    </div>
  );
}
