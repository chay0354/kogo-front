'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarClock, Check, ChevronDown, Hand, MessageCircle, PanelLeftClose, Pencil, Undo2, X } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/customerUtils';
import { isDemoContact } from '@/lib/wahub/demo';
import { callbackLine } from '@/lib/wahub/followup';
import { displayName, formatShortDate, hasName } from '@/lib/wahub/format';
import { futureOf, knowsFutureLeads, waitingOf } from '@/lib/wahub/futureLeads';
import { knownHeadline, leadOf } from '@/lib/wahub/leadStage';
import type { WahubContactDetail, WahubFollowupPatch, WahubTag } from '@/types/wahub';
import { LeadStateBlock } from '../leads/LeadBits';
import { ContactAvatar, DemoTag, LiveTestTag, Pill, Spinner } from '../shared/bits';
import { EventsList, FollowupMarks, KnownBox, KogoBox, NoteField, TagPicker } from '../shared/ContactParts';
import { Fold } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';
import { ContactStatusList } from './ContactStatusBlock';
import LiveTestBlock from './LiveTestBlock';
import { NoteList, WaitingCardMark } from './Notes';

/**
 * The sections of the card that open on a press, in the order they stand
 * (docs/WAHUB-CONTRACT-LAYOUT.md, ב.6).
 */
export type CardFold = 'known' | 'tags' | 'notes' | 'statuses' | 'history' | 'liveTest';

interface ContactPanelProps {
  contact: WahubContactDetail;
  now: Date;
  today: string;
  allTags: WahubTag[];
  analyzing: boolean;
  rechecking: boolean;
  /** The card stands alone on screen (a phone) or lies over the conversation (a drawer) and needs a way back. */
  showBack: boolean;
  onBack: () => void;
  /**
   * "הסתר כרטיס": the card stands beside the conversation on a desktop and can be put away, so the
   * conversation has its room (docs/WAHUB-CONTRACT-POLISH-1.md, א). Absent on a tablet and a phone.
   */
  onHide?: () => void;
  onFollowup: (patch: WahubFollowupPatch) => void;
  onTags: (tags: WahubTag[]) => void;
  onRename: (name: string) => void;
  onRecheck: () => void;
  onAnalyze: () => void;
  /** Stage 2: how many shadow proposals this conversation has, and when the last one was. */
  shadow?: { count: number; lastAt: string | null } | null;
  /**
   * The conversation's own actions — take it or hand it back, and "טופל" — as
   * one row of the card. The conversations tab passes them at every width.
   */
  actions?: ContactPanelActions;
  /**
   * "בדיקה חיה" (docs/WAHUB-CONTRACT-LIVE-TEST.md): passed only for a real
   * contact, on a server that knows the live test. A manager gets the switch;
   * anyone else only sees that it is on.
   */
  liveTest?: ContactPanelLiveTest;
  /** Sections open from the start. The card opens with every one of them folded. */
  defaultOpen?: CardFold[];
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
      <div className={cx(s.cardNameRow, 'flex items-center gap-1.5')}>
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
    <div className={cx(s.cardNameRow, 'flex items-center gap-1')}>
      <h3 className={cx(s.cardName, 'min-w-0 truncate')} dir="auto">
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

/** A section that is always open: a small title, and its content under it. */
function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={s.sect} aria-label={title}>
      <h4 className={cx(s.sectTitle, s.cardTitle)}>{title}</h4>
      {children}
    </section>
  );
}

/**
 * A section that opens on a press: its title, a number or a word beside it,
 * and the content only once it is asked for ("כותרת קודם, פרטים בלחיצה").
 */
function CardFoldSection({
  title,
  count,
  hint,
  hintTone,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Shown in brackets after the title. */
  count?: number;
  /** A word or a short line beside the title, so a folded section still says what is in it. */
  hint?: string;
  hintTone?: 'warn';
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <section className={cx(s.sect, s.fold, open && s.foldOpen)} aria-label={title}>
      <h4 className="m-0">
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={s.foldHead}>
          <span className={s.foldTitle}>
            {title}
            {count !== undefined && <span className={cx(s.num, s.foldCount)}>({count})</span>}
          </span>
          {hint && (
            <span className={cx(s.foldHint, hintTone === 'warn' && s.warnText)} dir="auto">
              {hint}
            </span>
          )}
          <ChevronDown className={s.foldChevron} aria-hidden="true" />
        </button>
      </h4>
      {/* It opens by growing, and closes the same way: what is under it slides, it does not jump. */}
      <Fold open={open} id={panelId} innerClassName={s.foldBody}>
        {children}
      </Fold>
    </section>
  );
}

