import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { WahubForCustomer, WahubForCustomerContact } from '@/types/wahub';
import CustomerWhatsAppBlock, { CustomerWhatsAppContacts } from './CustomerWhatsAppBlock';

const fetchWahubForCustomer = vi.fn(() => Promise.reject(new Error('the test must not reach the server')));
const recheckWahubForCustomer = vi.fn(() => Promise.reject(new Error('the test must not reach the server')));

vi.mock('@/lib/wahubApi', () => ({
  fetchWahubForCustomer: (...args: unknown[]) => fetchWahubForCustomer(...(args as [])),
  recheckWahubForCustomer: (...args: unknown[]) => recheckWahubForCustomer(...(args as [])),
}));

(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-10T12:00:00+03:00');
const FAMILY = '0b1c2d3e-0000-4000-8000-000000000001';
const noop = () => {};

function contact(id: number, overrides: Partial<WahubForCustomerContact> = {}): WahubForCustomerContact {
  return {
    id,
    name: 'דנה כהן',
    phone: '0501234567',
    is_demo: false,
    last_message_at: '2026-10-09T18:30:00+03:00',
    last_message_text: 'אפשר לקבוע ניסיון ליום שלישי?',
    last_message_direction: 'in',
    last_message_sender: 'customer',
    handled_by: 'bot',
    needs_human: false,
    known_summary: 'שאלה על קפוארה לבן 6 בראש העין.',
    known_interest_label: 'מתעניין',
    followup_status: 'later',
    followup_status_label: 'בזמן אחר',
    followup_due: '2026-10-24',
    kogo_outcome: 'trial_only',
    kogo_outcome_label: 'עשה ניסיון ולא נרשם',
    linked: true,
    link: `/wahub?tab=chats&contact=${id}`,
    ...overrides,
  };
}

function answer(contacts: WahubForCustomerContact[], phones = ['0501234567', '0529876543']): WahubForCustomer {
  return { family: FAMILY, phones, contacts, checked_at: '2026-10-10T11:50:00+03:00' };
}

describe('the "וואטסאפ" line on a customer\'s card', () => {
  it('starts closed, asks the server for nothing, and offers to open', () => {
    const html = renderToStaticMarkup(<CustomerWhatsAppBlock familyId={FAMILY} />);
    expect(html).toContain('וואטסאפ');
    expect(html).toContain('הצג שיחות');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('בדוק שוב');
    expect(html).not.toContain('לשיחה המלאה');
    expect(fetchWahubForCustomer).not.toHaveBeenCalled();
    expect(recheckWahubForCustomer).not.toHaveBeenCalled();
  });
});

describe('the family\'s WhatsApp contacts, once read', () => {
  it('a contact: name, phone, the last message with who wrote it and when, who answers, what is known, the mark, the outcome, the link', () => {
    const html = renderToStaticMarkup(
      <CustomerWhatsAppContacts data={answer([contact(12)])} rechecking={false} onRecheck={noop} now={NOW} />,
    );
    expect(html).toContain('דנה כהן');
    expect(html).toContain('0501234567');
    expect(html).toContain('אפשר לקבוע ניסיון ליום שלישי?');
    expect(html).toContain('הודעה אחרונה מהלקוח · 9.10 18:30');
    expect(html).toContain('הבוט עונה');
    expect(html).not.toContain('מבקש נציג');
    expect(html).toContain('שאלה על קפוארה לבן 6 בראש העין.');
    expect(html).toContain('מעקב: בזמן אחר · 24.10');
    expect(html).toContain('עשה ניסיון ולא נרשם');
    expect(html).toContain('מקושר לכרטיס הזה');
    expect(html).not.toContain('לא מקושר');
    // The full conversation opens in a new tab, in the section itself.
    expect(html).toContain('href="/wahub?tab=chats&amp;contact=12"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('לשיחה המלאה');
    expect(html).toContain('בדוק שוב');
    expect(html).toContain('2 טלפונים נבדקו');
  });

  it('a contact a person answers, who asked for one, not tied to this card, with the bot\'s last word', () => {
    const html = renderToStaticMarkup(
      <CustomerWhatsAppContacts
        data={answer([
          contact(7, {
            name: '',
            handled_by: 'human',
            needs_human: true,
            linked: false,
            link: '',
            last_message_direction: 'out',
            last_message_sender: 'bot',
            last_message_text: 'מעבירה לנציג',
            known_summary: '',
            followup_status: '',
            followup_status_label: '',
            followup_due: null,
            is_demo: true,
          }),
        ])}
        rechecking={false}
        onRecheck={noop}
        now={NOW}
      />,
    );
    expect(html).toContain('נציג עונה');
    expect(html).toContain('מבקש נציג');
    expect(html).toContain('לא מקושר');
    expect(html).toContain('דמו');
    expect(html).toContain('הודעה אחרונה מהבוט');
    expect(html).not.toContain('מה ידוע');
    expect(html).not.toContain('מעקב:');
    // No link from the server: the section's own address is built.
    expect(html).toContain('href="/wahub?tab=chats&amp;contact=7"');
    // No name: the phone stands in for it, once.
    expect(html.match(/0501234567/g)).toHaveLength(1);
  });

  it('with no contact says so, and still offers to check again', () => {
    const html = renderToStaticMarkup(
      <CustomerWhatsAppContacts data={answer([], ['0501234567'])} rechecking={false} onRecheck={noop} now={NOW} />,
    );
    expect(html).toContain('אין שיחות וואטסאפ למשפחה הזאת.');
    expect(html).toContain('1 טלפון נבדק');
    expect(html).toContain('בדוק שוב');
  });

  it('while checking again the button says so and is disabled', () => {
    const html = renderToStaticMarkup(
      <CustomerWhatsAppContacts data={answer([contact(12)])} rechecking onRecheck={noop} now={NOW} />,
    );
    expect(html).toContain('בודק…');
    expect(html).toContain('disabled=""');
  });
});
