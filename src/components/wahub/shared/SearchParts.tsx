'use client';

import { Contact, MessagesSquare, Search } from 'lucide-react';
import {
  SEARCH_TEXT,
  foundByLine,
  hasHit,
  markPhone,
  markWords,
  resultsWord,
  type MarkedPart,
  type PlaceTone,
} from '@/lib/wahub/search';
import type { WahubFoundBy, WahubSearchContact, WahubSearchCustomer } from '@/types/wahubSearch';
import x from '../search.module.css';
import s from '../wahub.module.css';
import { DemoTag } from './bits';
import CustomerCardLink from './CustomerCardLink';
import { cx } from './tones';

/**
 * What a search adds to a list (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1):
 * the letters and the digits that matched, marked where they stand; one line
 * that says the search looked everywhere; where each result stands; why a row
 * was found when it was not by what it already shows; and — beside the results
 * — the people the list does not hold: a customer in Kogo who never wrote on
 * WhatsApp, somebody who wrote and is no lead.
 *
 * Drawn from what they are given. Nothing here searches.
 */

/** Words with the pieces that matched marked. */
export function Marked({ parts }: { parts: ReadonlyArray<MarkedPart> }) {
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className={x.hit}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A name as a row shows it, with what the search matched marked. A contact with no name is shown by its phone:
 * the digits that were typed are then marked in it.
 */
export function MarkedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const words = markWords(name, query);
  if (hasHit(words)) return <Marked parts={words} />;
  const digits = markPhone(name, query);
  return digits ? <Marked parts={digits} /> : <>{name}</>;
}

/**
 * Under a result: the phone, when a number that was typed is in it (a row with a name does not otherwise show
 * its phone) — and why the row was found, when the server says it was not by the name or the phone
 * ("נמצא לפי: ילד/ה — נועם לוי"). Nothing is drawn when there is nothing to add.
 */
export function FoundLines({
  query,
  phone,
  phoneShown = false,
  found,
}: {
  query: string;
  /** The phone as it is shown ("050-123-4567"). */
  phone: string;
  /** The row already shows the phone as its name: it is marked there, and not said again here. */
  phoneShown?: boolean;
  found?: WahubFoundBy | null;
}) {
  if (!query) return null;
  const digits = phoneShown ? null : markPhone(phone, query);
  const why = foundByLine(found);
  if (!digits && !why) return null;
  const value = found?.value ?? '';
  const valueParts = value ? (markPhone(value, query) ?? markWords(value, query)) : null;
  return (
    <>
      {digits && (
        <span className={cx(x.found, x.foundPhone)}>
          <Marked parts={digits} />
        </span>
      )}
      {why && (
        <span className={x.found} dir="auto">
          {valueParts ? (
            <>
              {SEARCH_TEXT.foundBy}: {found?.label || 'התאמה'} — <Marked parts={valueParts} />
            </>
          ) : (
            why
          )}
        </span>
      )}
    </>
  );
}

const PLACE_CLASS: Record<PlaceTone, string | undefined> = {
  danger: x.placeAsk,
  gold: x.placeGold,
  warning: x.placeWarn,
  muted: undefined,
};

/** Where a result stands — the box of a conversation, the list of a lead — as one small tag. */
export function PlaceTag({ label, tone = 'muted' }: { label: string; tone?: PlaceTone }) {
  return <span className={cx(x.place, PLACE_CLASS[tone])}>{label}</span>;
}

/** "תוצאות בכל השיחות · 3 תוצאות": the search looked through everything, whatever was chosen above it. */
export function EverywhereStrip({ words, count, inset = false }: { words: string; count: number | null; inset?: boolean }) {
  return (
    <p className={cx(x.everywhere, inset && x.everywhereInset)} role="status">
      <Search aria-hidden="true" />
      <span>{words}</span>
      {count !== null && count > 0 && <span className={cx(x.everywhereCount, s.num)}>· {resultsWord(count)}</span>}
    </p>
  );
}

/** A family's children, in a few words: "נועם לוי (פעיל), יעל לוי". */
function childrenLine(customer: WahubSearchCustomer): string {
  return customer.children.map((child) => (child.status_label ? `${child.name} (${child.status_label})` : child.name)).join(', ');
}

