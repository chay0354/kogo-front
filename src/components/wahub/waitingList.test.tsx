import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { readWaitingEntry } from '@/lib/wahub/futureLeads';
import { makeContact } from '@/lib/wahub/testFixtures';
import { HAS_ROOM_TEXT, NOTIFY_UNKNOWN_TEXT, ROOM_LESSONS_NOTE, notSentText, readWaitingListPage, type NotifyStep } from '@/lib/wahub/waitingList';
import type {
  WahubContactDetail,
  WahubLeadDetails,
  WahubLeadRow,
  WahubLessonOption,
  WahubLessonOptions,
  WahubNote,
  WahubNotifyPreview,
  WahubWaitingEntry,
  WahubWaitingListPage,
  WahubWaitingMark,
} from '@/types/wahub';
import ContactPanel from './chats/ContactPanel';
import f from './future.module.css';
import LeadDetails, { type LeadDetailsProps } from './leads/v2/LeadDetails';
import LeadsList, { type LeadsListProps } from './leads/v2/LeadsList';
import {
  NotifyView,
  WaitingActionsView,
  WaitingWay,
  type NotifyControls,
  type NotifyViewProps,
  type WaitingActionsViewProps,
} from './leads/v2/WaitingBits';
import { WaitingListView, type WaitingListViewProps } from './leads/v2/WaitingListScreen';
import l from './leads/v2/leads.module.css';
import m from './motion.module.css';
import { NoteList, NotePaper, NoteRow, type NoteActions, type NoteEdit } from './shared/FutureParts';
import { LessonPickerView, type LessonPickerViewProps } from './shared/LessonPicker';
import w from './waiting.module.css';
import s from './wahub.module.css';

// Nothing here may reach a server.
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'מיכל', branch_ids: [] }, loading: false }),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ז — what the screens show of the full
 * waiting list, of adding to it by hand, of telling a customer that a place
 * was freed, and of a note's small menu; and, beside each, that a server built
 * before it is shown exactly what it was shown before. Every name here is invented.
 */

/** Tuesday, 13.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-13T09:00:00Z');
const TODAY = '2026-10-13';
const noop = () => {};

function render(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/**
 * The elements a component draws, without a browser: a component that keeps no
 * state is called as the function it is, and its tree is walked. One that keeps
 * state cannot be called this way; what it was handed to draw is walked instead.
 */
function elements(node: React.ReactNode): React.ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (typeof element.type === 'function') {
    const drawn = called(element);
    return elements(drawn === UNCALLABLE ? element.props.children : drawn);
  }
  return [element, ...elements(element.props.children)];
}

const UNCALLABLE = Symbol('keeps state');

function called(element: React.ReactElement): React.ReactNode | typeof UNCALLABLE {
  // React says, loudly, that a hook was called outside a draw; here that is the expected way to find out.
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return (element.type as (props: unknown) => React.ReactNode)(element.props);
  } catch {
    return UNCALLABLE;
  } finally {
    quiet.mockRestore();
  }
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    if (typeof element.type === 'function') {
      const drawn = called(element);
      return textOf(drawn === UNCALLABLE ? element.props.children : drawn);
    }
    return textOf(element.props.children);
  }
  return '';
}

type Pressable = React.ReactElement<{ onClick?: () => void; disabled?: boolean; type?: string; className?: string; 'aria-expanded'?: boolean }>;

/** The button that carries these words, or this label. */
function button(node: React.ReactNode, words: string): Pressable {
  const found = elements(node).find(
    (element) =>
      element.type === 'button' &&
      ((element.props as { 'aria-label'?: string })['aria-label'] === words || textOf(element).trim() === words),
  );
  if (!found) throw new Error(`no button "${words}"`);
  return found as Pressable;
}

const hasButton = (node: React.ReactNode, words: string) => {
  try {
    button(node, words);
    return true;
  } catch {
    return false;
  }
};

const css = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

// ---------------------------------------------------------------------------
// What the server sends
// ---------------------------------------------------------------------------

