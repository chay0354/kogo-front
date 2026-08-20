import styles from './GroupIdBadge.module.css';
import type { GroupIdBadgeProps } from './GroupIdBadge.types';

export function GroupIdBadge({ displayId, className }: GroupIdBadgeProps) {
  if (displayId === null || displayId === undefined) return null;

  return (
    <span className={className ? `${styles.badge} ${className}` : styles.badge}>
      #{displayId}
    </span>
  );
}