/**
 * "לקוח במערכת — אין שיחה בוואטסאפ" (ח.1.5): families the search found in Kogo that have no conversation behind
 * them, so a number the system knows is never answered with "לא נמצא" alone. Each with the one button that leads
 * to the customer's card; a family with no child has no card, and its row says so instead of offering a dead end.
 */
export function SystemCustomers({
  customers,
  more,
  query,
  inset = false,
  onOpenChat,
}: {
  customers: ReadonlyArray<WahubSearchCustomer>;
  more: boolean;
  query: string;
  inset?: boolean;
  /** For the rare family whose phone already wrote on WhatsApp and was not matched to it yet. */
  onOpenChat?: (contactId: number) => void;
}) {
  if (!customers.length) return null;
  return (
    <section className={cx(x.beside, inset && x.besideInset)} aria-label={SEARCH_TEXT.customersTitle}>
      <h3 className={x.besideTitle}>
        <Contact aria-hidden="true" />
        {SEARCH_TEXT.customersTitle}
      </h3>
      <ul className={x.besideList}>
        {customers.map((customer) => {
          const children = childrenLine(customer);
          const contact = customer.contact_id;
          return (
            <li key={customer.family_id} className={x.besideRow}>
              <span className={x.besideWho}>
                <span className={x.besideName} dir="auto">
                  <MarkedName name={customer.name || customer.phone_display || 'משפחה'} query={query} />
                </span>
                {customer.name && customer.phone_display && (
                  <span className={cx(x.besideMeta, x.foundPhone)}>
                    <Marked parts={markPhone(customer.phone_display, query) ?? [{ text: customer.phone_display, hit: false }]} />
                  </span>
                )}
                {children && (
                  <span className={x.besideMeta} dir="auto">
                    <Marked parts={markWords(children, query)} />
                  </span>
                )}
                {!customer.link && <span className={x.besideMeta}>{SEARCH_TEXT.noCard}</span>}
              </span>
              <span className={x.besideActs}>
                {contact != null && onOpenChat && (
                  <button type="button" onClick={() => onOpenChat(contact)} className={cx(s.btn, s.btnSm)}>
                    <MessagesSquare aria-hidden="true" />
                    {SEARCH_TEXT.toChat}
                  </button>
                )}
                {customer.link && <CustomerCardLink href={customer.link} />}
              </span>
            </li>
          );
        })}
      </ul>
      {more && <p className={x.besideNote}>{SEARCH_TEXT.customersMore}</p>}
    </section>
  );
}

/**
 * "נמצא בשיחות — לא ברשימת הלידים" (ח.1.4): people the search found among the conversations who are not in the
 * list that was searched — with the way to their conversation, and to their card when Kogo knows them.
 */
export function FoundContacts({
  contacts,
  query,
  onOpenChat,
}: {
  contacts: ReadonlyArray<WahubSearchContact>;
  query: string;
  onOpenChat: (contactId: number) => void;
}) {
  if (!contacts.length) return null;
  return (
    <section className={cx(x.beside, x.besideInset)} aria-label={SEARCH_TEXT.contactsTitle}>
      <h3 className={x.besideTitle}>
        <MessagesSquare aria-hidden="true" />
        {SEARCH_TEXT.contactsTitle}
      </h3>
      <ul className={x.besideList}>
        {contacts.map((contact) => (
          <li key={contact.id} className={x.besideRow}>
            <span className={x.besideWho}>
              <span className={x.besideName} dir="auto">
                <MarkedName name={contact.name || contact.phone_display || 'ללא שם'} query={query} />
                {contact.is_demo && <DemoTag size="row" />}
              </span>
              <FoundLines query={query} phone={contact.phone_display} phoneShown={!contact.name} found={contact.found_by} />
              {contact.box_label && <span className={x.besideMeta}>{contact.box_label}</span>}
            </span>
            <span className={x.besideActs}>
              <button type="button" onClick={() => onOpenChat(contact.id)} className={cx(s.btn, s.btnSm)}>
                <MessagesSquare aria-hidden="true" />
                {SEARCH_TEXT.toChat}
              </button>
              {contact.customer_link && <CustomerCardLink href={contact.customer_link} />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
