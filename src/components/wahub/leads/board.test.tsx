import React from 'react';
import { HoverHelp, StageHelp, StagesLegend } from '../shared/StageHelp';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { readLeadBoard } from '@/lib/wahub/leadStage';
import { makeContact } from '@/lib/wahub/testFixtures';
import type { WahubContact, WahubLead, WahubLeadActSummary, WahubLeadBoard } from '@/types/wahub';
import { leadKeys } from '../hooks/useLeadQueries';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import LeadActCard from '../today/LeadActCard';
import s from '../wahub.module.css';
import LeadBoardView, { NO_PEOPLE, type LeadBoardViewProps, type LeadPeopleState } from './LeadBoard';
import LegacyLeadsTab from './LegacyLeadsTab';

// Nothing here may reach a server: the board and its people are handed over, or put in the cache.
vi.mock('@/lib/wahubApi', async (original) => ({
  ...(await original<typeof import('@/lib/wahubApi')>()),
  fetchWahubLeadBoard: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
  fetchWahubContacts: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
  fetchWahubCounts: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
}));
// The screen of work queues from before reads who is signed in (for the branches filter).
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'דור', branch_ids: [] }, loading: false }),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב — the leads tab as a board: three
 * groups, the states of each with a number, the people of a state with "why"
 * and "what to do", and the way from a person into the conversation. And the
 * card "דורש טיפול" of the day's tab. On a server that has no board yet, the
 * screen from before.
 */

const NOW = new Date('2026-10-11T12:00:00+03:00');
const noop = () => {};

const BOARD: WahubLeadBoard = readLeadBoard({
  groups: [
    {
      key: 'act',
      label: 'דורש טיפול',
      total: 6,
      stages: [
        { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', hint: 'ביקש נציג, או בלי תשובה חצי שעה', next_step: 'לענות לו', count: 2, oldest_days: 0 },
        { key: 'signup_failed', label: 'ניסה להירשם והחיוב נכשל', hint: '', next_step: 'לברר מה קרה ולשלוח קישור חדש', count: 0, oldest_days: null },
        { key: 'answered_silent', label: 'קיבל תשובה ולא נרשם', hint: 'קיבל תשובה, ושותק יומיים ויותר', next_step: 'להתקשר ולהציע שיעור ניסיון', count: 4, oldest_days: 9 },
      ],
    },
    {
      key: 'wait',
      label: 'בתהליך',
      total: 3,
      stages: [
        { key: 'trial_booked', label: 'רשום לשיעור ניסיון', hint: '', next_step: '', count: 1, oldest_days: 2 },
        { key: 'in_conversation', label: 'בשיחה', hint: '', next_step: '', count: 2, oldest_days: 1 },
      ],
    },
    {
      key: 'closed',
      label: 'סגור',
      total: 40,
      stages: [
        { key: 'registered', label: 'נרשם', hint: '', next_step: '', count: 12, oldest_days: 20 },
        { key: 'cold', label: 'ליד ישן', hint: '', next_step: '', count: 28, oldest_days: 90 },
      ],
    },
  ],
  checked_at: '2026-10-11T11:57:00+03:00',
  pending_scan: 0,
});

function lead(overrides: Partial<WahubLead> = {}): WahubLead {
  return {
    stage: 'answered_silent',
    stage_label: 'קיבל תשובה ולא נרשם',
    group: 'act',
    since: '2026-10-07T10:00:00+03:00',
    days: 4,
    reason: 'שאלה על קפוארה בראש העין לפני 4 ימים. רק הבוט ענה. לא נרשמה.',
    next_step: 'אף נציג עוד לא דיבר איתה – להתקשר',
    human_touched: false,
    temperature: 'warm',
    ...overrides,
  };
}

const PEOPLE: WahubContact[] = [
  makeContact(41, { name: 'תמר אוחיון', lead: lead() }),
  makeContact(42, {
    name: 'גיא רוזן',
    lead: lead({ days: 6, reason: 'שאל על מחירים לפני 6 ימים. המשרד ענה. לא נרשם.', next_step: 'להתקשר ולהציע שיעור ניסיון', temperature: 'cold', human_touched: true }),
  }),
];

function people(overrides: Partial<LeadPeopleState> = {}): LeadPeopleState {
  return { ...NO_PEOPLE, status: 'ready', rows: PEOPLE, total: 4, ...overrides };
}

function view(overrides: Partial<LeadBoardViewProps> = {}): React.ReactElement {
  return (
    <LeadBoardView
      board={BOARD}
      refreshing={false}
      now={NOW}
      twoPane
      search=""
      searching={false}
      selectedKey="answered_silent"
      closedOpen={false}
      people={people()}
      creating={false}
      onSearch={noop}
      onStage={noop}
      onToggleClosed={noop}
      onToggleCreate={noop}
      onMore={noop}
      onRetryPeople={noop}
      onOpenChat={noop}
      {...overrides}
    />
  );
}

/** The elements a component draws, without a browser: a component that keeps no state is called as the function it is. */
function elements(node: React.ReactNode): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    // The bubble on a state keeps state of its own: read as the element it is, with what it wraps.
    if (element.type === StageHelp || element.type === StagesLegend || element.type === HoverHelp) return [element, ...elements(element.props.children)];
    return elements((element.type as (props: unknown) => React.ReactNode)(element.props));
  }
  return [element, ...elements(element.props.children)];
}

