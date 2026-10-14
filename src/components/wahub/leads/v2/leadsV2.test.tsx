import React from 'react';
import { HoverHelp, StageHelp, StagesLegend } from '../../shared/StageHelp';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { readLeadBoard } from '@/lib/wahub/leadStage';
import { readAutomation } from '@/lib/wahub/leadsAutomation';
import { NO_DETAILS } from '@/lib/wahub/leadsV2';
import type {
  WahubLeadCounts,
  WahubLeadDetails,
  WahubLeadFollowUp,
  WahubLeadRow,
  WahubLeadStageCount,
  WahubLeadsPage,
  WahubLeadsView,
  WahubStatus,
  WahubSummary,
} from '@/types/wahub';
import { leadKeys } from '../../hooks/useLeadQueries';
import { automationKeys } from '../../hooks/useLeadsAutomation';
import type { WahubLiveHandle } from '../../hooks/useWahubLive';
import { wahubKeys } from '../../hooks/useWahubQueries';
import TodayTab from '../../TodayTab';
import s from '../../wahub.module.css';
import LeadsTab from '../LeadsTab';
import LeadActions, { LeadActionsView, type LeadActionsViewProps } from './LeadActions';
import LeadDetails, { type LeadDetailsProps } from './LeadDetails';
import LeadRow from './LeadRow';
import LeadsList, { type LeadsListProps } from './LeadsList';
import TodayLeadsCard from './TodayLeadsCard';
import l from './leads.module.css';
import { leadsKeys } from './useLeads';

// Nothing here may reach a server: the lists and the leads are handed over, or put in the cache.
const refuse = vi.hoisted(() => () => vi.fn(() => Promise.reject(new Error('the test must not reach the server'))));
vi.mock('@/lib/wahub/leadsV2Api', async (original) => ({
  ...(await original<typeof import('@/lib/wahub/leadsV2Api')>()),
  fetchWahubLeads: refuse(),
  fetchWahubLead: refuse(),
  closeWahubLead: refuse(),
  reopenWahubLead: refuse(),
  snoozeWahubLead: refuse(),
  setWahubLeadOwner: refuse(),
  fetchWahubLeadsAutomation: refuse(),
}));
vi.mock('@/lib/wahubApi', async (original) => ({
  ...(await original<typeof import('@/lib/wahubApi')>()),
  fetchWahubLeadBoard: refuse(),
  fetchWahubContacts: refuse(),
  fetchWahubCounts: refuse(),
  fetchWahubSummary: refuse(),
  fetchWahubUnregisteredLeads: refuse(),
}));
// The screen of work queues from before reads who is signed in (for the branches filter).
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'דור', branch_ids: [] }, loading: false }),
}));
// A phone, when a test says so — the same line the stylesheet draws it from.
const screenIs = vi.hoisted(() => ({ phone: false }));
vi.mock('@/hooks/useMediaQuery', () => ({
  LG_MEDIA_QUERY: '(min-width: 1024px)',
  MD_MEDIA_QUERY: '(min-width: 768px)',
  useMediaQuery: (query: string) => screenIs.phone && query.includes('767'),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-LEADS-V2.md, ה and ח — the leads tab as one list: who
 * waits for the office, who the bot is handling, "נסגרו" behind a quiet link;
 * a row that says who, why and what is next; and the details of one lead with
 * the few things that can be done. On a server that has no `leads/` yet, the
 * board from before. Every name and number here is invented.
 */

/** Monday, 12.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-12T09:00:00Z');
const noop = () => {};

function lead(id: number, overrides: Partial<WahubLeadRow> = {}): WahubLeadRow {
  return {
    contact_id: id,
    name: 'תמר אוחיון',
    phone: `97250000${String(id).padStart(4, '0')}`,
    is_demo: false,
    stage: 'link_sent',
    stage_label: 'קיבל קישור ועוד לא נרשם',
    owner: 'bot',
    summary: 'אמא לילדה בת 5 בראש העין, שאלה על קפוארה, קיבלה קישור ולא נרשמה',
    chips: { branch: 'ראש העין', course_type: 'קפוארה', child: 'בת 5' },
    since: '2026-10-10T09:12:00Z',
    next: { who: 'bot', what: 'הבוט ישאל אם משהו נתקע באתר', when: '2026-10-13T07:30:00Z', state: 'planned' },
    last_message_at: '2026-10-10T09:12:00Z',
    ...overrides,
  };
}

// The kinds of people the real conversations showed (docs/WAHUB-CUSTOMER-TYPES-2026-10-12.md), with invented names.
const STUCK = lead(21, {
  name: 'מיכל ברק',
  stage: 'signup_stuck',
  stage_label: 'נתקע בהרשמה',
  owner: 'office',
  summary: 'ניסתה להירשם לאקרובטיקה בפתח תקווה — באתר כתוב שהקבוצה מלאה',
  chips: { branch: 'פתח תקווה', course_type: 'אקרובטיקה', child: 'כיתה ד׳' },
  since: '2026-10-12T07:40:00Z',
  next: { who: 'office', what: 'לעזור לסיים את ההרשמה', when: null, state: 'none' },
});
const ASKED = lead(22, {
  name: 'אורי שגב',
  stage: 'needs_reply',
  stage_label: 'שאל ולא קיבל מענה',
  owner: 'office',
  summary: 'שאל כמה ילדים יש בקבוצה ולא קיבל תשובה',
  chips: { branch: 'כפר סבא', course_type: 'קפוארה', child: 'בן 4' },
  since: '2026-10-11T15:00:00Z',
  next: { who: 'office', what: 'לענות על השאלה', when: null, state: 'none' },
});
const LINK = lead(23);
const TOO_YOUNG = lead(24, {
  name: 'נועה פרידמן',
  stage: 'waiting_date',
  stage_label: 'מחכה למועד',
  summary: 'הילד בן שנתיים ו-7 חודשים — צעיר מדי לקבוצה',
  chips: { branch: 'ראש העין', course_type: '', child: 'בן שנתיים ו-7 חודשים' },
  next: { who: 'bot', what: 'הילד יהיה בן 3', when: '2027-03-12', state: 'planned' },
});
const HELD = lead(25, {
  name: 'יעל דרור',
  stage: 'will_check',
  stage_label: 'אמר שיבדוק ויחזור',
  summary: 'אמרה שתדבר עם בן הזוג ותחזור',
  chips: { branch: '', course_type: 'אקרובטיקה', child: '' },
  next: { who: 'bot', what: 'הבוט ישאל אם יש חדש', when: '2026-10-12T07:30:00Z', state: 'due' },
});
const OUTSIDE = lead(26, {
  name: 'דנה אלון',
  owner: '',
  summary: 'שאלה על קפוארה בסניף של המתנ״ס',
  chips: { branch: 'מתנ״ס יהוד', course_type: 'קפוארה', child: 'בן 7' },
  next: { who: 'none', what: 'סניף חיצוני — ההרשמה מול העירייה', when: null, state: 'none' },
});
const ADDING = lead(27, {
  name: 'גלית מור',
  summary: 'הבן כבר בקפוארה; רוצה לרשום גם את אחותו לאקרובטיקה',
  chips: { branch: 'כפר סבא', course_type: 'אקרובטיקה', child: 'בת 6', existing: true },
});
const DEMO = lead(28, { name: 'רונית לב', is_demo: true });
const REGISTERED = lead(31, {
  name: 'אבי נחום',
  owner: '',
  stage: 'registered',
  stage_label: 'נרשם',
  summary: 'נרשם לקפוארה בראש העין',
  next: { who: 'none', what: '', when: null, state: 'none' },
});
const DELETED = lead(32, {
  name: 'שירה כץ',
  owner: '',
  stage: 'deleted',
  stage_label: 'נמחק',
  summary: 'חיפשה אולם להשכרה',
  next: { who: 'none', what: '', when: null, state: 'none' },
});

const COUNTS: WahubLeadCounts = { office: 7, bot: 41, closed: 212 };
const OFFICE_STAGES: WahubLeadStageCount[] = [
  { key: 'signup_stuck', label: 'נתקע בהרשמה', count: 2 },
  { key: 'needs_reply', label: 'שאל ולא קיבל מענה', count: 5 },
];

function list(overrides: Partial<LeadsListProps> = {}): React.ReactElement {
  return (
    <LeadsList
      view="office"
      counts={COUNTS}
      stage={null}
      stages={OFFICE_STAGES}
      search=""
      status="ready"
      error=""
      rows={[STUCK, ASKED]}
      stale={false}
      hasMore={false}
      loadingMore={false}
      refreshing={false}
      selectedId={null}
      now={NOW}
      sendingOn={false}
      onView={noop}
      onStage={noop}
      onSearch={noop}
      onOpen={noop}
      onMore={noop}
      onRetry={noop}
      {...overrides}
    />
  );
}

const DETAILS: WahubLeadDetails = {
  reason: 'קיבלה את כל הפרטים וקישור להרשמה לפני יומיים, ומאז לא כתבה',
  blocker_text: 'אמרה שתבדוק עם הבת שלה ותחזור',
  child: { name: 'נועם', age_years: 5, age_months: null, grade: 'גן חובה', birth_date: null },
  come_back_on: '2026-10-20',
  come_back_why: 'אחרי החגים',
  trial: { course: 'קפוארה גן', branch: 'ראש העין', date: '2026-10-08T14:00:00Z', instructor: 'יואב', attended: true },
  followups: [
    followUp({ id: 4, step: 1, status: 'sent', due_at: '2026-10-11T07:30:00Z', acted_at: '2026-10-11T07:31:00Z', text: 'היי, ראיתי שעוד לא נרשמתם — משהו נתקע באתר?' }),
    followUp({ id: 5, step: 2, status: 'planned', due_at: '2026-10-13T07:30:00Z', text: 'היי, רוצים שאשריין מקום לשיעור ניסיון ביום רביעי?', why: 'לא ענתה לפנייה הראשונה' }),
  ],
  timeline: [
    { at: '2026-10-10T09:00:00Z', text: 'כתבה לראשונה, ממודעה' },
    { at: '2026-10-10T09:12:00Z', text: 'קיבלה ימים, מחיר וקישור להרשמה' },
  ],
  in_system: '/customers?child=77',
};

function followUp(overrides: Partial<WahubLeadFollowUp>): WahubLeadFollowUp {
  return {
    id: 1,
    kind: 'link_reminder',
    kind_label: '',
    step: 1,
    due_at: null,
    status: 'planned',
    status_label: '',
    text: '',
    why: '',
    acted_at: null,
    outcome_note: '',
    ...overrides,
  };
}

function details(overrides: Partial<LeadDetailsProps> = {}): React.ReactElement {
  return (
    <LeadDetails
      lead={LINK}
      details={DETAILS}
      status="ready"
      error=""
      now={NOW}
      sendingOn={false}
      cover={false}
      busy={null}
      onClose={noop}
      onRetry={noop}
      onOpenChat={noop}
      onChange={noop}
      {...overrides}
    />
  );
}

function actions(overrides: Partial<LeadActionsViewProps> = {}): React.ReactElement {
  return (
    <LeadActionsView
      lead={LINK}
      now={NOW}
      busy={null}
      mode="idle"
      until="2026-10-19"
      note=""
      onMode={noop}
      onUntil={noop}
      onNote={noop}
      onOpenChat={noop}
      onChange={noop}
      {...overrides}
    />
  );
}

/**
 * The elements a component draws, without a browser: a component that keeps no state is called as the function
 * it is. One that does keep state (`skip`) is left as it stands — its own view is read on its own.
 */
function elements(node: React.ReactNode, skip: unknown[] = []): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, skip));
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    if (skip.includes(element.type)) return [];
    // The bubble on a state keeps state of its own: read as the element it is, with what it wraps.
    if (BUBBLES.includes(element.type)) return [element, ...elements(element.props.children, skip)];
    return elements((element.type as (props: unknown) => React.ReactNode)(element.props), skip);
  }
  return [element, ...elements(element.props.children, skip)];
}