/**
 * "מצב" on a server that has no lead state yet: what is known, in short — the
 * summary cut to a few lines, and the day he asked to be called back.
 */
function KnownShort({ contact, today, now }: { contact: WahubContactDetail; today: string; now: Date }) {
  const headline = knownHeadline(contact.known);
  const callback = callbackLine(contact.known.callback_on, today, now);
  return (
    <div className={s.stateBox}>
      <p className={s.stateCaption}>מה ידוע</p>
      <p className={cx(s.stateWhy, s.stateClamp, !headline && s.muted)} dir="auto">
        {headline || 'עוד אין מידע על הפנייה הזו.'}
      </p>
      {callback && (
        <p className="m-0 mt-2">
          <Pill tone={callback.due ? 'danger' : 'primary'}>
            <CalendarClock aria-hidden="true" />
            {callback.text}
          </Pill>
        </p>
      )}
    </div>
  );
}

/**
 * The contact's card, in one fixed order (docs/WAHUB-CONTRACT-LAYOUT.md, ב):
 * who — the state and what to do — the actions — what Kogo knows — the
 * office's follow-up mark — and under them the sections that open on a press.
 * The same order beside the conversation on a desktop and on a phone's details screen.
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
  onHide,
  onFollowup,
  onTags,
  onRename,
  onRecheck,
  onAnalyze,
  shadow = null,
  actions,
  liveTest,
  defaultOpen,
}: ContactPanelProps) {
  const human = contact.chat.handled_by === 'human';
  const whatsapp = formatWhatsAppLink(contact.phone);
  const lead = leadOf(contact);
  const demo = isDemoContact(contact);
  const liveOn = contact.live_test === true;
  const tags = contact.tags ?? [];
  const events = contact.events ?? [];
  const note = (contact.followup.note ?? '').trim();
  // Future leads, notes and the waiting list (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ה) — only where the server knows them.
  const knows = knowsFutureLeads(contact);
  const future = knows ? futureOf(contact) : null;
  const waitingList = waitingOf(contact);
  const notes = knows ? contact.notes : undefined;
  // A future lead a person holds is handed back from its own chip, at the head of the conversation: the plain
  // hand-back would leave the mark standing.
  const offerHandover = !(future && human);
  // "טופל" is the ✓ of the conversation's title row where there is one.
  const offerResolve = contact.chat.needs_human && !knows;

  const [open, setOpen] = useState<ReadonlySet<CardFold>>(() => new Set(defaultOpen ?? []));
  // Another person: the card is tidy again, every section folded.
  const [shownId, setShownId] = useState(contact.id);
  if (shownId !== contact.id) {
    setShownId(contact.id);
    setOpen(new Set(defaultOpen ?? []));
  }
  const toggle = (key: CardFold) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    // Positioned, so the hidden labels inside (sr-only, absolute) stay inside the scroller: left to the page they
    // stretched it by a line below the screen on a phone.
    <div className={cx(s.contactCard, 'relative min-h-0 flex-1 overflow-y-auto overscroll-contain')}>
      {showBack && (
        <div className={cx(s.paneHead, s.detailsHead, 'sticky top-0 z-10 flex items-center gap-2')} style={{ background: 'var(--surface)' }}>
          <button type="button" onClick={onBack} aria-label="חזרה לשיחה" title="חזרה לשיחה" className={s.ib}>
            <ArrowRight aria-hidden="true" />
          </button>
          <span className={cx(s.t1, 'truncate')}>פרטי איש הקשר</span>
        </div>
      )}

      {/* 1. Who. */}
      <section className={cx(s.sect, s.cardWho, onHide && s.cardWhoHide)} aria-label="מי">
        <ContactAvatar contact={contact} size="lg" />
        <div className="min-w-0 flex-1">
          <NameLine contact={contact} onRename={onRename} />
          <p className={cx(s.cardPhone, 'm-0 flex flex-wrap items-center gap-x-3 gap-y-0.5')}>
            <span dir="ltr" className={cx(s.num, 'select-all')}>
              {contact.phone_display || contact.phone}
            </span>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                WhatsApp
              </a>
            )}
          </p>
          {(demo || liveOn) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {demo && <DemoTag />}
              {liveOn && <LiveTestTag />}
            </div>
          )}
        </div>
        {/* At the head of the card, in its corner: one small button puts it away. Its words show where the card has
            room for them; the name's line keeps clear of it. */}
        {onHide && (
          <button type="button" onClick={onHide} aria-label="הסתר כרטיס" title="הסתר את הכרטיס" className={s.cardHide}>
            <PanelLeftClose aria-hidden="true" />
            <span>הסתר כרטיס</span>
          </button>
        )}
      </section>

      {/* 2. The state — "הכיוון": where this person stands, why, and what to do. */}
      <CardSection title="מצב">
        {lead ? (
          <LeadStateBlock lead={lead} needsHuman={contact.chat.needs_human} now={now} />
        ) : (
          <KnownShort contact={contact} today={today} now={now} />
        )}
        {/* The waiting list: quiet while they wait, standing out once a place was freed. */}
        {waitingList && <WaitingCardMark mark={waitingList} />}
      </CardSection>

      {/* 3. The actions, in one row. */}
      {actions && (offerHandover || offerResolve) && (
        <CardSection title="פעולות">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="פעולות על השיחה">
            {!offerHandover ? null : human ? (
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
            {offerResolve && (
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
          </div>
        </CardSection>
      )}

      {/* 4. In Kogo: registered or not, where, the children, the way to the customer's card. */}
      <CardSection title="במערכת">
        <KogoBox contact={contact} now={now} onRecheck={onRecheck} rechecking={rechecking} />
      </CardSection>

      {/* 5. The office's own mark. */}
      <CardSection title="מעקב">
        <FollowupMarks contact={contact} today={today} now={now} onChange={onFollowup} showBy compact />
      </CardSection>

      {/* 6. A title each; the details are a press away. */}
      <CardFoldSection title="מה ידוע" open={open.has('known')} onToggle={() => toggle('known')}>
        <KnownBox contact={contact} today={today} now={now} onAnalyze={onAnalyze} analyzing={analyzing} bare />
      </CardFoldSection>

      <CardFoldSection title="תגיות" count={tags.length} open={open.has('tags')} onToggle={() => toggle('tags')}>
        <TagPicker contact={contact} allTags={allTags} onChange={onTags} />
      </CardFoldSection>

      {knows ? (
        // The notes about the customer, newest first. They are written beside the writing box, while talking;
        // here they are read. What was typed in the old "הערות" box is still shown — unless it is the reason of
        // a future lead, which its chip already says.
        <CardFoldSection title="פתקים" count={notes?.length} open={open.has('notes')} onToggle={() => toggle('notes')}>
          <NoteList notes={notes ?? []} now={now} empty={note && !future ? undefined : 'עוד אין פתקים. כותבים פתק מהכפתור שליד תיבת ההודעה.'} />
          {note && !future && (
            <p className={cx(s.t2, notes?.length ? 'm-0 mt-2.5' : 'm-0')} dir="auto">
              הערה קודמת: {note}
            </p>
          )}
        </CardFoldSection>
      ) : (
        <CardFoldSection title="הערות" hint={note || undefined} open={open.has('notes')} onToggle={() => toggle('notes')}>
          <NoteField contact={contact} onSave={(text) => onFollowup({ note: text })} rows={3} />
        </CardFoldSection>
      )}

      <CardFoldSection title="סטטוסים" open={open.has('statuses')} onToggle={() => toggle('statuses')}>
        <ContactStatusList contact={contact} now={now} shadow={shadow} />
        <p className={cx(s.t2, 'm-0 mt-2.5')}>
          {[
            contact.source_label,
            contact.first_inbound_at ? `פנה לראשונה ${formatShortDate(contact.first_inbound_at, now)}` : '',
            `${contact.messages_count.toLocaleString('he-IL')} הודעות`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </CardFoldSection>

      <CardFoldSection title="היסטוריה" count={events.length} open={open.has('history')} onToggle={() => toggle('history')}>
        <EventsList events={events} now={now} />
      </CardFoldSection>

      {liveTest && (
        <CardFoldSection
          title="בדיקה חיה"
          hint={liveOn ? 'פעילה' : undefined}
          hintTone="warn"
          open={open.has('liveTest')}
          onToggle={() => toggle('liveTest')}
        >
          <LiveTestBlock contact={contact} canEdit={liveTest.canEdit} busy={liveTest.busy} onToggle={liveTest.onToggle} />
        </CardFoldSection>
      )}
    </div>
  );
}