/** The button whose own markup carries these words. The innermost one, so a row is found rather than what holds it. */
function buttonWith(node: React.ReactNode, text: string): React.ReactElement<{ onClick: () => void }> {
  const found = elements(node).filter((element) => element.type === 'button' && renderToStaticMarkup(element).includes(text));
  if (!found.length) throw new Error(`no button with "${text}"`);
  return found[found.length - 1] as React.ReactElement<{ onClick: () => void }>;
}

const section = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`);
  return html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
};

describe('the board: three groups', () => {
  const html = renderToStaticMarkup(view());

  it('needs handling, in progress, closed — in that order, each with its total', () => {
    const order = ['דורש טיפול', 'בתהליך', 'סגור'].map((label) => html.indexOf(`aria-label="${label}"`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(section(html, 'דורש טיפול')).toContain('>6<');
    expect(section(html, 'בתהליך')).toContain('>3<');
    expect(section(html, 'סגור')).toContain('>40<');
  });

  it('a group is rows of states: the label, the number, and how long the oldest has been there', () => {
    const act = section(html, 'דורש טיפול');
    expect(act).toContain('שאל ולא קיבל תשובה');
    expect(act).toContain('הוותיק: היום');
    expect(act).toContain('קיבל תשובה ולא נרשם');
    expect(act).toContain('הוותיק: לפני 9 ימים');
    expect(act).toContain('>4<');
  });

  it('a state with nobody in it stays on the list, quietly, with no "oldest"', () => {
    const act = section(html, 'דורש טיפול');
    const at = act.indexOf('ניסה להירשם והחיוב נכשל');
    const row = act.slice(act.lastIndexOf('<button', at), act.indexOf('</button>', at));
    expect(row).toContain(s.stageEmpty);
    expect(row).toContain('>0<');
    expect(row).not.toContain('הוותיק');
  });

  it('"סגור" is folded: its title and total, and its states a press away', () => {
    const closed = section(html, 'סגור');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('ליד ישן');
    const onToggleClosed = vi.fn();
    buttonWith(view({ onToggleClosed }), 'סגור').props.onClick();
    expect(onToggleClosed).toHaveBeenCalledTimes(1);

    const open = section(renderToStaticMarkup(view({ closedOpen: true })), 'סגור');
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('ליד ישן');
    expect(open).toContain('>28<');
  });

  it('the other two groups are always open and are not buttons', () => {
    expect(section(html, 'דורש טיפול')).not.toContain('aria-expanded');
    expect(section(html, 'בתהליך')).not.toContain('aria-expanded');
  });


  it('one search box and nothing else to filter by', () => {
    expect(html).toContain('aria-label="חיפוש בלידים"');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('כל הנושאים');
  });

  it('while the scan has not reached everyone it says so, and otherwise says nothing', () => {
    expect(html).not.toContain('עוד עוברת');
    const scanning = renderToStaticMarkup(view({ board: { ...BOARD, pending_scan: 120 } }));
    expect(scanning).toContain('המערכת עוד עוברת על 120 אנשי קשר');
  });
});

describe('a press on a state lists its people', () => {
  it('the press reaches the tab with the state\'s key', () => {
    const onStage = vi.fn();
    buttonWith(view({ onStage }), 'שאל ולא קיבל תשובה').props.onClick();
    expect(onStage).toHaveBeenCalledWith('needs_reply');
    buttonWith(view({ onStage }), 'רשום לשיעור ניסיון').props.onClick();
    expect(onStage).toHaveBeenLastCalledWith('trial_booked');
  });

  it('the state on show is marked on the board, and only it', () => {
    const html = renderToStaticMarkup(view());
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const at = html.indexOf('aria-pressed="true"');
    expect(html.slice(at, html.indexOf('</button>', at))).toContain('קיבל תשובה ולא נרשם');
  });

  it('the list is headed by the state, its count and its one plain line', () => {
    const list = section(renderToStaticMarkup(view()), 'קיבל תשובה ולא נרשם');
    expect(list).toContain('<h3');
    expect(list).toContain('>4<');
    expect(list).toContain('קיבל תשובה, ושותק יומיים ויותר');
  });

  it('a person is a row: the name, why in one line, how long, and what to do in bold', () => {
    const list = section(renderToStaticMarkup(view()), 'קיבל תשובה ולא נרשם');
    expect(list).toContain('תמר אוחיון');
    expect(list).toContain('שאלה על קפוארה בראש העין לפני 4 ימים. רק הבוט ענה. לא נרשמה.');
    expect(list).toContain('לפני 4 ימים');
    expect(list).toMatch(/<strong[^>]*>אף נציג עוד לא דיבר איתה – להתקשר<\/strong>/);
    expect(list).toContain('גיא רוזן');
    expect(list).toContain('לפני 6 ימים');
    expect(list).toMatch(/<strong[^>]*>להתקשר ולהציע שיעור ניסיון<\/strong>/);
    // "Why" is one line: it is cut with an ellipsis, and whole in the title.
    expect(list).toMatch(/class="[^"]*truncate[^"]*" dir="auto" title="שאלה על קפוארה/);
  });

  it('the temperature is a small dot with its word behind it', () => {
    const list = section(renderToStaticMarkup(view()), 'קיבל תשובה ולא נרשם');
    expect(list).toContain('aria-label="מתעניין"');
    expect(list).toContain('aria-label="קר"');
    expect(list).toContain(s.tempDot);
  });

  it('inside a state the rows do not repeat the state\'s tag', () => {
    expect(section(renderToStaticMarkup(view()), 'קיבל תשובה ולא נרשם')).not.toContain(s.stageTag);
  });

  it('a press on a person opens the conversation', () => {
    const onOpenChat = vi.fn();
    buttonWith(view({ onOpenChat }), 'תמר אוחיון').props.onClick();
    expect(onOpenChat).toHaveBeenCalledWith(41);
    buttonWith(view({ onOpenChat }), 'גיא רוזן').props.onClick();
    expect(onOpenChat).toHaveBeenLastCalledWith(42);
  });

  it('more people than a page: "הצג עוד" asks for the next one', () => {
    expect(renderToStaticMarkup(view())).not.toContain('הצג עוד');
    const onMore = vi.fn();
    const more = view({ people: people({ hasMore: true }), onMore });
    expect(renderToStaticMarkup(more)).toContain('הצג עוד');
    buttonWith(more, 'הצג עוד').props.onClick();
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('a state with nobody in it says so', () => {
    const html = renderToStaticMarkup(view({ selectedKey: 'signup_failed', people: people({ rows: [], total: 0 }) }));
    expect(section(html, 'ניסה להירשם והחיוב נכשל')).toContain('אין כאן אף אחד כרגע');
  });

  it('a row that came without a lead state still shows who it is, with the last message as its line', () => {
    const bare = makeContact(50, { name: 'נועה', last_message: { text: 'מתי יש שיעור?', direction: 'in', sender: 'customer', sent_at: '' } });
    const html = renderToStaticMarkup(view({ people: people({ rows: [bare], total: 1 }) }));
    expect(html).toContain('נועה');
    expect(html).toContain('מתי יש שיעור?');
  });
});

describe('the people of a state: waiting, reading again, failing', () => {
  it('on their way: rows of a person\'s shape, where the people will be — the board beside them stays', () => {
    const html = renderToStaticMarkup(view({ people: { ...NO_PEOPLE, status: 'loading' } }));
    const list = section(html, 'קיבל תשובה ולא נרשם');
    expect(list).toContain('aria-busy="true"');
    expect(list).toContain(s.skRowTall);
    expect(list).not.toContain('אין כאן אף אחד');
    expect(html).toContain('שאל ולא קיבל תשובה');
  });

  it('read again: the rows stay as they are, with "מתעדכן…" in the list\'s own title row — never back to the grey shape', () => {
    const list = section(renderToStaticMarkup(view({ people: people({ refreshing: true }) })), 'קיבל תשובה ולא נרשם');
    expect(list).toContain('תמר אוחיון');
    expect(list).toContain('מתעדכן…');
    expect(list).not.toContain(s.skRowTall);
    // The half-minute re-read does not dim the rows: nothing on screen should blink by itself.
    expect(list).not.toContain(s.dimmed);
  });

  it('rows that answer the search typed a moment ago are dimmed until the new ones land', () => {
    const list = section(
      renderToStaticMarkup(view({ search: 'תמ', searching: true, selectedKey: null, people: people({ refreshing: true, stale: true }) })),
      'תוצאות החיפוש',
    );
    expect(list).toContain('תמר אוחיון');
    expect(list).toContain(s.dimmed);
  });

  it('the board read again says "מתעדכן…" at the top of the tab, and keeps everything on screen', () => {
    const html = renderToStaticMarkup(view({ refreshing: true }));
    expect(html.slice(0, html.indexOf('aria-label="חיפוש בלידים"'))).toContain('מתעדכן…');
    expect(html).toContain('תמר אוחיון');
    expect(html).toContain('שאל ולא קיבל תשובה');
  });

  it('failed: one sentence and "נסה שוב" where the people would be — the board beside it is untouched', () => {
    const onRetryPeople = vi.fn();
    const failed = view({ people: { ...NO_PEOPLE, status: 'error', error: 'השרת לא ענה' }, onRetryPeople });
    const html = renderToStaticMarkup(failed);
    const list = section(html, 'קיבל תשובה ולא נרשם');
    expect(list).toContain('role="alert"');
    expect(list).toContain('לא הצלחנו לטעון את הרשימה');
    expect(list).toContain('השרת לא ענה');
    expect(section(html, 'דורש טיפול')).not.toContain('role="alert"');
    expect(section(html, 'דורש טיפול')).toContain('שאל ולא קיבל תשובה');
    buttonWith(failed, 'נסה שוב').props.onClick();
    expect(onRetryPeople).toHaveBeenCalledTimes(1);
  });
});

describe('the search', () => {
  const found = [
    makeContact(41, { name: 'תמר אוחיון', lead: lead() }),
    makeContact(60, { name: 'תמר לוי', lead: lead({ stage: 'registered', stage_label: 'נרשם', group: 'closed', next_step: '' }) }),
  ];
  const searching = view({ search: 'תמר', searching: true, selectedKey: null, people: people({ rows: found, total: 2 }) });
  const html = renderToStaticMarkup(searching);

  it('lists whoever it found, across all states, each with the state it is in', () => {
    const list = section(html, 'תוצאות החיפוש');
    expect(list).toContain('תמר אוחיון');
    expect(list).toContain('תמר לוי');
    expect(list).toContain('קיבל תשובה ולא נרשם');
    expect(list).toContain('>נרשם<');
    expect(list).toContain(s.stageTag);
  });

  it('marks no state on the board while it is on', () => {
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('typing reaches the tab; the cross clears it', () => {
    const onSearch = vi.fn();
    const typed = view({ search: 'תמר', searching: true, selectedKey: null, people: people({ rows: found }), onSearch });
    buttonWith(typed, 'נקה חיפוש').props.onClick();
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('nobody found says so', () => {
    const none = renderToStaticMarkup(view({ search: 'זזז', searching: true, selectedKey: null, people: people({ rows: [], total: 0 }) }));
    expect(none).toContain('אין מי שמתאים לחיפוש');
  });
});

describe('a narrow screen: the states, or the people of one — never both', () => {
  it('with no state chosen it is the board alone', () => {
    const html = renderToStaticMarkup(view({ twoPane: false, selectedKey: null, people: NO_PEOPLE }));
    expect(html).toContain('aria-label="מצבי הלידים"');
    expect(html).toContain('דורש טיפול');
    expect(html).not.toContain('חזרה לכל המצבים');
    expect(html).not.toContain('רשימת האנשים');
  });

  it('with a state chosen it is that state\'s people, with the way back to the board', () => {
    const onStage = vi.fn();
    const narrow = view({ twoPane: false, onStage });
    const html = renderToStaticMarkup(narrow);
    expect(html).not.toContain('aria-label="מצבי הלידים"');
    expect(html).toContain('תמר אוחיון');
    expect(html).toContain('aria-label="חזרה לכל המצבים"');
    buttonWith(narrow, 'חזרה לכל המצבים').props.onClick();
    expect(onStage).toHaveBeenCalledWith(null);
  });

  it('a wide screen with nobody to handle keeps its second column, and says so', () => {
    const html = renderToStaticMarkup(view({ selectedKey: null, people: NO_PEOPLE }));
    expect(html).toContain('aria-label="מצבי הלידים"');
    expect(html).toContain('אין כרגע מי שדורש טיפול');
  });
});

describe('"ליד חדש"', () => {
  it('is one button beside the search; the form opens as a card of the page', () => {
    const onToggleCreate = vi.fn();
    buttonWith(view({ onToggleCreate }), 'ליד חדש').props.onClick();
    expect(onToggleCreate).toHaveBeenCalledTimes(1);
    const open = renderToStaticMarkup(view({ creating: true, newLeadForm: <div data-form="new-lead">הטופס</div> }));
    expect(open).toContain('data-form="new-lead"');
    expect(open).toMatch(/aria-expanded="true"[^>]*>(<svg[^>]*>.*?<\/svg>)?ליד חדש/);
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

function tab(client: QueryClient, stage: string | null = null): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LegacyLeadsTab active live={LIVE} queue="all" stage={stage} status={undefined} onQueue={noop} onStage={noop} onOpenChat={noop} onOpenSettings={noop} />
    </QueryClientProvider>,
  );
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('the leads tab', () => {
  it('before the board has answered: the board\'s own shape, not an empty page', () => {
    const html = tab(newClient());
    expect(html).toContain('aria-label="טוען את הלידים"');
    expect(html).toContain(s.skRow);
    expect(html).not.toContain('תורי עבודה');
  });

  it('on a server that has the board: the three groups, and the first state that needs handling already open', () => {
    const client = newClient();
    client.setQueryData(leadKeys.board, BOARD);
    client.setQueryData(leadKeys.people('needs_reply', ''), {
      pages: [{ count: 1, next: null, previous: null, results: [makeContact(7, { name: 'דנה כהן', lead: lead({ stage: 'needs_reply', stage_label: 'שאל ולא קיבל תשובה', days: 0, next_step: 'לענות לו' }) })] }],
      pageParams: [1],
    });
    const html = tab(client);
    expect(html).toContain('aria-label="מצבי הלידים"');
    for (const label of ['דורש טיפול', 'בתהליך', 'סגור']) expect(html).toContain(`aria-label="${label}"`);
    const at = html.indexOf('aria-pressed="true"');
    expect(html.slice(at, html.indexOf('</button>', at))).toContain('שאל ולא קיבל תשובה');
    expect(html).toContain('דנה כהן');
    expect(html).toMatch(/<strong[^>]*>לענות לו<\/strong>/);
    expect(html).not.toContain('תורי עבודה');
  });

  it('a closed state named in the address opens "סגור" by itself', () => {
    const client = newClient();
    client.setQueryData(leadKeys.board, BOARD);
    client.setQueryData(leadKeys.people('cold', ''), { pages: [{ count: 0, next: null, previous: null, results: [] }], pageParams: [1] });
    const closed = section(tab(client, 'cold'), 'סגור');
    expect(closed).toContain('aria-expanded="true"');
    expect(closed).toContain('ליד ישן');
    // And with any other state on show it stays folded.
    const other = newClient();
    other.setQueryData(leadKeys.board, BOARD);
    expect(section(tab(other, 'needs_reply'), 'סגור')).toContain('aria-expanded="false"');
  });

  it('opens on the state the address names', () => {
    const client = newClient();
    client.setQueryData(leadKeys.board, BOARD);
    client.setQueryData(leadKeys.people('answered_silent', ''), {
      pages: [{ count: 2, next: null, previous: null, results: PEOPLE }],
      pageParams: [1],
    });
    const html = tab(client, 'answered_silent');
    const at = html.indexOf('aria-pressed="true"');
    expect(html.slice(at, html.indexOf('</button>', at))).toContain('קיבל תשובה ולא נרשם');
    expect(html).toContain('תמר אוחיון');
  });

  it('a row the server sent under a state it is not in is not shown there', () => {
    const client = newClient();
    client.setQueryData(leadKeys.board, BOARD);
    client.setQueryData(leadKeys.people('answered_silent', ''), {
      pages: [{ count: 2, next: null, previous: null, results: [PEOPLE[0], makeContact(99, { name: 'לא שייך' })] }],
      pageParams: [1],
    });
    const html = tab(client, 'answered_silent');
    expect(html).toContain('תמר אוחיון');
    expect(html).not.toContain('לא שייך');
  });

  it('on a server that has no board yet (404): the screen of work queues from before, whole', () => {
    const client = newClient();
    client.setQueryData(leadKeys.board, null);
    const html = tab(client);
    expect(html).toContain('aria-label="תורי עבודה"');
    for (const label of ['לחזור אליהם', 'עוד לא פנינו', 'לא ענו לנו', 'נרשמו']) expect(html).toContain(label);
    expect(html).toContain('כל הנושאים');
    expect(html).not.toContain('aria-label="מצבי הלידים"');
  });

  it('when the board could not be read: one sentence and "נסה שוב" — not the old screen, and not a blank one', () => {
    // A failed read as it stands once the screen is up: the answer is in, and it is a failure.
    // (A client that retries on mount would show the loading shape first, and then this.)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    client.getQueryCache().build(client, { queryKey: leadKeys.board }).setState({ status: 'error', error: new Error('boom'), fetchStatus: 'idle' });
    const html = tab(client);
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את הלידים');
    expect(html).toContain('נסה שוב');
    expect(html).not.toContain('תורי עבודה');
  });
});

// ---------------------------------------------------------------------------
// "דורש טיפול" on the day's tab
// ---------------------------------------------------------------------------

describe('"דורש טיפול" on the day\'s tab', () => {
  const counts: WahubLeadActSummary = {
    total: 6,
    stages: [
      { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', count: 2 },
      { key: 'answered_silent', label: 'קיבל תשובה ולא נרשם', count: 4 },
    ],
  };

  it('is the title, the total, and a row per state with its number', () => {
    const html = renderToStaticMarkup(<LeadActCard counts={counts} onStage={noop} />);
    expect(html).toContain('aria-label="דורש טיפול"');
    expect(html).toContain('>6<');
    expect(html).toContain('שאל ולא קיבל תשובה');
    expect(html).toContain('>2<');
    expect(html).toContain('קיבל תשובה ולא נרשם');
    expect(html).toContain('>4<');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it('a press on a state opens the leads tab on that state', () => {
    const onStage = vi.fn();
    buttonWith(<LeadActCard counts={counts} onStage={onStage} />, 'קיבל תשובה ולא נרשם').props.onClick();
    expect(onStage).toHaveBeenCalledWith('answered_silent');
  });

  it('with nobody to handle it says so, in the same card', () => {
    const html = renderToStaticMarkup(<LeadActCard counts={{ total: 0, stages: [] }} onStage={noop} />);
    expect(html).toContain('>0<');
    expect(html).toContain('אין כרגע מי שדורש טיפול');
    expect(html).not.toContain('<li>');
  });
});
