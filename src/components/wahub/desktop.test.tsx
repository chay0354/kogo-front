import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { makeContact } from '@/lib/wahub/testFixtures';
import type { WahubContactDetail, WahubLead } from '@/types/wahub';
import ChatList from './chats/ChatList';
import ContactPanel, { type CardFold } from './chats/ContactPanel';
import { LeadStateBlock, LeadStageTag, TemperatureDot } from './leads/LeadBits';
import { AreaError, CardSkeleton, ListRowsSkeleton, PanelSkeleton, RefreshNote, RowsSkeleton, TilesSkeleton } from './shared/loading';
import s from './wahub.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-LAYOUT.md — the contact's card in its one order with its
 * folded sections (ב), and how an area waits, reads again and fails (ג);
 * docs/WAHUB-CONTRACT-LEAD-STAGES.md (ב) — the state at the top of the card and
 * its tag in the conversations list, and what both show on a server that has
 * no lead state yet.
 */

const NOW = new Date('2026-10-11T12:00:00+03:00');
const TODAY = '2026-10-11';
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function lead(overrides: Partial<WahubLead> = {}): WahubLead {
  return {
    stage: 'answered_silent',
    stage_label: 'קיבל תשובה ולא נרשם',
    group: 'act',
    since: '2026-10-07T10:00:00+03:00',
    days: 4,
    reason: 'שאל על קפוארה בראש העין לפני 4 ימים. רק הבוט ענה. לא נרשם.',
    next_step: 'אף נציג עוד לא דיבר איתו – להתקשר',
    human_touched: false,
    temperature: 'warm',
    ...overrides,
  };
}

function detail(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return {
    ...makeContact(12, {
      name: 'דנה כהן',
      known: { summary: 'שאלה על קפוארה לבן 5.', topic_label: 'שיעור ניסיון', branch_name: 'פסגות אפק' },
      kogo: { outcome: 'trial_only', outcome_label: 'עשה ניסיון ולא נרשם' },
      followup: { note: 'אמא של יונתן' },
      tags: [
        { id: 1, name: 'קפוארה', color: '#2B3090' },
        { id: 2, name: 'חם', color: '#c81e1e' },
      ],
      ...overrides,
    }),
    messages: [],
    has_older: false,
    events: [
      { id: 5, kind: 'followup_changed', kind_label: 'סימון מעקב', text: 'בזמן אחר', actor_name: 'דור', created_at: '2026-10-06T14:05:00+03:00' },
      { id: 6, kind: 'analyzed', kind_label: 'סיכום', text: 'השיחה סוכמה', actor_name: '', created_at: '2026-10-07T09:00:00+03:00' },
      { id: 7, kind: 'created', kind_label: 'נוצר', text: 'פנייה ראשונה', actor_name: '', created_at: '2026-10-01T09:00:00+03:00' },
    ],
  };
}

const actions = { handoverBusy: false, resolveBusy: false, onTakeover: noop, onRelease: noop, onResolveNeedsHuman: noop };
const liveTest = { canEdit: true, busy: false, onToggle: noop };

function card(contact: WahubContactDetail, extra: { defaultOpen?: CardFold[]; showBack?: boolean; withLiveTest?: boolean } = {}): string {
  return render(
    <ContactPanel
      contact={contact}
      now={NOW}
      today={TODAY}
      allTags={[]}
      analyzing={false}
      rechecking={false}
      showBack={extra.showBack ?? false}
      onBack={noop}
      onFollowup={noop}
      onTags={noop}
      onRename={noop}
      onRecheck={noop}
      onAnalyze={noop}
      actions={actions}
      liveTest={extra.withLiveTest === false ? undefined : liveTest}
      defaultOpen={extra.defaultOpen}
    />,
  );
}

