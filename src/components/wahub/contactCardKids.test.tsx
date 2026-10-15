import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { makeContact } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubKogoChild, WahubKogoChildClass, WahubLead } from '@/types/wahub';
import ContactPanel from './chats/ContactPanel';
import c from './contactCard.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-LAYOUT.md, ב (15.10.2026) — the card in its new order:
 * "מה עכשיו" in one large line, then "ילדים וחוגים" — each child once, by name
 * and status, with its own way to its card and its classes one line each —
 * and nothing said twice.
 */

const NOW = new Date('2026-10-15T12:00:00+03:00');
const TODAY = '2026-10-15';
const noop = () => {};

function lesson(overrides: Partial<WahubKogoChildClass> = {}): WahubKogoChildClass {
  return {
    lesson_id: 'l-1',
    course_id: 'c-1',
    course: '4.5-6 קפוארה',
    course_type: 'קפוארה',
    day: 'ראשון',
    start: '16:45',
    end: '17:30',
    branch: 'מינץ',
    city: 'פתח תקווה',
    instructor: 'אורי בן דוד',
    ages: 'גיל 4.5-6',
    trial_on: null,
    status: 'active',
    ...overrides,
  };
}

function child(overrides: Partial<WahubKogoChild> = {}): WahubKogoChild {
  return { id: 'kid-7', name: 'נועה לוי', status: 'active', status_label: 'פעיל', classes: [lesson()], ...overrides };
}

const CUSTOMER_LEAD: WahubLead = {
  stage: 'customer',
  stage_label: 'לקוח קיים',
  group: 'closed',
  since: '2026-09-01T10:00:00+03:00',
  days: null,
  reason: 'לקוח רשום מ-1.9 · נועה לוי.',
  next_step: '',
  human_touched: true,
  temperature: '',
};

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return {
    ...makeContact(21, {
      name: 'רותם לוי',
      lead: CUSTOMER_LEAD,
      kogo: {
        outcome: 'customer_before',
        outcome_label: 'לקוח רשום',
        family_id: 'fam-1',
        child_ids: ['kid-7'],
        detail: 'לקוח רשום מ-1.9 · נועה לוי',
        is_customer: true,
        checked_at: '2026-10-15T11:50:00+03:00',
        children: [child()],
      },
      ...overrides,
    }),
    messages: [],
    has_older: false,
    events: [],
  };
}

function card(contact: WahubContactDetail): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContactPanel
        contact={contact}
        now={NOW}
        today={TODAY}
        allTags={[]}
        analyzing={false}
        rechecking={false}
        showBack={false}
        onBack={noop}
        onFollowup={noop}
        onTags={noop}
        onRename={noop}
        onRecheck={noop}
        onAnalyze={noop}
        actions={{ handoverBusy: false, resolveBusy: false, onTakeover: noop, onRelease: noop, onResolveNeedsHuman: noop }}
      />
    </QueryClientProvider>,
  );
}

function section(html: string, label: string, next: string): string {
  return html.slice(html.indexOf(`aria-label="${label}"`), html.indexOf(`aria-label="${next}"`));
}

