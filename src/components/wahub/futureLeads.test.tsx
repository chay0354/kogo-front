import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { BOT_STILL_ANSWERS, NOTE_NOT_SENT, futureChip, readUnderstood, type LaterStep } from '@/lib/wahub/futureLeads';
import { makeContact, makeMessage } from '@/lib/wahub/testFixtures';
import type {
  WahubBoxCounts,
  WahubContactDetail,
  WahubFuture,
  WahubLeadDetails,
  WahubLeadRow,
  WahubMessage,
  WahubNote,
  WahubWaitingMark,
} from '@/types/wahub';
import ChatList from './chats/ChatList';
import ChatThread, { type ThreadFutureActions } from './chats/ChatThread';
import Composer from './chats/Composer';
import ContactPanel from './chats/ContactPanel';
import { FutureStripView, type FutureStripViewProps } from './chats/FutureStrip';
import { LaterPanelView, type LaterPanelViewProps } from './chats/LaterPanel';
import f from './future.module.css';
import type { ContactThread } from './hooks/useContactThread';
import LeadDetails, { type LeadDetailsProps } from './leads/v2/LeadDetails';
import LeadRow from './leads/v2/LeadRow';
import { WaitingActionsView, type WaitingActionsViewProps } from './leads/v2/WaitingBits';
import l from './leads/v2/leads.module.css';
import m from './motion.module.css';
import { NoteBox, NoteList, NoteRow } from './shared/FutureParts';
import s from './wahub.module.css';

// Nothing here may reach a server.
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'manager', first_name: 'מיכל', branch_ids: [] }, loading: false }),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ה — what the screens show of the ✓, the
 * clock, the note, a future lead and the waiting list; and, beside every one of
 * them, that a server built before them is shown exactly what it was shown
 * before. Every name and number here is invented.
 */

/** Tuesday, 13.10.2026, 12:00 in Israel. */
const NOW = new Date('2026-10-13T09:00:00Z');
const TODAY = '2026-10-13';
const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<QueryClientProvider client={client()}>{node}</QueryClientProvider>);
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

/** What a component draws when it is called as a function — or UNCALLABLE for one that keeps state. */
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

/** The button that carries these words, or this label. */
function button(node: React.ReactNode, words: string): React.ReactElement<{ onClick?: () => void; disabled?: boolean; type?: string }> {
  const found = elements(node).find(
    (element) =>
      element.type === 'button' &&
      ((element.props as { 'aria-label'?: string })['aria-label'] === words || textOf(element).trim() === words),
  );
  if (!found) throw new Error(`no button "${words}"`);
  return found as React.ReactElement<{ onClick?: () => void; disabled?: boolean; type?: string }>;
}

const hasButton = (node: React.ReactNode, words: string) => {
  try {
    button(node, words);
    return true;
  } catch {
    return false;
  }
};

const FUTURE: WahubFuture = {
  due: '2026-12-01',
  reason: 'הילד יהיה בן 3 בדצמבר',
  by_name: 'מיכל כהן',
  at: '2026-10-13T06:12:00+00:00',
  state: 'parked',
  label: 'ליד עתידי',
  days_left: 49,
  muted: true,
};

const WAITING: WahubWaitingMark = {
  status: 'waiting',
  status_label: 'ברשימת המתנה',
  entry_id: 7,
  lesson_id: '0b0e',
  label: 'קפוארה גן חובה · יום שלישי · 17:00 · מינץ',
  course: 'קפוארה גן חובה',
  day: 'שלישי',
  start: '17:00',
  branch: 'מינץ',
  child: 'בן 5, גן חובה',
  since: '2026-10-13T05:40:00+00:00',
  freed_at: null,
  title: 'ברשימת המתנה: קפוארה גן חובה · יום שלישי · 17:00 · מינץ',
  more: 0,
};

const FREED: WahubWaitingMark = {
  ...WAITING,
  status: 'freed',
  status_label: 'התפנה מקום',
  freed_at: '2026-10-13T07:05:00+00:00',
  title: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00',
};

const NOTE: WahubNote = { id: 311, text: 'אמא ביקשה שנחזור אחרי החגים', by_name: 'מיכל כהן', created_at: '2026-10-13T09:20:00+03:00' };

/** A contact from a server that knows all of this (`chat.open`), and one from a server built before it. */
function knowing(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  const { chat, ...rest } = overrides;
  return {
    ...makeContact(12, { name: 'דנה לוי', ...rest, chat: { open: false, open_reason: '', open_label: '', ...chat } }),
    messages: [],
    has_older: false,
    events: [],
    notes: [],
  };
}

function old(overrides: Parameters<typeof makeContact>[1] = {}): WahubContactDetail {
  return { ...makeContact(12, { name: 'דנה לוי', ...overrides }), messages: [], has_older: false, events: [] };
}

function thread(contact: WahubContactDetail, messages: WahubMessage[] = []): ContactThread {
  return {
    contactId: contact.id,
    contact,
    messages,
    hasOlder: false,
    status: 'ready',
    error: '',
    loadingOlder: false,
    sending: false,
    olderLoads: 0,
    stateRef: { current: {} as never },
    putContact: noop,
    onLiveContact: noop,
    putMessages: noop,
    settleMessage: noop,
    loadOlder: async () => {},
    send: async () => true,
    sendFlow: async () => true,
    refreshQuietly: async () => {},
    retry: noop,
  };
}

const ACTIONS: ThreadFutureActions = {
  today: TODAY,
  closeBusy: false,
  onClose: noop,
  onHandToBot: async () => ({ error: '' }),
  onFuture: async () => ({ error: '' }),
  onNote: async () => '',
};

