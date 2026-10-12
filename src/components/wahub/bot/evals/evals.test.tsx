/**
 * "בדיקות" — the screen, drawn in every state it has
 * (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ג; docs/WAHUB-CONTRACT-BOT-EVALS.md):
 * the one big sentence, the one button, a run under way, what failed first,
 * what passed folded away, an open row with its conversation — and a server
 * that does not have the screen yet.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { EVALS_TEXT, EVAL_RUN_START, evalRunReducer, readEvalListing, readEvalRun, runQueue, type EvalRunAction, type EvalRunState } from '@/lib/wahub/evals';
import { rawEvalLast, rawEvalListing, rawEvalRun, rawEvalScenario } from '@/lib/wahub/teachFixtures';
import type { WahubEvalListing, WahubEvalRun } from '@/types/wahubTeach';
import BotTab from '../BotTab';
import EvalsTab from './EvalsTab';
import EvalsView, { type EvalsViewProps } from './EvalsView';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const NOW = new Date('2026-10-12T15:00:00+03:00');
const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<QueryClientProvider client={client()}>{node}</QueryClientProvider>);
}

/** What is on screen without a press: everything but the folded parts. */
function unfolded(html: string): string {
  let out = html;
  const fold = /<details(?![^>]*\sopen)[^>]*>(?:(?!<details)[\s\S])*?<\/details>/;
  while (fold.test(out)) out = out.replace(fold, '');
  return out;
}

/** The words a person reads there: the text, and what a screen reader is told (an element's id is neither). */
function read(html: string): string {
  const said = [...html.matchAll(/(?:aria-label|title|placeholder)="([^"]*)"/g)].map((match) => match[1]);
  return [html.replace(/<[^>]+>/g, ' '), ...said].join(' ');
}

/** Words that belong to a developer: a model's name, a tool, a code name, a rule's number. */
const TECHNICAL = /claude|opus|find_courses|order_city_only|asks_field_first|\bP1\b|טוקנ|מודל|prompt/;

function listing(over: Record<string, unknown> = {}): WahubEvalListing {
  return readEvalListing(rawEvalListing(over)) as WahubEvalListing;
}

function fullRun(over: Record<string, unknown> = {}): WahubEvalRun {
  return readEvalRun(rawEvalRun(over)) as WahubEvalRun;
}

function runState(actions: EvalRunAction[]): EvalRunState {
  return actions.reduce(evalRunReducer, EVAL_RUN_START);
}

