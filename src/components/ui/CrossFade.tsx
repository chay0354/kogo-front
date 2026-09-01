'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './CrossFade.module.css';
import { DIALOG_EXIT_MS, prefersReducedMotion } from './motion';

interface Props {
  /**
   * What is on screen right now — typically the loading flag read as a word.
   * A change here is what starts the dissolve.
   */
  swapKey: string;
  className?: string;
  children: ReactNode;
}

/**
 * Dissolves one thing into another in place.
 *
 * A skeleton disappearing in the same frame its content appears is the
 * hardest cut in the office screens, because the whole block changes at once.
 * Holding the placeholder for the length of a fade turns it into a handover.
 *
 * Reduced motion never keeps the outgoing copy, so the swap is the plain one.
 */
export default function CrossFade({ swapKey, className = '', children }: Props) {
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [shownKey, setShownKey] = useState(swapKey);
  const latest = useRef<{ key: string; node: ReactNode }>({ key: swapKey, node: children });

  // Adjusting state while rendering, so the handover starts in the same frame
  // the swap does and nothing is ever shown twice.
  if (shownKey !== swapKey) {
    setLeaving(prefersReducedMotion() ? null : latest.current);
    setShownKey(swapKey);
  }
  latest.current = { key: swapKey, node: children };

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), DIALOG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  return (
    <div className={`${styles.stack} ${className}`}>
      {leaving && (
        <div key={`leaving-${leaving.key}`} className={styles.leaving} aria-hidden="true">
          {leaving.node}
        </div>
      )}
      <div key={swapKey} className={styles.entering}>
        {children}
      </div>
    </div>
  );
}
