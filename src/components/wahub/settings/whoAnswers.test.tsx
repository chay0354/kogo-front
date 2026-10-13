import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { GO_LIVE_CLOSED, WHO_ANSWERS_CARD_ID, readBotMode, type GoLiveStep } from '@/lib/wahub/botMode';
import { readAutomation } from '@/lib/wahub/leadsAutomation';
import type { WahubLeadsAutomation, WahubStatus } from '@/types/wahub';
import type { WahubBotMode } from '@/types/wahubBotMode';
import { botModeKeys } from '../hooks/useBotMode';
import { automationKeys } from '../hooks/useLeadsAutomation';
import { CountUp } from '../shared/motion';
import s from '../wahub.module.css';
import a from './automation.module.css';
import { GoLiveDialogView, type GoLiveDialogViewProps } from './GoLiveDialog';
import {
  AutomationLineView,
  LEADS_AUTOMATION_CARD_ID,
  LeadsAutomationView,
  type LeadsAutomationFollowups,
  type LeadsAutomationViewProps,
} from './LeadsAutomationCard';
import SettingsTab from './SettingsTab';
import SystemStatusCard from './SystemStatusCard';
import WhoAnswersCard, { WhoAnswersFold, WhoAnswersView, type WhoAnswersViewProps } from './WhoAnswersCard';
import g from './whoAnswers.module.css';

// Nothing here may reach a server: what the cards show is handed over, or put in the cache.
const refuse = vi.hoisted(() => () => vi.fn(() => Promise.reject(new Error('the test must not reach the server'))));
vi.mock('@/lib/wahub/botModeApi', async (original) => ({
  ...(await original<typeof import('@/lib/wahub/botModeApi')>()),
  fetchWahubBotMode: refuse(),
  setWahubBotMode: refuse(),
  setWahubBotFollowups: refuse(),
}));
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
 * docs/WAHUB-CONTRACT-GO-LIVE.md, ג — "מי עונה ללקוחות". The first card of the
 * settings is where the owner moves every customer to the new bot, and back.
 * It says who answers right now, large; it has one button, and that button can
 * never turn "כולם" on by itself — it opens a window, and in the window a tick
 * comes before "להדליק לכולם". In the card under it, the comings back to the
 * leads have a switch of their own. On a server that has none of it, nothing
 * is there. Every name here is invented.
 */

/** Wednesday, 14.10.2026, 13:00 in Israel. */
const NOW = new Date('2026-10-14T10:00:00Z');
const noop = () => {};

const RAW_TEST = {
  mode: 'test',
  live: false,
  live_since: null,
  chosen_at: null,
  chosen_by: '',
  sending_enabled: true,
  text: 'מצב בדיקה: הבוט החדש עונה רק למספרי הבדיקה (מספר בדיקה אחד)',
  warning: '',
  stopped: null,
  test_contacts: 1,
  today: { sent: 0, failed: 0, late: 0, needs_human: 0, fallback: 0, unanswered: 0 },
  last_failure: null,
  followups: { on: false, since: null, turned_on_at: null, by: '', text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן', due_now: 3 },
  log: [],
};

const TEST = readBotMode(RAW_TEST) as WahubBotMode;

const LIVE = readBotMode({
  ...RAW_TEST,
  mode: 'all',
  live: true,
  live_since: '2026-10-14T09:05:00+00:00',
  chosen_at: '2026-10-14T09:05:00+00:00',
  chosen_by: 'דנה מנהלת',
  text: 'הבוט החדש עונה לכל הלקוחות, להודעות שהגיעו מ-12:05',
  today: { sent: 47, failed: 0, late: 2, needs_human: 3, fallback: 0, unanswered: 0 },
  log: [
    { at: '2026-10-14T09:05:00+00:00', what: 'live', to: 'all', by: '', text: 'הבוט החדש עונה לכולם מ-12:05 — רק להודעות שמגיעות מהרגע הזה' },
    { at: '2026-10-14T09:05:00+00:00', what: 'mode', to: 'all', by: 'דנה מנהלת', text: 'המצב שונה ל"כולם": הבוט החדש עונה לכל מי שכותב' },
  ],
}) as WahubBotMode;

const WARNING = 'המצב "כולם" נבחר, אבל השליחה כבויה — שום דבר לא יוצא. הבוט החדש יתחיל לענות רק להודעות שיגיעו אחרי שהשליחה תודלק';

/** "כולם" was chosen, and sending is off. */
const HELD = readBotMode({
  ...RAW_TEST,
  mode: 'all',
  sending_enabled: false,
  text: 'נבחר "כולם", והבוט החדש עוד לא עונה לאף לקוח',
  warning: WARNING,
}) as WahubBotMode;

/** The brake fired. */
const STOPPED = readBotMode({
  ...RAW_TEST,
  warning: 'הבוט החדש עצר את עצמו — מאז אף לקוח לא נענה אוטומטית, עד שבוחרים שוב "כולם"',
  stopped: { at: '2026-10-14T09:40:00+00:00', reason: '5 תשובות נכשלו ברצף בתוך 10 דקות', text: 'הבוט החדש עצר את עצמו: 5 תשובות נכשלו ברצף בתוך 10 דקות' },
  today: { sent: 31, failed: 6, late: 4, needs_human: 9, fallback: 2, unanswered: 1 },
  last_failure: { at: '2026-10-14T09:39:00+00:00', kind: 'send', text: 'השליחה ללקוח נכשלה' },
  log: [{ at: '2026-10-14T09:40:00+00:00', what: 'brake', to: 'test', by: '', text: 'הבוט החדש עצר את עצמו: 5 תשובות נכשלו ברצף בתוך 10 דקות' }],
}) as WahubBotMode;

const OPEN: GoLiveStep = { open: true, disconnected: false };
const TICKED: GoLiveStep = { open: true, disconnected: true };

function viewProps(overrides: Partial<WhoAnswersViewProps> = {}): WhoAnswersViewProps {
  return {
    status: 'ready',
    error: '',
    state: TEST,
    now: NOW,
    busy: null,
    goLive: GO_LIVE_CLOSED,
    goLiveProblems: [],
    goLiveError: '',
    confirmingBack: false,
    notice: '',
    wentBack: false,
    onGoLive: noop,
    onConfirmGoLive: noop,
    onAskBack: noop,
    onCancelBack: noop,
    onConfirmBack: noop,
    onRetry: noop,
    ...overrides,
  };
}

const view = (overrides: Partial<WhoAnswersViewProps> = {}) => <WhoAnswersView {...viewProps(overrides)} />;
const card = (overrides: Partial<WhoAnswersViewProps> = {}) => renderToStaticMarkup(view(overrides));

function dialogProps(overrides: Partial<GoLiveDialogViewProps> = {}): GoLiveDialogViewProps {
  return { step: OPEN, sendingEnabled: true, busy: false, problems: [], error: '', onTick: noop, onConfirm: noop, onClose: noop, ...overrides };
}

const dialog = (overrides: Partial<GoLiveDialogViewProps> = {}) => <GoLiveDialogView {...dialogProps(overrides)} />;

type Pressable = React.ReactElement<{ onClick?: () => void; onChange?: (event: unknown) => void; disabled?: boolean; children?: React.ReactNode }>;

/** What keeps something of its own — a fold that is open, a number that counts up — cannot be drawn without a page. */
const STATEFUL: unknown[] = [WhoAnswersFold, CountUp];

/** The elements a component that keeps no state draws; one that does is left as it stands. */
function elements(node: React.ReactNode): Pressable[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child));
  if (!React.isValidElement(node)) return [];
  const element = node as Pressable;
  if (element.type === React.Fragment) return elements(element.props.children);
  if (typeof element.type === 'function') {
    if (STATEFUL.includes(element.type)) return [];
    return elements((element.type as (props: unknown) => React.ReactNode)(element.props));
  }
  return [element, ...elements(element.props.children)];
}