/** The text a person reads, without the markup. */
function words(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const count = (text: string, word: string) => text.split(word).length - 1;

describe('a customer: everything said once', () => {
  const html = card(detail());
  const text = words(html);
  const now = section(html, 'מה עכשיו', 'ילדים וחוגים');
  const kids = section(html, 'ילדים וחוגים', 'פעולות');

  it('"לקוח קיים" once — the large line of "מה עכשיו" — and no other tag that says it', () => {
    expect(count(text, 'לקוח קיים')).toBe(1);
    expect(now).toContain('לקוח קיים');
    expect(now).toContain(c.stageLead);
    // The matching's own tag and the old "לקוח" pill are gone.
    expect(html).not.toMatch(/>לקוח רשום</);
    expect(html).not.toMatch(/>לקוח</);
  });

  it('the sentence once, without the child it names — the child is named below', () => {
    expect(count(text, 'לקוח רשום מ-1.9')).toBe(1);
    expect(now).toContain('לקוח רשום מ-1.9.');
    expect(count(text, 'נועה לוי')).toBe(1);
    expect(words(kids)).toContain('נועה לוי');
  });

  it('the child: name, status, its own link to its card; under it the class in one line', () => {
    expect(kids).toContain('>פעיל<');
    expect(kids).toMatch(/<a [^>]*aria-label="לכרטיס הלקוח של נועה לוי"[^>]*href="\/customers\?child=kid-7"/);
    expect(words(kids)).toContain('4.5-6 קפוארה · ראשון 16:45–17:30 · מינץ, פתח תקווה · מדריך: אורי בן דוד');
    expect(kids).toContain('<b>4.5-6 קפוארה</b>');
    // The ages are in the class's name: not said again.
    expect(kids).not.toContain('גיל 4.5-6');
    expect(kids).toContain('בדוק שוב');
    expect(kids).toContain('נבדק לפני 10 דק׳');
  });

  it('the way to the card is the child\'s, not a second button among the actions', () => {
    expect(count(text, 'לכרטיס הלקוח')).toBe(1);
    expect(section(html, 'פעולות', 'מה ידוע')).not.toContain('לכרטיס הלקוח');
  });
});

describe('"ילדים וחוגים"', () => {
  it('a trial ahead says its day first; a billing problem on one class is said on it', () => {
    const html = card(
      detail({
        kogo: {
          outcome: 'customer_before',
          detail: 'לקוח רשום מ-1.9 · נועה לוי',
          children: [
            child({
              classes: [
                lesson({ status: 'payments_problem' }),
                lesson({ lesson_id: 'l-2', day: 'שלישי', start: '17:00', end: '17:45', trial_on: '2026-10-20', course: 'אקרובטיקה', ages: 'כיתות א–ב' }),
              ],
            }),
          ],
        },
      }),
    );
    const kids = words(section(html, 'ילדים וחוגים', 'פעולות'));
    expect(kids).toContain('בעיית תשלום 4.5-6 קפוארה · ראשון 16:45–17:30');
    expect(kids).toContain('ניסיון ב-20.10 אקרובטיקה · שלישי 17:00–17:45 · מינץ, פתח תקווה · מדריך: אורי בן דוד · כיתות א–ב');
  });

  it('a child whose own status says the card failed is not told so again on the class', () => {
    const html = card(
      detail({
        lead: null,
        kogo: {
          outcome: 'customer_before',
          children: [child({ status: 'payment_problem', status_label: 'בעיה באשראי', classes: [lesson({ status: 'payments_problem' })] })],
        },
      }),
    );
    const kids = section(html, 'ילדים וחוגים', 'פעולות');
    expect(kids).toContain('בעיה באשראי');
    expect(kids).not.toContain('בעיית תשלום');
  });

  it('two children: each with its own row and its own link', () => {
    const html = card(
      detail({
        lead: { ...CUSTOMER_LEAD, reason: 'לקוח רשום מ-1.9 · נועה לוי, תמר לוי.' },
        kogo: {
          outcome: 'customer_before',
          detail: 'לקוח רשום מ-1.9 · נועה לוי, תמר לוי',
          children: [child(), child({ id: 'kid-8', name: 'תמר לוי', status: 'pending', status_label: 'בתהליך רישום', classes: [] })],
        },
      }),
    );
    const kids = section(html, 'ילדים וחוגים', 'פעולות');
    expect(kids).toContain('href="/customers?child=kid-7"');
    expect(kids).toContain('href="/customers?child=kid-8"');
    expect(kids).toContain('בתהליך רישום');
    expect(words(section(html, 'מה עכשיו', 'ילדים וחוגים'))).toContain('לקוח רשום מ-1.9.');
    expect(words(section(html, 'מה עכשיו', 'ילדים וחוגים'))).not.toContain('תמר לוי');
  });

  it('a state about something else: the answer is said over the children, once', () => {
    const html = card(
      detail({
        lead: { ...CUSTOMER_LEAD, stage: 'in_conversation', stage_label: 'בשיחה', group: 'wait', reason: 'שאל על חוג נוסף.' },
        kogo: {
          outcome: 'in_system',
          outcome_label: 'קיים במערכת בלי רישום',
          detail: 'נועה לוי (לא פעיל)',
          children: [child({ status: 'inactive', status_label: 'לא פעיל', classes: [] })],
        },
      }),
    );
    const kids = section(html, 'ילדים וחוגים', 'פעולות');
    expect(kids).toContain('קיים במערכת בלי רישום');
    // Its sentence was only the list of the children: it is the list below.
    expect(count(words(html), 'נועה לוי')).toBe(1);
    expect(count(words(html), 'לא פעיל')).toBe(1);
  });

  it('nobody found: says so, and offers to look again', () => {
    const html = card(detail({ lead: null, kogo: { outcome: 'not_found', outcome_label: 'לא נמצא במערכת', detail: '', family_id: null, child_ids: [], children: [] } }));
    const kids = section(html, 'ילדים וחוגים', 'מה ידוע');
    expect(kids).toContain('לא נמצא במערכת');
    expect(kids).toContain('בדוק שוב');
    expect(html).not.toContain('לכרטיס הלקוח');
  });

  it('before the children are read (the lists carry the ids alone), the card\'s button stands among the actions', () => {
    const html = card(detail({ kogo: { outcome: 'customer_before', family_id: 'fam-1', child_ids: ['kid-7'], children: undefined } }));
    expect(section(html, 'פעולות', 'מה ידוע')).toContain('href="/customers?child=kid-7"');
    expect(count(words(html), 'לכרטיס הלקוח')).toBe(1);
  });

  it('a server with no classes: the child alone, by name and status', () => {
    const html = card(detail({ kogo: { outcome: 'customer_before', children: [{ id: 'kid-7', name: 'נועה לוי', status: 'active', status_label: 'פעיל' }] } }));
    const kids = section(html, 'ילדים וחוגים', 'פעולות');
    expect(kids).toContain('נועה לוי');
    expect(kids).not.toContain(c.classes);
  });
});