function view(over: Partial<EvalsViewProps> = {}): string {
  const props: EvalsViewProps = {
    availability: 'ready',
    loadError: '',
    onRetry: noop,
    listing: listing(),
    run: EVAL_RUN_START,
    group: null,
    openId: null,
    detail: { state: 'none' },
    now: NOW,
    onGroup: noop,
    onOpen: noop,
    onRun: noop,
    onStop: noop,
    onRetryDetail: noop,
    onTeach: noop,
    ...over,
  };
  return render(<EvalsView {...props} />);
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

describe('the sub-tab', () => {
  it('"בדיקות" is a sub-tab of "הבוט"', () => {
    const html = render(
      <BotTab sub="evals" status={undefined} openItemId={null} tryQuestion="" onSub={noop} onOpenItem={noop} onTryQuestion={noop} onOpenChat={noop} onDemoChanged={noop} />,
    );
    expect(html).toContain('id="wahub-bot-tab-evals" aria-selected="true"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });

  it('draws the shape of the screen while the list is on its way — and runs nothing by itself', () => {
    const html = render(<EvalsTab onTeach={noop} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('role="progressbar"');
  });
});

describe('the top of the screen', () => {
  const html = view();

  it('one big sentence: how many test conversations pass, out of how many', () => {
    expect(html).toMatch(/<p class="[^"]*"><span[^>]*>3<\/span> מתוך <span[^>]*>6<\/span> שיחות בדיקה עוברות<\/p>/);
    expect(html).toContain('אחת נכשלה · אחת דולגה · אחת עוד לא נבדקה');
  });

  it('says when they were last checked', () => {
    expect(html).toContain('נבדק לאחרונה היום ב-12:41');
  });

  it('one button — "בדוק עכשיו" — and, because something failed, "בדוק רק מה שנכשל"; no other way to run', () => {
    const top = html.slice(0, html.indexOf('סינון לפי נושא'));
    expect(buttons(top)).toEqual([EVALS_TEXT.runNow, EVALS_TEXT.runFailed]);
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="checkbox"');
  });

  it('says what a press will check, that the bot really answers, and that it can be stopped', () => {
    expect(html).toContain('ייבדקו כל 6 השיחות');
    expect(html).toContain('אפשר לעצור באמצע');
  });

  it('nothing is running until he presses', () => {
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain(`>${EVALS_TEXT.stop}<`);
  });

  it('with nothing failed there is one button only, and the list says so', () => {
    const scenarios = (rawEvalListing().scenarios as Array<Record<string, unknown>>).map((scenario) => ({
      ...scenario,
      last: rawEvalLast({ status: 'passed', status_label: 'עבר', failed_checks: 0, headline: '' }),
    }));
    const allPassed = view({ listing: readEvalListing({ scenarios }) as WahubEvalListing });
    expect(allPassed).toMatch(/>6<\/span> מתוך <span[^>]*>6<\/span> שיחות בדיקה עוברות/);
    expect(allPassed).not.toContain(EVALS_TEXT.runFailed);
    expect(allPassed).toContain('כל השיחות עוברות');
    expect(allPassed).not.toContain('לא עברו');
  });

  it('before the first check there are no figures: the conversations wait, and the list is open', () => {
    const scenarios = (rawEvalListing().scenarios as Array<Record<string, unknown>>).map((scenario) => ({ ...scenario, last: null }));
    const never = view({ listing: readEvalListing({ scenarios }) as WahubEvalListing });
    expect(never).toContain('6 שיחות בדיקה מחכות לבדיקה ראשונה');
    expect(never).toContain(EVALS_TEXT.neverChecked);
    expect(never).not.toContain(EVALS_TEXT.runFailed);
    expect(never).toMatch(/<details[^>]*open=""/);
    expect(never).toContain('6 לא נבדקו');
  });

  it('says so when a stand-in bot answers, so the figures are not taken for the real bot\'s', () => {
    expect(html).not.toContain(EVALS_TEXT.stub);
    expect(view({ listing: listing({ engine: { configured: false, model: 'stub', judge: false, label: 'בוט מדומה' } }) })).toContain(EVALS_TEXT.stub);
  });
});

describe('the list', () => {
  const html = view();

  it('what failed comes first, with why in a line; what passed is folded away behind its count', () => {
    const failedAt = html.indexOf('לא עברו');
    const uncheckedAt = html.indexOf('2 לא נבדקו');
    const passedAt = html.indexOf('3 עברו');
    expect(failedAt).toBeGreaterThan(-1);
    expect(failedAt).toBeLessThan(uncheckedAt);
    expect(uncheckedAt).toBeLessThan(passedAt);
    expect(html).toContain('נותן עיר בלבד');
    expect(html).toContain('קודם מבררים, אחר כך מציעים');
    // Folded: the rows are a press away.
    const seen = unfolded(html);
    expect(seen).toContain('נותן עיר בלבד');
    expect(seen).not.toContain('שיחה שלמה, פרט אחרי פרט');
    expect(seen).not.toContain('סניף חיצוני: מי רושם?');
    expect(html).toContain('>הצג<');
  });

  it('a row is the conversation\'s name in plain words and its mark, never its code name', () => {
    expect(html).toContain('aria-label="נכשלה"');
    expect(html).toContain('aria-label="עברה"');
    expect(html).toContain('aria-label="דולג"');
    expect(html).toContain('aria-label="עוד לא נבדק"');
    expect(read(html)).not.toMatch(TECHNICAL);
  });

  it('a conversation that was skipped says why in its row', () => {
    expect(html).toContain('דולג: אי אפשר להריץ כאן: במערכת אין סניף חיצוני פעיל');
  });

  it('the groups are a quiet row of chips, each with how many it has', () => {
    expect(html).toContain('aria-label="סינון לפי נושא"');
    for (const title of ['הכול', 'סדר השיחה', 'מחיר, ניסיון והרשמה', 'סניפים וכתובות']) expect(html).toContain(title);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('a chosen group narrows the list and the press — the big sentence stays the whole truth', () => {
    const money = view({ group: 'money' });
    expect(money).toMatch(/>3<\/span> מתוך <span[^>]*>6<\/span>/);
    expect(money).toContain('ייבדקו 2 השיחות של &quot;מחיר, ניסיון והרשמה&quot;');
    expect(money).not.toContain('נותן עיר בלבד');
    expect(money).toContain('הורה ששואל על מחיר');
    // Nothing failed in this group: nothing to recheck.
    expect(money).not.toContain(EVALS_TEXT.runFailed);
    expect(money).toContain('אין שיחה שנכשלה בין אלה שנבדקו');
  });
});

describe('a run under way', () => {
  const queue = runQueue(listing().scenarios, 'all');
  const running = runState([
    { type: 'start', queue, scope: 'all', group: null },
    { type: 'scenario', id: 'order_greeting' },
    { type: 'outcome', id: 'order_greeting', outcome: 'passed' },
    { type: 'scenario', id: 'order_city_only' },
    { type: 'outcome', id: 'order_city_only', outcome: 'failed' },
    { type: 'scenario', id: 'order_step_by_step' },
    { type: 'turns', id: 'order_step_by_step', played: 2, total: 4 },
  ]);
  const html = view({ run: running });

  it('a live bar, which conversation is being checked out of how many, and how far inside it', () => {
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuemin="0" aria-valuemax="6" aria-valuenow="2"/);
    expect(html).toContain('בודק 3 מתוך 6: שיחה שלמה, פרט אחרי פרט');
    expect(html).toContain('תשובה 3 מתוך 4');
    expect(html).toMatch(/style="transform:scaleX\(0\.4083\)"/);
  });

  it('"עצור" takes the place of the buttons: one run at a time', () => {
    expect(html).toContain(`${EVALS_TEXT.stop}</button>`);
    expect(html).not.toContain(EVALS_TEXT.runNow);
    expect(html).not.toContain(EVALS_TEXT.runFailed);
  });

  it('the conversation being checked shows it in its row', () => {
    expect(html).toContain('aria-label="נבדקת עכשיו"');
  });

  it('when it ends, a line says how it came out, and the buttons are back', () => {
    const finished = view({
      run: evalRunReducer(
        runState([
          { type: 'start', queue: queue.slice(0, 2), scope: 'all', group: null },
          { type: 'outcome', id: 'order_greeting', outcome: 'passed' },
          { type: 'outcome', id: 'order_city_only', outcome: 'failed' },
        ]),
        { type: 'finish' },
      ),
    });
    expect(finished).toContain('הבדיקה הסתיימה: אחת עברה, אחת נכשלה');
    expect(finished).toContain(EVALS_TEXT.runNow);
    expect(finished).not.toContain('role="progressbar"');
  });

  it('a run that was stopped, or that the screen stopped for lack of a connection, says how far it got', () => {
    const stopped = view({ run: runState([{ type: 'start', queue, scope: 'all', group: null }, { type: 'outcome', id: 'order_greeting', outcome: 'passed' }, { type: 'stop' }]) });
    expect(stopped).toContain('הבדיקה נעצרה. נבדקו 1 מתוך 6: אחת עברה');
    const halted = view({ run: runState([{ type: 'start', queue, scope: 'all', group: null }, { type: 'halt', reason: EVALS_TEXT.offline }]) });
    expect(halted).toContain(EVALS_TEXT.offline);
    expect(halted).toContain(EVALS_TEXT.runNow);
  });
});

describe('an open row', () => {
  const html = view({ openId: 'order_city_only', detail: { state: 'ready', run: fullRun() } });

  it('is marked open, and only it', () => {
    expect(html.match(/<button[^>]*aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-controls="wahub-eval-order_city_only"');
  });

  it('shows what is checked, and the conversation as bubbles', () => {
    expect(html).toContain(`>${EVALS_TEXT.what}<`);
    expect(html).toContain('הבוט שואל על התחום ומציג תחומים, לא חוגים');
    expect(html).toContain(`>${EVALS_TEXT.conversation}<`);
    expect(html).toContain('>הלקוח כתב<');
    expect(html).toContain('>פתח תקווה<');
    expect(html).toContain('>הבוט ענה<');
    expect(html).toContain('בפתח תקווה יש לנו *קפוארה* בימי שני ב-17:00 (₪260)');
  });

  it('under the answer that did not pass: what was expected, and why it did not — a sentence each', () => {
    expect(html).toContain(`>${EVALS_TEXT.expected}<`);
    expect(html).toContain('הבוט שואל באיזה תחום מדובר לפני שהוא מציע חוגים');
    expect(html).toContain('והבוט כבר נתן פרטים של חוג (17:00, ₪260)');
  });

  it('"ללמד את הבוט" stands on a conversation that failed', () => {
    expect(html).toContain(`${EVALS_TEXT.teach}</button>`);
    const passed = view({ openId: 'order_greeting', detail: { state: 'ready', run: fullRun({ status: 'passed', status_label: 'עבר', failures: [], headline: '' }) } });
    expect(passed).not.toContain(EVALS_TEXT.teach);
  });

  it('no model, no tool and no code name is read without opening "פרטים טכניים" at the foot — where they all are', () => {
    expect(read(unfolded(html))).not.toMatch(TECHNICAL);
    // The check itself reads the folded part too: the names are really there to be kept out.
    expect(read(html)).toMatch(TECHNICAL);
    expect(html).toContain(EVALS_TEXT.technical);
    expect(html).toContain('claude-opus-5-5');
    expect(html).toContain('find_courses');
    expect(html).toContain('>14.2</span> שנ׳');
    expect(html).toContain(`${EVALS_TEXT.allChecks} <span`);
    expect(html).toContain('השופט לא ענה');
  });

  it('a row inside a folded piece opens that piece', () => {
    const inside = view({ openId: 'order_step_by_step', detail: { state: 'loading' } });
    expect(inside).toMatch(/<details[^>]*open=""[^>]*><summary><span>3 עברו/);
    expect(inside).toContain('aria-label="טוען את השיחה"');
  });

  it('a conversation that could not be opened says so, with a way to try again', () => {
    const failed = view({ openId: 'order_city_only', detail: { state: 'failed', text: 'הריצה לא נמצאה.' } });
    expect(failed).toContain(EVALS_TEXT.runFailedToOpen);
    expect(failed).toContain('הריצה לא נמצאה.');
    expect(failed).toContain('נסה שוב');
  });

  it('a conversation that was never checked says so, and is not asked of the server', () => {
    const never = view({ openId: 'money_sibling', detail: { state: 'none' } });
    expect(never).toContain('עוד לא נבדק. לחיצה על &quot;בדוק עכשיו&quot; תבדוק גם אותה.');
  });

  it('a conversation that was skipped, or did not run, says why in place of a conversation', () => {
    const skipped = view({
      openId: 'places_external',
      detail: {
        state: 'ready',
        run: fullRun({
          run_id: 415,
          status: 'skipped',
          status_label: 'דולג',
          detail: 'אי אפשר להריץ כאן: במערכת אין סניף חיצוני פעיל',
          conversation: [],
          checks: [],
          failures: [],
          scenario: { ...(rawEvalRun().scenario as object), id: 'places_external' },
        }),
      },
    });
    expect(skipped).toContain('<strong>דולג:</strong> אי אפשר להריץ כאן: במערכת אין סניף חיצוני פעיל');
    expect(skipped).not.toContain(`>${EVALS_TEXT.conversation}<`);
    expect(skipped).not.toContain(`${EVALS_TEXT.teach}</button>`);
  });

  it('a conversation being played right now shows the turns that came, and holds a place for the next answer', () => {
    const live = view({
      openId: 'order_step_by_step',
      detail: {
        state: 'ready',
        run: fullRun({ run_id: 901, status: 'running', status_label: 'רץ', done: false, failures: [], checks: [], turns_played: 1, turns_total: 4, scenario: { ...(rawEvalRun().scenario as object), id: 'order_step_by_step', turns: 4 } }),
      },
    });
    expect(live).toContain('התשובה בדרך');
    expect(live).not.toContain(EVALS_TEXT.technical);
    expect(live).not.toContain(`${EVALS_TEXT.teach}</button>`);
  });

  it('shows a burst of messages, a message the system sent first, and a bot that asked for a person', () => {
    const run = fullRun({
      conversation: [
        {
          turn: 1,
          last_outbound: 'תזכורת: מחר שיעור ניסיון ב-17:00',
          customer: [
            { kind: 'text', text: 'ויש לי גם ילד בן 5.' },
            { kind: 'voice', text: '' },
          ],
          bot: 'אעביר לנציג',
          reasoning: '',
          tools: [],
          request_human: true,
          request_human_reason: 'ביקש נציג',
          tags: [],
        },
      ],
    });
    const html = view({ openId: 'order_city_only', detail: { state: 'ready', run } });
    expect(html).toContain('לפני כן נשלח ללקוח');
    expect(html).toContain('תזכורת: מחר שיעור ניסיון ב-17:00');
    expect(html.match(/>הלקוח כתב</g)).toHaveLength(1);
    expect(html).toContain('הקלטה קולית (בלי תמלול)');
    expect(html).toContain('ביקש להעביר לנציג · ביקש נציג');
  });
});

describe('a server that does not have the checks yet', () => {
  it('says kindly that the screen will open after the next update — and nothing else', () => {
    const html = view({ availability: 'unavailable', listing: null });
    expect(html).toContain(EVALS_TEXT.notBuiltTitle);
    expect(html).toContain('ייפתח לבד');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/404|405|שגיאה/);
  });

  it('a real failure is one sentence and "נסה שוב"', () => {
    const html = view({ availability: 'failed', listing: null, loadError: 'אין הרשאה' });
    expect(html).toContain('role="alert"');
    expect(html).toContain(EVALS_TEXT.loadFailed);
    expect(html).toContain('אין הרשאה');
    expect(html).toContain('נסה שוב');
  });

  it('waiting for the list is a grey shape of the screen', () => {
    const html = view({ availability: 'loading', listing: null });
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('<button');
  });

  it('a list with one group shows no chips: there is nothing to narrow', () => {
    const one = readEvalListing({ scenarios: [rawEvalScenario('order_a'), rawEvalScenario('order_b', { last: null })] }) as WahubEvalListing;
    expect(view({ listing: one })).not.toContain('סינון לפי נושא');
  });
});