function conversation(contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ChatThread>> = {}, messages: WahubMessage[] = []): string {
  return render(
    <ChatThread
      thread={thread(contact, messages)}
      now={NOW}
      visible
      simulated={false}
      sendingOff
      handoverBusy={false}
      resolveBusy={false}
      showBack={false}
      showDetailsButton
      onBack={noop}
      onDetails={noop}
      onTakeover={noop}
      onRelease={noop}
      onResolveNeedsHuman={noop}
      onOpenSettings={noop}
      future={ACTIONS}
      {...over}
    />,
  );
}

// ---------------------------------------------------------------------------
// ✓ and the clock, in the conversation's title row
// ---------------------------------------------------------------------------

describe('the title row of a conversation: ✓ closes it, the clock puts it off', () => {
  it('a server that knows them: ✓ and the clock stand in the title row', () => {
    const html = conversation(knowing());
    expect(html).toContain('aria-label="סגירת שיחה"');
    expect(html).toContain('aria-label="לטפל בהמשך"');
    expect(html).toContain(f.ibDone);
    // The clock opens a bubble: closed until it is pressed.
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });

  it('one button for "done", not two: with ✓ in the title row, "מבקש נציג" keeps its line and loses its "טופל"', () => {
    const asks = { needs_human: true, needs_human_reason: 'רוצה לדבר עם מישהו', open: true, open_reason: 'needs_human' as const };
    const html = conversation(knowing({ chat: asks }));
    expect(html).toContain('מבקש נציג');
    expect(html).toContain('רוצה לדבר עם מישהו');
    expect(html).not.toContain('טופל');
  });

  it('a server built before them: the row is what it was — no ✓, no clock, and "טופל" where it stood', () => {
    const html = conversation(old({ chat: { needs_human: true } }));
    expect(html).not.toContain('סגירת שיחה');
    expect(html).not.toContain('לטפל בהמשך');
    expect(html).toContain('טופל');
    // …and the phone's own icon for taking the conversation is still there.
    expect(html).toContain('aria-label="קח שיחה"');
  });

  it('the screen is never told to offer them by its caller alone: without `chat.open` the handlers are not used', () => {
    expect(conversation(old(), { future: ACTIONS })).not.toContain('סגירת שיחה');
    // …and a server that knows them, on a screen that was handed no handlers, offers none either.
    expect(conversation(knowing(), { future: undefined })).not.toContain('סגירת שיחה');
  });

  it('while the close is on its way the ✓ waits, and cannot be pressed twice', () => {
    const html = conversation(knowing(), { future: { ...ACTIONS, closeBusy: true } });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="סגירת שיחה"/);
  });

  it('a phone: ✓ and the clock take the place of the round mark and of "קח שיחה", which is in the card — the name keeps its room', () => {
    const phone = conversation(knowing(), { showBack: true });
    expect(phone).toContain('aria-label="סגירת שיחה"');
    expect(phone).not.toContain(`class="${s.av}`);
    expect(phone).not.toContain('aria-label="קח שיחה"');
    // On a server without them the phone's title row is untouched.
    const before = conversation(old(), { showBack: true });
    expect(before).toContain(`class="${s.av}`);
    expect(before).toContain('aria-label="קח שיחה"');
  });
});

// ---------------------------------------------------------------------------
// The clock's bubble
// ---------------------------------------------------------------------------

function later(step: LaterStep, over: Partial<LaterPanelViewProps> = {}): React.ReactElement {
  return (
    <LaterPanelView
      step={step}
      future={null}
      today={TODAY}
      due=""
      reason=""
      onDue={noop}
      onReason={noop}
      onBot={noop}
      onMine={noop}
      onSave={noop}
      onDone={noop}
      onClose={noop}
      {...over}
    />
  );
}

const UNDERSTOOD = readUnderstood({
  ok: true,
  text: 'הילד יהיה בן 3 — הבוט יחזור אליהם ב-1.12.2026',
  why: 'הילד יהיה בן 3',
  next: { when: '2026-12-01T08:30:00+00:00' },
  sending_enabled: true,
});