const BUBBLES: unknown[] = [StageHelp, StagesLegend, HoverHelp];

/** A component that keeps state, as the element its parent drew for it — so what it was handed can be read. */
function componentOf<P>(node: React.ReactNode, component: (props: P) => React.ReactNode): React.ReactElement<P> {
  const walk = (child: React.ReactNode): React.ReactElement<P> | null => {
    if (Array.isArray(child)) return child.map(walk).find(Boolean) ?? null;
    if (!React.isValidElement(child)) return null;
    const element = child as React.ReactElement<{ children?: React.ReactNode }>;
    if (element.type === component) return element as unknown as React.ReactElement<P>;
    if (BUBBLES.includes(element.type)) return walk(element.props.children);
    if (typeof element.type === 'function') return walk((element.type as (props: unknown) => React.ReactNode)(element.props));
    return walk(element.props.children);
  };
  const found = walk(node);
  if (!found) throw new Error('the component is not drawn');
  return found;
}

type Pressable = React.ReactElement<{ onClick: () => void; disabled?: boolean }>;

/** The button whose own markup carries these words. The innermost one, so a row is found rather than what holds it. */
function buttonWith(node: React.ReactNode, text: string, skip: unknown[] = []): Pressable {
  const found = elements(node, skip).filter((element) => element.type === 'button' && renderToStaticMarkup(element).includes(text));
  if (!found.length) throw new Error(`no button with "${text}"`);
  return found[found.length - 1] as Pressable;
}

function buttonLabels(node: React.ReactNode, skip: unknown[] = []): string[] {
  return elements(node, skip)
    .filter((element) => element.type === 'button')
    .map((element) => renderToStaticMarkup(element).replace(/<[^>]+>/g, '').trim());
}

/** One row of the list, by a name in it. */
function rowOf(html: string, name: string): string {
  const at = html.indexOf(name);
  if (at < 0) throw new Error(`no row with "${name}"`);
  return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
}

