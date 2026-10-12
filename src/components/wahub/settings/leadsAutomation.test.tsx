import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { readAutomation, readTemplates } from '@/lib/wahub/leadsAutomation';
import type { WahubLeadTemplate, WahubLeadTemplateOption, WahubLeadsAutomation, WahubStatus } from '@/types/wahub';
import { automationKeys } from '../hooks/useLeadsAutomation';
import s from '../wahub.module.css';
import a from './automation.module.css';
import LeadsAutomationCard, {
  LEADS_AUTOMATION_CARD_ID,
  LeadsAutomationView,
  type LeadsAutomationTemplates,
  type LeadsAutomationViewProps,
} from './LeadsAutomationCard';
import LeadTemplates, { CopyWording, TemplateRowView, type LeadTemplatesProps, type TemplateRowViewProps } from './LeadTemplates';
import SettingsTab from './SettingsTab';

// Nothing here may reach a server: what the card shows is handed over, or put in the cache.
const refuse = vi.hoisted(() => () => vi.fn(() => Promise.reject(new Error('the test must not reach the server'))));
vi.mock('@/lib/wahub/leadsV2Api', async (original) => ({
  ...(await original<typeof import('@/lib/wahub/leadsV2Api')>()),
  fetchWahubLeadsAutomation: refuse(),
  fetchWahubLeadTemplates: refuse(),
  fetchWahubLeadTemplateOptions: refuse(),
  setWahubLeadTemplateTarget: refuse(),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-LEADS-V2.md, י — "הכול אוטומטי". The owner asked what is
 * happening with the bot coming back to the leads by itself; the card under
 * "מצב המערכת" answers at a glance: one large sentence, the four lines, what is
 * planned, and — folded — the templates, to be connected without help. On a
 * server that does not have it yet, there is no card. Every name here is invented.
 */

/** Monday, 12.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-12T09:00:00Z');
const noop = () => {};

const LINK_TEXT = 'היי, כאן קוגומלו 🙂 שלחתי לכם קישור להרשמה לחוג. הצלחתם להירשם, או שמשהו נתקע באתר?';
const TRIAL_TEXT = 'היי, איך היה בשיעור הניסיון? 🙂';

/** The contract's own example, with a few more comings back. */
const NOT_READY = readAutomation({
  ready: false,
  lines: [
    { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים, עודכן לפני 3 דק׳' },
    { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '12 חזרות מתוכננות, 3 הגיע זמנן' },
    { key: 'sending', ok: false, title: 'שליחה ללקוחות', detail: 'כבויה — שום הודעה לא יוצאת ללקוחות', how: 'מדליקים בהגדרות המערכת (WAHUB_SENDING_ENABLED)' },
    { key: 'templates', ok: false, title: 'תבניות וואטסאפ', detail: '0 מתוך 5 של שלב 1 מחוברות', how: 'יוצרים ב-ManyChat ובוחרים כאן למטה' },
  ],
  today: { planned: 12, due: 3, sent: 0, skipped: 4 },
  upcoming: [
    { contact_id: 11, name: 'יעל דרור', kind_label: 'בדיקה אם יש חדש', text: 'היי, הספקתם לחשוב על החוג? אם נשארה שאלה פתוחה — אני כאן.', when: '2026-10-12T07:30:00Z', state: 'due', needs_template: true, template_mapped: false },
    { contact_id: 12, name: 'תמר אוחיון', kind_label: 'תזכורת קישור', text: LINK_TEXT, when: '2026-10-13T07:30:00Z', state: 'planned', needs_template: true, template_mapped: false },
    { contact_id: 13, name: 'אורי שגב', kind_label: 'איך היה בניסיון', text: TRIAL_TEXT, when: '2026-10-13T08:00:00Z', state: 'planned', needs_template: true, template_mapped: true },
    { contact_id: 14, name: '', kind_label: 'פתיחה', text: 'היי 🙂 ראיתי שהתעניינתם בחוגים שלנו. לאיזה גיל, ובאיזו עיר?', when: '2026-10-12T11:00:00Z', state: 'planned', needs_template: false, template_mapped: false },
  ],
}) as WahubLeadsAutomation;

const READY = readAutomation({
  ready: true,
  lines: [
    { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים, עודכן לפני 3 דק׳' },
    { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '12 חזרות מתוכננות' },
    { key: 'sending', ok: true, title: 'שליחה ללקוחות', detail: 'פעילה, דרך ManyChat' },
    { key: 'templates', ok: true, title: 'תבניות וואטסאפ', detail: '5 מתוך 5 של שלב 1 מחוברות' },
  ],
  today: { planned: 12, due: 0, sent: 5, skipped: 1 },
  upcoming: [],
}) as WahubLeadsAutomation;

const TEMPLATES: WahubLeadTemplate[] = readTemplates([
  { template_key: 'link_reminder_2', kind_label: 'תזכורת קישור · פנייה 2', when_label: '3 ימים אחרי הקישור', text: 'היי, רוצים שאשלח שוב את הקישור לשיעור ניסיון?', stage: 2, mapped: false, target: null },
  { template_key: 'link_reminder_1', kind_label: 'תזכורת קישור', when_label: 'יום אחרי שקיבל קישור להרשמה ולא נרשם', text: LINK_TEXT, stage: 1, mapped: true, target: 'content1' },
  { template_key: 'trial_feedback_1', kind_label: 'איך היה בניסיון', when_label: 'יום אחרי שיעור ניסיון שלא הסתיים בהרשמה', text: TRIAL_TEXT, stage: 1, mapped: false, target: null },
  { template_key: 'trial_feedback_2', kind_label: 'איך היה בניסיון · פנייה 2', when_label: '3 ימים אחרי שיעור הניסיון', text: 'אם היה טוב — ההרשמה כאן.', stage: 2, mapped: false, target: null },
]);

const OPTIONS: WahubLeadTemplateOption[] = [
  { id: 'content1', name: 'kogo_lead_link_1' },
  { id: 'content2', name: 'kogo_lead_trial_1' },
];

function templatesOf(overrides: Partial<LeadsAutomationTemplates> = {}): LeadsAutomationTemplates {
  return { status: 'ready', error: '', list: TEMPLATES, options: OPTIONS, optionsReason: '', optionsLoading: false, saving: {}, saved: {}, errors: {}, ...overrides };
}

function card(overrides: Partial<LeadsAutomationViewProps> = {}): string {
  return renderToStaticMarkup(
    <LeadsAutomationView
      status="ready"
      error=""
      automation={NOT_READY}
      templates={templatesOf()}
      now={NOW}
      templatesOpen={false}
      onToggleTemplates={noop}
      onRetry={noop}
      onRetryTemplates={noop}
      onConnect={noop}
      onDisconnect={noop}
      {...overrides}
    />,
  );
}

function templates(overrides: Partial<LeadTemplatesProps> = {}): string {
  return renderToStaticMarkup(
    <LeadTemplates
      status="ready"
      error=""
      templates={TEMPLATES}
      options={OPTIONS}
      optionsLoading={false}
      now={NOW}
      saving={{}}
      saved={{}}
      errors={{}}
      onRetry={noop}
      onConnect={noop}
      onDisconnect={noop}
      {...overrides}
    />,
  );
}

function row(overrides: Partial<TemplateRowViewProps> = {}): React.ReactElement {
  return (
    <TemplateRowView
      template={TEMPLATES[2]}
      options={OPTIONS}
      optionsLoading={false}
      now={NOW}
      saving={null}
      saved={false}
      error=""
      pasted=""
      onPasted={noop}
      onConnect={noop}
      onDisconnect={noop}
      {...overrides}
    />
  );
}

/** The elements a component that keeps no state draws; one that does (`skip`) is left as it stands. */
function elements(node: React.ReactNode, skip: unknown[] = []): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, skip));
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    if (skip.includes(element.type)) return [];
    return elements((element.type as (props: unknown) => React.ReactNode)(element.props), skip);
  }
  return [element, ...elements(element.props.children, skip)];
}

const STATEFUL = [CopyWording];

/** One of the four lines, by its title. */
function lineOf(html: string, title: string): string {
  const at = html.indexOf(title);
  if (at < 0) throw new Error(`no line "${title}"`);
  return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
}

/** One coming back or one wording, by words in it: from its own <li> to the end of it. */
function itemOf(html: string, words: string): string {
  const at = html.indexOf(words);
  if (at < 0) throw new Error(`no item with "${words}"`);
  return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
}

const section = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`);
  if (at < 0) throw new Error(`no section "${label}"`);
  return html.slice(html.lastIndexOf('<section', at));
};

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

describe('the one large sentence', () => {
  it('not ready: the bot plans and does not send, and how many things are missing — on amber, never red', () => {
    const html = card();
    expect(html).toContain('הבוט מתכנן, אבל עוד לא שולח: חסרים 2 דברים');
    expect(html).toContain(`class="${a.headline} ${a.headWarn}"`);
    expect(html).toContain('data-ready="no"');
    expect(html).not.toContain(s.pBad);
    expect(html).not.toContain(s.badText);
  });

  it('ready: everything stands, quietly in green', () => {
    const html = card({ automation: READY });
    expect(html).toContain('הכול מוכן — הבוט חוזר ללידים לבד');
    expect(html).toContain(`class="${a.headline} ${a.headGood}"`);
    expect(html).toContain('data-ready="yes"');
    expect(html).not.toContain('עוד לא שולח');
    expect(html).not.toContain('aria-label="חסר"');
  });

  it('the day in a small line under it — only what there is something of', () => {
    expect(card()).toContain('חזרות היום: 12 מתוכננות · 3 הגיע זמנן ולא יצאו · 4 בוטלו');
    expect(card({ automation: READY })).toContain('חזרות היום: 12 מתוכננות · 5 נשלחו · אחת בוטלה');
    expect(card({ automation: { ...READY, today: { planned: 0, due: 0, sent: 0, skipped: 0, failed: 0 } } })).not.toContain('חזרות היום');
  });

  it('the card carries its name, and the place the leads tab leads to', () => {
    const html = card();
    expect(html).toContain(`id="${LEADS_AUTOMATION_CARD_ID}"`);
    expect(html).toContain('aria-label="חזרה אוטומטית ללידים"');
    expect(html).toContain('>חזרה אוטומטית ללידים</h3>');
  });
});

describe('the four lines', () => {
  const html = card();

  it('in the server\'s order, each with its title and its sentence', () => {
    const titles = ['זיהוי וסיווג הלידים', 'תזמון החזרות', 'שליחה ללקוחות', 'תבניות וואטסאפ'];
    const at = titles.map((title) => html.indexOf(title));
    expect(at.every((index) => index > -1)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(lineOf(html, 'זיהוי וסיווג הלידים')).toContain('53 לידים פתוחים, עודכן לפני 3 דק׳');
    expect(lineOf(html, 'שליחה ללקוחות')).toContain('כבויה — שום הודעה לא יוצאת ללקוחות');
  });

  it('a line that stands: a quiet green tick, said in a word for a reader — and nothing about fixing', () => {
    const line = lineOf(html, 'תזמון החזרות');
    expect(line).toContain('data-ok="yes"');
    expect(line).toContain(`class="${a.mark} ${a.markOk}"`);
    expect(line).toContain('aria-label="תקין"');
    expect(line).not.toContain('איך מתקנים');
  });

  it('a line that is missing: an amber cross, and how it is put right', () => {
    const line = lineOf(html, 'תבניות וואטסאפ');
    expect(line).toContain('data-ok="no"');
    expect(line).toContain(`class="${a.mark} ${a.markOff}"`);
    expect(line).toContain('aria-label="חסר"');
    expect(line).toContain('איך מתקנים:');
    expect(line).toContain('יוצרים ב-ManyChat ובוחרים כאן למטה');
  });

  it('the name of a setting stands apart from the sentence: small, on its own, out of its brackets', () => {
    const line = lineOf(html, 'שליחה ללקוחות');
    expect(line).toContain('מדליקים בהגדרות המערכת');
    expect(line).toContain(`<span class="${a.setting}">WAHUB_SENDING_ENABLED</span>`);
    expect(line).not.toContain('(WAHUB_SENDING_ENABLED)');
    // Nowhere else on the card is anything written in a setting's letters.
    expect((html.match(/[A-Z]{3,}_[A-Z_]+/g) ?? [])).toEqual(['WAHUB_SENDING_ENABLED']);
  });

  it('ready: four ticks and not one cross', () => {
    const ready = card({ automation: READY });
    expect((ready.match(/data-ok="yes"/g) ?? []).length).toBe(4);
    expect(ready).not.toContain('data-ok="no"');
    expect(ready).not.toContain('איך מתקנים');
  });

  it('the lines are read, not pressed: the card switches nothing on', () => {
    const lines = html.slice(html.indexOf('aria-label="מה עובד ומה חסר"'), html.indexOf(`aria-label="מה הבוט מתכנן לשלוח"`));
    expect(lines).not.toContain('<button');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="checkbox"');
  });
});

describe('"מה הבוט מתכנן לשלוח"', () => {
  const html = card();

  it('each one: who, what — the wording cut short — and when, as a person would say it', () => {
    const tamar = itemOf(html, 'תמר אוחיון');
    expect(tamar).toContain('תזכורת קישור');
    expect(tamar).toContain('מחר ב-10:30');
    expect(tamar).toContain('היי, כאן קוגומלו');
    expect(tamar).toContain('…');
    expect(tamar).not.toContain(LINK_TEXT);
    expect(tamar).toContain('aria-expanded="false"');
  });

  it('its time has come and it did not go out: "היה יוצא עכשיו", in amber', () => {
    const yael = itemOf(html, 'יעל דרור');
    expect(yael).toContain(`class="${a.upWhen} ${a.upWhenHeld}">היה יוצא עכשיו<`);
  });

  it('a small mark: a template is missing, one is connected — and none where none is needed', () => {
    expect(itemOf(html, 'תמר אוחיון')).toContain(`class="${s.pill} ${s.pWarn} ${a.upTag}">דורש תבנית<`);
    expect(itemOf(html, 'אורי שגב')).toContain(`class="${s.pill} ${s.pGood} ${a.upTag}">תבנית מחוברת<`);
    const opening = itemOf(html, 'ליד בלי שם');
    expect(opening).not.toContain('תבנית');
    expect(opening).toContain('היום ב-14:00');
  });

  it('a press opens the whole wording under the row — and it is then not said twice', () => {
    const open = itemOf(card({ defaultOpenUpcoming: [1] }), 'תמר אוחיון');
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain(`<blockquote class="${a.quote}" dir="auto">${LINK_TEXT}</blockquote>`);
    expect(open.split('היי, כאן קוגומלו').length - 1).toBe(1);
  });

  it('what stops this very one is said under its wording, in the server\'s words', () => {
    const noted = { ...NOT_READY, upcoming: [{ ...NOT_READY.upcoming[0], note: 'השליחה כבויה' }] };
    expect(itemOf(card({ automation: noted }), 'יעל דרור')).not.toContain('השליחה כבויה');
    const open = itemOf(card({ automation: noted, defaultOpenUpcoming: [0] }), 'יעל דרור');
    expect(open).toContain(`<p class="${a.upNote}">השליחה כבויה</p>`);
  });

  it('an invented customer is marked — its coming back is written to the demo conversation and sent to nobody', () => {
    const demo = { ...NOT_READY, upcoming: [{ ...NOT_READY.upcoming[0], name: 'רונית לב', is_demo: true, needs_template: false, note: 'ייכתב לשיחת הדמו — לא נשלח לאף אחד' }] };
    const row = itemOf(card({ automation: demo, defaultOpenUpcoming: [0] }), 'רונית לב');
    expect(row).toContain('>דמו<');
    expect(row).toContain('ייכתב לשיחת הדמו — לא נשלח לאף אחד');
    expect(row).not.toContain('דורש תבנית');
    expect(card()).not.toContain('>דמו<');
  });

  it('nothing planned: said in a sentence', () => {
    const empty = card({ automation: READY });
    expect(empty).toContain('אין כרגע חזרות מתוכננות');
    expect(empty).not.toContain(a.upList);
  });

  it('more than five: the first five, and a way to the rest', () => {
    const many = {
      ...NOT_READY,
      upcoming: Array.from({ length: 8 }, (_, index) => ({ ...NOT_READY.upcoming[1], contact_id: 100 + index, name: `ליד מספר ${index + 1}` })),
    };
    const more = card({ automation: many });
    expect(more).toContain('ליד מספר 5');
    expect(more).not.toContain('ליד מספר 6');
    expect(more).toContain('הצג עוד 3');
    expect(html).not.toContain('הצג עוד');
  });

  it('a coming back with no wording is a plain row — nothing to open', () => {
    const bare = card({ automation: { ...NOT_READY, upcoming: [{ ...NOT_READY.upcoming[1], text: '' }] } });
    expect(itemOf(bare, 'תמר אוחיון')).not.toContain('<button');
  });
});

describe('the hierarchy: the sentence, the four lines, what is planned, the templates', () => {
  it('in that order, top to bottom', () => {
    const html = card();
    const order = ['הבוט מתכנן, אבל עוד לא שולח', 'aria-label="מה עובד ומה חסר"', 'aria-label="מה הבוט מתכנן לשלוח"', 'aria-label="תבניות"'].map((mark) => html.indexOf(mark));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('the templates are folded: a title with how many are connected, and nothing of them in the page', () => {
    const html = card();
    const fold = section(html, 'תבניות');
    expect(fold).toContain('aria-expanded="false"');
    expect(fold).toContain('תבניות (1 מתוך 4 מחוברות)');
    expect(fold).not.toContain('העתק נוסח');
    expect(fold).not.toContain('<select');
    expect(fold).not.toContain(TRIAL_TEXT);
  });

  it('until the wordings were read the fold\'s title carries no number', () => {
    expect(section(card({ templates: templatesOf({ status: 'loading', list: [] }) }), 'תבניות')).toContain('>תבניות<');
    expect(card({ templates: templatesOf({ status: 'loading', list: [] }) })).not.toContain('מתוך 4');
  });

  it('opened: the templates stand under their title', () => {
    const fold = section(card({ templatesOpen: true }), 'תבניות');
    expect(fold).toContain('aria-expanded="true"');
    expect(fold).toContain('שלב 1 — מתחילים מכאן');
    expect(fold).toContain('העתק נוסח');
  });
});

describe('waiting, failing', () => {
  it('waiting: the card\'s name, and the shape of the sentence and the four lines', () => {
    const html = card({ status: 'loading', automation: null });
    expect(html).toContain('חזרה אוטומטית ללידים');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="טוען את מצב החזרה ללידים"');
    expect((html.match(new RegExp(`class="${a.skLine}"`, 'g')) ?? []).length).toBe(4);
    expect(html).not.toContain('הבוט מתכנן');
    expect(html).not.toContain('תבניות');
  });

  it('a failure: one sentence in Hebrew and "נסו שוב" — inside the card, which keeps its name', () => {
    const html = card({ status: 'error', automation: null, error: 'אין הרשאה לצפות בזה' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את מצב החזרה ללידים');
    expect(html).toContain('אין הרשאה לצפות בזה');
    expect(html).toContain('נסו שוב');
    expect(html).toContain('>חזרה אוטומטית ללידים</h3>');
    expect(html).not.toContain('aria-busy');
  });

  it('a read that failed while the card is on screen leaves what it shows', () => {
    const html = card({ status: 'ready', error: 'משהו נכשל' });
    expect(html).toContain('הבוט מתכנן, אבל עוד לא שולח');
    expect(html).not.toContain('role="alert"');
  });
});

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------

describe('the templates: stage 1 first, stage 2 folded under it', () => {
  it('stage 1 with how many of it are connected, its wordings in the server\'s order', () => {
    const html = templates();
    expect(html).toContain('שלב 1 — מתחילים מכאן');
    expect(html).toContain('1 מתוך 2 מחוברות');
    expect(html.indexOf('שלב 1 — מתחילים מכאן')).toBeLessThan(html.indexOf('שלב 2 — הפניות הבאות'));
    expect(html.indexOf('יום אחרי שקיבל קישור להרשמה ולא נרשם')).toBeLessThan(html.indexOf('יום אחרי שיעור ניסיון שלא הסתיים בהרשמה'));
  });

  it('stage 2 is folded: its title and its count, and none of its wordings in the page', () => {
    const html = templates();
    const two = section(html, 'שלב 2 — הפניות הבאות');
    expect(two).toContain('aria-expanded="false"');
    expect(two).toContain('0 מתוך 2 מחוברות');
    expect(html).not.toContain('3 ימים אחרי הקישור');
    expect(html).not.toContain('אם היה טוב — ההרשמה כאן.');
  });

  it('opened, stage 2 shows its wordings', () => {
    const two = section(templates({ defaultStageTwoOpen: true }), 'שלב 2 — הפניות הבאות');
    expect(two).toContain('aria-expanded="true"');
    expect(two).toContain('3 ימים אחרי הקישור');
    expect(two).toContain('אם היה טוב — ההרשמה כאן.');
  });

  it('with no first stage, the second is simply the list — nothing to unfold', () => {
    const html = templates({ templates: TEMPLATES.filter((template) => template.stage === 2) });
    expect(html).not.toContain('שלב 1');
    expect(html).toContain('שלב 2 — הפניות הבאות');
    expect(html).not.toContain('aria-expanded');
    expect(html).toContain('3 ימים אחרי הקישור');
  });

  it('one line on what to do with them — in plain words', () => {
    expect(templates()).toContain('יוצרים כל תבנית ב-ManyChat עם הנוסח שכאן');
  });

  it('an account that cannot be listed, and the server said why: said once, with a way to ask again', () => {
    const html = templates({ options: null, optionsReason: 'ManyChat לא ענה', defaultStageTwoOpen: true, onRetryOptions: noop });
    expect(html).toContain('אי אפשר להציג כרגע את רשימת התבניות מ-ManyChat (ManyChat לא ענה).');
    expect(html.split('אי אפשר להציג כרגע').length - 1).toBe(1);
    expect(html).toMatch(/אי אפשר להציג כרגע[^<]*<button type="button" class="[^"]*">נסו שוב<\/button>/);
    expect(html).toContain('placeholder="שם התבנית ב-ManyChat"');
    // No reason given (a server without the list at all): the boxes alone. And never beside a list that did arrive.
    expect(templates({ options: null })).not.toContain('אי אפשר להציג כרגע');
    expect(templates({ optionsReason: 'ManyChat לא ענה' })).not.toContain('אי אפשר להציג כרגע');
    expect(templates({ options: null, optionsReason: 'ManyChat לא ענה', optionsLoading: true })).not.toContain('אי אפשר להציג כרגע');
  });

  it('waiting: shapes; a failure: a sentence and "נסו שוב"; none: said', () => {
    const waiting = templates({ status: 'loading', templates: [] });
    expect(waiting).toContain('aria-label="טוען את התבניות"');
    expect(waiting).not.toContain('שלב 1');
    const failed = templates({ status: 'error', templates: [], error: 'השרת לא ענה' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('לא הצלחנו לטעון את התבניות');
    expect(failed).toContain('השרת לא ענה');
    expect(failed).toContain('נסו שוב');
    expect(templates({ templates: [] })).toContain('עוד אין נוסחים לחזרה ללידים.');
  });
});

describe('one wording', () => {
  it('when it is sent, and the wording whole — with a way to copy it', () => {
    const html = renderToStaticMarkup(row());
    expect(html).toContain('>איך היה בניסיון</h5>');
    expect(html).toContain('יום אחרי שיעור ניסיון שלא הסתיים בהרשמה');
    expect(html).toContain(`<p class="${a.wordingText}" dir="auto">${TRIAL_TEXT}</p>`);
    expect(html).toContain('העתק נוסח');
  });

  it('nothing connected: the account\'s templates to choose from — no "מחובר", no "נתק"', () => {
    const html = renderToStaticMarkup(row());
    expect(html).toContain('<select');
    expect(html).toContain('<option value="" selected="">בחרו תבנית</option>');
    expect(html).toContain('<option value="content1">kogo_lead_link_1</option>');
    expect(html).toContain('<option value="content2">kogo_lead_trial_1</option>');
    expect(html).not.toContain('מחובר');
    expect(html).not.toContain('>נתק</button>');
    expect(html).not.toContain('<input');
  });

  it('connected: "מחובר" with a tick, the template chosen in the picker, and "נתק"', () => {
    const html = renderToStaticMarkup(row({ template: TEMPLATES[1] }));
    expect(html).toContain(`class="${s.pill} ${s.pGood} ${a.tplPill}"`);
    expect(html).toContain('מחובר');
    expect(html).toContain('<option value="content1" selected="">kogo_lead_link_1</option>');
    expect(html).toContain('<option value="" disabled="">בחרו תבנית</option>');
    expect(html).toContain('>נתק</button>');
  });

  it('what is connected but no longer in the account still shows in the picker', () => {
    const gone = { ...TEMPLATES[1], target: 'content9', target_name: 'kogo_old' };
    expect(renderToStaticMarkup(row({ template: gone }))).toContain('<option value="content9" selected="">kogo_old</option>');
  });

  it('choosing saves at once: the wording\'s key and the template\'s identifier', () => {
    const onConnect = vi.fn();
    const select = elements(row({ onConnect }), STATEFUL).find((element) => element.type === 'select') as React.ReactElement<{
      onChange: (event: unknown) => void;
    }>;
    select.props.onChange({ target: { value: 'content2' } });
    expect(onConnect).toHaveBeenCalledWith('trial_feedback_1', 'content2');
    // The empty line of the picker is not a choice.
    select.props.onChange({ target: { value: '' } });
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('"נתק" cuts off that wording', () => {
    const onDisconnect = vi.fn();
    const cut = elements(row({ template: TEMPLATES[1], onDisconnect }), STATEFUL).find(
      (element) => element.type === 'button' && renderToStaticMarkup(element).includes('נתק'),
    ) as React.ReactElement<{ onClick: () => void }>;
    cut.props.onClick();
    expect(onDisconnect).toHaveBeenCalledWith('link_reminder_1');
  });

  it('an account that cannot be listed: a box to paste the template\'s name into, and "חבר"', () => {
    const html = renderToStaticMarkup(row({ options: null }));
    expect(html).not.toContain('<select');
    expect(html).toContain('placeholder="שם התבנית ב-ManyChat"');
    expect(html).toContain('>חבר</button>');
    // The empty box keeps the page's direction for its hint; a name being typed is written left to right.
    expect(html).not.toMatch(/<input[^>]*dir=/);
    expect(renderToStaticMarkup(row({ options: null, pasted: 'kogo' }))).toMatch(/<input[^>]*dir="ltr"/);
    // Nothing typed: nothing to connect.
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>חבר<\/button>/);
    expect(renderToStaticMarkup(row({ options: null, pasted: 'kogo_lead_trial_1' }))).toMatch(/<button type="submit" class="[^"]*">חבר<\/button>/);
  });

  it('an account with no templates yet takes a pasted name too', () => {
    expect(renderToStaticMarkup(row({ options: [] }))).toContain('placeholder="שם התבנית ב-ManyChat"');
  });

  it('a pasted name is connected as it was written, without what a copy drags along', () => {
    const onConnect = vi.fn();
    const onPasted = vi.fn();
    const preventDefault = vi.fn();
    const tree = elements(row({ options: null, pasted: '  kogo_lead_trial_1\n', onConnect, onPasted }), STATEFUL);
    const form = tree.find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: unknown) => void }>;
    form.props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onConnect).toHaveBeenCalledWith('trial_feedback_1', 'kogo_lead_trial_1');
    // What was typed stays in the box: a name the server refuses comes back to be put right.
    expect(onPasted).not.toHaveBeenCalled();

    const input = tree.find((element) => element.type === 'input') as React.ReactElement<{ onChange: (event: unknown) => void }>;
    input.props.onChange({ target: { value: 'kogo' } });
    expect(onPasted).toHaveBeenLastCalledWith('kogo');
  });

  it('an empty box connects nothing', () => {
    const onConnect = vi.fn();
    const form = elements(row({ options: null, pasted: '   ', onConnect }), STATEFUL).find((element) => element.type === 'form') as React.ReactElement<{
      onSubmit: (event: unknown) => void;
    }>;
    form.props.onSubmit({ preventDefault: noop });
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('pasted and connected: the name as it is written in ManyChat, and "נתק" — no box', () => {
    const pasted = { ...TEMPLATES[1], target: 'kogo_lead_link_1' };
    const html = renderToStaticMarkup(row({ template: pasted, options: null }));
    expect(html).toContain(`<span class="${a.connected}" title="kogo_lead_link_1">kogo_lead_link_1</span>`);
    expect(html).toContain('>נתק</button>');
    expect(html).not.toContain('<input');
  });

  it('while the account\'s templates are on their way: a shape where the picker will be', () => {
    const html = renderToStaticMarkup(row({ template: TEMPLATES[1], optionsLoading: true, options: null }));
    expect(html).toContain(s.skeleton);
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('>נתק</button>');
  });

  it('a save on its way: nothing of this wording can be pressed twice', () => {
    const connecting = renderToStaticMarkup(row({ saving: 'connect' }));
    expect(connecting).toMatch(/<select[^>]*disabled=""/);
    expect(connecting).toContain(s.spin);
    const cutting = renderToStaticMarkup(row({ template: TEMPLATES[1], saving: 'disconnect' }));
    expect(cutting).toMatch(/<button type="button" disabled=""[^>]*>נתק<\/button>/);
  });

  it('saved: a small word beside it, for a moment', () => {
    const html = renderToStaticMarkup(row({ template: TEMPLATES[1], saved: true }));
    expect(html).toContain('role="status"');
    expect(html).toContain('נשמר');
    expect(renderToStaticMarkup(row({ template: TEMPLATES[1] }))).not.toContain('נשמר');
    // Not while the next save is still on its way.
    expect(renderToStaticMarkup(row({ template: TEMPLATES[1], saved: true, saving: 'disconnect' }))).not.toContain('נשמר');
  });

  it('refused: why, in a sentence, under that wording alone — in amber, never red', () => {
    const html = renderToStaticMarkup(row({ error: 'התבנית לא נמצאה ב-ManyChat' }));
    expect(html).toContain(`<p role="alert" class="${a.tplError}">התבנית לא נמצאה ב-ManyChat</p>`);
    expect(html).not.toContain(s.noteBad);
    expect(templates({ errors: { trial_feedback_1: 'התבנית לא נמצאה ב-ManyChat' } }).split('role="alert"').length - 1).toBe(1);
  });

  it('the name the template is given in ManyChat stands beside the wording — until one is connected', () => {
    const named = { ...TEMPLATES[2], suggested_name: 'kogo_lead_trial_1' };
    const html = renderToStaticMarkup(row({ template: named }));
    expect(html).toContain(`שם מוצע ב-ManyChat: <span class="${a.tplNameValue}">kogo_lead_trial_1</span>`);
    expect(renderToStaticMarkup(row({ template: { ...named, mapped: true, target: 'content2' } }))).not.toContain('שם מוצע');
    expect(renderToStaticMarkup(row())).not.toContain('שם מוצע');
  });

  it('who connected it and when: a hover away on "מחובר"', () => {
    const recorded = { ...TEMPLATES[1], connected_by: 'דנה המנהלת', connected_at: '2026-10-12T06:10:00Z' };
    expect(renderToStaticMarkup(row({ template: recorded }))).toContain('title="חובר על ידי דנה המנהלת · 12.10 09:10"');
    expect(renderToStaticMarkup(row({ template: TEMPLATES[1] }))).not.toContain('title="חובר');
  });

  it('a wording that is switched off says so, quietly', () => {
    const html = renderToStaticMarkup(row({ template: { ...TEMPLATES[2], active: false } }));
    expect(html).toContain('הנוסח הזה כבוי ולא נשלח');
    expect(renderToStaticMarkup(row())).not.toContain('הנוסח הזה כבוי');
  });

  it('nothing technical is shown: not the wording\'s key, not the template\'s identifier', () => {
    const html = templates({ defaultStageTwoOpen: true });
    for (const template of TEMPLATES) expect(html).not.toContain(`>${template.template_key}<`);
    expect(html).not.toContain('>content1<');
    expect(html).not.toContain('trial_feedback_1');
  });
});

// ---------------------------------------------------------------------------
// The card with its reading — and the settings it stands in
// ---------------------------------------------------------------------------

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function reading(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LeadsAutomationCard />
    </QueryClientProvider>,
  );
}

const STATUS: WahubStatus = {
  inbound_configured: true,
  inbound_key_set_at: '2026-10-01T10:00:00+03:00',
  bot_replies_seen: true,
  ai_configured: true,
  send_configured: true,
  sending_enabled: false,
  simulate_send: false,
  last_inbound_at: '2026-10-12T11:57:00+03:00',
  contacts_total: 40,
  messages_last_24h: 120,
  inbound_url: 'https://example.test/api/v1/wahub/inbound/manychat/',
};

function settings(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SettingsTab status={STATUS} statusLoading={false} statusError={false} onRetryStatus={noop} onOpenChat={noop} />
    </QueryClientProvider>,
  );
}

describe('the card with its reading', () => {
  it('a server from before (404): no card at all, and nothing in its place', () => {
    const client = newClient();
    client.setQueryData(automationKeys.status, null);
    expect(reading(client)).toBe('');
  });

  it('before the first answer: the card\'s own waiting shape', () => {
    const html = reading(newClient());
    expect(html).toContain('aria-label="טוען את מצב החזרה ללידים"');
    expect(html).toContain('חזרה אוטומטית ללידים');
  });

  it('a server that has it: the sentence, the lines, what is planned — and the fold counts the wordings that were read', () => {
    const client = newClient();
    client.setQueryData(automationKeys.status, NOT_READY);
    client.setQueryData(automationKeys.templates, TEMPLATES);
    const html = reading(client);
    expect(html).toContain('הבוט מתכנן, אבל עוד לא שולח: חסרים 2 דברים');
    expect(html).toContain('תמר אוחיון');
    expect(html).toContain('תבניות (1 מתוך 4 מחוברות)');
    // Folded to begin with.
    expect(section(html, 'תבניות')).toContain('aria-expanded="false"');
  });

  it('the wordings still on their way do not hold the card back', () => {
    const client = newClient();
    client.setQueryData(automationKeys.status, READY);
    const html = reading(client);
    expect(html).toContain('הכול מוכן — הבוט חוזר ללידים לבד');
    expect(section(html, 'תבניות')).toContain('>תבניות<');
  });
});

describe('in the settings', () => {
  it('under "מצב המערכת", and above the ManyChat connection', () => {
    const client = newClient();
    client.setQueryData(automationKeys.status, NOT_READY);
    const html = settings(client);
    const order = ['aria-label="מצב המערכת"', `id="${LEADS_AUTOMATION_CARD_ID}"`, 'החיבור ל-ManyChat'].map((mark) => html.indexOf(mark));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });

  it('a server from before: the settings are exactly as they were', () => {
    const client = newClient();
    client.setQueryData(automationKeys.status, null);
    const html = settings(client);
    expect(html).not.toContain('חזרה אוטומטית ללידים');
    expect(html).not.toContain(LEADS_AUTOMATION_CARD_ID);
    expect(html).toContain('מצב המערכת');
    expect(html).toContain('החיבור ל-ManyChat');
  });

  it('the card adds no switch to the settings: the one there is, is the one there was', () => {
    const before = newClient();
    before.setQueryData(automationKeys.status, null);
    const after = newClient();
    after.setQueryData(automationKeys.status, NOT_READY);
    const switches = (html: string) => (html.match(/role="switch"/g) ?? []).length;
    expect(switches(settings(after))).toBe(switches(settings(before)));
  });
});