describe('the clock\'s bubble: two choices, and only two', () => {
  it('it opens on "הבוט ימשיך לטפל" and "ליד עתידי שלי" — and nothing else to press but the X', () => {
    const node = later({ step: 'menu' });
    const html = render(node);
    expect(html.split(f.opt + '"').length - 1).toBe(2);
    expect(html.indexOf('הבוט ימשיך לטפל')).toBeLessThan(html.indexOf('ליד עתידי שלי'));
    expect(elements(node).filter((element) => element.type === 'button')).toHaveLength(3);
    expect(html).toContain('aria-label="סגור"');
    // No switches.
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="checkbox"');
  });

  it('each choice goes where it says', () => {
    const onBot = vi.fn();
    const onMine = vi.fn();
    const onClose = vi.fn();
    const node = later({ step: 'menu' }, { onBot, onMine, onClose });
    const options = elements(node).filter((element) => (element.props as { className?: string }).className === f.opt);
    (options[0].props as { onClick: () => void }).onClick();
    (options[1].props as { onClick: () => void }).onClick();
    button(node, 'סגור').props.onClick?.();
    expect([onBot, onMine, onClose].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('"הבוט קורא את השיחה…" — said aloud, with the section\'s three dots, while the answer is on its way', () => {
    const html = render(later({ step: 'reading' }));
    expect(html).toContain('הבוט קורא את השיחה');
    expect(html).toContain('role="status"');
    expect(html).toContain(m.thinking);
    expect(html.match(/<i><\/i>/g)).toHaveLength(3);
    // It can be put away while it reads: the X is not locked.
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="סגור"/);
  });

  it('the bot understood: its one sentence, large, and two quiet ways on', () => {
    const onMine = vi.fn();
    const onClose = vi.fn();
    const node = later({ step: 'understood', understood: UNDERSTOOD }, { onMine, onClose });
    const html = render(node);
    expect(html).toContain('הילד יהיה בן 3 — הבוט יחזור אליהם ב-1.12.2026');
    expect(html).toContain(f.gotText);
    // The sentence is said once.
    expect(html.split('הבוט יחזור אליהם').length - 1).toBe(1);
    button(node, 'זה לא נכון — אקח את זה אליי').props.onClick?.();
    expect(onMine).toHaveBeenCalledTimes(1);
    button(node, 'סגור').props.onClick?.();
    expect(onClose).toHaveBeenCalled();
    // Sending is on: nothing is said about it.
    expect(html).not.toContain('השליחה ללקוחות כבויה');
  });

  it('…and when nothing can go out yet, one quiet line says the message will wait', () => {
    const html = render(later({ step: 'understood', understood: { ...UNDERSTOOD, sending_enabled: false } }));
    expect(html).toContain('השליחה ללקוחות כבויה — ההודעה תחכה עד שתודלק.');
  });

  it('`understood.ok = false`: nothing changed, it says why, and offers "ליד עתידי שלי"', () => {
    const onMine = vi.fn();
    const understood = readUnderstood({ ok: false, text: 'הבוט לא מצא בשיחה מתי ועל מה לחזור.' });
    const node = later({ step: 'understood', understood }, { onMine });
    const html = render(node);
    expect(html).toContain('הבוט לא מצא בשיחה מתי ועל מה לחזור.');
    expect(html).toContain('השיחה נשארה אצלך');
    expect(html).toContain('כלום לא השתנה');
    expect(html).not.toContain(f.got + '"');
    button(node, 'ליד עתידי שלי').props.onClick?.();
    expect(onMine).toHaveBeenCalledTimes(1);
    expect(hasButton(node, 'זה לא נכון — אקח את זה אליי')).toBe(false);
  });

  it('…for a lead that is a future lead already, the offer is "טופל" — it has its day', () => {
    const onDone = vi.fn();
    const understood = readUnderstood({ ok: false, text: 'הלקוח כבר רשום — אין מה לתזמן.' });
    const node = later({ step: 'understood', understood }, { future: FUTURE, onDone });
    button(node, 'טופל').props.onClick?.();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasButton(node, 'ליד עתידי שלי')).toBe(false);
  });

  it('the hand-over was refused (the switch is off, ManyChat is down): the server\'s reason, and a way to try again', () => {
    const onBot = vi.fn();
    const node = later({ step: 'failed', text: 'השליחה ללקוחות כבויה. כלום לא השתנה.' }, { onBot });
    const html = render(node);
    expect(html).toContain('השליחה ללקוחות כבויה. כלום לא השתנה.');
    expect(html).toContain('role="alert"');
    button(node, 'נסו שוב').props.onClick?.();
    expect(onBot).toHaveBeenCalledTimes(1);
  });
});

describe('"ליד עתידי שלי": a day and a reason — two fields, and no more', () => {
  const FORM: LaterStep = { step: 'form', saving: false, error: '' };

  it('two fields: the day (with four days a press away) and the reason', () => {
    const node = later(FORM);
    const html = render(node);
    const inputs = elements(node).filter((element) => element.type === 'input' || element.type === 'textarea' || element.type === 'select');
    expect(inputs.map((input) => (input.props as { type?: string }).type)).toEqual(['date', 'text']);
    for (const label of ['מחר', 'בעוד שבוע', 'בעוד חודש', 'בעוד חודשיים']) expect(hasButton(node, label)).toBe(true);
    // The first day that can be chosen is tomorrow.
    expect(html).toContain('min="2026-10-14"');
    expect(html).toContain('maxLength="300"');
  });

  it('a shortcut chooses its day', () => {
    const onDue = vi.fn();
    const node = later(FORM, { onDue });
    button(node, 'בעוד חודשיים').props.onClick?.();
    expect(onDue).toHaveBeenCalledWith('2026-12-13');
  });

  it('the day that was chosen is said in words, and its shortcut is marked', () => {
    const html = render(later(FORM, { due: '2026-10-14', reason: '' }));
    expect(html).toContain('יום רביעי, 14.10.2026');
    expect(html).toMatch(new RegExp(`aria-pressed="true"[^>]*class="[^"]*${f.shortcutOn}`));
  });

  it('it cannot be saved without a day after today, nor — the first time — without a reason', () => {
    const save = (over: Partial<LaterPanelViewProps>) => button(later(FORM, over), 'שמור').props.disabled;
    expect(save({ due: '', reason: 'הילד יהיה בן 3' })).toBe(true);
    expect(save({ due: TODAY, reason: 'הילד יהיה בן 3' })).toBe(true);
    expect(save({ due: '2026-12-01', reason: '   ' })).toBe(true);
    expect(save({ due: '2026-12-01', reason: 'הילד יהיה בן 3' })).toBe(false);
  });

  it('Enter in the reason saves — once the form is whole', () => {
    const onSave = vi.fn();
    const submit = (node: React.ReactElement) => {
      const form = elements(node).find((element) => element.type === 'form');
      (form?.props as { onSubmit: (event: { preventDefault: () => void }) => void }).onSubmit({ preventDefault: noop });
    };
    submit(later(FORM, { due: '', reason: 'x', onSave }));
    expect(onSave).not.toHaveBeenCalled();
    submit(later(FORM, { due: '2026-12-01', reason: 'הילד יהיה בן 3', onSave }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('putting an existing lead off: the button says so, and the reason may be left as it is', () => {
    const node = later(FORM, { future: FUTURE, due: '2027-01-10', reason: '' });
    expect(render(node)).toContain('לדחות את הליד העתידי');
    expect(button(node, 'לדחות').props.disabled).toBe(false);
  });

  it('while it is being saved nothing can be pressed — and the bubble is not closed from under it', () => {
    const node = later({ step: 'form', saving: true, error: '' }, { due: '2026-12-01', reason: 'x' });
    expect(button(node, 'שמור').props.disabled).toBe(true);
    expect(button(node, 'סגור').props.disabled).toBe(true);
  });

  it('the server refused (the day is not ahead): its own words, inside the form', () => {
    const html = render(later({ step: 'form', saving: false, error: 'המועד צריך להיות אחרי היום.' }, { due: '2026-12-01', reason: 'x' }));
    expect(html).toContain('המועד צריך להיות אחרי היום.');
    expect(html).toContain('role="alert"');
  });

  it('`mute.muted = false`: saved — and one plain line says the bot still answers, with the server\'s reason', () => {
    const onClose = vi.fn();
    const text = `נשמר. ${BOT_STILL_ANSWERS}: השליחה ללקוחות כבויה.`;
    const node = later({ step: 'saved', text }, { onClose });
    const html = render(node);
    expect(html).toContain('נשמר. הבוט עדיין עונה ללקוח הזה אם יכתוב: השליחה ללקוחות כבויה.');
    expect(html).toContain(f.warnLine);
    button(node, 'הבנתי').props.onClick?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('every step of the bubble has its X', () => {
    const steps: LaterStep[] = [
      { step: 'menu' },
      { step: 'reading' },
      { step: 'understood', understood: UNDERSTOOD },
      { step: 'failed', text: 'x' },
      FORM,
      { step: 'saved', text: 'x' },
    ];
    for (const step of steps) expect(render(later(step)), step.step).toContain('aria-label="סגור"');
  });
});

// ---------------------------------------------------------------------------
// The chip of a future lead
// ---------------------------------------------------------------------------

function strip(future: WahubFuture, over: Partial<FutureStripViewProps> = {}): React.ReactElement {
  const chip = futureChip(future, TODAY, NOW);
  return (
    <FutureStripView
      chip={chip}
      muted={future.muted}
      open={chip.loud}
      doneBusy={false}
      onToggle={noop}
      onDone={noop}
      onPostpone={noop}
      onToBot={noop}
      {...over}
    />
  );
}

describe('the chip of a future lead, at the head of its conversation', () => {
  it('parked: quiet — "ליד עתידי · 1.12 · הסיבה · של מי", and its actions a press away', () => {
    const html = render(strip(FUTURE));
    expect(html).toContain('<strong>ליד עתידי</strong> · 1.12 · הילד יהיה בן 3 בדצמבר · מיכל כהן');
    expect(html).not.toContain(f.stripLoud);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('להחזיר לבוט');
  });

  it('due: it stands out, and stands open — that is when it is acted on', () => {
    const html = render(strip({ ...FUTURE, state: 'due', due: TODAY }));
    expect(html).toContain(f.stripLoud);
    expect(html).toContain('הגיע היום');
    expect(html).toContain('aria-expanded="true"');
    for (const action of ['טופל', 'לדחות', 'להחזיר לבוט']) expect(html).toContain(action);
  });

  it('wrote: it stands out, and says the customer wrote before the day', () => {
    const html = render(strip({ ...FUTURE, state: 'wrote' }));
    expect(html).toContain(f.stripLoud);
    expect(html).toContain('הלקוח כתב · נקבע ל-1.12');
  });

  it('three actions, and each does its own', () => {
    const onDone = vi.fn();
    const onPostpone = vi.fn();
    const onToBot = vi.fn();
    const node = strip({ ...FUTURE, state: 'due', due: TODAY }, { onDone, onPostpone, onToBot });
    button(node, 'טופל').props.onClick?.();
    button(node, 'לדחות').props.onClick?.();
    button(node, 'להחזיר לבוט').props.onClick?.();
    expect([onDone, onPostpone, onToBot].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
    const all = elements(node).filter((element) => element.type === 'button');
    // The chip itself, and the three.
    expect(all).toHaveLength(4);
  });

  it('the bot was not silenced: one small line says it still answers — whether or not the chip is open, and only then', () => {
    expect(render(strip({ ...FUTURE, muted: false }, { open: true }))).toContain(`${BOT_STILL_ANSWERS}.`);
    expect(render(strip({ ...FUTURE, muted: false }, { open: false }))).toContain(`${BOT_STILL_ANSWERS}.`);
    expect(render(strip(FUTURE, { open: true }))).not.toContain(BOT_STILL_ANSWERS);
  });

  it('in a conversation: the chip under the title row, and the plain "החזר לבוט" gives way to the chip\'s own', () => {
    const held = knowing({ chat: { handled_by: 'human', open: true, open_reason: 'future_due' }, future: { ...FUTURE, state: 'due', due: TODAY } });
    const html = conversation(held);
    expect(html).toContain(f.stripLoud);
    expect(html).toContain('להחזיר לבוט');
    expect(html).not.toContain('החזר לבוט<');
    // A person holding a conversation that is no future lead still has the plain one.
    expect(conversation(knowing({ chat: { handled_by: 'human', open: true, open_reason: 'human' } }))).toContain('החזר לבוט');
  });

  it('a server built before it never shows the chip, whatever the contact carries', () => {
    expect(conversation(old({ future: FUTURE }))).not.toContain('ליד עתידי');
  });
});

// ---------------------------------------------------------------------------
// A note
// ---------------------------------------------------------------------------

describe('a note about the customer: a line of the log, and it looks it', () => {
  it('inside the conversation: "פתק · מי · מתי" on its own paper — not a bubble, on neither side', () => {
    const html = render(<NoteRow note={NOTE} />);
    expect(html).toContain('פתק · מיכל כהן · 09:20');
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    expect(html).toContain('role="note"');
    expect(html).toContain(`aria-label="${NOTE_NOT_SENT}"`);
    expect(html).toContain(f.note);
    expect(html).not.toContain(s.bubble);
    expect(html).not.toContain(s.bubbleRowOut);
  });

  it('a note that was just written comes in softly', () => {
    expect(render(<NoteRow note={NOTE} arrived />)).toContain(m.rise);
    expect(render(<NoteRow note={NOTE} />)).not.toContain(m.rise);
  });

  it('it stands in the conversation where it was written, between the messages', () => {
    const before = makeMessage(1, { text: 'כמה עולה החוג?', sent_at: '2026-10-13T09:00:00+03:00' });
    const after = makeMessage(2, { text: 'תודה רבה', sent_at: '2026-10-13T09:40:00+03:00' });
    const html = conversation({ ...knowing(), notes: [NOTE] }, {}, [before, after]);
    expect(html.indexOf('כמה עולה החוג?')).toBeLessThan(html.indexOf('אמא ביקשה שנחזור'));
    expect(html.indexOf('אמא ביקשה שנחזור')).toBeLessThan(html.indexOf('תודה רבה'));
  });

  it('a conversation with a note and no message shows the note, not "עוד אין הודעות"', () => {
    const html = conversation({ ...knowing(), notes: [NOTE] });
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    expect(html).not.toContain('עוד אין הודעות');
  });

  it('the small "פתק" button stands beside the writing box — also when nothing can be sent', () => {
    const locked = conversation(knowing(), { sendingOff: true });
    expect(locked).toContain('aria-label="פתק על הלקוח"');
    const open = conversation(knowing(), { sendingOff: false });
    expect(open).toContain('aria-label="פתק על הלקוח"');
    // A button, not a switch.
    expect(open).not.toContain('role="switch"');
  });

  it('a server built before notes: no button, and no note is drawn', () => {
    const html = conversation({ ...old(), notes: [NOTE] });
    expect(html).not.toContain('פתק');
  });

  it('where it is written: on the note\'s own paper, saying it is sent to nobody; "שמור פתק", never "שלח"', () => {
    const html = render(<NoteBox name="דנה לוי" text="אמא ביקשה" saving={false} error="" onText={noop} onSave={noop} onClose={noop} />);
    expect(html).toContain(f.noteBox);
    expect(html).toContain('לא נשלח ללקוח');
    expect(html).toContain('שמור פתק');
    expect(html).not.toContain('שלח<');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('aria-label="סגור את הפתק"');
  });

  it('an empty note cannot be saved; one that was refused keeps its words and says why', () => {
    const empty = render(<NoteBox name="דנה" text="  " saving={false} error="" onText={noop} onSave={noop} onClose={noop} />);
    expect(empty).toMatch(/<button type="submit" disabled=""/);
    const refused = render(<NoteBox name="דנה" text="פתק ארוך" saving={false} error="הפתק ארוך מדי (עד 500 תווים)." onText={noop} onSave={noop} onClose={noop} />);
    expect(refused).toContain('פתק ארוך');
    expect(refused).toContain('הפתק ארוך מדי');
    expect(refused).toContain('role="alert"');
  });

  it('the writing box without a note handler is the box it always was', () => {
    const contact = makeContact(12);
    const html = render(<Composer contact={contact} sending={false} simulated={false} sendingOff={false} onSend={async () => true} onSendFlow={async () => true} onOpenSettings={noop} />);
    expect(html).toContain('תשובות מוכנות');
    expect(html).not.toContain('פתק');
  });

  it('a list of notes: the words, then who and when', () => {
    const html = render(<NoteList notes={[NOTE]} now={NOW} />);
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    expect(html).toContain('מיכל כהן · 13.10 09:20');
    expect(render(<NoteList notes={[]} now={NOW} empty="עוד אין פתקים." />)).toContain('עוד אין פתקים.');
    expect(render(<NoteList notes={[]} now={NOW} />)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// The list: the boxes, and the marks on a row
// ---------------------------------------------------------------------------

const COUNTS: WahubBoxCounts = { all: 40, waiting: 3, needs_human: 2, unread: 5, human: 4, bot: 36, open: 6, future: 9 };
const OLD_COUNTS: WahubBoxCounts = { all: 40, waiting: 3, needs_human: 2, unread: 5, human: 4, bot: 36 };

function chatList(over: Partial<React.ComponentProps<typeof ChatList>> = {}): string {
  return render(
    <ChatList
      items={[]}
      status="ready"
      error=""
      hasMore={false}
      loadingMore={false}
      box="all"
      counts={COUNTS}
      search=""
      selectedId={null}
      now={NOW}
      notConnected={false}
      onSearch={noop}
      onBox={noop}
      onOpen={noop}
      onLoadMore={noop}
      onRetry={noop}
      onOpenSettings={noop}
      {...over}
    />,
  );
}

describe('the boxes above the conversations', () => {
  it('"פתוחות" leads the person\'s boxes, with its number; "לידים עתידיים" closes them, quietly', () => {
    const html = chatList();
    const at = (label: string) => html.indexOf(`>${label}<`);
    expect(at('פתוחות')).toBeGreaterThan(-1);
    expect(at('פתוחות')).toBeLessThan(at('מבקשים נציג'));
    expect(at('בטיפול נציג')).toBeLessThan(at('לידים עתידיים'));
    expect(at('לידים עתידיים')).toBeLessThan(at('מחכים לתשובה'));
    expect(html).toMatch(new RegExp(`${f.boxQuiet}"[^>]*>לידים עתידיים`));
  });

  it('the red number is still the one of "מבקשים נציג" alone', () => {
    const html = chatList();
    expect(html.split(s.cntHot).length - 1).toBe(1);
    expect(html).toMatch(new RegExp(`>מבקשים נציג<span class="[^"]*${s.cntHot}`));
  });

  it('a server that does not count them is not offered them — nor is a screen that has no counts yet', () => {
    for (const counts of [OLD_COUNTS, null]) {
      const html = chatList({ counts });
      expect(html).not.toContain('פתוחות');
      expect(html).not.toContain('לידים עתידיים');
      expect(html).toContain('מבקשים נציג');
    }
  });
});

describe('a row of the list', () => {
  const row = (contact: ReturnType<typeof makeContact>) => chatList({ items: [contact] });

  it('a future lead that waits for its day: a quiet mark, with the reason and whose it is beside it', () => {
    const html = row(makeContact(1, { chat: { open: false }, future: FUTURE }));
    expect(html).toContain('ליד עתידי · 1.12');
    expect(html).toContain(f.markQuiet);
    expect(html).not.toContain(f.markLoud);
    expect(html).toContain('הילד יהיה בן 3 בדצמבר · מיכל כהן');
  });

  it('its day came, or the customer wrote: the mark stands out', () => {
    const due = row(makeContact(1, { chat: { open: true, open_reason: 'future_due' }, future: { ...FUTURE, state: 'due', due: TODAY } }));
    expect(due).toContain(f.markLoud);
    expect(due).toContain('ליד עתידי · הגיע היום');
    const wrote = row(makeContact(2, { chat: { open: true, open_reason: 'future_wrote' }, future: { ...FUTURE, state: 'wrote' } }));
    expect(wrote).toContain(f.markLoud);
    // A row says it shortly; the day it was set for is in the conversation's own chip.
    expect(wrote).toContain('>ליד עתידי · הלקוח כתב</span>');
  });

  it('the waiting list: quiet while they wait, standing out once a place was freed', () => {
    const waiting = row(makeContact(1, { waiting_list: WAITING }));
    expect(waiting).toContain('ברשימת המתנה: קפוארה גן חובה · יום שלישי · 17:00 · מינץ');
    expect(waiting).toContain(f.markQuiet);
    expect(waiting).not.toContain(f.markFreed);
    const freed = row(makeContact(2, { waiting_list: { ...FREED, more: 1 } }));
    expect(freed).toContain('התפנה מקום בקפוארה גן חובה יום שלישי 17:00 · ועוד 1');
    expect(freed).toContain(f.markFreed);
  });

  it('a contact with neither is the row it always was', () => {
    const html = row(makeContact(1));
    expect(html).not.toContain(f.mark);
    expect(html).not.toContain('ליד עתידי');
  });
});

// ---------------------------------------------------------------------------
// The contact's card
// ---------------------------------------------------------------------------

function card(contact: WahubContactDetail, over: Partial<React.ComponentProps<typeof ContactPanel>> = {}): string {
  return render(
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
    />,
  );
}

describe('the contact\'s card', () => {
  it('the notes: a title and how many; opened, the notes themselves — newest first', () => {
    const second: WahubNote = { id: 312, text: 'חזרה אלינו, רוצה יום שלישי', by_name: 'דור', created_at: '2026-10-13T10:00:00+03:00' };
    const folded = card({ ...knowing(), notes: [second, NOTE] });
    expect(folded).toContain('פתקים');
    expect(folded).toMatch(/פתקים<span[^>]*>\(2\)<\/span>/);
    expect(folded).not.toContain('אמא ביקשה שנחזור');
    const open = card({ ...knowing(), notes: [second, NOTE] }, { defaultOpen: ['notes'] });
    expect(open.indexOf('חזרה אלינו, רוצה יום שלישי')).toBeLessThan(open.indexOf('אמא ביקשה שנחזור'));
  });

  it('one place for notes, not two: the old "הערות" box gives way — and what was typed in it is still shown', () => {
    const html = card(knowing({ followup: { note: 'להתקשר אחרי 16:00' } }), { defaultOpen: ['notes'] });
    expect(html).not.toContain('הערות');
    expect(html).not.toContain('<textarea');
    expect(html).toContain('הערה קודמת: להתקשר אחרי 16:00');
  });

  it('…but not when it is the reason of a future lead — the chip already says that', () => {
    const html = card(knowing({ followup: { status: 'later', due: '2026-12-01', note: FUTURE.reason }, future: FUTURE }), { defaultOpen: ['notes'] });
    expect(html).not.toContain('הערה קודמת');
  });

  it('a server built before notes keeps the box it had', () => {
    const html = card(old({ followup: { note: 'להתקשר אחרי 16:00' } }), { defaultOpen: ['notes'] });
    expect(html).toContain('הערות');
    expect(html).toContain('<textarea');
    expect(html).not.toContain('פתקים');
  });

  it('the waiting list: a quiet mark under the state; a freed place stands out', () => {
    const waiting = card(knowing({ waiting_list: WAITING }));
    expect(waiting).toContain(f.cardMark);
    expect(waiting).toContain('ברשימת המתנה: קפוארה גן חובה · יום שלישי · 17:00 · מינץ');
    expect(waiting).not.toContain(f.cardMarkFreed);
    const freed = card(knowing({ waiting_list: FREED }));
    expect(freed).toContain(f.cardMarkFreed);
    expect(freed).toContain('התפנה מקום בקפוארה גן חובה יום שלישי 17:00');
    expect(card(knowing())).not.toContain(f.cardMark);
  });

  it('"טופל" is the ✓ of the conversation where there is one; on an older server it stays in the card', () => {
    expect(card(knowing({ chat: { needs_human: true, open: true, open_reason: 'needs_human' } }))).not.toContain('טופל');
    expect(card(old({ chat: { needs_human: true } }))).toContain('טופל');
  });

  it('a future lead a person holds is handed back from its chip, not by the plain "החזר לבוט"', () => {
    const held = card(knowing({ chat: { handled_by: 'human', open: false }, future: FUTURE }));
    expect(held).not.toContain('החזר לבוט');
    // The bot could not be silenced: taking the conversation is still offered — it is how the silencing is tried again.
    const notMuted = card(knowing({ chat: { handled_by: 'bot', open: false }, future: { ...FUTURE, muted: false } }));
    expect(notMuted).toContain('קח שיחה');
    // No future lead: the card's actions are what they were.
    expect(card(knowing({ chat: { handled_by: 'human', open: true, open_reason: 'human' } }))).toContain('החזר לבוט');
  });
});

// ---------------------------------------------------------------------------
// The leads tab
// ---------------------------------------------------------------------------

function lead(over: Partial<WahubLeadRow> = {}): WahubLeadRow {
  return {
    contact_id: 12,
    name: 'דנה לוי',
    phone: '972500000012',
    is_demo: false,
    stage: 'waiting_list',
    stage_label: 'ברשימת המתנה',
    owner: '',
    summary: 'אמא לילד בן 5, רצתה קפוארה בימי שלישי — הקבוצה מלאה',
    chips: { branch: 'מינץ', course_type: 'קפוארה', child: 'בן 5' },
    since: '2026-10-13T05:40:00Z',
    next: { who: 'none', what: 'ברשימת המתנה — נתריע כשיתפנה מקום', when: null, state: 'none' },
    last_message_at: '2026-10-13T05:40:00Z',
    ...over,
  };
}

const FREED_LEAD = lead({
  owner: 'office',
  summary: 'התפנה מקום בקפוארה גן חובה יום שלישי 17:00 (מינץ)',
  next: { who: 'office', what: 'להציע ללקוח את המקום שהתפנה', when: null, state: 'none' },
  waiting_list: FREED,
});

function leadRow(row: WahubLeadRow): string {
  return render(
    <ul>
      <LeadRow lead={row} now={NOW} sendingOn={false} selected={false} onOpen={noop} />
    </ul>,
  );
}

describe('a lead\'s row', () => {
  it('"הבוט מטפל", on the waiting list: the exact lesson, and when they joined', () => {
    const html = leadRow(lead({ waiting_list: WAITING }));
    expect(html).toContain(l.wait);
    expect(html).toContain('<strong>קפוארה גן חובה · יום שלישי · 17:00 · מינץ</strong> · נכנס ב-13.10');
    expect(html).toContain('ברשימת המתנה — נתריע כשיתפנה מקום');
    expect(html).not.toContain(l.freed);
  });

  it('"מחכים לך", a place was freed: the headline is the server\'s title — and the sentence that only repeats it is left out', () => {
    const html = leadRow(FREED_LEAD);
    expect(html).toContain(l.freed);
    expect(html).toContain('התפנה מקום בקפוארה גן חובה יום שלישי 17:00');
    expect(html.split('התפנה מקום בקפוארה').length - 1).toBe(1);
    expect(html).toContain('מחכה לך: להציע ללקוח את המקום שהתפנה');
  });

  it('…a sentence that says more than the headline stays', () => {
    const html = leadRow({ ...FREED_LEAD, summary: 'ביקשה שנתקשר רק אחרי 16:00 ולא בבוקר' });
    expect(html).toContain('ביקשה שנתקשר רק אחרי 16:00');
  });

  it('a future lead whose day has come: the mark stands out, with the reason and whose it is', () => {
    const due = lead({
      stage: 'callback_due',
      stage_label: 'הגיע הזמן לחזור אליו',
      owner: 'office',
      next: { who: 'office', what: 'לחזור ללקוח', when: null, state: 'none' },
      future: { ...FUTURE, state: 'due', due: TODAY },
    });
    const html = leadRow(due);
    expect(html).toContain(l.futureMarkLoud);
    expect(html).toContain('ליד עתידי · הגיע היום');
    expect(html).toContain('הילד יהיה בן 3 בדצמבר · מיכל כהן');
    // Parked, it is quiet.
    expect(leadRow(lead({ stage: 'waiting_date', future: FUTURE }))).not.toContain(l.futureMarkLoud);
  });

  it('a lead with neither is the row it always was', () => {
    const html = leadRow(lead({ stage: 'link_sent' }));
    for (const name of [l.wait, l.freed, l.futureLine]) expect(html).not.toContain(name);
  });
});

function details(row: WahubLeadRow, more: Partial<WahubLeadDetails> | null, over: Partial<LeadDetailsProps> = {}): React.ReactElement {
  const base: WahubLeadDetails = {
    reason: row.summary,
    blocker_text: '',
    child: null,
    come_back_on: null,
    come_back_why: '',
    trial: null,
    followups: [],
    timeline: [],
    in_system: null,
  };
  return (
    <LeadDetails
      lead={row}
      details={more ? { ...base, ...more } : null}
      status={more ? 'ready' : 'loading'}
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
      {...over}
    />
  );
}

describe('a lead\'s details', () => {
  it('a place was freed: the headline right under "מה קורה עכשיו", with "טופל" and "להסיר מהרשימה"', () => {
    const html = render(details(FREED_LEAD, {}));
    expect(html).toContain(l.freedBox);
    expect(html.indexOf('מה קורה עכשיו')).toBeLessThan(html.indexOf(l.freedBox));
    expect(html).toContain('להסיר מהרשימה');
    expect(html).toMatch(/aria-label="פעולות על המקום שהתפנה"[^]*טופל/);
    // The reason that only repeats the headline is not said again as "למה זה ליד".
    expect(html).not.toContain('למה זה ליד');
  });

  it('the headline and its actions are there at once, from the row — before the rest is read', () => {
    const html = render(details(FREED_LEAD, null));
    expect(html).toContain(l.freedBox);
    expect(html).toContain('להסיר מהרשימה');
  });

  it('the notes the office wrote, and every entry of the waiting list', () => {
    const entries = [
      { id: 7, status: 'freed', status_label: 'התפנה מקום', lesson_label: WAITING.label, child: 'בן 5', added_by: 'bot' as const, added_by_name: '', created_at: WAITING.since, freed_at: FREED.freed_at, closed_at: null, closed_by_name: '', closed_reason: '', position: 1, title: FREED.title },
      { id: 5, status: 'removed', status_label: 'הוסר', lesson_label: 'אקרובטיקה · יום ראשון · 16:00 · מינץ', child: '', added_by: 'person' as const, added_by_name: 'דור', created_at: '2026-10-01T08:00:00Z', freed_at: null, closed_at: '2026-10-05T08:00:00Z', closed_by_name: 'דור', closed_reason: 'השיעור נמחק', position: null, title: '' },
    ];
    const html = render(details(FREED_LEAD, { notes: [NOTE], waiting_list_entries: entries }));
    expect(html).toMatch(/פתקים <span[^>]*>\(1\)<\/span>/);
    expect(html).toContain('אמא ביקשה שנחזור אחרי החגים');
    expect(html).toContain('רשימת המתנה');
    expect(html).toContain('התפנה מקום · נכנס ב-13.10 · בן 5 · מקום 1 בתור');
    expect(html).toContain('הוסר · נכנס ב-1.10 · השיעור נמחק · נסגר ב-5.10');
    // What still stands is read before what was closed.
    expect(html.indexOf('מקום 1 בתור')).toBeLessThan(html.indexOf('השיעור נמחק'));
    // The freed entry's two actions are at the head of the details — once, not again in the list.
    expect(html.split('להסיר מהרשימה').length - 1).toBe(1);
  });

  it('a second place that was freed carries its own two actions in the list', () => {
    const entries = [7, 9].map((id) => ({
      id, status: 'freed', status_label: 'התפנה מקום', lesson_label: `שיעור ${id}`, child: '', added_by: 'bot' as const, added_by_name: '',
      created_at: WAITING.since, freed_at: FREED.freed_at, closed_at: null, closed_by_name: '', closed_reason: '', position: 1, title: '',
    }));
    const html = render(details({ ...FREED_LEAD, waiting_list: { ...FREED, more: 1 } }, { waiting_list_entries: entries }));
    expect(html.split('להסיר מהרשימה').length - 1).toBe(2);
  });

  it('a future lead: its mark, the reason in full, whose it is — and that the bot still answers, only when it does', () => {
    const due = lead({
      stage: 'callback_due',
      owner: 'office',
      next: { who: 'office', what: 'לחזור ללקוח', when: null, state: 'none' },
      future: { ...FUTURE, state: 'wrote', muted: false },
    });
    const html = render(details(due, {}));
    expect(html).toContain(l.futureMarkLoud);
    expect(html).toContain('ליד עתידי · הלקוח כתב · נקבע ל-1.12');
    expect(html).toContain('הילד יהיה בן 3 בדצמבר');
    expect(html).toContain(`${BOT_STILL_ANSWERS}.`);
    expect(render(details({ ...due, future: FUTURE }, {}))).not.toContain(BOT_STILL_ANSWERS);
  });

  it('a server built before all of it: the details are what they were', () => {
    const before = lead({
      stage: 'link_sent',
      stage_label: 'קיבל קישור ועוד לא נרשם',
      owner: 'bot',
      summary: 'שאלה על קפוארה, קיבלה קישור ולא נרשמה',
      next: { who: 'bot', what: 'הבוט יזכיר את הקישור', when: '2026-10-14T07:30:00Z', state: 'planned' },
    });
    const html = render(details(before, {}));
    for (const words of ['פתקים', 'רשימת המתנה', 'ליד עתידי', 'להסיר מהרשימה']) expect(html).not.toContain(words);
  });

  it('a closed lead shows its entries and offers nothing to press on them', () => {
    const html = render(details({ ...FREED_LEAD, stage: 'deleted', owner: '' }, {}, { closed: true }));
    expect(html).not.toContain(l.freedBox);
    expect(html).not.toContain('להסיר מהרשימה');
  });
});

describe('the two actions of a freed place', () => {
  function actions(over: Partial<WaitingActionsViewProps> = {}): React.ReactElement {
    return <WaitingActionsView name="דנה לוי" lesson={WAITING.label} busy={null} asking={false} onAsk={noop} onAct={noop} {...over} />;
  }

  it('"טופל" is one press; "להסיר מהרשימה" asks first — nothing here puts a person back on the list', () => {
    const onAct = vi.fn();
    const onAsk = vi.fn();
    const node = actions({ onAct, onAsk });
    button(node, 'טופל').props.onClick?.();
    expect(onAct).toHaveBeenCalledWith('handled');
    button(node, 'להסיר מהרשימה').props.onClick?.();
    expect(onAsk).toHaveBeenCalledWith(true);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('the question names the person and the lesson; "כן" removes, "ביטול" lets go', () => {
    const onAct = vi.fn();
    const onAsk = vi.fn();
    const node = actions({ asking: true, onAct, onAsk });
    const html = render(node);
    expect(html).toContain('דנה לוי');
    expect(html).toContain('קפוארה גן חובה · יום שלישי · 17:00 · מינץ');
    expect(html).toContain('אי אפשר להחזיר מכאן');
    button(node, 'כן, להסיר').props.onClick?.();
    expect(onAct).toHaveBeenCalledWith('remove');
    button(node, 'ביטול').props.onClick?.();
    expect(onAsk).toHaveBeenCalledWith(false);
  });

  it('while one is on its way neither can be pressed', () => {
    const node = actions({ busy: 'handled' });
    expect(button(node, 'טופל').props.disabled).toBe(true);
    expect(button(node, 'להסיר מהרשימה').props.disabled).toBe(true);
  });
});