const section = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`);
  if (at < 0) throw new Error(`no section "${label}"`);
  return html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
};

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe('the bar: two tabs, "נסגרו" as a quiet link, one filter and the search', () => {
  const html = renderToStaticMarkup(list());

  it('"מחכים לך (N)" and "הבוט מטפל (N)" — two tabs and no third', () => {
    const tabs = html.match(/role="tab"[^>]*>.*?<\/button>/g) ?? [];
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toContain('מחכים לך');
    expect(tabs[0]).toContain('>7<');
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[1]).toContain('הבוט מטפל');
    expect(tabs[1]).toContain('>41<');
    expect(tabs[1]).toContain('aria-selected="false"');
  });

  it('somebody waits for the office: its number is amber — and nothing on this screen is red', () => {
    expect(html).toMatch(new RegExp(`${l.tabCountAct}[^>]*>7<`));
    expect(html.match(new RegExp(l.tabCountAct, 'g'))).toHaveLength(1);
    const nobody = renderToStaticMarkup(list({ counts: { office: 0, bot: 41, closed: 3 }, rows: [] }));
    expect(nobody).not.toContain(l.tabCountAct);
    for (const red of [s.pBad, s.cntHot, s.segBadge, s.badText, s.btnBad]) expect(html).not.toContain(red);
  });

  it('"נסגרו" is a link at the side with its number, pressed only when the closed list is the one in front', () => {
    expect(html).toMatch(new RegExp(`aria-pressed="false"[^>]*class="${l.closedLink}"[^>]*>נסגרו<span[^>]*>\\(212\\)</span>`));
    const closed = renderToStaticMarkup(list({ view: 'closed', rows: [REGISTERED], stages: [] }));
    expect(closed).toContain(l.closedOn);
    expect(closed).toContain('aria-pressed="true"');
    expect(closed).not.toContain('aria-selected="true"');
  });

  it('one filter: every state that has someone in it, with its number — and "all" with the list\'s own', () => {
    const select = html.slice(html.indexOf('<select'), html.indexOf('</select>'));
    expect(select).toContain('aria-label="סינון לפי מצב"');
    const options = select.match(/<option[^>]*>[^<]*/g)?.map((option) => option.replace(/<option[^>]*>/, '')) ?? [];
    expect(options).toEqual(['כל המצבים (7)', 'נתקע בהרשמה (2)', 'שאל ולא קיבל מענה (5)']);
    expect(html.match(/<select/g)).toHaveLength(1);
  });

  it('with nothing to choose between, the filter is not drawn at all', () => {
    expect(renderToStaticMarkup(list({ stages: [OFFICE_STAGES[0]] }))).not.toContain('<select');
    expect(renderToStaticMarkup(list({ stages: [] }))).not.toContain('<select');
    // A state already chosen keeps the control on screen, marked, so it can be let go of.
    const chosen = renderToStaticMarkup(list({ stage: 'signup_stuck', stages: [OFFICE_STAGES[0]] }));
    expect(chosen).toContain(l.stageOn);
    expect(chosen).toMatch(/<option value="signup_stuck" selected="">נתקע בהרשמה \(2\)/);
  });

  it('a search box, with a way to clear it once something was typed', () => {
    expect(html).toContain('aria-label="חיפוש בלידים"');
    expect(html).not.toContain('aria-label="נקה חיפוש"');
    const onSearch = vi.fn();
    buttonWith(list({ search: 'תמר', onSearch }), 'נקה חיפוש').props.onClick();
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('no board of columns, no switches, and no button the contract does not list', () => {
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('ליד חדש');
    expect(html).not.toContain('aria-label="מצבי הלידים"');
    expect(buttonLabels(list())).toEqual(['מחכים לך7', 'הבוט מטפל41', 'נסגרו(212)', expect.stringContaining('מיכל ברק'), expect.stringContaining('אורי שגב')]);
  });

  it('a press on a tab, on "נסגרו", on a state and on a row each say what was pressed', () => {
    const onView = vi.fn();
    const onStage = vi.fn();
    const onOpen = vi.fn();
    const tree = list({ onView, onStage, onOpen });
    buttonWith(tree, 'הבוט מטפל').props.onClick();
    buttonWith(tree, 'נסגרו').props.onClick();
    expect(onView.mock.calls).toEqual([['bot'], ['closed']]);

    const select = elements(tree).find((element) => element.type === 'select') as React.ReactElement<{ onChange: (event: unknown) => void }>;
    select.props.onChange({ target: { value: 'needs_reply' } });
    select.props.onChange({ target: { value: '' } });
    expect(onStage.mock.calls).toEqual([['needs_reply'], [null]]);

    buttonWith(tree, 'אורי שגב').props.onClick();
    expect(onOpen).toHaveBeenCalledWith(22);
  });

  it('before the numbers are known the tabs carry none, and "all" says only that', () => {
    const waiting = renderToStaticMarkup(list({ counts: null, status: 'loading', rows: [], stage: 'signup_stuck' }));
    expect(waiting).not.toContain(l.tabCount);
    expect(waiting).toContain('>כל המצבים<');
    expect(waiting).not.toContain('(212)');
  });
});

describe('a row: who, the one sentence, quiet chips, and the next step', () => {
  const row = (target: WahubLeadRow, props: Partial<React.ComponentProps<typeof LeadRow>> = {}) =>
    renderToStaticMarkup(<LeadRow lead={target} now={NOW} sendingOn={false} selected={false} onOpen={noop} {...props} />);

  it('the name, the sentence, the chips in one order, how long ago — and the whole row is one button', () => {
    const html = row(LINK);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`class="${l.name}"[^>]*>תמר אוחיון<`));
    expect(html).toMatch(new RegExp(`class="${l.summary}"[^>]*>אמא לילדה בת 5 בראש העין, שאלה על קפוארה, קיבלה קישור ולא נרשמה<`));
    const chips = html.match(new RegExp(`class="${l.chip}"[^>]*>[^<]+`, 'g'))?.map((chip) => chip.replace(/.*>/, ''));
    expect(chips).toEqual(['ראש העין', 'קפוארה', 'בת 5']);
    expect(html).toMatch(new RegExp(`class="${l.since}">לפני יומיים<`));
    // The order the eye takes: the name, the sentence, the chips, the next step — and, last and quiet, how long ago.
    const order = [l.name, l.summary, l.chips, l.next, l.since].map((name) => html.indexOf(`class="${name}`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the bot\'s step: what and when, on the bot\'s ground', () => {
    const html = row(LINK);
    expect(html).toContain('data-next="bot"');
    expect(html).toContain(l.nextBot);
    expect(html).toContain('הבוט ישאל אם משהו נתקע באתר מחר ב-10:30');
  });

  it('the office\'s step: "מחכה לך" and the task, on gold', () => {
    const html = row(STUCK);
    expect(html).toContain('data-next="office"');
    expect(html).toContain(l.nextOffice);
    expect(html).toContain('מחכה לך: לעזור לסיים את ההרשמה');
    expect(html).toMatch(new RegExp(`class="${l.since}">לפני שעה<`));
  });

  it('due and held back: the row says so, and why; the server\'s own words are a hover away', () => {
    const html = row(HELD);
    expect(html).toContain('data-next="held"');
    expect(html).toContain(l.nextHeld);
    expect(html).toContain('היה נשלח עכשיו — השליחה כבויה');
    // The server's own words are in the bubble a mouse opens on the line (nextStepHelp), not a second, native title.
    expect(html).not.toContain('title="הבוט ישאל אם יש חדש"');
    expect(row(HELD, { sendingOn: true })).toContain('היה נשלח עכשיו — אין תבנית מאושרת');
    expect(row(HELD, { sendingOn: null })).toContain('היה נשלח עכשיו — עוד לא נשלח');
  });

  it('waiting for a date: the date first, then why', () => {
    expect(row(TOO_YOUNG)).toContain('ב-12.3 — הילד יהיה בן 3');
  });

  it('nobody\'s step still says its words — an outside branch is never an empty cell', () => {
    const html = row(OUTSIDE);
    expect(html).toContain('data-next="quiet"');
    expect(html).toContain(l.nextQuiet);
    expect(html).toContain('סניף חיצוני — ההרשמה מול העירייה');
  });

  it('an existing customer who wants to add: a quiet chip, before the others', () => {
    const chips = row(ADDING).match(new RegExp(`class="${l.chip}"[^>]*>[^<]+`, 'g'))?.map((chip) => chip.replace(/.*>/, ''));
    expect(chips).toEqual(['לקוח קיים — רוצה להוסיף', 'כפר סבא', 'אקרובטיקה', 'בת 6']);
  });

  it('"דמו" beside the name of an invented customer, and nowhere else', () => {
    expect(row(DEMO)).toContain('>דמו<');
    expect(row(LINK)).not.toContain('>דמו<');
  });

  it('no state tag in a row: the state is the filter\'s, and the details\'', () => {
    expect(row(LINK)).not.toContain('קיבל קישור ועוד לא נרשם');
    expect(row(LINK)).not.toContain(s.pill);
  });

  it('a closed lead says how it ended where the next step would be', () => {
    expect(row(REGISTERED, { closed: true })).toMatch(/data-next="quiet"[^>]*>(<svg.*?<\/svg>)?<span[^>]*>נרשם</);
    const odd = lead(40, { owner: '', stage: 'moved_away', stage_label: 'עברו דירה', next: { who: 'none', what: '', when: null, state: 'none' } });
    expect(row(odd, { closed: true })).toContain('>עברו דירה<');
  });

  it('the row whose details are open is marked, for the eye and for a reader', () => {
    const html = row(LINK, { selected: true });
    expect(html).toContain('aria-current="true"');
    expect(html).toContain(l.rowOn);
    expect(row(LINK)).not.toContain('aria-current');
  });

  it('a lead the bot has not summed up yet, with no name: the phone, and a line that says so', () => {
    const html = row(lead(9, { name: '', summary: '', chips: { branch: '', course_type: '', child: '' } }));
    expect(html).toContain('>050-000-0009<');
    expect(html).toContain('הבוט עוד לא סיכם את השיחה');
    expect(html).not.toContain(l.chips);
  });
});

describe('the list: waiting, empty, failing', () => {
  it('waiting: rows of a row\'s own shape, under a bar that is already there', () => {
    const html = renderToStaticMarkup(list({ status: 'loading', rows: [], counts: null, stages: [] }));
    expect(html).toContain('aria-label="טוען את הלידים"');
    expect(html.match(new RegExp(`class="${l.skRow}"`, 'g'))).toHaveLength(6);
    expect(html).toContain('מחכים לך');
    expect(html).toContain('aria-label="חיפוש בלידים"');
  });

  it('nobody waits for the office: said kindly, with what the bot is doing', () => {
    const html = renderToStaticMarkup(list({ rows: [], counts: { office: 0, bot: 41, closed: 3 }, stages: [] }));
    expect(html).toContain('אין לידים שמחכים לך');
    expect(html).toContain('הבוט מטפל ב-41 לידים.');
    expect(html).not.toContain('נקה סינון');
    expect(html).not.toContain('role="alert"');
  });

  it('the bot\'s list and the closed one have words of their own', () => {
    expect(renderToStaticMarkup(list({ view: 'bot', rows: [], counts: { office: 2, bot: 0, closed: 0 }, stages: [] }))).toContain('הבוט לא מטפל כרגע באף ליד');
    expect(renderToStaticMarkup(list({ view: 'closed', rows: [], counts: { office: 0, bot: 0, closed: 0 }, stages: [] }))).toContain('עוד לא נסגר אף ליד');
  });

  it('a search or a state that found nobody says only that, with one way out', () => {
    const onSearch = vi.fn();
    const onStage = vi.fn();
    const tree = list({ rows: [], search: 'זזז', onSearch, onStage });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('אין לידים שמתאימים');
    expect(html).not.toContain('אין לידים שמחכים לך');
    buttonWith(tree, 'נקה סינון').props.onClick();
    expect(onSearch).toHaveBeenCalledWith('');
    expect(onStage).toHaveBeenCalledWith(null);
  });

  it('a failure: one sentence in Hebrew and "נסו שוב", where the rows would be — the bar stays', () => {
    const onRetry = vi.fn();
    const tree = list({ status: 'error', error: 'השרת לא זמין כרגע', rows: [], onRetry });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את הלידים');
    expect(html).toContain('השרת לא זמין כרגע');
    expect(html).toContain('מחכים לך');
    buttonWith(tree, 'נסו שוב').props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
    // With no sentence from the server, the screen has one of its own.
    expect(renderToStaticMarkup(list({ status: 'error', rows: [] }))).toContain('בדקו את החיבור ונסו שוב.');
  });

  it('more to read: "הצג עוד" under the rows, and it waits while a page is on its way', () => {
    expect(renderToStaticMarkup(list())).not.toContain('הצג עוד');
    const onMore = vi.fn();
    const tree = list({ hasMore: true, onMore });
    buttonWith(tree, 'הצג עוד').props.onClick();
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(buttonWith(list({ hasMore: true, loadingMore: true }), 'הצג עוד').props.disabled).toBe(true);
  });

  it('rows that answer what was asked a moment ago are dimmed until theirs land', () => {
    expect(renderToStaticMarkup(list({ stale: true }))).toContain(l.stale);
    expect(renderToStaticMarkup(list())).not.toContain(l.stale);
  });
});

