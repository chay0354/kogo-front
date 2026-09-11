import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import type { StatusTone } from './tenancyUtils';
import styles from './rentals.module.css';

/**
 * The chips the tenants view and its dialogs share, so a tenancy's status and
 * a contract version's read in one set of colours wherever they appear.
 */

const TONE_CLASS: Record<StatusTone, string> = {
  ok: theme.tagOk,
  progress: styles.toneProgress,
  signed: theme.tagType,
  off: theme.tagOff,
  bad: theme.tagLow,
};

/** A status in its tone's colours. */
export function ToneChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`${theme.tag} ${TONE_CLASS[tone]}`}>{children}</span>;
}

/**
 * The version on file no longer matches the agreement. The title says why on
 * hover; a screen reader reads no titles, so the same words sit in the text.
 */
export function StaleChip({ title }: { title: string }) {
  return (
    <span className={styles.staleChip} title={title}>
      <AlertTriangle size={12} aria-hidden="true" />
      לא תואם להסכם
      <span className={styles.srOnly}> — {title}</span>
    </span>
  );
}
