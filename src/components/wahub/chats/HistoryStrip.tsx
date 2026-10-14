'use client';

import { History } from 'lucide-react';
import { historyLine, type WahubHistoryNote } from '@/lib/wahub/history';
import h from '../history.module.css';

/**
 * At the head of a conversation from before the switch: the old bot's answers are not here, and where they are —
 * or, once copied from ManyChat, that they stand in the conversation, marked.
 */
export default function HistoryStrip({ note, now }: { note: WahubHistoryNote | null | undefined; now: Date }) {
  const line = historyLine(note, now);
  if (!line) return null;
  return (
    <div className={h.strip} role="note">
      <History aria-hidden="true" />
      <div className={h.body}>
        <span className={h.title}>{line.title}</span>
        <span>{line.text}</span>
        {line.href ? (
          <a className={h.link} href={line.href} target="_blank" rel="noopener noreferrer">
            {line.link} ↗
          </a>
        ) : (
          line.link && <span className={h.quiet}>{line.link}</span>
        )}
      </div>
    </div>
  );
}