// ---------------------------------------------------------------------------
// The details of one lead
// ---------------------------------------------------------------------------

describe('the details: everything a press opens', () => {
  const html = renderToStaticMarkup(details());

  it('who: the name, the phone, the state in plain words, and how long', () => {
    const head = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(head).toContain('תמר אוחיון');
    expect(head).toContain('050-000-0023');
    expect(head).toContain('קיבל קישור ועוד לא נרשם');
    expect(head).toContain('לפני יומיים');
  });

  // 12.10.2026 (docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md): the block is now called
  // "מה קורה עכשיו" and carries the bot's message with it — it is the one thing the screen is about.
  it('"מה קורה עכשיו" stands first, on the ground of whose move it is', () => {
    const now = section(html, 'מה קורה עכשיו');
    expect(now).toContain(l.nextBot);
    expect(now).toContain('הבוט ישאל אם משהו נתקע באתר מחר ב-10:30');
    expect(html.indexOf('aria-label="מה קורה עכשיו"')).toBeLessThan(html.indexOf('aria-label="למה זה ליד"'));
    const held = section(renderToStaticMarkup(details({ lead: HELD })), 'מה קורה עכשיו');
    expect(held).toContain('היה נשלח עכשיו — השליחה כבויה');
    // What the bot meant to do is said under it.
    expect(held).toContain('הבוט ישאל אם יש חדש');
  });

  it('the bot\'s message that is still ahead is inside "מה קורה עכשיו": its wording, and one word for where it stands', () => {
    const now = section(html, 'מה קורה עכשיו');
    expect(now).toContain('היי, רוצים שאשריין מקום לשיעור ניסיון ביום רביעי?');
    expect(now).toContain(l.bubbleAhead);
    expect(now.match(new RegExp(l.fuStatus, 'g'))).toHaveLength(1);
    expect(now).toContain('>מתוכנן<');
    expect(now).toContain('פנייה 2');
    // Why the bot planned it says something the screen does not say elsewhere: it stays.
    expect(now).toContain('למה: לא ענתה לפנייה הראשונה');
    // The hour is the block's own line; it is not said again under the wording.
    expect(now.split('מחר ב-10:30')).toHaveLength(2);
  });

  it('a message that was due and did not go out: the block says so once — no tag and no note repeat it', () => {
    const due = renderToStaticMarkup(
      details({
        lead: HELD,
        details: {
          ...NO_DETAILS,
          followups: [followUp({ id: 9, kind: 'will_check', step: 1, status: 'due', due_at: '2026-10-12T07:30:00Z', text: 'היי, יש חדש?' })],
        },
      }),
    );
    const now = section(due, 'מה קורה עכשיו');
    expect(now).toContain('היי, יש חדש?');
    expect(now.split('היה נשלח עכשיו')).toHaveLength(2);
    expect(now.split('השליחה כבויה')).toHaveLength(2);
    expect(now).not.toContain(l.fuStatus);
    expect(now).toContain('פנייה 1');
  });

  it('a message that went out, while it is the bot the lead waits on: its wording, marked "נשלח" — and history once the step is the office\'s', () => {
    const sent = followUp({ id: 7, step: 1, status: 'sent', due_at: '2026-10-11T07:30:00Z', acted_at: '2026-10-11T07:31:00Z', text: 'היי, משהו נתקע באתר?' });
    const waiting = lead(41, { next: { who: 'none', what: 'הבוט חזר אליו — מחכים לתשובה', when: null, state: 'none' } });
    const bot = renderToStaticMarkup(details({ lead: waiting, details: { ...NO_DETAILS, followups: [sent] } }));
    const now = section(bot, 'מה קורה עכשיו');
    expect(now).toContain('היי, משהו נתקע באתר?');
    expect(now).toContain(l.bubbleSent);
    expect(now).toContain('>נשלח<');
    expect(now).toContain('11.10 10:31');
    expect(bot).not.toContain('aria-label="פניות קודמות של הבוט"');
    const office = renderToStaticMarkup(details({ lead: ASKED, details: { ...NO_DETAILS, followups: [sent] } }));
    expect(section(office, 'מה קורה עכשיו')).not.toContain('היי, משהו נתקע באתר?');
    expect(section(office, 'פניות קודמות של הבוט')).toContain('היי, משהו נתקע באתר?');
  });

  it('the sections, in one order: now, why, what stops them, when, the trial, the child — then, folded, the bot\'s earlier messages and what happened', () => {
    const titles = ['מה קורה עכשיו', 'למה זה ליד', 'מה עוצר את ההרשמה', 'מתי חוזרים', 'שיעור הניסיון', 'הילד', 'פניות קודמות של הבוט', 'מה קרה עד עכשיו'];
    const order = titles.map((title) => html.indexOf(`aria-label="${title}"`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('a section\'s title is a title — and nothing on the screen is in the faint label of before', () => {
    expect(section(html, 'למה זה ליד')).toContain(`<h3 class="${l.dTitle}">למה זה ליד</h3>`);
    expect(html).not.toContain('dLabel');
  });

  it('why, what stops them, and when to come back — each in a sentence', () => {
    expect(section(html, 'למה זה ליד')).toContain('קיבלה את כל הפרטים וקישור להרשמה לפני יומיים, ומאז לא כתבה');
    expect(section(html, 'למה זה ליד')).toContain('>ראש העין<');
    expect(section(html, 'מה עוצר את ההרשמה')).toContain('אמרה שתבדוק עם הבת שלה ותחזור');
    const when = section(html, 'מתי חוזרים');
    expect(when).toContain('יום שלישי, 20.10.2026');
    expect(when).toContain('אחרי החגים');
  });

  it('the child and the trial: only what is known, as short facts', () => {
    const child = section(html, 'הילד');
    expect(child).toMatch(/<dt>שם<\/dt><dd[^>]*>נועם<\/dd>/);
    expect(child).toMatch(/<dt>גיל<\/dt><dd[^>]*>5<\/dd>/);
    expect(child).toMatch(/<dt>כיתה<\/dt><dd[^>]*>גן חובה<\/dd>/);
    expect(child).not.toContain('תאריך לידה');
    const trial = section(html, 'שיעור הניסיון');
    expect(trial).toMatch(/<dt>חוג<\/dt><dd[^>]*>קפוארה גן<\/dd>/);
    expect(trial).toMatch(/<dt>מתי<\/dt><dd[^>]*>יום חמישי, 8.10.2026 ב-17:00<\/dd>/);
    expect(trial).toMatch(/<dt>מדריך<\/dt><dd[^>]*>יואב<\/dd>/);
    expect(trial).toMatch(/<dt>הגעה<\/dt><dd[^>]*>הגיעו<\/dd>/);
  });

  it('each thing once: what stops them is drawn only when it adds to the sentence above it', () => {
    // The owner's own screen (12.10): the same sentence stood under "למה זה ליד", under "מה עוצר את ההרשמה",
    // on the "למה:" line of the bot's message, and again in the timeline.
    const why = 'שאל על קפוארה בסניף הדגמה (גיל 6) אתמול. אמר שיבדוק ויחזור: "אני אבדוק".';
    const once = renderToStaticMarkup(
      details({
        lead: lead(42, { stage: 'will_check', stage_label: 'אמר שיבדוק ויחזור', summary: why, chips: { branch: 'סניף הדגמה', course_type: 'קפוארה', child: 'גיל 6' } }),
        details: {
          ...NO_DETAILS,
          reason: why,
          blocker_text: 'אמר שיבדוק ויחזור: "אני אבדוק"',
          child: { name: '', age_years: 6, age_months: null, grade: '', birth_date: null },
          followups: [followUp({ id: 3, kind: 'will_check', step: 1, status: 'planned', due_at: '2026-10-13T07:30:00Z', text: 'היי, הספקתם לחשוב?', why })],
          timeline: [
            { at: '2026-10-12T04:15:00Z', text: `בשיחה ← אמר שיבדוק ויחזור (${why})` },
            { at: '2026-10-11T14:45:00Z', text: 'נוצר מהודעת וואטסאפ' },
          ],
        },
      }),
    );
    expect(once.split('אני אבדוק')).toHaveLength(2);
    expect(once).not.toContain('aria-label="מה עוצר את ההרשמה"');
    expect(once).not.toContain('למה:');
    // The chip already says the age: the child's own section would say it a second time.
    expect(once).not.toContain('aria-label="הילד"');
    // The timeline's line is the short thing it should be.
    expect(section(once, 'מה קרה עד עכשיו')).toContain('>בשיחה ← אמר שיבדוק ויחזור<');
  });

  it('what is behind us is folded: a title and how many — the bot\'s earlier messages, and what happened', () => {
    const earlier = section(html, 'פניות קודמות של הבוט');
    expect(earlier).toMatch(/<details class="[^"]*"><summary/);
    expect(earlier).not.toMatch(/<details[^>]* open/);
    expect(earlier).toMatch(/פניות קודמות של הבוט <span[^>]*>\(1\)<\/span>/);
    const items = earlier.split('<li').slice(1);
    expect(items).toHaveLength(1);
    // One that is behind us is a title — what, when, what became of it; its wording is a press away.
    expect(items[0]).toContain('תזכורת לקישור ההרשמה · פנייה 1');
    expect(items[0]).toContain('>נשלח<');
    expect(items[0]).toContain('11.10 10:31');
    expect(items[0]).toContain('היי, ראיתי שעוד לא נרשמתם — משהו נתקע באתר?');
    // The one still ahead is not here: it stands in "מה קורה עכשיו".
    expect(earlier).not.toContain('היי, רוצים שאשריין מקום');
  });

  it('a short timeline behind its title', () => {
    const timeline = section(html, 'מה קרה עד עכשיו');
    expect(timeline).toMatch(/<details class="[^"]*"><summary/);
    expect(timeline).not.toMatch(/<details[^>]* open/);
    expect(timeline).toMatch(/מה קרה עד עכשיו <span[^>]*>\(2\)<\/span>/);
    expect(timeline).toContain('10.10 12:00');
    expect(timeline).toContain('כתבה לראשונה, ממודעה');
    expect(timeline).toContain('קיבלה ימים, מחיר וקישור להרשמה');
  });

  // Owner, 13.10.2026: "בלחיצת כפתור אני יכול לעבור לכרטיס הלקוח".
  it('"לכרטיס הלקוח": one clear button among the actions, beside "פתח שיחה" — and no link at the foot of the details', () => {
    const actions = html.slice(html.indexOf(`class="${l.actions}"`), html.indexOf(l.dScroll));
    expect((html.match(/לכרטיס הלקוח/g) ?? []).length).toBe(1);
    expect(actions).toMatch(/<a [^>]*href="\/customers\?child=77"[^>]*>.*לכרטיס הלקוח<\/a>/);
    expect(actions.indexOf('פתח שיחה')).toBeLessThan(actions.indexOf('לכרטיס הלקוח'));
    // The two ways out share the first row; what changes the lead shares the second.
    expect(actions).toContain(l.actGridCard);
    expect(actions).toContain(l.actCard);
    expect(html).not.toContain('aria-label="במערכת"');
    expect(html).not.toContain('כרטיס הלקוח ב-Kogo');
  });

  it('nobody Kogo knows — or a family with no card to open — and there is no button at all (not a locked one)', () => {
    for (const in_system of [null, '/customers']) {
      const unknown = renderToStaticMarkup(details({ details: { ...DETAILS, in_system } }));
      expect(unknown).not.toContain('לכרטיס הלקוח');
      expect(unknown).not.toContain('href="/customers');
      expect(unknown).not.toContain(l.actGridCard);
    }
    // Until the details were read the row alone does not say: the actions stand as they always did.
    const waiting = renderToStaticMarkup(details({ details: null, status: 'loading' }));
    expect(waiting).not.toContain('לכרטיס הלקוח');
  });

  it('a closed lead of a customer: "פתח שיחה" and "לכרטיס הלקוח" side by side', () => {
    const closed = renderToStaticMarkup(details({ lead: lead(52, { stage: 'registered', stage_label: 'נרשם', owner: '' }), details: { ...DETAILS, in_system: '/customers?child=77' } }));
    const actions = closed.slice(closed.indexOf(`class="${l.actions}"`), closed.indexOf(l.dScroll));
    expect(actions).toContain('href="/customers?child=77"');
    expect(actions).toContain(l.actGridTwo);
    expect(actions).not.toContain(l.actGridCard);
  });

  it('what is not known is not drawn — no title over nothing', () => {
    const bare = renderToStaticMarkup(details({ details: NO_DETAILS }));
    // 12.10.2026: "הבוט לא תכנן פנייה לליד הזה." is gone with its section — "מה קורה עכשיו" already says what
    // happens next, and a title over a sentence that says "nothing" was one more thing to read.
    for (const title of ['מה עוצר את ההרשמה', 'מתי חוזרים', 'הילד', 'שיעור הניסיון', 'פניות קודמות של הבוט', 'מה קרה עד עכשיו', 'במערכת']) {
      expect(bare).not.toContain(`aria-label="${title}"`);
    }
    expect(bare).not.toContain('הבוט לא תכנן פנייה');
    // Why they are a lead falls back on the row's own sentence.
    expect(section(bare, 'למה זה ליד')).toContain(LINK.summary);
    expect(section(bare, 'מה קורה עכשיו')).not.toContain(l.bubble);
  });

  it('a desktop: a column beside the list, with a mark that closes it', () => {
    expect(html).toContain('aria-label="פרטי הליד"');
    expect(html).not.toContain(l.detailsCover);
    expect(html).toContain('aria-label="סגור את פרטי הליד"');
    expect(html).not.toContain('aria-label="חזרה לרשימה"');
    const onClose = vi.fn();
    buttonWith(details({ onClose }), 'סגור את פרטי הליד', [LeadActions]).props.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a phone: a screen of its own, with "חזרה" at its head and no close mark', () => {
    const phone = renderToStaticMarkup(details({ cover: true }));
    expect(phone).toContain(l.detailsCover);
    expect(phone).toContain('aria-label="חזרה לרשימה"');
    expect(phone).not.toContain('aria-label="סגור את פרטי הליד"');
    const onClose = vi.fn();
    buttonWith(details({ cover: true, onClose }), 'חזרה לרשימה', [LeadActions]).props.onClick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('while the rest is read: the name, the next step and the actions are there at once; the sections wait as shapes', () => {
    const waiting = renderToStaticMarkup(details({ details: null, status: 'loading' }));
    expect(waiting).toContain('תמר אוחיון');
    expect(waiting).toContain('הבוט ישאל אם משהו נתקע באתר מחר ב-10:30');
    expect(waiting).toContain('פתח שיחה');
    expect(waiting).toContain('aria-label="טוען את פרטי הליד"');
    expect(waiting).not.toContain('aria-label="הילד"');
  });

  it('a lead opened from a link, before anything is known: its head waits as a shape too', () => {
    const waiting = renderToStaticMarkup(details({ lead: null, details: null, status: 'loading' }));
    expect(waiting).toContain('aria-label="טוען את פרטי הליד"');
    expect(waiting).not.toContain('פתח שיחה');
    expect(waiting).not.toContain('aria-label="מה קורה עכשיו"');
  });

  it('the rest failed: one sentence and "נסו שוב" under what the row already told', () => {
    const onRetry = vi.fn();
    const tree = details({ details: null, status: 'error', error: 'השרת לא זמין כרגע', onRetry });
    const failed = renderToStaticMarkup(tree);
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('לא הצלחנו לטעון את שאר הפרטים');
    expect(failed).toContain('השרת לא זמין כרגע');
    expect(failed).toContain('תמר אוחיון');
    expect(failed).toContain('פתח שיחה');
    buttonWith(tree, 'נסו שוב', [LeadActions]).props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('a lead the server no longer has: said, with the way back — and nothing to press on it', () => {
    const gone = renderToStaticMarkup(details({ lead: null, details: null, status: 'gone' }));
    expect(gone).toContain('הליד הזה כבר לא ברשימה');
    expect(gone).not.toContain('פתח שיחה');
    expect(gone).not.toContain('לא רלוונטי');
  });

  it('a closed lead has no next step: the same place says how it ended — and no message of the bot\'s belongs to "now"', () => {
    const closed = renderToStaticMarkup(details({ lead: REGISTERED, details: { ...NO_DETAILS, followups: DETAILS.followups } }));
    expect(closed).not.toContain('aria-label="מה קורה עכשיו"');
    expect(section(closed, 'הליד סגור')).not.toContain(l.bubble);
    expect(section(closed, 'פניות קודמות של הבוט')).toMatch(/\(2\)/);
    expect(section(closed, 'הליד סגור')).toContain('>נרשם<');
    // Read from the closed list in a state this screen does not know: closed all the same.
    const odd = lead(40, { owner: '', stage: 'moved_away', stage_label: 'עברו דירה', next: { who: 'none', what: '', when: null, state: 'none' } });
    expect(section(renderToStaticMarkup(details({ lead: odd, details: NO_DETAILS, closed: true })), 'הליד סגור')).toContain('>עברו דירה<');
  });

  it('an invented customer is marked beside the name', () => {
    expect(renderToStaticMarkup(details({ lead: DEMO }))).toContain('>דמו<');
  });
});

describe('what can be done with a lead — the contract\'s four, and no more', () => {
  it('a lead the bot is handling: open the conversation, take it, put it off, or "לא רלוונטי"', () => {
    expect(buttonLabels(actions())).toEqual(['פתח שיחה', 'קח אליי', 'דחה למועד', 'לא רלוונטי']);
    const html = renderToStaticMarkup(actions());
    expect(html).not.toContain('role="switch"');
    expect(html).toMatch(new RegExp(`class="[^"]*${s.btnP}[^"]*"[^>]*>(<svg.*?</svg>)?פתח שיחה`));
  });

  it('a lead that waits for the office can be handed back to the bot', () => {
    expect(buttonLabels(actions({ lead: STUCK }))).toEqual(['פתח שיחה', 'החזר לבוט', 'דחה למועד', 'לא רלוונטי']);
  });

  it('each press says what was pressed', () => {
    const onOpenChat = vi.fn();
    const onChange = vi.fn();
    const onMode = vi.fn();
    const tree = actions({ onOpenChat, onChange, onMode });
    buttonWith(tree, 'פתח שיחה').props.onClick();
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    buttonWith(tree, 'קח אליי').props.onClick();
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'owner', owner: 'office' });
    buttonWith(actions({ lead: STUCK, onChange }), 'החזר לבוט').props.onClick();
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'owner', owner: 'bot' });
    // The other two ask first: nothing is saved by the press itself.
    buttonWith(tree, 'דחה למועד').props.onClick();
    buttonWith(tree, 'לא רלוונטי').props.onClick();
    expect(onMode.mock.calls).toEqual([['snooze'], ['remove']]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('"דחה למועד": a date — tomorrow at the earliest — and a note; saving sends both', () => {
    const onChange = vi.fn();
    const onMode = vi.fn();
    const tree = actions({ mode: 'snooze', until: '2026-11-01', note: '  אחרי החגים ', onChange, onMode });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="דחייה למועד"');
    expect(html).toMatch(/<input type="date"[^>]*value="2026-11-01"/);
    expect(html).toMatch(/<input type="date"[^>]*min="2026-10-13"/);
    expect(html).toContain('הערה (לא חובה)');
    expect(buttonLabels(tree)).toEqual(['דחה למועד', 'ביטול']);

    const form = elements(tree).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: unknown) => void }>;
    const preventDefault = vi.fn();
    form.props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith({ kind: 'snooze', until: '2026-11-01', note: 'אחרי החגים' });

    buttonWith(tree, 'ביטול').props.onClick();
    expect(onMode).toHaveBeenCalledWith('idle');
  });

  it('Escape lets go of the question that is open, and of nothing else', () => {
    const onMode = vi.fn();
    const preventDefault = vi.fn();
    const form = elements(actions({ mode: 'snooze', onMode })).find((element) => element.type === 'form') as React.ReactElement<{
      onKeyDown: (event: unknown) => void;
    }>;
    form.props.onKeyDown({ key: 'Enter', preventDefault });
    expect(onMode).not.toHaveBeenCalled();
    form.props.onKeyDown({ key: 'Escape', preventDefault });
    expect(onMode).toHaveBeenCalledWith('idle');
    // Marked as handled, so the details behind the question do not close with it.
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('a day that is not ahead of us cannot be saved', () => {
    const onChange = vi.fn();
    for (const until of ['2026-10-12', '2026-10-01', '']) {
      const tree = actions({ mode: 'snooze', until, onChange });
      expect(buttonWith(tree, 'דחה למועד').props.disabled).toBe(true);
      const form = elements(tree).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: unknown) => void }>;
      form.props.onSubmit({ preventDefault: noop });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"לא רלוונטי" asks first, by name — and only "כן" writes `deleted`', () => {
    const onChange = vi.fn();
    const onMode = vi.fn();
    const tree = actions({ mode: 'remove', onChange, onMode });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-label="אישור פעולה"');
    expect(html).toMatch(/להוציא את <strong[^>]*>תמר אוחיון<\/strong> מהלידים\?/);
    expect(html).toContain('אפשר להחזיר אחר כך מ״נסגרו״');
    expect(buttonLabels(tree)).toEqual(['כן, להוציא', 'ביטול']);

    buttonWith(tree, 'ביטול').props.onClick();
    expect(onMode).toHaveBeenCalledWith('idle');
    expect(onChange).not.toHaveBeenCalled();

    buttonWith(tree, 'כן, להוציא').props.onClick();
    expect(onChange).toHaveBeenCalledWith({ kind: 'close', reason: 'deleted' });
  });

  it('a closed lead can be opened or brought back — and one who registered, only opened', () => {
    const onChange = vi.fn();
    const tree = actions({ lead: DELETED, onChange });
    expect(buttonLabels(tree)).toEqual(['פתח שיחה', 'החזר לרשימה']);
    buttonWith(tree, 'החזר לרשימה').props.onClick();
    expect(onChange).toHaveBeenCalledWith({ kind: 'reopen' });
    expect(buttonLabels(actions({ lead: REGISTERED }))).toEqual(['פתח שיחה']);
    // Read from the closed list in a state this screen does not know: closed all the same.
    const odd = lead(40, { owner: '', stage: 'moved_away', stage_label: 'עברו דירה' });
    expect(buttonLabels(actions({ lead: odd, closed: true }))).toEqual(['פתח שיחה', 'החזר לרשימה']);
    // And a question left open for a lead that is closed is not asked.
    expect(buttonLabels(actions({ lead: DELETED, mode: 'remove' }))).toEqual(['פתח שיחה', 'החזר לרשימה']);
  });

  it('while a change is on its way nothing else can be pressed — but the conversation can still be opened', () => {
    const tree = actions({ busy: 'owner' });
    expect(buttonWith(tree, 'קח אליי').props.disabled).toBe(true);
    expect(buttonWith(tree, 'דחה למועד').props.disabled).toBe(true);
    expect(buttonWith(tree, 'לא רלוונטי').props.disabled).toBe(true);
    expect(buttonWith(tree, 'פתח שיחה').props.disabled).toBeUndefined();
    expect(renderToStaticMarkup(buttonWith(tree, 'קח אליי'))).toContain(s.spin);
  });

  it('the box of "דחה למועד" opens a week ahead', () => {
    const html = renderToStaticMarkup(<LeadActions lead={LINK} now={NOW} busy={null} initialMode="snooze" onOpenChat={noop} onChange={noop} />);
    expect(html).toMatch(/<input type="date"[^>]*value="2026-10-19"/);
  });

  it('from the details, a change names the lead it is for — and the actions start over for another lead', () => {
    const onChange = vi.fn();
    const onOpenChat = vi.fn();
    const handed = componentOf(details({ onChange, onOpenChat }), LeadActions);
    handed.props.onChange({ kind: 'owner', owner: 'office' });
    expect(onChange).toHaveBeenCalledWith(LINK, { kind: 'owner', owner: 'office' });
    handed.props.onOpenChat();
    expect(onOpenChat).toHaveBeenCalledWith(23);
    // Keyed by the lead: a question left open for one is never shown for the next.
    expect(handed.key).toBe('23');
    expect(componentOf(details({ lead: STUCK }), LeadActions).key).toBe('21');
  });
});

// ---------------------------------------------------------------------------
// The tab itself: which screen it shows, from what the server answered
// ---------------------------------------------------------------------------

const LIVE = {
  subscribe: () => noop,
  onResync: () => noop,
  whenReady: async () => {},
  snapshot: () => null,
  rewind: noop,
  resync: noop,
} as unknown as WahubLiveHandle;

const STATUS = { sending_enabled: false } as WahubStatus;

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function page(results: WahubLeadRow[], overrides: Partial<WahubLeadsPage> = {}): WahubLeadsPage {
  return { counts: COUNTS, results, next_cursor: null, ...overrides };
}

function seed(client: QueryClient, view: WahubLeadsView, first: WahubLeadsPage | null, stage: string | null = null, q = ''): QueryClient {
  client.setQueryData(leadsKeys.list(view, stage, q), { pages: [first], pageParams: [null] });
  return client;
}

function tab(client: QueryClient, props: Partial<React.ComponentProps<typeof LeadsTab>> = {}): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LeadsTab
        active
        live={LIVE}
        owner="office"
        stage={null}
        leadId={null}
        status={STATUS}
        onAddress={noop}
        onOpenChat={noop}
        queue="all"
        onQueue={noop}
        onStage={noop}
        onOpenSettings={noop}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('the leads tab: which screen, from what the server answered', () => {
  it('before the first answer: the list\'s own shape, in a screen that already fills the window', () => {
    const html = tab(newClient());
    expect(html).toContain(`class="${l.screen}"`);
    expect(html).toContain('data-active=""');
    expect(html).toContain('aria-label="טוען את הלידים"');
    expect(html).toContain('מחכים לך');
    expect(html).not.toContain('aria-label="מצבי הלידים"');
  });

  it('a server with no `leads/` (404): the board from before, untouched — and nothing of the new screen', () => {
    const client = seed(newClient(), 'office', null);
    client.setQueryData(
      leadKeys.board,
      readLeadBoard({
        groups: [
          { key: 'act', label: 'דורש טיפול', total: 2, stages: [{ key: 'needs_reply', label: 'שאל ולא קיבל תשובה', hint: '', next_step: 'לענות לו', count: 2, oldest_days: 0 }] },
          { key: 'wait', label: 'בתהליך', total: 0, stages: [] },
          { key: 'closed', label: 'סגור', total: 0, stages: [] },
        ],
        checked_at: null,
        pending_scan: 0,
      }),
    );
    const html = tab(client);
    expect(html).toContain('aria-label="מצבי הלידים"');
    expect(html).toContain('aria-label="דורש טיפול"');
    expect(html).toContain('ליד חדש');
    expect(html).not.toContain(l.screen);
    expect(html).not.toContain('data-active');
    expect(html).not.toContain('הבוט מטפל');
  });

  it('the same server, before its board has answered: the board\'s own waiting shape', () => {
    const html = tab(seed(newClient(), 'office', null));
    expect(html).toContain(s.leadsScreen);
    expect(html).not.toContain(l.screen);
  });

  it('a server that has it: the rows, the three numbers, and the filter built from what was read', () => {
    const html = tab(seed(newClient(), 'office', page([ASKED, STUCK])));
    expect(html).toContain('מיכל ברק');
    expect(html).toContain('אורי שגב');
    expect(html).toContain('>7<');
    expect(html).toContain('>41<');
    expect(html).toContain('(212)');
    // No `stages` from the server: the whole list was read, so the numbers are counted from it.
    expect(html).toContain('נתקע בהרשמה (1)');
    expect(html).toContain('שאל ולא קיבל מענה (1)');
    expect(html).not.toContain('aria-label="מצבי הלידים"');
  });

  it('"נתקע בהרשמה" stands at the head of "מחכים לך", whatever order the rows came in', () => {
    const html = tab(seed(newClient(), 'office', page([ASKED, STUCK])));
    expect(html.indexOf('מיכל ברק')).toBeLessThan(html.indexOf('אורי שגב'));
    // In the bot's list the order is the server's alone.
    const bot = tab(seed(newClient(), 'bot', page([LINK, { ...STUCK, owner: 'bot' }])), { owner: 'bot' });
    expect(bot.indexOf('תמר אוחיון')).toBeLessThan(bot.indexOf('מיכל ברק'));
  });

  it('the server\'s own `stages` win, and a list that is only partly read shows no numbers of its own', () => {
    const sent = tab(seed(newClient(), 'office', page([STUCK, ASKED], { stages: OFFICE_STAGES })));
    expect(sent).toContain('נתקע בהרשמה (2)');
    expect(sent).toContain('שאל ולא קיבל מענה (5)');
    const partly = tab(seed(newClient(), 'office', page([STUCK, ASKED], { next_cursor: 'c2' })));
    expect(partly).toContain('>נתקע בהרשמה<');
    expect(partly).not.toContain('נתקע בהרשמה (');
    expect(partly).toContain('הצג עוד');
  });

  it('the sending switch words a step that was held back', () => {
    const client = seed(newClient(), 'bot', page([HELD]));
    expect(tab(client, { owner: 'bot' })).toContain('היה נשלח עכשיו — השליחה כבויה');
    expect(tab(client, { owner: 'bot', status: { sending_enabled: true } as WahubStatus })).toContain('היה נשלח עכשיו — אין תבנית מאושרת');
    expect(tab(client, { owner: 'bot', status: undefined })).toContain('היה נשלח עכשיו — עוד לא נשלח');
  });

  it('a lead named in the address, on a desktop: its details beside the list, its row marked', () => {
    const html = tab(seed(newClient(), 'office', page([STUCK, ASKED])), { leadId: 22 });
    expect(html).toContain('aria-label="פרטי הליד"');
    expect(html).not.toContain(l.detailsCover);
    expect(html).toContain('data-layout="split"');
    expect(rowOf(html, 'מיכל ברק')).not.toContain('aria-current');
    expect(rowOf(html, 'שאל כמה ילדים יש בקבוצה')).toContain('aria-current="true"');
    // The head and the next step come from the row at once; the rest waits for its own read.
    const pane = html.slice(html.indexOf('aria-label="פרטי הליד"'));
    expect(pane).toContain('אורי שגב');
    expect(pane).toContain('מחכה לך: לענות על השאלה');
    expect(pane).toContain('aria-label="טוען את פרטי הליד"');
    expect(pane).toContain('החזר לבוט');
  });

  it('once its own read has landed: the sections', () => {
    const client = seed(newClient(), 'bot', page([LINK]));
    client.setQueryData(leadsKeys.detail(23), { ...LINK, details: DETAILS });
    const html = tab(client, { owner: 'bot', leadId: 23 });
    expect(html).toContain('aria-label="מה עוצר את ההרשמה"');
    expect(html).toContain('אמרה שתבדוק עם הבת שלה ותחזור');
    expect(html).not.toContain('aria-label="טוען את פרטי הליד"');
  });

  it('on a phone: one screen at a time — the list steps aside and the details carry "חזרה"', () => {
    screenIs.phone = true;
    try {
      const client = seed(newClient(), 'office', page([STUCK, ASKED]));
      const open = tab(client, { leadId: 22 });
      expect(open).toContain('data-layout="single"');
      expect(open).toContain(l.detailsCover);
      expect(open).toContain('aria-label="חזרה לרשימה"');
      expect(open).toMatch(new RegExp(`class="${l.main} ${l.hidden}"`));
      // With no lead open the list is the screen, and there are no details at all.
      const closed = tab(client);
      expect(closed).not.toContain('aria-label="פרטי הליד"');
      expect(closed).not.toContain(l.hidden);
    } finally {
      screenIs.phone = false;
    }
  });

  it('a lead opened from the closed list can only be opened or brought back', () => {
    const odd = lead(40, { name: 'אלה שחר', owner: '', stage: 'moved_away', stage_label: 'עברו דירה', next: { who: 'none', what: '', when: null, state: 'none' } });
    const html = tab(seed(newClient(), 'closed', page([odd, REGISTERED])), { owner: 'closed', leadId: 40 });
    const pane = html.slice(html.indexOf('aria-label="פרטי הליד"'));
    expect(pane).toContain('החזר לרשימה');
    expect(pane).not.toContain('לא רלוונטי');
    expect(pane).not.toContain('קח אליי');
    expect(pane).toContain('>עברו דירה<');
  });

  it('narrowed by a state: its own rows, with the whole list still feeding the numbers and the filter', () => {
    const client = seed(newClient(), 'office', page([STUCK, ASKED]));
    seed(client, 'office', page([STUCK]), 'signup_stuck');
    const html = tab(client, { stage: 'signup_stuck' });
    expect(html).toContain('מיכל ברק');
    expect(html).not.toContain('אורי שגב');
    expect(html).toMatch(/<option value="signup_stuck" selected="">נתקע בהרשמה \(1\)/);
    expect(html).toContain('שאל ולא קיבל מענה (1)');
  });

  it('out of view the tab is not marked as the one that fills the window', () => {
    const html = tab(seed(newClient(), 'office', page([STUCK])), { active: false });
    expect(html).toContain(l.screen);
    expect(html).not.toContain('data-active');
  });
});

// ---------------------------------------------------------------------------
// "הכול אוטומטי": the strip at the head of "הבוט מטפל" (docs/WAHUB-CONTRACT-LEADS-V2.md, י)
// ---------------------------------------------------------------------------

const HELD_TEXT = '3 הודעות היו יוצאות עכשיו — השליחה כבויה';

function automation(due: number, sending = false, templates = false) {
  return readAutomation({
    ready: sending && templates,
    lines: [
      { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '' },
      { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '' },
      { key: 'sending', ok: sending, title: 'שליחה ללקוחות', detail: '', how: 'מדליקים בהגדרות המערכת' },
      { key: 'templates', ok: templates, title: 'תבניות וואטסאפ', detail: '', how: 'יוצרים ב-ManyChat' },
    ],
    today: { planned: 12, due, sent: 0, skipped: 0 },
    upcoming: [],
  });
}

describe('messages that were due and did not go out: one quiet strip at the head of "הבוט מטפל"', () => {
  it('above the rows: how many, and why — the whole strip is one button that leads to what is missing', () => {
    const html = renderToStaticMarkup(list({ view: 'bot', rows: [LINK, HELD], held: HELD_TEXT }));
    expect(html).toContain(HELD_TEXT);
    expect(html).toContain('מה חסר');
    expect(html.indexOf(HELD_TEXT)).toBeLessThan(html.indexOf('תמר אוחיון'));
    expect((html.match(new RegExp(`class="${l.held} `, 'g')) ?? []).length).toBe(1);
    // Amber, like a row that was held back — never red.
    expect(html).not.toContain(s.pBad);
  });

  it('a press leads to the card in the settings', () => {
    const onHeld = vi.fn();
    buttonWith(list({ view: 'bot', rows: [LINK], held: HELD_TEXT, onHeld }), 'מה חסר').props.onClick();
    expect(onHeld).toHaveBeenCalledTimes(1);
  });

  it('nothing held: no strip', () => {
    expect(renderToStaticMarkup(list({ view: 'bot', rows: [LINK] }))).not.toContain(l.held);
    expect(renderToStaticMarkup(list({ view: 'bot', rows: [LINK], held: '' }))).not.toContain('מה חסר');
  });

  it('only on the bot\'s list — never over "מחכים לך" or "נסגרו"', () => {
    expect(renderToStaticMarkup(list({ view: 'office', held: HELD_TEXT }))).not.toContain(HELD_TEXT);
    expect(renderToStaticMarkup(list({ view: 'closed', rows: [REGISTERED], held: HELD_TEXT }))).not.toContain(HELD_TEXT);
  });

  it('it stands over an empty list and over one still on its way too', () => {
    expect(renderToStaticMarkup(list({ view: 'bot', rows: [], held: HELD_TEXT }))).toContain(HELD_TEXT);
    expect(renderToStaticMarkup(list({ view: 'bot', rows: [], status: 'loading', held: HELD_TEXT }))).toContain(HELD_TEXT);
  });

  it('the tab reads it from the server: sending off, or a template missing', () => {
    const off = seed(newClient(), 'bot', page([LINK, HELD]));
    off.setQueryData(automationKeys.status, automation(3));
    expect(tab(off, { owner: 'bot' })).toContain(HELD_TEXT);

    const noTemplate = seed(newClient(), 'bot', page([LINK, HELD]));
    noTemplate.setQueryData(automationKeys.status, automation(1, true, false));
    expect(tab(noTemplate, { owner: 'bot' })).toContain('הודעה אחת הייתה יוצאת עכשיו — חסרה תבנית');
  });

  it('a server that words the strip itself is shown as it said it — and with `banner: null`, nothing', () => {
    const worded = seed(newClient(), 'bot', page([LINK, HELD]));
    worded.setQueryData(automationKeys.status, { ...automation(3, true, true), banner: { count: 2, text: '2 הודעות היו יוצאות עכשיו — השרת לא מחובר ל-ManyChat' } });
    expect(tab(worded, { owner: 'bot' })).toContain('2 הודעות היו יוצאות עכשיו — השרת לא מחובר ל-ManyChat');

    const nothing = seed(newClient(), 'bot', page([LINK, HELD]));
    nothing.setQueryData(automationKeys.status, { ...automation(3), banner: null });
    expect(tab(nothing, { owner: 'bot' })).not.toContain(l.held);
  });

  it('nothing due: no strip; and none on the list that waits for the office', () => {
    const none = seed(newClient(), 'bot', page([LINK]));
    none.setQueryData(automationKeys.status, automation(0));
    expect(tab(none, { owner: 'bot' })).not.toContain(l.held);

    const office = seed(newClient(), 'office', page([STUCK]));
    office.setQueryData(automationKeys.status, automation(3));
    expect(tab(office)).not.toContain(l.held);
  });

  it('a server that has no `leads/automation/` yet (404): no strip, and the list is as it was', () => {
    const client = seed(newClient(), 'bot', page([LINK, HELD]));
    client.setQueryData(automationKeys.status, null);
    const html = tab(client, { owner: 'bot' });
    expect(html).not.toContain(l.held);
    expect(html).not.toContain('מה חסר');
    expect(html).toContain('תמר אוחיון');
    // Before it has answered at all, the same.
    expect(tab(seed(newClient(), 'bot', page([LINK])), { owner: 'bot' })).not.toContain(l.held);
  });
});

// ---------------------------------------------------------------------------
// "מחכים לך" on the day's tab
// ---------------------------------------------------------------------------

const SUMMARY: WahubSummary = {
  waiting: 3,
  needs_human: 1,
  unread: 4,
  due_followups: 2,
  new_contacts_today: 5,
  new_contacts_7d: 31,
  inbound_today: 42,
  outbound_today: 38,
  oldest_waiting_since: null,
  by_day: [],
  unregistered_leads: { total: 14, hot: 5, oldest_days: 22 },
  lead_act: { total: 6, stages: [{ key: 'needs_reply', label: 'שאל ולא קיבל תשובה', count: 6 }] },
};

function today(client: QueryClient, onGo: React.ComponentProps<typeof TodayTab>['onGo'] = noop): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TodayTab status={STATUS} onGo={onGo} onOpenChat={noop} />
    </QueryClientProvider>,
  );
}

describe('the day\'s tab: "מחכים לך" leads to the new list', () => {
  it('on a server that has `leads/`: "מחכים לך" with its number and the first few — in place of "דורש טיפול"', () => {
    const client = newClient();
    client.setQueryData(wahubKeys.summary, SUMMARY);
    client.setQueryData(leadsKeys.glance, page([STUCK, ASKED]));
    const html = today(client);
    const card = section(html, 'מחכים לך');
    expect(card).toContain('>7<');
    expect(card).toContain('הבוט מטפל ב-41');
    expect(card).toContain('מיכל ברק');
    expect(card).toContain('מחכה לך: לעזור לסיים את ההרשמה');
    expect(card).toContain('אורי שגב');
    expect(html).not.toContain('aria-label="דורש טיפול"');
    expect(html).not.toContain('aria-label="שאלו ולא נרשמו"');
  });

  it('until that server has answered once, the card\'s place is held by a shape — one card never flips into another', () => {
    const client = newClient();
    client.setQueryData(wahubKeys.summary, SUMMARY);
    const html = today(client);
    expect(html).not.toContain('aria-label="מחכים לך"');
    expect(html).not.toContain('aria-label="דורש טיפול"');
    expect(html).toContain(s.skRow);
  });

  it('the title leads to the list that waits for the office; a name leads to that lead', () => {
    const onOpenList = vi.fn();
    const onOpenLead = vi.fn();
    const card = <TodayLeadsCard page={page([STUCK, ASKED])} now={NOW} sendingOn={false} onOpenList={onOpenList} onOpenLead={onOpenLead} />;
    buttonWith(card, 'מחכים לך').props.onClick();
    expect(onOpenList).toHaveBeenCalledTimes(1);
    buttonWith(card, 'אורי שגב').props.onClick();
    expect(onOpenLead).toHaveBeenCalledWith(22);
  });

  it('"נתקע בהרשמה" comes first on the card too, whatever order the rows came in', () => {
    const html = renderToStaticMarkup(
      <TodayLeadsCard page={page([ASKED, STUCK])} now={NOW} sendingOn={false} onOpenList={noop} onOpenLead={noop} />,
    );
    expect(html.indexOf('מיכל ברק')).toBeLessThan(html.indexOf('אורי שגב'));
  });

  it('more wait than the card shows: five names, and a way to all of them', () => {
    const many = Array.from({ length: 7 }, (_, index) => lead(50 + index, { name: `ליד ${index + 1}`, owner: 'office', next: { who: 'office', what: 'להתקשר', when: null, state: 'none' } }));
    const onOpenList = vi.fn();
    const card = <TodayLeadsCard page={page(many)} now={NOW} sendingOn={false} onOpenList={onOpenList} onOpenLead={noop} />;
    const html = renderToStaticMarkup(card);
    expect(html.match(new RegExp(`class="${l.glanceRow}"`, 'g'))).toHaveLength(5);
    expect(html).not.toContain('ליד 6');
    buttonWith(card, 'לכל ה-7').props.onClick();
    expect(onOpenList).toHaveBeenCalledTimes(1);
  });

  it('nobody waits: said kindly, with what the bot is doing — and the number is not amber', () => {
    const html = renderToStaticMarkup(
      <TodayLeadsCard page={page([], { counts: { office: 0, bot: 41, closed: 3 } })} now={NOW} sendingOn={false} onOpenList={noop} onOpenLead={noop} />,
    );
    expect(html).toContain('אין לידים שמחכים לך');
    expect(html).toContain('הבוט מטפל ב-41 לידים.');
    expect(html).not.toContain(l.glanceCountAct);
  });
});
