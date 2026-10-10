'use client';

import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
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

interface ContactStatusBlockProps {
  contact: WahubContact;
  now: Date;
  shadow?: { count: number; lastAt: string | null } | null;
  /** Open from the start (tests, a wide pane). The panel keeps it folded. */
  defaultOpen?: boolean;
}

/**
 * "הצג סטטוסים": one button; a press opens the main state (who answers) and
 * under it the small states, grouped for the bot, the person and the
 * conversation. Compact, not a flat list (owner, 10.10).
 */
export default function ContactStatusBlock({ contact, now, shadow, defaultOpen = false }: ContactStatusBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const statuses = contactStatuses(contact, now, shadow);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cx(s.btn, s.btnSm)}>
        <ListChecks aria-hidden="true" />
        {open ? 'הסתר סטטוסים' : 'הצג סטטוסים'}
        <ChevronDown className={cx('transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-2" role="region" aria-label="הסטטוסים של השיחה">
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
      )}
    </div>
  );
}
