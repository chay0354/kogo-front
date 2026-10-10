'use client';

import { useState } from 'react';
import { Check, MessageSquare, X } from 'lucide-react';
import { diffChange, kindLabel } from '@/lib/wahub/bot';
import { formatDateTime } from '@/lib/wahub/format';
import type { WahubKnowledgeProposal, WahubProposalStatus } from '@/types/wahub';
import { Pill, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { Fold, WhoMark } from '../shared';

const STATUS_TONE: Record<WahubProposalStatus, 'warning' | 'success' | 'danger' | 'primary'> = {
  pending: 'warning',
  approved: 'primary',
  applied: 'success',
  rejected: 'danger',
};

const STATUS_WORD: Record<WahubProposalStatus, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר',
  applied: 'הוחל על הידע',
  rejected: 'נדחה',
};

interface ProposalCardProps {
  proposal: WahubKnowledgeProposal;
  now: Date;
  busy: boolean;
  /** Folded by default: the title and the pills; the rest on a press. */
  compact?: boolean;
  onApprove?: (note: string) => void;
  onReject?: (note: string) => void;
  onOpenChat?: (contactId: number) => void;
  onOpenItem?: (id: number) => void;
}

/**
 * One proposal to change the bot: the title; "why" folded; the change as
 * before/after a person can read; the evidence folded; and אשר / דחה.
 * Nothing changes the knowledge until אשר is pressed.
 */
export default function ProposalCard({ proposal, now, busy, compact = false, onApprove, onReject, onOpenChat, onOpenItem }: ProposalCardProps) {
  const [open, setOpen] = useState(!compact);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const rows = diffChange(proposal.change?.before, proposal.change?.after);
  const pending = proposal.status === 'pending';
  const kindWord = proposal.change_kind_label || kindLabel(proposal.change?.kind ?? 'fact');
  const changeTitle =
    proposal.change?.action === 'create'
      ? `רשומה חדשה · ${kindWord}`
      : `עדכון רשומה${proposal.change?.item_id ? ` #${proposal.change.item_id}` : ''} · ${kindWord}`;

  return (
    <article className={cx(s.card, 'flex flex-col gap-3')} aria-label={proposal.title}>
      <header className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-start"
        >
          <span className="block text-[14.5px] font-extrabold leading-snug" dir="auto">
            {proposal.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill tone={STATUS_TONE[proposal.status] ?? 'neutral'}>{proposal.status_label || STATUS_WORD[proposal.status] || proposal.status}</Pill>
            <Pill tone="neutral">{proposal.source_label || proposal.source}</Pill>
            {proposal.pattern_label && <Pill tone="muted">{proposal.pattern_label}</Pill>}
            {proposal.contact_name && (
              <span className={cx(s.t2, '!text-[12px] font-bold')} dir="auto">
                {proposal.contact_name}
              </span>
            )}
            <span className={cx(s.t2, s.num, '!text-[11.5px]')}>{formatDateTime(proposal.created_at, now)}</span>
          </span>
        </button>
        {proposal.contact_id != null && onOpenChat && (
          <button type="button" onClick={() => onOpenChat(proposal.contact_id as number)} className={cx(s.btn, s.btnSm)}>
            <MessageSquare aria-hidden="true" />
            לשיחה
          </button>
        )}
      </header>

      {open && (
        <>
          <Fold title="למה" defaultOpen={!compact}>
            <p className="m-0 whitespace-pre-line text-[13.5px] leading-relaxed" dir="auto">
              {proposal.explanation || <span className={s.muted}>לא נרשם הסבר.</span>}
            </p>
          </Fold>

          <section aria-label="השינוי">
            <p className={cx(s.sectTitle, 'mb-1.5 flex flex-wrap items-center gap-2')}>
              {changeTitle}
              {proposal.change?.item_id != null && onOpenItem && (
                <button type="button" onClick={() => onOpenItem(proposal.change.item_id as number)} className={cx(s.link, '!text-[12px]')}>
                  פתח את הרשומה
                </button>
              )}
            </p>
            {rows.length === 0 ? (
              <p className={cx(s.t2, 'm-0')}>אין שדות בשינוי.</p>
            ) : (
              <div className={s.diff}>
                {rows.map((row) => (
                  <div key={row.key} className={s.diffRow}>
                    <span>{row.label}</span>
                    <span className={cx(s.diffBefore, !row.changed && s.diffSame)} dir="auto" aria-label="לפני">
                      {row.before}
                    </span>
                    <span className={cx(s.diffAfter, !row.changed && s.diffSame)} dir="auto" aria-label="אחרי">
                      {row.after}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Fold title="הראיות" count={proposal.evidence?.length ?? 0}>
            {!proposal.evidence?.length ? (
              <p className={cx(s.t2, 'm-0')}>אין הודעות מצורפות.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {proposal.evidence.map((line, index) => (
                  <li key={`${line.message_id ?? 'x'}-${index}`} className={s.evLine}>
                    <WhoMark who={line.who} />
                    <p dir="auto">{line.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Fold>

          {proposal.status !== 'pending' && (proposal.decided_at || proposal.decision_note) && (
            <p className={cx(s.t2, 'm-0 !text-[12.5px]')} dir="auto">
              {STATUS_WORD[proposal.status]}
              {proposal.decided_by_name ? ` · ${proposal.decided_by_name}` : ''}
              {proposal.decided_at ? ` · ${formatDateTime(proposal.decided_at, now)}` : ''}
              {proposal.decision_note ? ` · “${proposal.decision_note}”` : ''}
            </p>
          )}

          {pending && (onApprove || onReject) && (
            <div className="flex flex-col gap-2">
              {rejecting ? (
                <div className={cx(s.confirm, s.confirmBad, 'flex flex-col gap-2')}>
                  <p className="m-0">
                    <strong className="font-extrabold">למה לדחות?</strong> ההערה נשמרת עם ההצעה.
                  </p>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} autoFocus aria-label="הערת דחייה" className={s.field} />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !note.trim()} onClick={() => onReject?.(note)} className={cx(s.btn, s.btnSm, s.btnBad)}>
                      {busy && <Spinner className="h-3.5 w-3.5" />}
                      דחה
                    </button>
                    <button type="button" onClick={() => setRejecting(false)} disabled={busy} className={cx(s.btn, s.btnSm)}>
                      חזרה
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy || !onApprove} onClick={() => onApprove?.('')} className={cx(s.btn, s.btnP)}>
                    {busy ? <Spinner /> : <Check aria-hidden="true" />}
                    אשר
                  </button>
                  <button type="button" disabled={busy || !onReject} onClick={() => setRejecting(true)} className={s.btn}>
                    <X aria-hidden="true" />
                    דחה
                  </button>
                  <span className={cx(s.t2, '!text-[12px]')}>אשר = הידע משתנה עכשיו. לא נשלח כלום ללקוח.</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
