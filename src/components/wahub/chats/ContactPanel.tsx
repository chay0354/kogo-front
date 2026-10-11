'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Hand, MessageCircle, Pencil, Undo2, X } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/customerUtils';
import { displayName, formatShortDate, hasName } from '@/lib/wahub/format';
import type { WahubContactDetail, WahubFollowupPatch, WahubTag } from '@/types/wahub';
import { ContactAvatar, PanelSection, Pill, Spinner } from '../shared/bits';
import { EventsLog, FollowupMarks, KnownBox, KogoBox, NoteField, TagPicker } from '../shared/ContactParts';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import ContactStatusBlock from './ContactStatusBlock';
import LiveTestBlock from './LiveTestBlock';
import ServiceNoteBox from './ServiceNoteBox';

interface ContactPanelProps {
  contact: WahubContactDetail;
  now: Date;
  today: string;
  allTags: WahubTag[];
  analyzing: boolean;
  rechecking: boolean;
  /** The pane stands alone on screen (narrow layouts) and needs a way back to the conversation. */
  showBack: boolean;
  onBack: () => void;
  onFollowup: (patch: WahubFollowupPatch) => void;
  onTags: (tags: WahubTag[]) => void;
  onRename: (name: string) => void;
  onRecheck: () => void;
  onAnalyze: () => void;
  /** Stage 2: how many shadow proposals this conversation has, and when the last one was. */
  shadow?: { count: number; lastAt: string | null } | null;
  /**
   * The conversation's own actions, when the panel stands in for it (a phone,
   * a tablet): take the conversation or hand it back, and "טופל". A wide
   * screen keeps them in the conversation's header and passes nothing.
   */
  actions?: ContactPanelActions;
  /**
   * "בדיקה חיה" (docs/WAHUB-CONTRACT-LIVE-TEST.md): passed only for a real
   * contact, on a server that knows the live test. A manager gets the switch;
   * anyone else only sees that it is on.
   */
  liveTest?: ContactPanelLiveTest;
}

export interface ContactPanelLiveTest {
  canEdit: boolean;
  busy: boolean;
  onToggle: (on: boolean) => void;
}

export interface ContactPanelActions {
  handoverBusy: boolean;
  resolveBusy: boolean;
  onTakeover: () => void;
  onRelease: () => void;
  onResolveNeedsHuman: () => void;
}