const LESSON = { id: '0b0e', course_id: '77aa', course: 'קפוארה גן חובה', day: 'שלישי', start: '17:00', end: '17:45', branch: 'מינץ', label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ' };
const LESSON2 = { id: '2222', course_id: '88bb', course: 'אקרובטיקה כיתות א׳–ב׳', day: 'ראשון', start: '16:00', end: '16:45', branch: 'הזמיר', label: 'אקרובטיקה כיתות א׳–ב׳ · יום ראשון · 16:00 · הזמיר' };

/** One row of GET waiting-list/ on a server that knows all of ז. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    contact_id: 12,
    name: 'דנה לוי',
    phone_display: '050-555-0101',
    is_demo: false,
    status: 'freed',
    status_label: 'התפנה מקום',
    lesson: LESSON,
    child: 'בן 5, גן חובה',
    added_by: 'bot',
    added_by_name: null,
    created_at: '2026-10-11T08:40:00+00:00',
    freed_at: '2026-10-13T07:05:00+00:00',
    closed_at: null,
    closed_by_name: null,
    closed_reason: '',
    position: 1,
    title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00',
    notified_at: null,
    notified_by_name: null,
    notified_how: '',
    notified_how_label: '',
    customer_replied_at: null,
    ...over,
  };
}

const TOLD = { notified_at: '2026-10-13T08:02:00+00:00', notified_by_name: 'מיכל כהן', notified_how: 'text', notified_how_label: 'הודעה רגילה' };

/** Two wait for the one place that was freed; one more waits for a lesson that is full. */
const ANSWER = {
  counts: { waiting: 1, freed: 2 },
  lessons: [
    { ...LESSON, exists: true, enrolled: 19, capacity: 20, seats_left: 1, is_full: false, seats_label: '19 מתוך 20 · נשאר מקום אחד', waiting: 0, freed: 2, entry_ids: [7, 9] },
    { ...LESSON2, exists: true, enrolled: 20, capacity: 20, seats_left: 0, is_full: true, seats_label: '20 מתוך 20 · מלא', waiting: 1, freed: 0, entry_ids: [11] },
  ],
  results: [
    row(),
    row({ id: 9, contact_id: 13, name: 'אורי נחום', child: 'בת 5', position: 2, created_at: '2026-10-12T08:40:00+00:00' }),
    row({ id: 11, contact_id: 14, name: 'נועה פרידמן', child: 'בת 6', status: 'waiting', status_label: 'ממתין', lesson: LESSON2, freed_at: null, position: 1, added_by: 'person', added_by_name: 'מיכל כהן' }),
  ],
};

const page = (answer: unknown = ANSWER): WahubWaitingListPage => readWaitingListPage(answer) as WahubWaitingListPage;

/** The same answer from the morning's server: no lessons, and nothing about telling the customer. */
function morningAnswer(): unknown {
  const strip = (entry: Record<string, unknown>) => {
    const { notified_at: _a, notified_by_name: _b, notified_how: _c, notified_how_label: _d, customer_replied_at: _e, ...rest } = entry;
    return rest;
  };
  return { counts: ANSWER.counts, results: ANSWER.results.map(strip) };
}

const READY: WahubNotifyPreview = {
  can: true,
  how: 'text',
  how_label: 'תצא כהודעה רגילה (הלקוח כתב ב-24 השעות האחרונות)',
  text: 'היי התפנה מקום ב *קפוארה גן חובה* ביום שלישי ב-17:00 (מינץ) 🎉 רוצים שנשמור לכם אותו?',
  blocked: '',
  detail: '',
  needs_again: false,
  already_notified_at: null,
  already_notified_by_name: '',
};

const NO_NOTIFY: NotifyControls = { open: null, onStart: noop, onSend: noop, onClose: noop };

// ---------------------------------------------------------------------------
// The way in
// ---------------------------------------------------------------------------

describe('the way into the waiting list: one quiet line above the leads', () => {
  // Owner, 13.10.2026 afternoon: "'מחכים לך' זה כללי מדי… תרשום 'מחכים שיתפנה מקום', ושיישאר ככה".
  it('"מחכים שיתפנה מקום" and how many wait; a place that was freed is said in green', () => {
    const quiet = render(<WaitingWay counts={{ waiting: 4, freed: 0 }} onOpen={noop} />);
    expect(quiet).toContain('<strong>מחכים שיתפנה מקום</strong> · 4 ממתינים');
    expect(quiet).not.toContain('רשימת המתנה');
    expect(quiet).not.toContain(w.wayFreed);
    const freed = render(<WaitingWay counts={{ waiting: 5, freed: 2 }} onOpen={noop} />);
    expect(freed).toContain(w.wayFreed);
    expect(freed).toContain('7 ממתינים');
    expect(freed).toContain('התפנה מקום ל-2');
  });

  it('nobody waits: the way in is still there, and says so', () => {
    expect(render(<WaitingWay counts={{ waiting: 0, freed: 0 }} onOpen={noop} />)).toContain('אין ממתינים');
  });

  it('the whole line is the way in', () => {
    const onOpen = vi.fn();
    const node = <WaitingWay counts={{ waiting: 1, freed: 0 }} onOpen={onOpen} />;
    (elements(node).find((element) => element.type === 'button') as Pressable).props.onClick?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  function list(over: Partial<LeadsListProps> = {}): string {
    return render(
      <LeadsList
        view="office"
        counts={{ office: 0, bot: 0, closed: 0 }}
        stage={null}
        stages={[]}
        search=""
        status="ready"
        error=""
        rows={[]}
        stale={false}
        hasMore={false}
        loadingMore={false}
        refreshing={false}
        selectedId={null}
        now={NOW}
        sendingOn={false}
        waitingList={{ waiting: 3, freed: 1 }}
        onWaitingList={noop}
        onView={noop}
        onStage={noop}
        onSearch={noop}
        onOpen={noop}
        onMore={noop}
        onRetry={noop}
        {...over}
      />,
    );
  }

  it('it stands above "מחכים לך" and "הבוט מטפל" — not above the closed ones, and out of the way of a search', () => {
    expect(list()).toContain(w.way);
    expect(list({ view: 'bot' })).toContain(w.way);
    expect(list({ view: 'closed' })).not.toContain(w.way);
    expect(list({ search: 'דנה' })).not.toContain(w.way);
  });

  it('it is not a tab: the two tabs are what they were', () => {
    const html = list();
    expect(html.split('role="tab"').length - 1).toBe(2);
  });

  it('a server with no waiting list: there is no way in', () => {
    expect(list({ waitingList: null })).not.toContain('רשימת המתנה');
  });
});

// ---------------------------------------------------------------------------
// The full list
// ---------------------------------------------------------------------------

function listView(over: Partial<WaitingListViewProps> = {}): React.ReactElement {
  return (
    <WaitingListView
      status="ready"
      error=""
      page={page()}
      now={NOW}
      refreshing={false}
      toggledLessons={{}}
      toggledEntries={{}}
      busy={null}
      notify={NO_NOTIFY}
      onBack={noop}
      onToggleLesson={noop}
      onToggleEntry={noop}
      onAct={noop}
      onOpenChat={noop}
      onRetry={noop}
      {...over}
    />
  );
}

describe('the full waiting list, by lesson', () => {
  it('the head says what this is, how many wait, and — apart — for how many a place was freed', () => {
    const html = render(listView());
    expect(html).toContain('>מחכים שיתפנה מקום</h2>');
    expect(html).toContain('3 ממתינים');
    expect(html).toContain('<strong>התפנה מקום ל-2</strong>');
  });

  it('a lesson\'s title row: the class, when and where; enrolled against the limit right now; how many wait', () => {
    const html = render(listView());
    expect(html).toContain('קפוארה גן חובה');
    expect(html).toContain('יום שלישי · 17:00 · מינץ');
    expect(html).toContain('19 מתוך 20 · נשאר מקום אחד');
    expect(html).toContain('2 ממתינים');
    expect(html).toContain('20 מתוך 20 · מלא');
    expect(html).toContain('ממתין אחד');
  });

  it('a lesson that has a place now comes first, green, and stands open; one that is full is a title until pressed', () => {
    const html = render(listView());
    const freed = html.indexOf('קפוארה גן חובה');
    const full = html.indexOf('אקרובטיקה כיתות א׳–ב׳');
    expect(freed).toBeGreaterThan(-1);
    expect(freed).toBeLessThan(full);
    expect(html.split(w.lessonFreed).length - 1).toBe(1);
    expect(html).toContain(w.lessonNews);
    // Open: its line is in the page. Folded: the one who waits for the full lesson is not.
    expect(html).toContain('דנה לוי');
    expect(html).toContain('אורי נחום');
    expect(html).not.toContain('נועה פרידמן');
    expect(html).toMatch(new RegExp(`aria-expanded="true"[^>]*class="${w.lessonHead}"`));
    expect(html).toMatch(new RegExp(`aria-expanded="false"[^>]*class="${w.lessonHead}"`));
  });

  it('the line: who is first, the child, and one word for where each stands', () => {
    const html = render(listView());
    expect(html).toContain(w.placeFirst);
    expect(html).toContain('title="ראשון בתור"');
    expect(html).toContain('title="מקום 2 בתור"');
    expect(html).toContain('בן 5, גן חובה');
    expect(html.indexOf('דנה לוי')).toBeLessThan(html.indexOf('אורי נחום'));
    expect(html.split(w.standingFreed).length - 1).toBe(2);
  });

  it('the first in line of a freed place is open, with what can be done; the second is a title until pressed', () => {
    const html = render(listView());
    // One open person: one set of actions, and what a press adds — since when, who added them.
    expect(html.split('aria-label="פעולות על המקום שהתפנה"').length - 1).toBe(1);
    expect(html).toContain('נכנס ב-11.10 · ראשון בתור · התפנה ב-13.10 · הבוט הוסיף');
    for (const words of ['להודיע ללקוח', 'טופל', 'להסיר מהרשימה', 'פתח שיחה']) expect(html).toContain(words);
    expect(html).not.toContain('נכנס ב-12.10');
  });

  it('a press opens and closes a lesson and a person — the screen above keeps which', () => {
    const onToggleLesson = vi.fn();
    const onToggleEntry = vi.fn();
    const node = listView({ onToggleLesson, onToggleEntry });
    const heads = elements(node).filter((element) => element.type === 'button' && (element.props as { className?: string }).className === w.lessonHead) as Pressable[];
    expect(heads).toHaveLength(2);
    heads[0].props.onClick?.();
    heads[1].props.onClick?.();
    expect(onToggleLesson.mock.calls).toEqual([['0b0e', false], ['2222', true]]);
    const people = elements(node).filter((element) => element.type === 'button' && (element.props as { className?: string }).className === w.personHead) as Pressable[];
    // (The walk reads through a fold that is closed: the third is the one who waits for the full lesson.)
    expect(people.map((person) => person.props['aria-expanded'])).toEqual([true, false, false]);
    people[1].props.onClick?.();
    expect(onToggleEntry).toHaveBeenCalledWith(9, true);
  });

  it('whoever only waits can be taken off the list — and nothing else', () => {
    const html = render(listView({ toggledLessons: { '2222': true }, toggledEntries: { 11: true } }));
    expect(html).toContain('נועה פרידמן');
    expect(html).toContain('aria-label="פעולות על הרשומה"');
    expect(html).toContain('ראשון בתור · הוסיף: מיכל כהן');
    const after = html.slice(html.indexOf('aria-label="פעולות על הרשומה"'));
    expect(after).toContain('להסיר מהרשימה');
    expect(after).not.toContain('טופל');
    expect(after).not.toContain('להודיע ללקוח');
  });

  it('the customer was told: "הודענו ללקוח · מתי · מי" — and once they wrote back, "הלקוח ענה"', () => {
    const told = render(listView({ page: page({ ...ANSWER, results: [row(TOLD), ...ANSWER.results.slice(1)] }) }));
    expect(told).toContain(w.standingTold);
    expect(told).toContain('הודענו ללקוח · 13.10 11:02 · מיכל כהן');
    expect(told).not.toContain('הלקוח ענה');
    const replied = render(listView({ page: page({ ...ANSWER, results: [row({ ...TOLD, customer_replied_at: '2026-10-13T08:40:00+00:00' }), ...ANSWER.results.slice(1)] }) }));
    expect(replied).toContain(w.standingReplied);
    expect(replied).toContain('הלקוח ענה · 13.10 11:40');
  });

  it('the block of "להודיע ללקוח" keeps its person — and their lesson — open, whatever was pressed', () => {
    const notify: NotifyControls = { ...NO_NOTIFY, open: { entryId: 9, step: { step: 'ready', preview: READY, sending: false } } };
    const html = render(listView({ notify, toggledLessons: { '0b0e': false }, toggledEntries: { 9: false } }));
    expect(html).toContain('זה מה שיישלח ללקוח');
    expect(html).toContain('אורי נחום');
  });

  it('a server from the morning (no lessons, nothing about telling): the same groups, with no numbers and no "להודיע ללקוח"', () => {
    const html = render(listView({ page: page(morningAnswer()) }));
    expect(html).toContain('קפוארה גן חובה');
    expect(html).toContain('2 ממתינים');
    expect(html).not.toContain(w.lessonSeats);
    expect(html).not.toContain('להודיע ללקוח');
    // What it could do before, it still can.
    expect(html).toContain('טופל');
    expect(html).toContain('להסיר מהרשימה');
  });

  it('nobody waits; the list on its way; a read that failed', () => {
    const empty = render(listView({ page: page({ counts: { waiting: 0, freed: 0 }, lessons: [], results: [] }) }));
    expect(empty).toContain('אף אחד לא ממתין');
    expect(render(listView({ status: 'loading', page: null }))).toContain('aria-busy="true"');
    const onRetry = vi.fn();
    const failed = listView({ status: 'error', page: null, error: 'אין חיבור', onRetry });
    expect(render(failed)).toContain('לא הצלחנו לטעון את רשימת ההמתנה');
    button(failed, 'נסו שוב').props.onClick?.();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('the way back to the leads stands at the head, by name', () => {
    const onBack = vi.fn();
    button(listView({ onBack }), 'חזרה ללידים').props.onClick?.();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// "להודיע ללקוח"
// ---------------------------------------------------------------------------

function notifyView(step: NotifyStep, over: Partial<NotifyViewProps> = {}): React.ReactElement {
  return <NotifyView step={step} now={NOW} onSend={noop} onClose={noop} {...over} />;
}

describe('"להודיע ללקוח": first what would go out, then the press that sends it', () => {
  it('while it is read: the section\'s three dots, and nothing to press', () => {
    const node = notifyView({ step: 'loading' });
    const html = render(node);
    expect(html).toContain('בודקים מה ייצא ללקוח');
    expect(html).toContain(m.thinking);
    expect(elements(node).filter((element) => element.type === 'button')).toHaveLength(0);
  });

  it('it goes out: the wording as the customer will see it, how it goes out, and one press', () => {
    const onSend = vi.fn();
    const onClose = vi.fn();
    const node = notifyView({ step: 'ready', preview: READY, sending: false }, { onSend, onClose });
    const html = render(node);
    expect(html).toContain('זה מה שיישלח ללקוח');
    expect(html).toContain(w.notifyBubble);
    expect(html).toContain('קפוארה גן חובה');
    expect(html).toContain('תצא כהודעה רגילה');
    expect(html).not.toContain(w.notifyHeld);
    button(node, 'לשלוח ללקוח').props.onClick?.();
    button(node, 'ביטול').props.onClick?.();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a template: the customer gets the template\'s own wording, and the screen says so', () => {
    const html = render(notifyView({ step: 'ready', preview: { ...READY, how: 'template', how_label: 'תצא כתבנית מאושרת — הלקוח מקבל את הנוסח הקבוע של התבנית' }, sending: false }));
    expect(html).toContain('תצא כתבנית מאושרת');
  });

  it('it would not go out: why comes first, in plain words, and the press is locked', () => {
    for (const [blocked, words] of [
      ['sending_off', 'השליחה ללקוחות כבויה'],
      ['no_template', 'אין תבנית מחוברת'],
      ['taken', 'המקום נתפס בינתיים'],
      ['demo', 'איש קשר דמו'],
    ] as const) {
      const preview: WahubNotifyPreview = { ...READY, can: false, blocked, detail: 'מפעילים בהגדרות המערכת (WAHUB_SENDING_ENABLED), אוטומציה בשם kogo_lead_seat_1' };
      const node = notifyView({ step: 'ready', preview, sending: false });
      const html = render(node);
      expect(html, blocked).toContain(words);
      expect(html.indexOf(w.notifyHeld), blocked).toBeLessThan(html.indexOf(w.notifyBubble));
      // No name of a setting reaches the screen.
      expect(html, blocked).not.toMatch(/WAHUB_|kogo_lead/);
      expect(html, blocked).toContain('הנוסח שהיה נשלח');
      expect(html, blocked).toContain(w.notifyBubbleOff);
      expect(button(node, 'לשלוח ללקוח').props.disabled, blocked).toBe(true);
      expect(hasButton(node, 'סגור'), blocked).toBe(true);
    }
  });

  it('a locked press cannot send, whatever is pressed', () => {
    const preview: WahubNotifyPreview = { ...READY, can: false, blocked: 'sending_off' };
    expect(button(notifyView({ step: 'ready', preview, sending: false }), 'לשלוח ללקוח').props.disabled).toBe(true);
  });

  it('already told of this place: the question, and the press says "לשלוח שוב"', () => {
    const preview: WahubNotifyPreview = { ...READY, needs_again: true, already_notified_at: '2026-10-13T08:02:00+00:00', already_notified_by_name: 'מיכל כהן' };
    const onSend = vi.fn();
    const node = notifyView({ step: 'ready', preview, sending: false }, { onSend });
    const html = render(node);
    expect(html).toContain('כבר נשלחה הודעה ב-13.10 11:02 (מיכל כהן). לשלוח שוב?');
    expect(hasButton(node, 'לשלוח ללקוח')).toBe(false);
    button(node, 'לשלוח שוב').props.onClick?.();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('a message about an earlier place, since taken, asks nothing: this one is new', () => {
    const preview: WahubNotifyPreview = { ...READY, needs_again: false, already_notified_at: '2026-10-10T08:02:00+00:00', already_notified_by_name: 'מיכל כהן' };
    const node = notifyView({ step: 'ready', preview, sending: false });
    expect(render(node)).not.toContain('לשלוח שוב');
    expect(hasButton(node, 'לשלוח ללקוח')).toBe(true);
  });

  it('while it is on its way nothing can be pressed — one press is one message', () => {
    const node = notifyView({ step: 'ready', preview: READY, sending: true });
    expect(button(node, 'לשלוח ללקוח').props.disabled).toBe(true);
    expect(button(node, 'ביטול').props.disabled).toBe(true);
    expect(render(node)).toContain(s.spin);
  });

  it('nothing went out, or it is not known: the reason, and only "סגור" — nothing here sends again', () => {
    for (const text of [notSentText('sending_off', ''), NOTIFY_UNKNOWN_TEXT, 'ManyChat דחה את הפעולה: האיש לא נמצא.']) {
      const onClose = vi.fn();
      const node = notifyView({ step: 'held', text }, { onClose });
      expect(render(node)).toContain(text);
      const buttons = elements(node).filter((element) => element.type === 'button');
      expect(buttons).toHaveLength(1);
      button(node, 'סגור').props.onClick?.();
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

// ---------------------------------------------------------------------------
// What can be done with one entry
// ---------------------------------------------------------------------------

function actions(over: Partial<WaitingActionsViewProps> = {}): React.ReactElement {
  return <WaitingActionsView name="דנה לוי" lesson={LESSON.label} busy={null} asking={false} onAsk={noop} onAct={noop} {...over} />;
}

describe('what can be done with one entry of the list', () => {
  it('a place was freed: "להודיע ללקוח" leads — it is the next thing to do', () => {
    const onNotify = vi.fn();
    const node = actions({ onNotify });
    expect(button(node, 'להודיע ללקוח').props.className).toContain(s.btnP);
    expect(button(node, 'טופל').props.className).not.toContain(s.btnP);
    button(node, 'להודיע ללקוח').props.onClick?.();
    expect(onNotify).toHaveBeenCalledTimes(1);
    // The three, in the order they are done.
    const html = render(node);
    expect(html.indexOf('להודיע ללקוח')).toBeLessThan(html.indexOf('טופל'));
    expect(html.indexOf('טופל')).toBeLessThan(html.indexOf('להסיר מהרשימה'));
  });

  it('once the customer was told, "טופל" leads, and telling again is a quiet second', () => {
    const node = actions({ onNotify: noop, told: true });
    expect(button(node, 'טופל').props.className).toContain(s.btnP);
    expect(button(node, 'להודיע ללקוח').props.className).not.toContain(s.btnP);
  });

  it('a server that cannot tell a customer: the two actions it always had, and "טופל" leads', () => {
    const node = actions();
    expect(hasButton(node, 'להודיע ללקוח')).toBe(false);
    expect(button(node, 'טופל').props.className).toContain(s.btnP);
    expect(hasButton(node, 'להסיר מהרשימה')).toBe(true);
  });

  it('still waiting: "להסיר מהרשימה" alone — asked about first', () => {
    const onAsk = vi.fn();
    const onAct = vi.fn();
    const node = actions({ status: 'waiting', onNotify: noop, onAsk, onAct });
    expect(hasButton(node, 'טופל')).toBe(false);
    expect(hasButton(node, 'להודיע ללקוח')).toBe(false);
    button(node, 'להסיר מהרשימה').props.onClick?.();
    expect(onAsk).toHaveBeenCalledWith(true);
    expect(onAct).not.toHaveBeenCalled();
    const asked = actions({ status: 'waiting', asking: true, onAct });
    expect(render(asked)).toContain('המקום בתור לא נשמר');
    button(asked, 'כן, להסיר').props.onClick?.();
    expect(onAct).toHaveBeenCalledWith('remove');
  });

  it('the block of "להודיע ללקוח" stands in place of the buttons while it is open', () => {
    const node = actions({ onNotify: noop, notify: { step: 'ready', preview: READY, sending: false } });
    expect(hasButton(node, 'טופל')).toBe(false);
    expect(hasButton(node, 'להסיר מהרשימה')).toBe(false);
    expect(hasButton(node, 'לשלוח ללקוח')).toBe(true);
  });

  it('"פתח שיחה": a quiet way to the person\'s conversation, where the entry is shown away from it', () => {
    const onOpenChat = vi.fn();
    for (const status of ['freed', 'waiting'] as const) {
      const node = actions({ status, onOpenChat });
      expect(button(node, 'פתח שיחה').props.className).toContain(w.quietLink);
      button(node, 'פתח שיחה').props.onClick?.();
    }
    expect(onOpenChat).toHaveBeenCalledTimes(2);
    // In a lead's details the conversation is one press away already: the line is not drawn twice.
    expect(hasButton(actions(), 'פתח שיחה')).toBe(false);
  });

  it('while a press is on its way nothing else can be pressed', () => {
    const node = actions({ onNotify: noop, busy: 'handled' });
    for (const words of ['להודיע ללקוח', 'טופל', 'להסיר מהרשימה']) expect(button(node, words).props.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Choosing a lesson
// ---------------------------------------------------------------------------

const OPTION: WahubLessonOption = {
  id: '0b0e',
  course: 'קפוארה גן חובה',
  day: 'שלישי',
  start: '17:00',
  end: '17:45',
  branch_id: '5c1d',
  branch: 'מינץ',
  label: LESSON.label,
  seats_label: '20 מתוך 20 · מלא',
  is_full: true,
  can_join: true,
  waiting: 2,
  on_list: false,
};

const OPTIONS: WahubLessonOptions = {
  branches: [{ id: '5c1d', name: 'מינץ' }, { id: '9e2f', name: 'הזמיר' }],
  total: 3,
  results: [
    OPTION,
    { ...OPTION, id: 'mine', course: 'אקרובטיקה כיתות א׳–ב׳', branch_id: '9e2f', branch: 'הזמיר', on_list: true, waiting: 1 },
    { ...OPTION, id: 'room', course: 'ג׳ודו כיתות א׳–ב׳', seats_label: '18 מתוך 20 · נשארו 2', is_full: false, can_join: false, waiting: 0 },
  ],
};

function picker(over: Partial<LessonPickerViewProps> = {}): React.ReactElement {
  return (
    <LessonPickerView
      name="דנה לוי"
      status="ready"
      error=""
      options={OPTIONS}
      stale={false}
      search=""
      branch=""
      roomOpen={false}
      chosen={null}
      child=""
      saving={false}
      saveError=""
      onSearch={noop}
      onBranch={noop}
      onRoom={noop}
      onChoose={noop}
      onChild={noop}
      onSave={noop}
      onClose={noop}
      onRetry={noop}
      {...over}
    />
  );
}

describe('"להוסיף לרשימת המתנה": the window where a lesson is chosen', () => {
  it('a window of its own: a title, who is being added, and an X', () => {
    const onClose = vi.fn();
    const node = picker({ onClose });
    const html = render(node);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('>להוסיף לרשימת המתנה</h2>');
    expect(html).toContain('דנה לוי');
    // The X at the head — and the ground behind the window — both put it away.
    const closers = elements(node).filter((element) => element.type === 'button' && (element.props as { 'aria-label'?: string })['aria-label'] === 'סגור') as Pressable[];
    expect(closers).toHaveLength(2);
    closers.forEach((closer) => closer.props.onClick?.());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('a search, and a branch to narrow by — only when there is more than one', () => {
    const html = render(picker());
    expect(html).toContain('aria-label="חיפוש שיעור"');
    expect(html).toContain('aria-label="סינון לפי סניף"');
    expect(html).toContain('כל הסניפים');
    expect(html.split('<option').length - 1).toBe(3);
    expect(render(picker({ options: { ...OPTIONS, branches: [OPTIONS.branches[0]] } }))).not.toContain('סינון לפי סניף');
  });

  it('only a lesson that can be waited for can be pressed: a full one', () => {
    const onChoose = vi.fn();
    const node = picker({ onChoose });
    const html = render(node);
    expect(html).toContain('20 מתוך 20 · מלא · 2 ממתינים');
    const rows = elements(node).filter((element) => element.type === 'button' && (element.props as { className?: string }).className === w.opt) as Pressable[];
    expect(rows).toHaveLength(1);
    rows[0].props.onClick?.();
    expect(onChoose).toHaveBeenCalledWith(OPTION);
  });

  it('a lesson this person already waits for is there, marked — and cannot be chosen again', () => {
    const html = render(picker());
    expect(html).toContain('כבר ברשימה');
    expect(html).toContain(w.optOn);
    expect(html).toMatch(new RegExp(`<div class="${w.opt} ${w.optOff} ${w.optOn}">`));
  });

  it('lessons that have room wait behind their title; opened, none of them can be pressed, and the reason is said', () => {
    const folded = render(picker());
    expect(folded).toContain('שיעורים שיש בהם מקום');
    expect(folded).toContain('(1)');
    expect(folded).not.toContain('ג׳ודו כיתות א׳–ב׳');
    const onRoom = vi.fn();
    const node = picker({ roomOpen: true, onRoom });
    const open = render(node);
    expect(open).toContain('ג׳ודו כיתות א׳–ב׳');
    expect(open).toContain('18 מתוך 20 · נשארו 2');
    expect(open).toContain(ROOM_LESSONS_NOTE);
    expect(ROOM_LESSONS_NOTE).toContain('לרשום אליו ישר');
    expect(open).toMatch(new RegExp(`<li class="${w.opt} ${w.optOff}">`));
    (elements(node).find((element) => element.type === 'button' && (element.props as { className?: string }).className === w.roomHead) as Pressable).props.onClick?.();
    expect(onRoom).toHaveBeenCalledWith(false);
  });

  it('no full lesson: said plainly, with what to do instead', () => {
    const none = { ...OPTIONS, results: [OPTIONS.results[2]] };
    expect(render(picker({ options: none }))).toContain('אין כרגע שיעור מלא');
    expect(render(picker({ options: none, search: 'ג׳ודו' }))).toContain('אין שיעור מלא שמתאים לחיפוש');
    expect(render(picker({ options: none }))).toContain('לשיעור שיש בו מקום רושמים ישר');
  });

  it('the lessons on their way; a read that failed; a server that cannot list them', () => {
    expect(render(picker({ status: 'loading', options: null }))).toContain('aria-busy="true"');
    const onRetry = vi.fn();
    const failed = picker({ status: 'error', options: null, error: 'אין חיבור', onRetry });
    expect(render(failed)).toContain('לא הצלחנו לטעון את השיעורים');
    button(failed, 'נסו שוב').props.onClick?.();
    expect(onRetry).toHaveBeenCalledTimes(1);
    const missing = render(picker({ status: 'missing', options: null }));
    expect(missing).toContain('אי אפשר להוסיף מכאן כרגע');
    expect(missing).not.toContain('חיפוש שיעור');
  });

  it('the second step: the lesson that was chosen, large; one short field that is not required; one button', () => {
    const onSave = vi.fn();
    const onChoose = vi.fn();
    const node = picker({ chosen: OPTION, onSave, onChoose });
    const html = render(node);
    expect(html).toContain(w.chosen);
    expect(html).toContain('קפוארה גן חובה');
    expect(html).toContain('יום שלישי · 17:00 · מינץ');
    expect(html).toContain('על מי מדובר');
    expect(html).toContain('גיל או כיתה, לא חובה');
    expect(html.split('<input').length - 1).toBe(1);
    expect(html).not.toContain('required');
    // The buttons are pinned to the foot of the window.
    expect(html).toMatch(new RegExp(`class="${w.winFoot}"[^]*להוסיף לרשימה[^]*שיעור אחר`));
    expect(button(node, 'להוסיף לרשימה').props.type).toBe('submit');
    button(node, 'שיעור אחר').props.onClick?.();
    expect(onChoose).toHaveBeenCalledWith(null);
    // Enter in the field adds: the form's own submit.
    const form = elements(node).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
    form.props.onSubmit({ preventDefault: noop });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a refusal — the lesson has room — is said in plain words, and what was chosen stays', () => {
    const html = render(picker({ chosen: OPTION, child: 'בן 5', saveError: `${HAS_ROOM_TEXT}.` }));
    expect(html).toContain('בשיעור הזה יש מקום — אפשר לרשום ישר.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('value="בן 5"');
    expect(html).toContain('קפוארה גן חובה');
  });

  it('a lesson that turned out to have room cannot be added to: its numbers say so, and the button is locked', () => {
    const onSave = vi.fn();
    const room: WahubLessonOption = { ...OPTION, is_full: false, can_join: false, seats_label: '18 מתוך 20 · נשארו 2', waiting: 0 };
    const node = picker({ chosen: room, saveError: `${HAS_ROOM_TEXT}.`, onSave });
    expect(render(node)).toContain('18 מתוך 20 · נשארו 2');
    expect(button(node, 'להוסיף לרשימה').props.disabled).toBe(true);
    const form = elements(node).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
    form.props.onSubmit({ preventDefault: noop });
    expect(onSave).not.toHaveBeenCalled();
    // The way on is still there.
    expect(button(node, 'שיעור אחר').props.disabled).toBe(false);
  });

  it('while it is being added nothing can be pressed — not the X either', () => {
    const onSave = vi.fn();
    const node = picker({ chosen: OPTION, saving: true, onSave });
    expect(button(node, 'להוסיף לרשימה').props.disabled).toBe(true);
    expect(button(node, 'שיעור אחר').props.disabled).toBe(true);
    const closers = elements(node).filter((element) => element.type === 'button' && (element.props as { 'aria-label'?: string })['aria-label'] === 'סגור') as Pressable[];
    expect(closers.every((closer) => closer.props.disabled)).toBe(true);
    const form = elements(node).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
    form.props.onSubmit({ preventDefault: noop });
    expect(onSave).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A note's small menu
// ---------------------------------------------------------------------------

const NOTE: WahubNote = { id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+03:00', edited_at: null, edited_by_name: '' };
/** The same note from a server that cannot change one: it does not say whether it was edited. */
const OLD_NOTE: WahubNote = { id: 311, text: NOTE.text, by_name: NOTE.by_name, created_at: NOTE.created_at };
const NOTE_ACTIONS: NoteActions = { onEdit: async () => '', onDelete: async () => '' };

function paper(edit: Partial<NoteEdit> = {}, note: WahubNote = NOTE, inThread = true): React.ReactElement {
  const full: NoteEdit = { mode: 'idle', text: note.text, busy: false, error: '', onMode: noop, onText: noop, onSave: noop, onDelete: noop, ...edit };
  return <NotePaper note={note} meta="פתק · מיכל כהן · 09:20" inThread={inThread} now={NOW} edit={full} />;
}

describe('a note: editing and deleting', () => {
  it('a note the server can change carries a small menu — in the conversation and in a list', () => {
    const row = render(<NoteRow note={NOTE} now={NOW} actions={NOTE_ACTIONS} />);
    expect(row).toContain('aria-label="עוד על הפתק"');
    expect(row).toContain('aria-haspopup="menu"');
    // Closed until it is pressed.
    expect(row).not.toContain('role="menu"');
    expect(render(<NoteList notes={[NOTE]} now={NOW} actions={NOTE_ACTIONS} />)).toContain('aria-label="עוד על הפתק"');
  });

  it('a server that cannot (no `edited_at`), or a screen that only reads: the note is what it was', () => {
    for (const html of [
      render(<NoteRow note={OLD_NOTE} now={NOW} actions={NOTE_ACTIONS} />),
      render(<NoteRow note={NOTE} now={NOW} />),
      render(<NoteList notes={[OLD_NOTE]} now={NOW} actions={NOTE_ACTIONS} />),
      render(<NoteList notes={[NOTE]} now={NOW} />),
    ]) {
      expect(html).not.toContain('עוד על הפתק');
      expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
      expect(html).toContain(f.note);
    }
  });

  it('the menu: "עריכה" and "מחיקה", and nothing else', () => {
    const onMode = vi.fn();
    const node = paper({ mode: 'menu', onMode });
    const html = render(node);
    expect(html).toContain('role="menu"');
    expect(html.split('role="menuitem"').length - 1).toBe(2);
    button(node, 'עריכה').props.onClick?.();
    button(node, 'מחיקה').props.onClick?.();
    expect(onMode.mock.calls).toEqual([['edit'], ['ask']]);
    // The same button puts the menu away.
    button(node, 'עוד על הפתק').props.onClick?.();
    expect(onMode).toHaveBeenLastCalledWith('idle');
  });

  it('editing: the note\'s own words in a box, in place; the same words cannot be saved', () => {
    const onSave = vi.fn();
    const same = paper({ mode: 'edit', onSave });
    const html = render(same);
    expect(html).toContain('<textarea');
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    expect(html).toContain('maxLength="500"');
    expect(button(same, 'שמור').props.disabled).toBe(true);
    // The menu is away while the words are being edited.
    expect(hasButton(same, 'עוד על הפתק')).toBe(false);
    const changed = paper({ mode: 'edit', text: 'אמא ביקשה שנחזור אחרי סוכות', onSave });
    expect(button(changed, 'שמור').props.disabled).toBe(false);
    const form = elements(changed).find((element) => element.type === 'form') as React.ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>;
    form.props.onSubmit({ preventDefault: noop });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('an empty note is not saved — it is deleted, and the button says so', () => {
    const node = paper({ mode: 'edit', text: '   ' });
    expect(button(node, 'שמור').props.disabled).toBe(true);
    expect(render(node)).toContain('title="פתק ריק — כדי להסיר אותו, מוחקים"');
  });

  it('a save that was refused: the reason beside what was typed, and it can be tried again', () => {
    const node = paper({ mode: 'edit', text: 'נוסח חדש', error: 'הפתק הזה כבר לא קיים.' });
    const html = render(node);
    expect(html).toContain('הפתק הזה כבר לא קיים.');
    expect(html).toContain('נוסח חדש');
    expect(button(node, 'שמור').props.disabled).toBe(false);
  });

  it('deleting asks first — a deleted note is gone for good', () => {
    const onDelete = vi.fn();
    const onMode = vi.fn();
    const node = paper({ mode: 'ask', onDelete, onMode });
    const html = render(node);
    expect(html).toContain('למחוק את הפתק?');
    expect(html).toContain('אי אפשר להחזיר.');
    // The note is still read while it is asked about.
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    button(node, 'כן, למחוק').props.onClick?.();
    expect(onDelete).toHaveBeenCalledTimes(1);
    button(node, 'ביטול').props.onClick?.();
    expect(onMode).toHaveBeenCalledWith('idle');
  });

  it('while a save or a delete is on its way neither can be pressed again', () => {
    const saving = paper({ mode: 'edit', text: 'נוסח חדש', busy: true });
    expect(button(saving, 'שמור').props.disabled).toBe(true);
    expect(button(saving, 'ביטול').props.disabled).toBe(true);
    const deleting = paper({ mode: 'ask', busy: true });
    expect(button(deleting, 'כן, למחוק').props.disabled).toBe(true);
  });

  it('a note that was edited says "נערך", quietly — with when and by whom a hover away', () => {
    const edited: WahubNote = { ...NOTE, edited_at: '2026-10-13T07:02:00+00:00', edited_by_name: 'דור סער' };
    const html = render(<NoteRow note={edited} now={NOW} />);
    expect(html).toContain(w.noteEdited);
    expect(html).toContain('נערך');
    expect(html).toContain('title="נערך ב-13.10 10:02 · דור סער"');
    expect(render(<NoteList notes={[edited]} now={NOW} />)).toContain('נערך');
    expect(render(<NoteRow note={NOTE} now={NOW} />)).not.toContain('נערך');
  });
});

// ---------------------------------------------------------------------------
// In a lead's details, and in the contact's card
// ---------------------------------------------------------------------------

const MARK: WahubWaitingMark = {
  status: 'freed',
  status_label: 'התפנה מקום',
  entry_id: 7,
  lesson_id: '0b0e',
  label: LESSON.label,
  course: LESSON.course,
  day: LESSON.day,
  start: LESSON.start,
  branch: LESSON.branch,
  child: 'בן 5, גן חובה',
  since: '2026-10-11T08:40:00+00:00',
  freed_at: '2026-10-13T07:05:00+00:00',
  title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00',
  more: 0,
  notified_at: null,
};

function lead(over: Partial<WahubLeadRow> = {}): WahubLeadRow {
  return {
    contact_id: 12,
    name: 'דנה לוי',
    phone: '972500000012',
    is_demo: false,
    stage: 'waiting_list',
    stage_label: 'ברשימת המתנה',
    owner: 'office',
    summary: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00 (מינץ)',
    chips: { branch: 'מינץ', course_type: 'קפוארה', child: 'בן 5' },
    since: '2026-10-13T05:40:00Z',
    next: { who: 'office', what: 'להציע ללקוח את המקום שהתפנה', when: null, state: 'none' },
    last_message_at: '2026-10-13T05:40:00Z',
    waiting_list: MARK,
    ...over,
  };
}

function details(row: WahubLeadRow, more: Partial<WahubLeadDetails>, over: Partial<LeadDetailsProps> = {}): React.ReactElement {
  const base: WahubLeadDetails = { reason: row.summary, blocker_text: '', child: null, come_back_on: null, come_back_why: '', trial: null, followups: [], timeline: [], in_system: null };
  return (
    <LeadDetails
      lead={row}
      details={{ ...base, ...more }}
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
      onWaiting={noop}
      notify={NO_NOTIFY}
      {...over}
    />
  );
}

const entryOf = (over: Record<string, unknown> = {}): WahubWaitingEntry => readWaitingEntry(row(over)) as WahubWaitingEntry;

describe('a lead\'s details', () => {
  it('a place was freed: "להודיע ללקוח" is the first of the three', () => {
    const html = render(details(lead(), { waiting_list_entries: [entryOf()] }));
    expect(html).toContain(l.freedBox);
    expect(html.indexOf('להודיע ללקוח')).toBeGreaterThan(-1);
    expect(html.indexOf('להודיע ללקוח')).toBeLessThan(html.indexOf('טופל'));
  });

  it('the customer was told: said on the entry — when, by whom, and whether they answered', () => {
    const told = render(details(lead({ waiting_list: { ...MARK, notified_at: TOLD.notified_at } }), { waiting_list_entries: [entryOf({ ...TOLD, customer_replied_at: '2026-10-13T08:40:00+00:00' })] }));
    expect(told).toContain('הודענו ללקוח · 13.10 11:02 · מיכל כהן');
    expect(told).toContain('הלקוח ענה · 13.10 11:40');
  });

  it('the block of "להודיע ללקוח" opens in place of the buttons', () => {
    const notify: NotifyControls = { ...NO_NOTIFY, open: { entryId: 7, step: { step: 'ready', preview: READY, sending: false } } };
    const html = render(details(lead(), { waiting_list_entries: [entryOf()] }, { notify }));
    expect(html).toContain('זה מה שיישלח ללקוח');
    expect(html).toContain('לשלוח ללקוח');
    expect(html).not.toContain('להסיר מהרשימה');
  });

  it('a server that cannot tell a customer: the freed place has the two actions it had', () => {
    const { notified_at: _drop, ...mark } = MARK;
    const { notified_at: _a, notified_by_name: _b, notified_how: _c, notified_how_label: _d, customer_replied_at: _e, ...bare } = row();
    const html = render(details(lead({ waiting_list: mark }), { waiting_list_entries: [readWaitingEntry(bare) as WahubWaitingEntry] }));
    expect(html).not.toContain('להודיע ללקוח');
    expect(html).toContain('טופל');
    expect(html).toContain('להסיר מהרשימה');
  });

  it('"להוסיף לרשימת המתנה": a quiet line — never one more button among the lead\'s actions', () => {
    const onAddWaiting = vi.fn();
    const quiet = lead({ owner: '', waiting_list: null, next: { who: 'bot', what: 'הבוט יזכיר את הקישור', when: null, state: 'planned' } });
    const node = details(quiet, {}, { onAddWaiting });
    const html = render(node);
    expect(html).toContain('להוסיף לרשימת המתנה');
    expect(html).toContain(w.quietLink);
    // The lead's own actions are what they were: the new line is not among them.
    const grid = html.slice(html.indexOf(l.actGrid), html.indexOf(l.dScroll));
    expect(grid).not.toContain('רשימת המתנה');
    button(node, 'להוסיף לרשימת המתנה').props.onClick?.();
    expect(onAddWaiting).toHaveBeenCalledTimes(1);
  });

  it('…already on a list: the line offers another lesson, under their entries', () => {
    const waiting = lead({ owner: '', waiting_list: { ...MARK, status: 'waiting', status_label: 'ברשימת המתנה', title: `ברשימת המתנה: ${LESSON.label}` }, next: { who: 'none', what: 'ברשימת המתנה — נתריע כשיתפנה מקום', when: null, state: 'none' } });
    const html = render(details(waiting, { waiting_list_entries: [entryOf({ status: 'waiting', status_label: 'ממתין' })] }, { onAddWaiting: noop }));
    expect(html).toContain('להוסיף לשיעור נוסף');
    expect(html.indexOf('להסיר מהרשימה')).toBeLessThan(html.indexOf('להוסיף לשיעור נוסף'));
  });

  it('…a place was freed and it is their only entry: still "another lesson" — they are on a list already', () => {
    const html = render(details(lead(), { waiting_list_entries: [entryOf()] }, { onAddWaiting: noop }));
    expect(html).toContain('להוסיף לשיעור נוסף');
    expect(html).not.toContain('להוסיף לרשימת המתנה');
  });

  it('a server that cannot list the lessons, and a lead that is closed: nothing is offered', () => {
    const quiet = lead({ owner: '', waiting_list: null });
    expect(render(details(quiet, {}))).not.toContain('להוסיף');
    expect(render(details({ ...quiet, stage: 'deleted' }, {}, { onAddWaiting: noop, closed: true }))).not.toContain('להוסיף');
  });

  it('the notes say "נערך" here too — and are only read', () => {
    const edited: WahubNote = { ...NOTE, edited_at: '2026-10-13T07:02:00+00:00', edited_by_name: 'דור סער' };
    const html = render(details(lead(), { notes: [edited] }));
    expect(html).toContain('נערך');
    expect(html).not.toContain('עוד על הפתק');
  });
});

function knowing(over: Parameters<typeof makeContact>[1] = {}, notes: WahubNote[] = []): WahubContactDetail {
  const { chat, ...rest } = over;
  return { ...makeContact(12, { name: 'דנה לוי', ...rest, chat: { open: false, open_reason: '', open_label: '', ...chat } }), messages: [], has_older: false, events: [], notes };
}

function card(contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ContactPanel>> = {}): React.ReactElement {
  return (
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
      {...over}
    />
  );
}

describe('the contact\'s card', () => {
  it('"להוסיף לרשימת המתנה" stands under the state, as a quiet line — not among the conversation\'s actions', () => {
    const html = render(card(knowing(), { onAddWaiting: noop }));
    expect(html).toContain('להוסיף לרשימת המתנה');
    const state = html.slice(html.indexOf('aria-label="מצב"'), html.indexOf('aria-label="פעולות"'));
    expect(state).toContain('להוסיף לרשימת המתנה');
    expect(state).toContain(w.quietLink);
  });

  it('…already waiting for a lesson: the line offers another one', () => {
    const waiting = knowing({ waiting_list: { ...MARK, status: 'waiting', status_label: 'ברשימת המתנה', title: `ברשימת המתנה: ${LESSON.label}` } });
    const html = render(card(waiting, { onAddWaiting: noop }));
    expect(html).toContain('להוסיף לשיעור נוסף');
    expect(html).not.toContain('להוסיף לרשימת המתנה');
  });

  it('a server that cannot list the lessons: the card is what it was', () => {
    expect(render(card(knowing()))).not.toContain('להוסיף ל');
  });

  it('the notes carry their menu in the card — and none on a server that cannot change a note', () => {
    const open = { defaultOpen: ['notes' as const], noteActions: NOTE_ACTIONS };
    expect(render(card(knowing({}, [NOTE]), open))).toContain('aria-label="עוד על הפתק"');
    expect(render(card(knowing({}, [OLD_NOTE]), open))).not.toContain('עוד על הפתק');
    expect(render(card(knowing({}, [NOTE]), { defaultOpen: ['notes'] }))).not.toContain('עוד על הפתק');
  });
});

// ---------------------------------------------------------------------------
// The stylesheet: the window on a phone, and the section's motion
// ---------------------------------------------------------------------------

describe('the window and the list keep to the section\'s rules', () => {
  const WAITING = css('./waiting.module.css');
  const phone = WAITING.slice(WAITING.indexOf('@media (max-width: 767px)'));

  it('on a phone the window is a sheet at the foot of the screen, its buttons pinned to its foot, clear of the home bar', () => {
    expect(phone).toMatch(/\.winRoot \{[^}]*align-items: flex-end;/);
    expect(phone).toMatch(/\.win \{[^}]*border-radius: 20px 20px 0 0;/);
    expect(phone).toMatch(/\.winFoot \{[^}]*env\(safe-area-inset-bottom/);
    expect(phone).toMatch(/\.winFoot > button \{[^}]*height: 46px;/);
    // The X is a finger wide.
    expect(phone).toMatch(/\.winHead > button \{[^}]*width: 44px;[^}]*height: 44px;/);
  });

  it('what is inside the window scrolls by itself, and keeps its scroll to itself', () => {
    expect(WAITING).toMatch(/\.winBody \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
    expect(WAITING).toMatch(/\.wlScroll \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
  });

  it('a keyboard that opens leaves the sheet the room above it', () => {
    expect(phone).toMatch(/\.winRoot\[data-keyboard\] \{[^}]*height: var\(--kbd-height\);/);
  });

  it('a box that is typed in is sixteen pixels on a phone — the page does not zoom', () => {
    expect(phone).toMatch(/\.winTools \.winSearch input,[^{]*\.input,[^{]*\{\s*font-size: 16px;/);
  });

  it('"reduce motion" stops what it adds', () => {
    const block = WAITING.slice(WAITING.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['.wl', '.notify', '.win', '.winScrim', '.winStep', '.noteMenu', '.noteEdit']) expect(block).toContain(name);
  });

  it('red stays for "מבקש נציג" alone: nothing here is drawn in it — what is held back is amber', () => {
    expect(WAITING).not.toMatch(/var\(--bad(?:-bg)?\)/);
    expect(WAITING).toMatch(/\.formError \{[^}]*color: var\(--warn\);/);
  });
});
