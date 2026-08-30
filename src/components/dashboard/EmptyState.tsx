'use client';

import styles from './EmptyState.module.css';

interface Props {
  /** Short title, e.g. the widget name. */
  title: string;
  /** Why it is empty. Defaults to the "waiting for backend data" message. */
  reason?: string;
  /** Optional emoji/icon shown above the title. */
  icon?: string;
  /** When true, renders a compact inline variant instead of a full card. */
  inline?: boolean;
}

/**
 * Placeholder shown where the v5 mockup has a widget whose data does not yet
 * exist in the API. The structure and styling are final; Stage 2 only needs to
 * replace this with the real numbers. Never renders fabricated values.
 */
export default function EmptyState({
  title,
  reason = 'הנתונים יתווספו בשלב הבא — המבנה מוכן',
  icon = '⏳',
  inline = false,
}: Props) {
  return (
    <div className={inline ? styles.inline : styles.card} role="status">
      <div className={styles.icon} aria-hidden>
        {icon}
      </div>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.reason}>{reason}</p>
      </div>
      <span className={styles.badge}>ממתין לנתונים</span>
    </div>
  );
}