const words = (element: React.ReactElement) => renderToStaticMarkup(element).replace(/<[^>]+>/g, '').trim();

/** The buttons a tree draws, with the words on each. */
function buttons(node: React.ReactNode): Array<{ text: string; element: Pressable }> {
  return elements(node)
    .filter((element) => element.type === 'button')
    .map((element) => ({ text: words(element), element }));
}

function press(node: React.ReactNode, text: string): Pressable {
  const found = buttons(node).find((button) => button.text === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found.element;
}

/** The opening tag of the button with these words: its attributes, as they reach the page. */
function buttonTag(html: string, text: string): string {
  const at = html.indexOf(`${text}</button>`);
  if (at < 0) throw new Error(`no button "${text}"`);
  const from = html.lastIndexOf('<button', at);
  return html.slice(from, html.indexOf('>', from) + 1);
}

const count = (html: string, mark: string) => html.split(mark).length - 1;

// ---------------------------------------------------------------------------
// The state, large
// ---------------------------------------------------------------------------

describe('who answers, large', () => {
  it('"בדיקה בלבד": the new bot answers only the test numbers', () => {
    const html = card();
    expect(html).toContain(`id="${WHO_ANSWERS_CARD_ID}"`);
    expect(html).toContain('aria-label="מי עונה ללקוחות"');
    expect(html).toContain(`<p class="${g.headText}">בדיקה בלבד</p>`);
    expect(html).toContain('הבוט החדש עונה רק למספרי הבדיקה');
    expect(html).toContain('· מספר בדיקה אחד');
    expect(html).toContain('data-tone="test"');
    expect(html).not.toContain(g.toneLive);
  });

  it('"הבוט החדש עונה לכולם", in green, with since when', () => {
    const html = card({ state: LIVE });
    expect(html).toContain(`<p class="${g.headText}">הבוט החדש עונה לכולם</p>`);
    expect(html).toContain('מאז 14.10 12:05');
    expect(html).toContain(`class="${g.headline} ${g.toneLive}" data-tone="live"`);
    expect(html).not.toContain('data-warning');
  });

  it('"כולם" was chosen and sending is off: the server\'s sentence in amber, and its warning under it — never green', () => {
    const html = card({ state: HELD });
    expect(html).toContain(`class="${g.headline} ${g.toneHeld}" data-tone="held"`);
    expect(html).toContain(`<p class="${g.headText}">נבחר &quot;כולם&quot;, והבוט החדש עוד לא עונה לאף לקוח</p>`);
    expect(html).toContain('data-warning=""');
    expect(html).toContain('המצב &quot;כולם&quot; נבחר, אבל השליחה כבויה');
    expect(html).not.toContain(g.toneLive);
    expect(html).not.toContain('>הבוט החדש עונה לכולם<');
    expect(html).not.toContain('מאז');
  });

  it('the brake fired: what the server says and what is done now — first, before the state', () => {
    const html = card({ state: STOPPED });
    const strip = html.indexOf(`class="${g.stopped}"`);
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(html.indexOf('data-tone='));
    expect(html).toContain(`<div role="alert" class="${g.stopped}">`);
    expect(html).toContain('הבוט החדש עצר את עצמו: 5 תשובות נכשלו ברצף בתוך 10 דקות');
    expect(html).toContain('14.10 12:40');
    expect(html).toContain('מהרגע הזה אף אחד לא עונה ללקוחות אוטומטית.');
    expect(html).toContain('<b>מה עושים עכשיו:</b>');
    expect(html).toContain('מחברים חזרה את הבוט הישן ב-ManyChat');
    // Under it the state is what it is: "בדיקה בלבד", and the button turns the new bot on again.
    expect(html).toContain('data-tone="test"');
    expect(html).toContain('data-who-answers-action="go_live"');
  });

  it('…and that the bot stopped itself is said once: the server\'s second sentence about it is not repeated', () => {
    const html = card({ state: STOPPED });
    expect(count(html, 'עצר את עצמו')).toBe(1);
    expect(html).not.toContain('data-warning');
  });

  it('no brake: no strip', () => {
    expect(card()).not.toContain(g.stopped);
    expect(card({ state: LIVE })).not.toContain(g.stopped);
  });

  it('nothing technical is written on the card: not the mode\'s name, not a setting\'s', () => {
    for (const state of [TEST, LIVE, HELD, STOPPED]) {
      const text = card({ state, defaultOpen: ['failure', 'log'] }).replace(/<[^>]+>/g, ' ');
      expect(text).not.toMatch(/\b(mode|live|test|all|true|false|null|undefined)\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// The one button, and the two steps
// ---------------------------------------------------------------------------

describe('the one button', () => {
  it('from "בדיקה בלבד": "הבוט החדש עונה לכולם" — and it is the only button of the card', () => {
    const html = card();
    expect(count(html, '<button')).toBe(1);
    expect(buttonTag(html, 'הבוט החדש עונה לכולם')).toContain('data-who-answers-action="go_live"');
    expect(html).not.toContain('לחזור לבדיקה בלבד');
  });

  it('while the bot answers everybody: "לחזור לבדיקה בלבד" — the only button that is not a fold', () => {
    const html = card({ state: LIVE });
    expect(buttonTag(html, 'לחזור לבדיקה בלבד')).toContain('data-who-answers-action="back_to_test"');
    expect(count(html, 'data-who-answers-action')).toBe(1);
    // The rest are titles that open: each says so.
    expect(count(html, '<button')).toBe(1 + count(html, 'aria-expanded='));
  });

  it('chosen, and not answering yet: the way back is there all the same', () => {
    expect(card({ state: HELD })).toContain('data-who-answers-action="back_to_test"');
  });

  it('no switch on this card', () => {
    for (const state of [TEST, LIVE, HELD, STOPPED]) expect(card({ state })).not.toContain('role="switch"');
  });

  it('never the browser\'s own question', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    press(view(), 'הבוט החדש עונה לכולם').props.onClick?.();
    press(view({ state: LIVE }), 'לחזור לבדיקה בלבד').props.onClick?.();
    expect(confirm).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('going live takes two steps', () => {
  it('step one — the button on the card only opens the window; nothing is turned on', () => {
    const onGoLive = vi.fn();
    const onConfirmGoLive = vi.fn();
    press(view({ onGoLive, onConfirmGoLive }), 'הבוט החדש עונה לכולם').props.onClick?.();
    expect(onGoLive).toHaveBeenCalledTimes(1);
    expect(onGoLive).toHaveBeenCalledWith('open');
    expect(onConfirmGoLive).not.toHaveBeenCalled();
  });

  it('closed: no window in the page', () => {
    expect(card()).not.toContain('role="dialog"');
    expect(card({ state: LIVE })).not.toContain('role="dialog"');
  });

  it('the window says in plain words what is about to happen', () => {
    const html = card({ goLive: OPEN });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('מהרגע הזה הבוט החדש עונה לכל לקוח שכותב.');
    expect(html).toContain('הוא לא עונה על הודעות שנכנסו לפני כן.');
    expect(html).toContain('ודאו שהבוט הישן כבר מנותק ב-ManyChat.');
    expect(html).toContain('ניתקתי את הבוט הישן ב-ManyChat');
    // An X at its head, and the two buttons at its foot.
    expect(count(html, 'aria-label="סגור"')).toBe(2);
    expect(html).toContain('>ביטול</button>');
  });

  it('step two — without the tick, "להדליק לכולם" cannot be pressed', () => {
    const html = renderToStaticMarkup(dialog());
    expect(buttonTag(html, 'להדליק לכולם')).toContain('disabled=""');
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)/);
  });

  it('…and a press that got past the button turns nothing on', () => {
    const onConfirm = vi.fn();
    press(dialog({ onConfirm }), 'להדליק לכולם').props.onClick?.();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the tick is put: the button wakes, and one press asks the server once', () => {
    const onConfirm = vi.fn();
    const html = renderToStaticMarkup(dialog({ step: TICKED }));
    expect(buttonTag(html, 'להדליק לכולם')).not.toContain('disabled');
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""/);
    press(dialog({ step: TICKED, onConfirm }), 'להדליק לכולם').props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ticking and unticking say so, and nothing more', () => {
    const onTick = vi.fn();
    const onConfirm = vi.fn();
    const box = elements(dialog({ onTick, onConfirm })).find((element) => element.type === 'input');
    box?.props.onChange?.({ target: { checked: true } });
    box?.props.onChange?.({ target: { checked: false } });
    expect(onTick.mock.calls).toEqual([[true], [false]]);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('through the card: the tick reaches the window\'s owner as "tick", and only "להדליק לכולם" confirms', () => {
    const onGoLive = vi.fn();
    const onConfirmGoLive = vi.fn();
    const tree = view({ goLive: TICKED, onGoLive, onConfirmGoLive });
    elements(tree)
      .find((element) => element.type === 'input')
      ?.props.onChange?.({ target: { checked: false } });
    expect(onGoLive).toHaveBeenLastCalledWith('untick');
    press(tree, 'ביטול').props.onClick?.();
    expect(onGoLive).toHaveBeenLastCalledWith('close');
    expect(onConfirmGoLive).not.toHaveBeenCalled();
    press(tree, 'להדליק לכולם').props.onClick?.();
    expect(onConfirmGoLive).toHaveBeenCalledTimes(1);
  });

  it('while the press is on its way: everything in the window waits, and a second press does nothing', () => {
    const onConfirm = vi.fn();
    const html = renderToStaticMarkup(dialog({ step: TICKED, busy: true }));
    expect(buttonTag(html, 'להדליק לכולם')).toContain('disabled=""');
    expect(buttonTag(html, 'ביטול')).toContain('disabled=""');
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    press(dialog({ step: TICKED, busy: true, onConfirm }), 'להדליק לכולם').props.onClick?.();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('sending is off: the window says so before anything is pressed', () => {
    expect(renderToStaticMarkup(dialog({ sendingEnabled: false }))).toContain('השליחה ללקוחות כבויה כרגע. גם אחרי ההדלקה שום תשובה לא תצא, עד שהשליחה תודלק.');
    expect(renderToStaticMarkup(dialog())).not.toContain('השליחה ללקוחות כבויה');
  });

  it('the server cannot go live (409): its reasons in its own words, and the window stays', () => {
    const html = card({
      goLive: TICKED,
      goLiveError: 'אי אפשר לעבור ל"כולם" עכשיו — השרת לא יכול לענות ללקוחות',
      goLiveProblems: [
        { code: 'no_claude_key', text: 'אין בשרת מפתח Anthropic — אין בוט חדש שיענה' },
        { code: 'self_call_failed', text: 'השרת לא הצליח לקרוא לעצמו: לא התקבלה תשובה בזמן' },
      ],
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain(`<div role="alert" class="${g.problems}">`);
    expect(html).toContain('אי אפשר לעבור ל&quot;כולם&quot; עכשיו — השרת לא יכול לענות ללקוחות');
    expect(html).toContain('<li>אין בשרת מפתח Anthropic — אין בוט חדש שיענה</li>');
    expect(html).toContain('<li>השרת לא הצליח לקרוא לעצמו: לא התקבלה תשובה בזמן</li>');
    // The state behind the window did not move.
    expect(html).toContain('data-tone="test"');
    expect(html).toContain('data-mode="test"');
  });

  it('reasons with no sentence over them get the screen\'s own', () => {
    const html = renderToStaticMarkup(dialog({ step: TICKED, problems: [{ code: 'no_manychat', text: 'השרת לא מחובר ל-ManyChat' }] }));
    expect(html).toContain('אי אפשר להדליק עכשיו');
    expect(html).toContain('<li>השרת לא מחובר ל-ManyChat</li>');
  });

  it('anything else that went wrong is said in the window, in amber', () => {
    const html = renderToStaticMarkup(dialog({ step: TICKED, error: 'ההדלקה לא נשמרה. נסו שוב.' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('ההדלקה לא נשמרה. נסו שוב.');
    expect(html).not.toContain(s.noteBad);
  });

  it('the state turned to "כולם" under an open window (somebody else chose): the window is put away', () => {
    expect(card({ state: LIVE, goLive: TICKED })).not.toContain('role="dialog"');
    expect(card({ state: HELD, goLive: TICKED })).not.toContain('role="dialog"');
  });

  it('the button on the card waits while a change is on its way', () => {
    expect(buttonTag(card({ busy: 'all', goLive: TICKED }), 'הבוט החדש עונה לכולם')).toContain('disabled=""');
    expect(buttonTag(card({ state: LIVE, busy: 'test' }), 'לחזור לבדיקה בלבד')).toContain('disabled=""');
  });
});

// ---------------------------------------------------------------------------
// The way back
// ---------------------------------------------------------------------------

describe('going back to "בדיקה בלבד"', () => {
  it('the button asks first — it changes nothing by itself', () => {
    const onAskBack = vi.fn();
    const onConfirmBack = vi.fn();
    press(view({ state: LIVE, onAskBack, onConfirmBack }), 'לחזור לבדיקה בלבד').props.onClick?.();
    expect(onAskBack).toHaveBeenCalledTimes(1);
    expect(onConfirmBack).not.toHaveBeenCalled();
  });

  it('the question is asked inside the page, short, with the reminder about the old bot', () => {
    const html = card({ state: LIVE, confirmingBack: true });
    expect(html).toContain('role="group" aria-label="אישור פעולה"');
    expect(html).toContain('<b>לחזור לבדיקה בלבד?</b>');
    expect(html).toContain('<b>לחבר חזרה את הבוט הישן ב-ManyChat, אחרת אף אחד לא עונה ללקוחות.</b>');
    expect(html).toContain('>כן, לחזור לבדיקה בלבד</button>');
    expect(html).toContain('>ביטול</button>');
    // The button that asked gives way to the question: there are not two ways to go back at once.
    expect(html).not.toContain('data-who-answers-action');
    expect(html).not.toContain('role="dialog"');
  });

  it('"כן" goes back; "ביטול" does not', () => {
    const onConfirmBack = vi.fn();
    const onCancelBack = vi.fn();
    const tree = view({ state: LIVE, confirmingBack: true, onConfirmBack, onCancelBack });
    press(tree, 'ביטול').props.onClick?.();
    expect(onCancelBack).toHaveBeenCalledTimes(1);
    expect(onConfirmBack).not.toHaveBeenCalled();
    press(tree, 'כן, לחזור לבדיקה בלבד').props.onClick?.();
    expect(onConfirmBack).toHaveBeenCalledTimes(1);
  });

  it('the state turned to "בדיקה בלבד" under the question (the brake fired): the question is put away', () => {
    const html = card({ state: STOPPED, confirmingBack: true });
    expect(html).not.toContain('aria-label="אישור פעולה"');
    expect(html).toContain('data-who-answers-action="go_live"');
  });

  it('after going back, the reminder stays on the card', () => {
    const html = card({ wentBack: true });
    expect(html).toContain('חזרנו לבדיקה בלבד.');
    expect(html).toContain('<b>אם הבוט הישן מנותק ב-ManyChat — חברו אותו חזרה, אחרת אף אחד לא עונה ללקוחות.</b>');
    // Not while the bot answers everybody again, and not over the strip of the brake, which says it already.
    expect(card({ state: LIVE, wentBack: true })).not.toContain('חזרנו לבדיקה בלבד');
    expect(card({ state: STOPPED, wentBack: true })).not.toContain('חזרנו לבדיקה בלבד');
  });

  it('a change that was refused, or whose outcome is not known, is said on the card', () => {
    const html = card({ state: HELD, notice: 'השרת לא ענה, ולא ידוע אם השינוי נשמר. לפני שמנסים שוב — בדקו מה מוצג כאן.' });
    expect(html).toContain(`<p role="alert" class="${g.error}">`);
    expect(html).toContain('השרת לא ענה, ולא ידוע אם השינוי נשמר.');
  });
});

// ---------------------------------------------------------------------------
// The day, and what is a press away
// ---------------------------------------------------------------------------

describe('what happened today', () => {
  it('six small numbers, each with its word, in their order', () => {
    const html = card({ state: LIVE });
    const figures = [...html.matchAll(/data-figure="([a-z_]+)"><span class="[^"]*">([\d,]+)<\/span><span class="[^"]*">([^<]+)<\/span>/g)].map(
      (match) => `${match[1]} ${match[2]} ${match[3]}`,
    );
    expect(figures).toEqual(['sent 47 נענו', 'failed 0 נכשלו', 'late 2 נענו באיחור', 'needs_human 3 עברו לנציג', 'fallback 0 קיבלו הודעת גיבוי', 'unanswered 0 לא נענו']);
    expect(html).toContain('aria-label="מה קרה היום"');
  });

  it('a quiet "בדיקה בלבד" shows no numbers at all', () => {
    expect(card()).not.toContain('data-figure');
    expect(card()).not.toContain('מה קרה היום');
  });

  it('what failed and who was not answered stand out in amber; nothing here is red', () => {
    const html = card({ state: { ...LIVE, today: { ...LIVE.today, failed: 6, unanswered: 1 } } });
    expect(html).toMatch(new RegExp(`class="${g.figure} ${g.figureAlert}" data-figure="failed"`));
    expect(html).toMatch(new RegExp(`class="${g.figure} ${g.figureAlert}" data-figure="unanswered"`));
    expect(html).toMatch(new RegExp(`class="${g.figure}" data-figure="sent"`));
    expect(html).not.toContain(s.pBad);
    expect(html).not.toContain(s.badText);
  });

  it('who changed what is a title — the lines come on a press', () => {
    const folded = card({ state: LIVE });
    expect(folded).toContain('מי שינה ומתי');
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).not.toContain('המצב שונה ל');
    const open = card({ state: LIVE, defaultOpen: ['log'] });
    expect(open).toContain('המצב שונה ל&quot;כולם&quot;: הבוט החדש עונה לכל מי שכותב');
    expect(open).toContain('14.10 12:05');
    expect(open).toContain('· דנה מנהלת');
  });

  it('the last failure is a title with its hour — what failed comes on a press', () => {
    const folded = card({ state: STOPPED });
    expect(folded).toContain('הכשל האחרון');
    expect(folded).toContain('14.10 12:39');
    expect(folded).not.toContain('השליחה ללקוח נכשלה');
    expect(card({ state: STOPPED, defaultOpen: ['failure'] })).toContain('השליחה ללקוח נכשלה');
  });

  it('nothing failed and nothing changed: no titles to open', () => {
    expect(card()).not.toContain('aria-expanded');
  });

  it('what is on screen is being read again: a quiet word, and the card stays', () => {
    const html = card({ state: LIVE, refreshing: true });
    expect(html).toContain('מתעדכן…');
    expect(html).toContain('הבוט החדש עונה לכולם');
  });

  it('the server could not be asked again: the card says how old what it shows is', () => {
    expect(card({ state: LIVE, staleAt: '12:31' })).toContain('אין תשובה מהשרת כרגע. מה שמוצג כאן נכון לשעה 12:31.');
    expect(card({ state: LIVE })).not.toContain('אין תשובה מהשרת');
  });
});

// ---------------------------------------------------------------------------
// Waiting, failing — and a server from before
// ---------------------------------------------------------------------------

describe('before the first answer, and without one', () => {
  it('waiting: the shape of the state, and no button', () => {
    const html = card({ status: 'loading', state: null });
    expect(html).toContain('aria-label="טוען מי עונה ללקוחות"');
    expect(html).not.toContain('<button');
  });

  it('a failed read: a sentence and "נסו שוב" — no state is guessed, and nothing can be turned on', () => {
    const onRetry = vi.fn();
    const html = card({ status: 'error', state: null, error: 'משהו השתבש בשרת. נסו שוב בעוד רגע.' });
    expect(html).toContain('לא הצלחנו לטעון מי עונה ללקוחות');
    expect(html).toContain('משהו השתבש בשרת. נסו שוב בעוד רגע.');
    expect(html).not.toContain('data-tone');
    expect(html).not.toContain('data-who-answers-action');
    expect(html).not.toContain('בדיקה בלבד');
    press(view({ status: 'error', state: null, onRetry }), 'נסו שוב').props.onClick?.();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function reading(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WhoAnswersCard />
    </QueryClientProvider>,
  );
}

describe('the card with its reading', () => {
  it('a server from before (404): no card at all, and nothing in its place', () => {
    const client = newClient();
    client.setQueryData(botModeKeys.state, null);
    expect(reading(client)).toBe('');
  });

  it('before the first answer: the card\'s own waiting shape', () => {
    const html = reading(newClient());
    expect(html).toContain('aria-label="טוען מי עונה ללקוחות"');
    expect(html).not.toContain('data-who-answers-action');
  });

  it('a server that has it: the state it gave, the one button — and no window open', () => {
    const client = newClient();
    client.setQueryData(botModeKeys.state, TEST);
    const html = reading(client);
    expect(html).toContain('data-tone="test"');
    expect(html).toContain('data-who-answers-action="go_live"');
    expect(html).not.toContain('role="dialog"');

    client.setQueryData(botModeKeys.state, LIVE);
    const live = reading(client);
    expect(live).toContain('data-tone="live"');
    expect(live).toContain('data-who-answers-action="back_to_test"');
    expect(live).not.toContain('aria-label="אישור פעולה"');
  });
});

// ---------------------------------------------------------------------------
// The switch of the comings back to the leads
// ---------------------------------------------------------------------------

const FOUR_LINES = [
  { key: 'classify', ok: true, title: 'זיהוי וסיווג הלידים', detail: '53 לידים פתוחים, עודכן לפני 3 דק׳' },
  { key: 'schedule', ok: true, title: 'תזמון החזרות', detail: '12 חזרות מתוכננות' },
  { key: 'sending', ok: true, title: 'שליחה ללקוחות', detail: 'פעילה, דרך ManyChat' },
  { key: 'templates', ok: true, title: 'תבניות וואטסאפ', detail: '5 מתוך 5 של שלב 1 מחוברות' },
];
/** As the server words it (lead_automation.py): its "how" names the settings, where the switch is not. */
const FIFTH_OFF = {
  key: 'followups',
  ok: false,
  title: 'חזרות אוטומטיות',
  detail: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן',
  how: 'מדליקים בהגדרות, ליד "למי הבוט החדש עונה". רק חזרות שמועדן אחרי ההדלקה יוצאות — מה שחיכה עד אז מדולג',
};
const FIFTH_ON = { key: 'followups', ok: true, title: 'חזרות אוטומטיות', detail: 'דלוקות — יוצאות רק חזרות שמועדן אחרי 12:05' };

const automationOf = (lines: unknown[], ready: boolean) =>
  readAutomation({ ready, lines, today: { planned: 12, due: 3, sent: 0, skipped: 0 }, upcoming: [] }) as WahubLeadsAutomation;

const AUTO_OFF = automationOf([...FOUR_LINES, FIFTH_OFF], false);
const AUTO_ON = automationOf([...FOUR_LINES, FIFTH_ON], true);
/** A server from before the switch: four lines, and all of them stand. */
const AUTO_FOUR = automationOf(FOUR_LINES, true);

function followupsOf(overrides: Partial<LeadsAutomationFollowups> = {}): LeadsAutomationFollowups {
  return {
    on: false,
    text: 'כבויות — הבוט מתכנן חזרות ולא שולח אותן',
    dueNow: 3,
    busy: false,
    confirming: false,
    error: '',
    onToggle: noop,
    onConfirm: noop,
    onCancel: noop,
    ...overrides,
  };
}

function automationCard(overrides: Partial<LeadsAutomationViewProps> = {}): string {
  return renderToStaticMarkup(
    <LeadsAutomationView
      status="ready"
      error=""
      automation={AUTO_OFF}
      templates={{ status: 'ready', error: '', list: [], options: [], optionsReason: '', optionsLoading: false, saving: {}, saved: {}, errors: {} }}
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

const line = (followups?: LeadsAutomationFollowups, row = AUTO_OFF.lines[4]) => <AutomationLineView line={row} followups={followups} />;

/** One of the lines, by its title: from its own <li> to the end of it. */
function lineOf(html: string, title: string): string {
  const at = html.indexOf(`>${title}</h4>`);
  if (at < 0) throw new Error(`no line "${title}"`);
  return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
}

const switches = (html: string) => count(html, 'role="switch"');

describe('the switch of the comings back', () => {
  it('stands inside the existing card, on its own line — "חזרות אוטומטיות" — and nowhere else', () => {
    const html = automationCard({ followups: followupsOf() });
    expect(html).toContain(`id="${LEADS_AUTOMATION_CARD_ID}"`);
    expect(switches(html)).toBe(1);
    expect(lineOf(html, 'חזרות אוטומטיות')).toContain('role="switch"');
    for (const title of ['זיהוי וסיווג הלידים', 'תזמון החזרות', 'שליחה ללקוחות', 'תבניות וואטסאפ']) expect(lineOf(html, title)).not.toContain('role="switch"');
  });

  it('the fifth line is drawn like the other four: a mark, a title, a sentence, and how it is put right', () => {
    const html = automationCard({ followups: followupsOf() });
    expect(count(html, `<li class="${a.line}"`)).toBe(5);
    const fifth = lineOf(html, 'חזרות אוטומטיות');
    expect(fifth).toContain('data-ok="no"');
    expect(fifth).toContain('aria-label="חסר"');
    expect(fifth).toContain(`<p class="${a.lineDetail}">כבויות — הבוט מתכנן חזרות ולא שולח אותן</p>`);
    expect(fifth).toContain('<b>איך מתקנים:</b>');
    // The switch is on this very line: the line says so, and does not send the reader elsewhere.
    expect(fifth).toContain('מדליקים במתג שבשורה הזאת.');
    expect(fifth).not.toContain('למי הבוט החדש עונה');
  });

  it('off: said by the switch and by the words — "כבויות"', () => {
    const fifth = lineOf(automationCard({ followups: followupsOf() }), 'חזרות אוטומטיות');
    expect(fifth).toMatch(/role="switch" aria-checked="false" aria-label="חזרות אוטומטיות ללידים"/);
    expect(fifth).toContain('כבויות');
  });

  it('on: the switch, and since when — in the server\'s sentence', () => {
    const fifth = lineOf(
      automationCard({ automation: AUTO_ON, followups: followupsOf({ on: true, text: 'דלוקות — יוצאות רק חזרות שמועדן אחרי 12:05' }) }),
      'חזרות אוטומטיות',
    );
    expect(fifth).toMatch(/role="switch" aria-checked="true"/);
    expect(fifth).toContain('דלוקות — יוצאות רק חזרות שמועדן אחרי 12:05');
    expect(fifth).toContain('data-ok="yes"');
    expect(fifth).not.toContain('איך מתקנים');
  });

  it('the words beside the switch follow the switch — the answer to the press — even before the lines are read again', () => {
    // The lines still say "off"; the switch was just turned on.
    const fifth = lineOf(automationCard({ automation: AUTO_OFF, followups: followupsOf({ on: true, text: 'דלוקות — יתחילו לצאת בדקות הקרובות, רק מה שמועדו מעכשיו' }) }), 'חזרות אוטומטיות');
    expect(fifth).toContain('דלוקות — יתחילו לצאת בדקות הקרובות');
    expect(fifth).not.toContain('כבויות');
  });

  it('pressing it while it is off only asks — nothing is turned on', () => {
    const onToggle = vi.fn();
    const onConfirm = vi.fn();
    const sw = elements(line(followupsOf({ onToggle, onConfirm }))).find((element) => (element.props as { role?: string }).role === 'switch');
    sw?.props.onClick?.();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the question says what turning on does: only what is due from now on — and how many are left behind', () => {
    const html = renderToStaticMarkup(line(followupsOf({ confirming: true })));
    expect(html).toContain('role="group" aria-label="אישור פעולה"');
    expect(html).toContain('<b>להדליק את החזרות האוטומטיות ללידים?</b>');
    expect(html).toContain('ייצאו רק חזרות שמועדן מעכשיו והלאה; מה שהגיע זמנו קודם לא יישלח.');
    expect(html).toContain('3 חזרות שכבר הגיע זמנן לא יישלחו.');
    expect(html).toContain('>כן, להדליק</button>');
    // While the question is asked, "how it is put right" gives way to it.
    expect(html).not.toContain('איך מתקנים');
    expect(renderToStaticMarkup(line(followupsOf({ confirming: true, dueNow: 1 })))).toContain('חזרה אחת שכבר הגיע זמנה לא תישלח.');
    expect(renderToStaticMarkup(line(followupsOf({ confirming: true, dueNow: 0 })))).not.toContain('לא תישלח');
  });

  it('"כן, להדליק" turns it on; "ביטול" does not', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const tree = line(followupsOf({ confirming: true, onConfirm, onCancel }));
    press(tree, 'ביטול').props.onClick?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    press(tree, 'כן, להדליק').props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('pressing it while it is on turns it off — with no question', () => {
    const onToggle = vi.fn();
    const on = followupsOf({ on: true, text: 'דלוקות', onToggle });
    const sw = elements(line(on, AUTO_ON.lines[4])).find((element) => (element.props as { role?: string }).role === 'switch');
    sw?.props.onClick?.();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(renderToStaticMarkup(line(on, AUTO_ON.lines[4]))).not.toContain('אישור פעולה');
  });

  it('it turned on under the question (somebody else did): the question is put away', () => {
    expect(renderToStaticMarkup(line(followupsOf({ on: true, confirming: true }), AUTO_ON.lines[4]))).not.toContain('אישור פעולה');
  });

  it('while the press is on its way the switch waits', () => {
    expect(renderToStaticMarkup(line(followupsOf({ busy: true })))).toMatch(/role="switch"[^>]*disabled=""/);
  });

  it('a press that was refused: why, under the line, in amber', () => {
    const html = renderToStaticMarkup(line(followupsOf({ error: 'ההדלקה לא נשמרה. נסו שוב.' })));
    expect(html).toContain(`<p role="alert" class="${a.tplError}">ההדלקה לא נשמרה. נסו שוב.</p>`);
  });

  it('the one large sentence counts the switch with the rest', () => {
    expect(automationCard({ automation: AUTO_OFF, followups: followupsOf() })).toContain('הבוט מתכנן, אבל עוד לא שולח: חסר דבר אחד');
    expect(automationCard({ automation: AUTO_ON, followups: followupsOf({ on: true, text: 'דלוקות' }) })).toContain('הכול מוכן — הבוט חוזר ללידים לבד');
  });

  it('a server that has the switch and sent no line for it: the line is added, and the sentence does not say "ready" over it', () => {
    const html = automationCard({ automation: AUTO_FOUR, followups: followupsOf() });
    expect(count(html, `<li class="${a.line}"`)).toBe(5);
    expect(lineOf(html, 'חזרות אוטומטיות')).toContain('role="switch"');
    expect(html).not.toContain('הכול מוכן');
    expect(html).toContain('חסר דבר אחד');
  });

  it('a server that does not have the switch: the card is exactly as it was — four lines, no switch', () => {
    const html = automationCard({ automation: AUTO_FOUR });
    expect(switches(html)).toBe(0);
    expect(count(html, `<li class="${a.line}"`)).toBe(4);
    expect(html).toContain('הכול מוכן — הבוט חוזר ללידים לבד');
    expect(html).not.toContain('חזרות אוטומטיות');
  });

  it('the line without the switch\'s state (it is still being read) is a line like the others, in the server\'s words', () => {
    const html = automationCard({ automation: AUTO_OFF });
    expect(switches(html)).toBe(0);
    const fifth = lineOf(html, 'חזרות אוטומטיות');
    expect(fifth).toContain('כבויות — הבוט מתכנן חזרות ולא שולח אותן');
    expect(fifth).toContain('מדליקים בהגדרות, ליד');
  });
});

// ---------------------------------------------------------------------------
// In the settings
// ---------------------------------------------------------------------------

const STATUS: WahubStatus = {
  inbound_configured: true,
  inbound_key_set_at: '2026-10-01T10:00:00+03:00',
  bot_replies_seen: true,
  ai_configured: true,
  send_configured: true,
  sending_enabled: true,
  simulate_send: false,
  last_inbound_at: '2026-10-14T12:57:00+03:00',
  contacts_total: 40,
  messages_last_24h: 120,
  inbound_url: 'https://example.test/api/v1/wahub/inbound/manychat/',
  live_test_contacts: 1,
};

function settings(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SettingsTab status={STATUS} statusLoading={false} statusError={false} onRetryStatus={noop} onOpenChat={noop} />
    </QueryClientProvider>,
  );
}

function clientWith(state: WahubBotMode | null, automation: WahubLeadsAutomation | null = AUTO_OFF): QueryClient {
  const client = newClient();
  client.setQueryData(botModeKeys.state, state);
  client.setQueryData(automationKeys.status, automation);
  return client;
}

describe('in the settings', () => {
  it('"מי עונה ללקוחות" is the first card — above "מצב המערכת" and everything else', () => {
    const html = settings(clientWith(TEST));
    const order = [`id="${WHO_ANSWERS_CARD_ID}"`, 'aria-label="מצב המערכת"', `id="${LEADS_AUTOMATION_CARD_ID}"`, 'החיבור ל-ManyChat'].map((mark) => html.indexOf(mark));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html.indexOf('<section')).toBe(html.indexOf(`<section id="${WHO_ANSWERS_CARD_ID}"`));
  });

  it('exactly two controls were added: the one button, and the one switch', () => {
    const before = settings(clientWith(null, AUTO_FOUR));
    const after = settings(clientWith(TEST));
    expect(switches(after) - switches(before)).toBe(1);
    expect(count(after, 'data-who-answers-action') - count(before, 'data-who-answers-action')).toBe(1);
  });

  it('"מצב המערכת" gets a row "מי עונה" that leads to the card — a word, and no second telling', () => {
    const html = renderToStaticMarkup(<SystemStatusCard status={STATUS} botMode={LIVE} />);
    expect(html).toContain('aria-label="מי עונה: הבוט החדש, לכולם. לכרטיס “מי עונה ללקוחות”"');
    const at = html.indexOf('aria-label="מי עונה:');
    const row = html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
    // It leads; it does not open.
    expect(row).not.toContain('aria-expanded');
    expect(row).toContain('>מי עונה</span>');
    expect(row).toContain(s.pGood);
    // "שליחה ללקוחות" stays, right above it.
    expect(html.indexOf('>שליחה ללקוחות</span>')).toBeGreaterThan(-1);
    expect(html.indexOf('>שליחה ללקוחות</span>')).toBeLessThan(at);
    // Nothing of the card's own words is said here again.
    expect(html).not.toContain('מאז 14.10');
    expect(html).not.toContain('להדליק');
  });

  it('the row\'s word, by the state', () => {
    const word = (state: WahubBotMode) => renderToStaticMarkup(<SystemStatusCard status={STATUS} botMode={state} />);
    expect(word(TEST)).toContain('aria-label="מי עונה: בדיקה בלבד.');
    expect(word(HELD)).toContain('aria-label="מי עונה: עוד לא עונה לכולם.');
    expect(word(STOPPED)).toContain('aria-label="מי עונה: הבוט החדש עצר.');
  });

  it('while the bot answers everybody, "בדיקה חיה" no longer says that nothing changes for everybody else', () => {
    const live = settings(clientWith(LIVE));
    expect(live).not.toContain('לכל השאר שום דבר לא משתנה');
    expect(live).toContain('גם אחרי חזרה ל“בדיקה בלבד”');
    expect(settings(clientWith(TEST))).toContain('לכל השאר שום דבר לא משתנה');
  });

  it('a server from before: no card, no row, no switch — the settings are as they were', () => {
    const html = settings(clientWith(null, AUTO_FOUR));
    expect(html).not.toContain('מי עונה');
    expect(html).not.toContain(WHO_ANSWERS_CARD_ID);
    expect(html).not.toContain('data-who-answers-action');
    expect(html).not.toContain('חזרות אוטומטיות');
    expect(html).toContain('לכל השאר שום דבר לא משתנה');
    // The first card is the one that always was.
    const first = html.indexOf('<section');
    expect(html.slice(first, html.indexOf('>', first))).toContain('aria-label="מצב המערכת"');
    expect(count(html, `<li class="${a.line}"`)).toBe(4);
  });

  it('a server from before, down to the status card: without the state it is drawn exactly as it always was', () => {
    const plain = renderToStaticMarkup(<SystemStatusCard status={STATUS} />);
    expect(renderToStaticMarkup(<SystemStatusCard status={STATUS} botMode={null} />)).toBe(plain);
    expect(plain).not.toContain('מי עונה');
  });
});
