'use client';

import { contactStatuses, type StatusTone } from '@/lib/wahub/bot';
import type { WahubContact } from '@/types/wahub';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: '',
  danger: s.badText,
  warning: s.warnText,
  success: s.goodText,
  muted: s.muted,
};

interface ContactStatusListProps {
  contact: WahubContact;
  now: Date;
  shadow?: { count: number; lastAt: string | null } | null;
}

/**
 * The statuses of a conversation: the main state (who answers) and under it the
 * small states, grouped for the bot, the person and the conversation. Compact,
 * not a flat list (owner, 10.10). The contact's card shows it under its folded
 * "סטטוסים" title.
 */
export function ContactStatusList({ contact, now, shadow }: ContactStatusListProps) {
  const statuses = contactStatuses(contact, now, shadow);
  return (
    <div role="region" aria-label="הסטטוסים של השיחה">
      <div className={s.stPrimary}>
        <span>{statuses.primary.label}</span>
        <span className={cx(TONE_CLASS[statuses.primary.tone], 'font-extrabold')}>{statuses.primary.value}</span>
      </div>
      {statuses.groups.map((group) => (
        <section key={group.title} className={s.stGroup} aria-label={group.title}>
          <h5>{group.title}</h5>
          <dl className="m-0">
            {group.rows.map((row) => (
              <div key={row.label} className={s.stRow}>
                <dt>{row.label}</dt>
                <dd className={TONE_CLASS[row.tone]} dir="auto">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
