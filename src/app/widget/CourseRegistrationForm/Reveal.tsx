'use client';

import { useEffect, useState } from 'react';
import styles from './newLook.module.css';

interface Props {
  open: boolean;
  children: React.ReactNode;
  /** Room above what opens, so a closed block takes no space at all. */
  gap?: 16 | 20;
  /**
   * A fold: a part that was on show closes and opens again. What is inside does
   * not play its entrance when it opens — the fields were already there.
   */
  fold?: boolean;
}

/**
 * A part of the form that opens by its own height, and closes the same way.
 * What is inside stays mounted while closed, so nothing typed is lost.
 */
export default function Reveal({ open, children, gap, fold = false }: Props) {
  // Clipped while it moves; once open, focus rings and popups may reach outside.
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettled(true), 640);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      className={`${styles.reveal}${open ? ` ${fold ? styles.foldOpen : styles.revealOpen}` : ''}${open && settled ? ` ${styles.revealSettled}` : ''}`}
      // Closed, its fields are out of reach of the keyboard and of screen readers too.
      {...(open ? {} : { inert: '' as unknown as boolean, 'aria-hidden': true })}
    >
      <div className={styles.revealIn}>
        <div className={gap === 20 ? styles.gap20 : gap === 16 ? styles.gap16 : undefined}>{children}</div>
      </div>
    </div>
  );
}