function NameLine({ contact, onRename }: { contact: WahubContactDetail; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(contact.name ?? '');

  useEffect(() => {
    setEditing(false);
    setValue(contact.name ?? '');
  }, [contact.id, contact.name]);

  function save() {
    const clean = value.trim();
    setEditing(false);
    if (clean !== (contact.name ?? '').trim()) onRename(clean);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') {
              setEditing(false);
              setValue(contact.name ?? '');
            }
          }}
          aria-label="שם איש הקשר"
          maxLength={120}
          autoFocus
          className={cx(s.field, s.fieldSm, '!w-full')}
        />
        <button type="button" onClick={save} aria-label="שמור שם" className={cx(s.ib, s.ibSm)}>
          <Check aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(contact.name ?? '');
          }}
          aria-label="בטל עריכה"
          className={cx(s.ib, s.ibSm)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <h3 className="min-w-0 truncate text-[18px] font-black" dir="auto">
        {hasName(contact) ? displayName(contact) : 'ללא שם'}
      </h3>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="ערוך שם"
        title="ערוך שם"
        className={cx(s.ib, s.ibSm)}
      >
        <Pencil aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The left-hand column: everything about the person in the conversation.
 * What the system knows and what the office marked are kept in separate boxes.
 */
export default function ContactPanel({
  contact,
  now,
  today,
  allTags,
  analyzing,
  rechecking,
  showBack,
  onBack,
  onFollowup,
  onTags,
  onRename,
  onRecheck,
  onAnalyze,
  shadow = null,
  actions,
  liveTest,
}: ContactPanelProps) {
  const human = contact.chat.handled_by === 'human';
  const whatsapp = formatWhatsAppLink(contact.phone);

  return (
    // Positioned, so the hidden labels inside (sr-only, absolute) stay inside the scroller: left to the page they
    // stretched it by a line below the screen on a phone.
    <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {showBack && (
        <div className={cx(s.paneHead, s.detailsHead, 'sticky top-0 z-10 flex items-center gap-2')} style={{ background: 'var(--surface)' }}>
          <button type="button" onClick={onBack} aria-label="חזרה לשיחה" title="חזרה לשיחה" className={s.ib}>
            <ArrowRight aria-hidden="true" />
          </button>
          <span className={cx(s.t1, 'truncate')}>פרטי איש הקשר</span>
        </div>
      )}

      <div className={cx(s.sect, 'flex items-center gap-3')}>
        <ContactAvatar contact={contact} size="lg" />
        <div className="min-w-0 flex-1">
          <NameLine contact={contact} onRename={onRename} />
          <p dir="ltr" className={cx(s.t2, s.num, 'm-0 select-all text-end !text-[12.5px]')}>
            {contact.phone_display || contact.phone}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {contact.source_label && <Pill tone="neutral">{contact.source_label}</Pill>}
            {contact.first_inbound_at && (
              <span className={cx(s.t2, '!text-[11px]')}>פנה לראשונה {formatShortDate(contact.first_inbound_at, now)}</span>
            )}
            <span className={cx(s.t2, '!text-[11px]')}>{contact.messages_count.toLocaleString('he-IL')} הודעות</span>
          </div>
        </div>
      </div>

      {/* Standing in for the conversation: its actions and the way to WhatsApp are here too. */}
      {actions && (
        <div className={cx(s.sect, 'flex flex-wrap items-center gap-2')} role="group" aria-label="פעולות על השיחה">
          {human ? (
            <button type="button" onClick={actions.onRelease} disabled={actions.handoverBusy} className={cx(s.btn, s.btnSm)}>
              {actions.handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Undo2 aria-hidden="true" />}
              החזר לבוט
            </button>
          ) : (
            <button type="button" onClick={actions.onTakeover} disabled={actions.handoverBusy} className={cx(s.btn, s.btnSm, s.btnP)}>
              {actions.handoverBusy ? <Spinner className="h-3.5 w-3.5" /> : <Hand aria-hidden="true" />}
              קח שיחה
            </button>
          )}
          {contact.chat.needs_human && (
            <button
              type="button"
              onClick={actions.onResolveNeedsHuman}
              disabled={actions.resolveBusy}
              className={cx(s.btn, s.btnSm, s.btnBad)}
            >
              {actions.resolveBusy ? <Spinner className="h-3.5 w-3.5" /> : <Check aria-hidden="true" />}
              טופל
            </button>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cx(s.btn, s.btnSm, 'ms-auto')}>
              <MessageCircle aria-hidden="true" />
              WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Titles first (owner, 10.10): the statuses open on a press; "הבוט טעה כאן" opens a short box. */}
      <div className={cx(s.sect, 'flex flex-col gap-2')}>
        <ContactStatusBlock contact={contact} now={now} shadow={shadow} />
        <ServiceNoteBox contactId={contact.id} />
        {liveTest && (
          <LiveTestBlock
            contact={contact}
            canEdit={liveTest.canEdit}
            busy={liveTest.busy}
            onToggle={liveTest.onToggle}
          />
        )}
      </div>

      <div className={s.sect}>
        <KnownBox contact={contact} today={today} now={now} onAnalyze={onAnalyze} analyzing={analyzing} />
      </div>

      <PanelSection title="במערכת">
        <KogoBox contact={contact} now={now} onRecheck={onRecheck} rechecking={rechecking} />
      </PanelSection>

      <PanelSection title="סימון מעקב">
        <FollowupMarks contact={contact} today={today} now={now} onChange={onFollowup} showBy />
      </PanelSection>

      <PanelSection title="מידע חדש">
        <NoteField contact={contact} onSave={(note) => onFollowup({ note })} rows={3} />
      </PanelSection>

      <PanelSection title="תגיות">
        <TagPicker contact={contact} allTags={allTags} onChange={onTags} />
      </PanelSection>

      <section className={s.sect}>
        <EventsLog events={contact.events ?? []} now={now} />
      </section>
    </div>
  );
}