/** Where each section of the card starts, by the name it carries for a screen reader. */
function sectionOrder(html: string): string[] {
  return [...html.matchAll(/<section class="[^"]*" aria-label="([^"]+)"/g)].map((match) => match[1]);
}

describe('the contact\'s card: one fixed order', () => {
  const ORDER = ['מי', 'מצב', 'פעולות', 'במערכת', 'מעקב', 'מה ידוע', 'תגיות', 'הערות', 'סטטוסים', 'היסטוריה', 'בדיקה חיה'];

  it('who — the state — the actions — in Kogo — follow-up — and then the folded sections', () => {
    expect(sectionOrder(card(detail({ lead: lead(), live_test: false })))).toEqual(ORDER);
  });

  it('the order is the same on a server that has no lead state yet', () => {
    expect(sectionOrder(card(detail({ live_test: false })))).toEqual(ORDER);
  });

  it('the order is the same on a phone\'s details screen, under the way back', () => {
    const html = card(detail({ lead: lead(), live_test: false }), { showBack: true });
    expect(sectionOrder(html)).toEqual(ORDER);
    expect(html).toContain('aria-label="חזרה לשיחה"');
    expect(html.indexOf('חזרה לשיחה')).toBeLessThan(html.indexOf('aria-label="מי"'));
  });

  it('"בדיקה חיה" is there only when the tab passes it (not a demo contact, not an older server)', () => {
    expect(sectionOrder(card(detail({ lead: lead() }), { withLiveTest: false }))).toEqual(ORDER.slice(0, -1));
  });

  it('"who" is the initials, the name with its pencil, the phone and the way to WhatsApp', () => {
    const html = card(detail());
    const who = html.slice(html.indexOf('aria-label="מי"'), html.indexOf('aria-label="מצב"'));
    expect(who).toContain('דנה כהן');
    expect(who).toContain('aria-label="ערוך שם"');
    expect(who).toContain('050-0000012');
    expect(who).toContain('https://wa.me/972500000012');
  });

  it('"who" carries the two tags that say what kind of contact this is: demo, live test', () => {
    const demo = card(detail({ is_demo: true }), { withLiveTest: false });
    expect(demo.slice(demo.indexOf('aria-label="מי"'), demo.indexOf('aria-label="מצב"'))).toContain('>דמו<');
    const live = card(detail({ live_test: true }));
    expect(live.slice(live.indexOf('aria-label="מי"'), live.indexOf('aria-label="מצב"'))).toContain('>בדיקה חיה<');
    const plain = card(detail({ live_test: false }));
    const who = plain.slice(plain.indexOf('aria-label="מי"'), plain.indexOf('aria-label="מצב"'));
    expect(who).not.toContain('>דמו<');
    expect(who).not.toContain('>בדיקה חיה<');
  });

  it('the actions are one row: take the conversation, and "טופל" only when a person was asked for', () => {
    const quiet = card(detail());
    const row = quiet.slice(quiet.indexOf('aria-label="פעולות"'), quiet.indexOf('aria-label="במערכת"'));
    expect(row).toContain('קח שיחה');
    expect(row).not.toContain('טופל');
    const asked = card(detail({ chat: { needs_human: true } }));
    expect(asked.slice(asked.indexOf('aria-label="פעולות"'), asked.indexOf('aria-label="במערכת"'))).toContain('טופל');
    const taken = card(detail({ chat: { handled_by: 'human' } }));
    const takenRow = taken.slice(taken.indexOf('aria-label="פעולות"'), taken.indexOf('aria-label="במערכת"'));
    expect(takenRow).toContain('החזר לבוט');
    expect(takenRow).not.toContain('קח שיחה');
  });

  it('"הבוט טעה כאן" is out of the card', () => {
    expect(card(detail({ lead: lead() }), { defaultOpen: ['known', 'tags', 'notes', 'statuses', 'history', 'liveTest'] })).not.toContain(
      'הבוט טעה כאן',
    );
  });
});

describe('the contact\'s card: titles first, details on a press', () => {
  const folded = card(detail({ lead: lead(), live_test: false }));

  it('opens with every folded section shut: six titles, no content', () => {
    expect(folded.match(/aria-expanded="false"/g)).toHaveLength(6);
    expect(folded).not.toContain('aria-expanded="true"');
    // What sits behind the titles is not in the page until it is asked for.
    expect(folded).not.toContain('סכם מחדש');
    expect(folded).not.toContain('הוסף תגית');
    expect(folded).not.toContain('<textarea');
    expect(folded).not.toContain('מי עונה');
    expect(folded).not.toContain('השיחה סוכמה');
    expect(folded).not.toContain('role="switch"');
  });

  it('a folded title says how much is behind it: the number of tags and of log entries, the first words of the note', () => {
    expect(folded).toMatch(/תגיות<span[^>]*>\(2\)<\/span>/);
    expect(folded).toMatch(/היסטוריה<span[^>]*>\(3\)<\/span>/);
    const notes = folded.slice(folded.indexOf('aria-label="הערות"'), folded.indexOf('aria-label="סטטוסים"'));
    expect(notes).toContain('אמא של יונתן');
    expect(notes).toContain(s.foldHint);
  });

  it('each one opens by itself, and only it', () => {
    const tags = card(detail({ lead: lead(), live_test: false }), { defaultOpen: ['tags'] });
    expect(tags.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(tags).toContain('תגית חדשה');
    expect(tags).not.toContain('<textarea');

    const history = card(detail({ lead: lead(), live_test: false }), { defaultOpen: ['history'] });
    expect(history).toContain('השיחה סוכמה');
    expect(history).toContain('פנייה ראשונה');
    expect(history).not.toContain('תגית חדשה');
  });

  it('the whole of "מה ידוע" — the summary, the facts, "סכם מחדש" — is the first folded section', () => {
    const open = card(detail({ lead: lead(), live_test: false }), { defaultOpen: ['known'] });
    const known = open.slice(open.indexOf('aria-label="מה ידוע"'), open.indexOf('aria-label="תגיות"'));
    expect(known).toContain('שאלה על קפוארה לבן 5.');
    expect(known).toContain('שיעור ניסיון');
    expect(known).toContain('פסגות אפק');
    expect(known).toContain('סכם מחדש');
  });

  it('the follow-up marks stay out in the open — they are the office\'s daily work — as one compact row', () => {
    const marks = folded.slice(folded.indexOf('aria-label="מעקב"'), folded.indexOf('aria-label="מה ידוע"'));
    for (const label of ['לחזור אליו', 'לא ענה', 'ענה', 'בזמן אחר', 'נרשם', 'לא רלוונטי']) expect(marks).toContain(label);
    expect(marks).toContain(s.marksRow);
  });
});

describe('"מצב" at the top of the card — the direction', () => {
  it('with a lead state: the tag, how long, why in a sentence, and what to do in bold', () => {
    const html = card(detail({ lead: lead() }));
    const state = html.slice(html.indexOf('aria-label="מצב"'), html.indexOf('aria-label="פעולות"'));
    expect(state).toContain('קיבל תשובה ולא נרשם');
    expect(state).toContain('לפני 4 ימים');
    expect(state).toContain('שאל על קפוארה בראש העין לפני 4 ימים. רק הבוט ענה. לא נרשם.');
    expect(state).toContain('מה עושים');
    expect(state).toMatch(/<strong[^>]*>אף נציג עוד לא דיבר איתו – להתקשר<\/strong>/);
    // The temperature is a dot with its word behind it.
    expect(state).toContain('aria-label="מתעניין"');
    // The state stands instead of the short "מה ידוע", not beside it.
    expect(state).not.toContain(s.stateCaption);
  });

  it('what waits for us is marked as such; what is in progress says there is nothing to do now', () => {
    const act = renderToStaticMarkup(<LeadStateBlock lead={lead()} needsHuman={false} now={NOW} />);
    expect(act).toContain(s.stateNextAct);
    const waiting = renderToStaticMarkup(
      <LeadStateBlock lead={lead({ group: 'wait', stage: 'trial_booked', stage_label: 'רשום לשיעור ניסיון', next_step: '' })} needsHuman={false} now={NOW} />,
    );
    expect(waiting).toContain('רשום לשיעור ניסיון');
    expect(waiting).toContain('אין מה לעשות עכשיו.');
    expect(waiting).not.toContain('מה עושים');
    const closed = renderToStaticMarkup(
      <LeadStateBlock lead={lead({ group: 'closed', stage: 'registered', stage_label: 'נרשם', next_step: '', reason: 'נרשם ב-9.10.' })} needsHuman={false} now={NOW} />,
    );
    expect(closed).toContain('נרשם ב-9.10.');
    expect(closed).not.toContain('מה עושים');
    expect(closed).not.toContain('אין מה לעשות עכשיו');
  });

  it('on a server with no lead state: the short "מה ידוע" — the summary, clipped — in its place', () => {
    const html = card(detail());
    const state = html.slice(html.indexOf('aria-label="מצב"'), html.indexOf('aria-label="פעולות"'));
    expect(state).toContain('מה ידוע');
    expect(state).toContain('שאלה על קפוארה לבן 5.');
    expect(state).toContain(s.stateClamp);
    expect(state).not.toContain('מה עושים');
  });

  it('on a server with no lead state and nothing known: it says so, and nothing is invented', () => {
    const html = card(detail({ known: { summary: '', topic_label: '', branch_name: '' } }));
    const state = html.slice(html.indexOf('aria-label="מצב"'), html.indexOf('aria-label="פעולות"'));
    expect(state).toContain('עוד אין מידע על הפנייה הזו.');
  });

  it('a lead object that cannot be shown falls back the same way, rather than drawing an empty block', () => {
    const html = card(detail({ lead: { ...lead(), group: 'nonsense' as never } }));
    const state = html.slice(html.indexOf('aria-label="מצב"'), html.indexOf('aria-label="פעולות"'));
    expect(state).toContain('שאלה על קפוארה לבן 5.');
    expect(state).not.toContain('מה עושים');
  });
});

describe('the state\'s tag', () => {
  it('is the state\'s name on the colour of its group', () => {
    expect(renderToStaticMarkup(<LeadStageTag lead={lead()} />)).toContain(s.pWarn);
    expect(renderToStaticMarkup(<LeadStageTag lead={lead({ stage: 'needs_reply' })} needsHuman />)).toContain(s.pBad);
    expect(renderToStaticMarkup(<LeadStageTag lead={lead({ group: 'wait', stage: 'in_conversation' })} />)).toContain(s.pNav);
    expect(renderToStaticMarkup(<LeadStageTag lead={lead({ group: 'closed', stage: 'registered' })} />)).toContain(s.pGood);
    expect(renderToStaticMarkup(<LeadStageTag lead={lead({ group: 'closed', stage: 'cold' })} />)).toContain(s.pMute);
  });

  it('no temperature, no dot', () => {
    expect(renderToStaticMarkup(<TemperatureDot temperature="" />)).toBe('');
    expect(renderToStaticMarkup(<TemperatureDot temperature={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<TemperatureDot temperature="hot" />)).toContain('aria-label="חם"');
  });
});

describe('the conversations list: one tag instead of many', () => {
  const listProps = {
    status: 'ready' as const,
    error: '',
    hasMore: false,
    loadingMore: false,
    box: 'all' as const,
    counts: null,
    search: '',
    selectedId: null,
    now: NOW,
    notConnected: false,
    onSearch: noop,
    onBox: noop,
    onOpen: noop,
    onLoadMore: noop,
    onRetry: noop,
    onOpenSettings: noop,
  };
  const rowOf = (html: string, name: string) => {
    const at = html.indexOf(name);
    return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
  };

  it('a state that calls for action is a tag beside the name, in place of the row of small marks', () => {
    const html = render(
      <ChatList
        {...listProps}
        items={[
          makeContact(1, {
            name: 'דנה כהן',
            lead: lead({ stage: 'needs_reply', stage_label: 'שאל ולא קיבל תשובה' }),
            chat: { needs_human: true, waiting_since: '2026-10-11T11:40:00+03:00', unread_count: 2 },
          }),
        ]}
      />,
    );
    const row = rowOf(html, 'דנה כהן');
    expect(row).toContain('שאל ולא קיבל תשובה');
    expect(row).toContain(s.stageTag);
    // The marks it replaces: who answers, the request for a person, how long he has waited.
    expect(row).not.toContain('הבוט עונה');
    expect(row).not.toContain('>מבקש נציג<');
    expect(row).not.toContain('מחכה 20');
    // The red dot on the mark and the unread count are not tags: they stay.
    expect(row).toContain('aria-label="מבקש נציג"');
    expect(row).toContain('2 הודעות שלא נקראו');
  });

  it('a state that is in progress or closed gets no tag at all', () => {
    const html = render(
      <ChatList
        {...listProps}
        items={[
          makeContact(1, { name: 'מאיה קליין', lead: lead({ group: 'wait', stage: 'in_conversation', stage_label: 'בשיחה' }) }),
          makeContact(2, { name: 'אורי נחום', lead: lead({ group: 'closed', stage: 'registered', stage_label: 'נרשם' }) }),
        ]}
      />,
    );
    expect(html).not.toContain(s.stageTag);
    expect(html).not.toContain('>בשיחה<');
    expect(rowOf(html, 'אורי נחום')).not.toContain('>נרשם<');
  });

  it('what says who this is stays beside the state: an invented contact, a live test, a person answering', () => {
    const html = render(
      <ChatList
        {...listProps}
        items={[
          makeContact(1, { name: 'רונית לב', is_demo: true, lead: lead({ group: 'wait', stage: 'in_conversation' }) }),
          makeContact(2, { name: 'דור סער', live_test: true, lead: lead() }),
          makeContact(3, { name: 'איתי בן דוד', chat: { handled_by: 'human' }, lead: lead({ group: 'wait', stage: 'in_conversation' }) }),
        ]}
      />,
    );
    expect(rowOf(html, 'רונית לב')).toContain('>דמו<');
    expect(rowOf(html, 'דור סער')).toContain('>בדיקה חיה<');
    expect(rowOf(html, 'איתי בן דוד')).toContain('נציג עונה');
  });

  it('on a server with no lead state the row is exactly as it was', () => {
    const html = render(
      <ChatList
        {...listProps}
        items={[makeContact(1, { name: 'דנה כהן', chat: { needs_human: true, waiting_since: '2026-10-11T11:40:00+03:00' } })]}
      />,
    );
    const row = rowOf(html, 'דנה כהן');
    expect(row).not.toContain(s.stageTag);
    expect(row).toContain('הבוט עונה');
    expect(row).toContain('מבקש נציג');
    expect(row).toContain('מחכה 20 דק׳');
  });
});

describe('waiting, reading again and failing', () => {
  const listProps = {
    items: [],
    error: '',
    hasMore: false,
    loadingMore: false,
    box: 'all' as const,
    counts: null,
    search: '',
    selectedId: null,
    now: NOW,
    notConnected: false,
    onSearch: noop,
    onBox: noop,
    onOpen: noop,
    onLoadMore: noop,
    onRetry: noop,
    onOpenSettings: noop,
  };

  it('a list on its way is rows of its own shape — a mark and two lines — never an empty column', () => {
    const html = render(<ChatList {...listProps} status="loading" />);
    expect(html).toContain('aria-label="טוען שיחות"');
    expect(html.match(new RegExp(s.skAvatar, 'g'))!.length).toBeGreaterThanOrEqual(8);
    expect(html).not.toContain('אין שיחות');
  });

  it('a list read again keeps its rows and says "מתעדכן…" quietly; it does not go back to the grey shape', () => {
    const html = render(<ChatList {...listProps} items={[makeContact(1, { name: 'דנה כהן' })]} status="refreshing" />);
    expect(html).toContain('דנה כהן');
    expect(html).toContain('מתעדכן…');
    expect(html).not.toContain('aria-label="טוען שיחות"');
  });

  it('a list that is not being read says nothing, and still keeps the note\'s place', () => {
    const html = render(<ChatList {...listProps} items={[makeContact(1)]} status="ready" />);
    expect(html).not.toContain('מתעדכן…');
    expect(html).toContain(s.refreshNote);
  });

  it('a list that failed says so in one sentence, with "נסה שוב", where the list would be', () => {
    const html = render(<ChatList {...listProps} status="error" error="השרת לא ענה" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את השיחות');
    expect(html).toContain('השרת לא ענה');
    expect(html).toContain('נסה שוב');
    // The search and the boxes above it are untouched by the failure.
    expect(html).toContain('חיפוש בשיחות');
    expect(html).toContain('מבקשים נציג');
  });

  it('the quiet note is always in the page, and carries the words only while something is read', () => {
    const idle = renderToStaticMarkup(<RefreshNote active={false} />);
    expect(idle).toContain('role="status"');
    expect(idle).not.toContain('מתעדכן');
    expect(idle).not.toContain(s.refreshOn);
    const busy = renderToStaticMarkup(<RefreshNote active />);
    expect(busy).toContain('מתעדכן…');
    expect(busy).toContain(s.refreshOn);
  });

  it('the card on its way is sections of its own shape: who, the open sections, the folded titles', () => {
    const html = renderToStaticMarkup(<CardSkeleton />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="טוען את פרטי איש הקשר"');
    expect(html.match(new RegExp(`class="[^"]*${s.sect}[^"]*"`, 'g'))).toHaveLength(9);
    expect(html).toContain(s.skAvatarLg);
  });

  it('tiles on their way are tiles: as many as were asked for, each a label and a number', () => {
    const html = renderToStaticMarkup(<TilesSkeleton count={4} />);
    expect(html.match(new RegExp(s.skTile, 'g'))).toHaveLength(4);
    expect(html.match(new RegExp(s.skNumber, 'g'))).toHaveLength(4);
    expect(html).toContain(s.kpi);
  });

  it('rows on their way: short ones with a number, or tall ones with three lines', () => {
    const short = renderToStaticMarkup(<RowsSkeleton rows={3} />);
    expect(short.match(new RegExp(s.skCount, 'g'))).toHaveLength(3);
    const tall = renderToStaticMarkup(<RowsSkeleton rows={2} tall />);
    expect(tall.match(new RegExp(s.skRowTall, 'g'))).toHaveLength(2);
    expect(tall).not.toContain(s.skCount);
    expect(renderToStaticMarkup(<ListRowsSkeleton rows={5} />).match(new RegExp(s.skAvatar, 'g'))).toHaveLength(5);
  });

  it('a whole tab on its way is tiles and a card, not a blank page', () => {
    const html = renderToStaticMarkup(<PanelSkeleton />);
    expect(html).toContain(s.skTile);
    expect(html).toContain(s.card);
  });

  it('a failed area is a sentence and "נסה שוב"; with nothing to retry there is no button', () => {
    const html = renderToStaticMarkup(<AreaError title="לא הצלחנו לטעון את הרשימה" onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את הרשימה');
    expect(html).toContain('נסה שוב');
    expect(html).toContain(s.emptyTight);
    expect(renderToStaticMarkup(<AreaError title="לא הצלחנו" />)).not.toContain('<button');
  });
});
