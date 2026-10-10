'use client';

import { memo, useState } from 'react';
import { MessageCircle, MessagesSquare } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/customerUtils';
import { followupDueLine } from '@/lib/wahub/followup';
import { displayName, formatDateTime, formatShortDate, hasName, previewText } from '@/lib/wahub/format';
import type { WahubContact, WahubFollowupPatch, WahubTag } from '@/types/wahub';
import { ContactAvatar, Pill } from '../shared/bits';
import { FollowupMarks, KnownBox, NoteField, OutcomeChip, TagPicker } from '../shared/ContactParts';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

interface LeadCardProps {
  contact: WahubContact;
  today: string;
  now: Date;
  allTags: WahubTag[];
  onFollowup: (id: number, patch: WahubFollowupPatch) => void;
  onTags: (id: number, tags: WahubTag[]) => void;
  onOpenChat: (id: number) => void;
}

const DUE_PILL = { danger: 'danger', warning: 'warning', info: 'primary' } as const;

/**
 * One lead: who, when, what the system knows, and the office's own marks.
 *
 * The card never moves when it is marked. It is swapped in place with what the
 * server saved, and stays where it stands until the view is changed.
 */
const LeadCard = memo(function LeadCard({
  contact,
  today,
  now,
  allTags,
  onFollowup,
  onTags,
  onOpenChat,
}: LeadCardProps) {
  const [open, setOpen] = useState(false);
  const { known, followup } = contact;
  const whatsapp = formatWhatsAppLink(contact.phone);
  const quote = previewText(contact.last_message);
  const long = quote.length > 140;
  const dueLine = followupDueLine(followup, today, now);
  const branch = known.branch_name || known.city;

  return (
    <article className={s.card}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <ContactAvatar contact={contact} size="sm" />
          <h3 className="truncate text-[15px] font-extrabold" dir="auto">
            {hasName(contact) ? displayName(contact) : 'ללא שם'}
          </h3>
          <span dir="ltr" className={cx(s.num, 'select-all text-[13.5px] font-bold')}>
            {contact.phone_display || contact.phone}
          </span>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12.5px] font-bold hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              WhatsApp
            </a>
          )}
        </div>
        <p className={cx(s.t2, 'm-0 shrink-0 font-semibold')}>
          {contact.first_inbound_at ? `פנה לראשונה ${formatShortDate(contact.first_inbound_at, now)}` : 'עוד לא כתב לנו'}
          {contact.last_inbound_at ? ` · לאחרונה ${formatDateTime(contact.last_inbound_at, now)}` : ''}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {dueLine && <Pill tone={DUE_PILL[dueLine.tone]}>{dueLine.text}</Pill>}
        {known.topic_label && <Pill tone="primary">{known.topic_label}</Pill>}
        <Pill tone="neutral" wrap>
          {branch || 'לא צוין סניף'}
        </Pill>
        <OutcomeChip contact={contact} />
        {contact.source_label && contact.source !== 'whatsapp' && <Pill tone="gold">{contact.source_label}</Pill>}
      </div>

      {quote && (
        <blockquote className={cx(s.quote, !open && 'line-clamp-2')} dir="auto">
          {quote}
        </blockquote>
      )}
      {long && (
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={cx(s.link, 'mt-1 text-[12.5px]')}>
          {open ? 'פחות' : 'עוד'}
        </button>
      )}

      <div className="mt-3">
        <KnownBox contact={contact} today={today} now={now} />
      </div>

      <div className="mt-3 flex flex-col gap-2.5 pt-3" style={{ borderTop: '1px solid var(--line-2)' }}>
        <NoteField
          contact={contact}
          onSave={(note) => onFollowup(contact.id, { note })}
          rows={(followup.note ?? '').length > 70 ? 2 : 1}
        />
        <FollowupMarks contact={contact} today={today} now={now} onChange={(patch) => onFollowup(contact.id, patch)} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <TagPicker contact={contact} allTags={allTags} onChange={(tags) => onTags(contact.id, tags)} />
          </div>
          <button type="button" onClick={() => onOpenChat(contact.id)} className={cx(s.btn, s.btnP)}>
            <MessagesSquare aria-hidden="true" />
            פתח שיחה
          </button>
        </div>
      </div>
    </article>
  );
});

export default LeadCard;
