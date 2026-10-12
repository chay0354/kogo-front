/**
 * "ללמד" — the screen, drawn in every state it has
 * (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, ב): the one big box, the bot
 * thinking, the card (what it understood, what would change, the example, the
 * warning, the two buttons), the one question, "נשמר ✓" with the line of the
 * check, the quiet list — and a server that does not have the screen yet.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { BOT_SUBS } from '@/lib/wahub/bot';
import { TEACH_TEXT, readTeachPage, readTeachThread } from '@/lib/wahub/teach';
import { rawTeachChange, rawTeachCheck, rawTeachPage, rawTeachRow, rawTeachSaved, rawTeachThread } from '@/lib/wahub/teachFixtures';
import type { WahubTeachRow, WahubTeachThread } from '@/types/wahubTeach';
import BotTab from '../BotTab';
import { TeachCardView, type TeachCardViewProps } from './TeachCard';
import type { TeachHistoryProps } from './TeachHistory';
import TeachTab from './TeachTab';
import TeachView, { composerShown, type TeachSlot, type TeachViewProps } from './TeachView';

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

/** What is on screen without a press: everything but the folded parts ("פרטים טכניים", "דוגמאות"…). */
function unfolded(html: string): string {
  let out = html;
  const fold = /<details(?![^>]*\sopen)[^>]*>(?:(?!<details)[\s\S])*?<\/details>/;
  while (fold.test(out)) out = out.replace(fold, '');
  return out;
}

/** Words that belong to a developer: none of them may be read on the screen without opening "פרטים טכניים". */
const TECHNICAL = /behavior_rule|price_needs_course|claude|refine_stub|כלל התנהגות|רשומה|prompt|מודל|טוקנ|proposal|#\d/;

function thread(over: Record<string, unknown> = {}): WahubTeachThread {
  return readTeachThread(rawTeachThread(over)) as WahubTeachThread;
}

function saved(over: Record<string, unknown> = {}): WahubTeachThread {
  return readTeachThread(rawTeachSaved(over)) as WahubTeachThread;
}

function rows(): WahubTeachRow[] {
  return (
    readTeachPage(
      rawTeachPage([
        rawTeachRow(44, { state: 'waiting', state_label: 'מחכה לאישור שלך', understood: 'כששואלים על יום הולדת, הבוט ישאל אם מדובר בברכה או בהפעלה', at: '2026-10-12T08:00:00+03:00' }),
        rawTeachRow(43),
        rawTeachRow(42, { state: 'undone', state_label: 'בוטל', understood: 'הבוט יסיים כל הודעה בלב', at: '2026-10-08T10:00:00+03:00' }),
        rawTeachRow(41, { state: 'nothing', state_label: 'לא שונה דבר', understood: '', text: 'חוג קפוארה עולה 250 שקל', at: '2025-12-30T10:00:00+02:00' }),
      ]),
    )?.results ?? []
  );
}

function history(over: Partial<TeachHistoryProps> = {}): TeachHistoryProps {
  return {
    rows: rows(),
    count: 4,
    openId: null,
    askingId: null,
    undoingId: null,
    rowError: null,
    more: false,
    loadingMore: false,
    now: NOW,
    onOpen: noop,
    onAskUndo: noop,
    onUndo: noop,
    onMore: noop,
    ...over,
  };
}

function view(over: Partial<TeachViewProps> = {}): string {
  const props: TeachViewProps = {
    availability: 'ready',
    loadError: '',
    onRetry: noop,
    slot: null,
    draft: '',
    sendError: '',
    onDraft: noop,
    onSend: noop,
    onApprove: noop,
    onSay: noop,
    onUndo: noop,
    onClose: noop,
    onRetryOpen: noop,
    history: history(),
    ...over,
  };
  return render(<TeachView {...props} />);
}

function slotOf(value: WahubTeachThread, over: Partial<Extract<TeachSlot, { kind: 'thread' }>> = {}): TeachSlot {
  return { kind: 'thread', thread: value, busy: null, said: '', saidAt: 0, error: '', unsent: '', previewStalled: false, checkStalled: false, version: 1, ...over };
}

function card(value: WahubTeachThread, over: Partial<TeachCardViewProps> = {}): string {
  const props: TeachCardViewProps = {
    thread: value,
    busy: null,
    said: '',
    saidAt: 0,
    error: '',
    unsent: '',
    previewStalled: false,
    checkStalled: false,
    fixing: false,
    confirmingUndo: false,
    onApprove: noop,
    onSay: noop,
    onUndo: noop,
    onFixing: noop,
    onConfirmingUndo: noop,
    onClose: noop,
    ...over,
  };
  return render(<TeachCardView {...props} />);
}

describe('the sub-tab', () => {
  it('"ללמד" is the first sub-tab of "הבוט", and "בדיקות" stands among them', () => {
    expect(BOT_SUBS[0]).toMatchObject({ key: 'teach', label: 'ללמד' });
    expect(BOT_SUBS.map((sub) => sub.key)).toContain('evals');
    const html = render(
      <BotTab sub="teach" status={undefined} openItemId={null} tryQuestion="" onSub={noop} onOpenItem={noop} onTryQuestion={noop} onOpenChat={noop} onDemoChanged={noop} />,
    );
    expect(html).toContain('id="wahub-bot-tab-teach" aria-selected="true"');
    expect(html.indexOf('>ללמד<')).toBeLessThan(html.indexOf('>ידע<'));
    expect(html).toContain('>בדיקות<');
  });

  it('draws the shape of the screen while the first read is on its way, and nothing breaks without a server', () => {
    const html = render(<TeachTab />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(TEACH_TEXT.title);
  });
});

describe('before anything is written', () => {
  const html = view();

  it('one big box, with the question over it and a quiet example inside it', () => {
    expect(html).toContain(`<h2>${TEACH_TEXT.title}</h2>`);
    expect(html).toContain('ושום דבר לא משתנה בלי האישור שלך');
    expect(html).toContain(`placeholder="${TEACH_TEXT.example}"`);
    expect(html).toContain(`aria-label="${TEACH_TEXT.title}"`);
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain('maxLength="4000"');
    expect(html).toContain(TEACH_TEXT.keys);
  });

  it('nothing can be sent while the box is empty', () => {
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>[\s\S]*שלח לבוט/);
    expect(view({ draft: 'כששואלים על מחיר…' })).not.toMatch(/<button type="submit" disabled=""/);
  });

  it('no switch, and no words of a developer', () => {
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="checkbox"');
    expect(unfolded(html)).not.toMatch(TECHNICAL);
  });

  it('says how much room is left only near the end of it', () => {
    expect(view({ draft: 'א'.repeat(100) })).not.toContain('נשארו');
    expect(view({ draft: 'א'.repeat(3900) })).toContain('נשארו 100 תווים');
  });

  it('a send that failed says why, and the words are still in the box', () => {
    const failed = view({ draft: 'כששואלים על מחיר, קודם לשאול על איזה חוג', sendError: TEACH_TEXT.failed });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('מה שכתבת נשאר בתיבה');
    expect(failed).toContain('>כששואלים על מחיר, קודם לשאול על איזה חוג</textarea>');
  });
});

describe('"מה לימדת עד היום"', () => {
  const html = view();

  it('is a quiet list: the date, what was understood, and where it stands', () => {
    expect(html).toContain(TEACH_TEXT.historyTitle);
    expect(html).toContain('>12.10<');
    expect(html).toContain('>8.10<');
    // Another year says so.
    expect(html).toContain('>30.12.25<');
    expect(html).toContain('כששואלים על יום הולדת, הבוט ישאל אם מדובר בברכה או בהפעלה');
    for (const label of ['מחכה לאישור שלך', 'נשמר', 'בוטל', 'לא שונה דבר']) expect(html).toContain(`>${label}<`);
    // Nobody understood the fourth one: his own words stand in its row.
    expect(html).toContain('חוג קפוארה עולה 250 שקל');
  });

  it('"בטל" stands only on a row that has something to take back', () => {
    expect(html.match(/aria-label="בטל: /g)).toHaveLength(2);
    expect(html).toContain('aria-label="בטל: כששואלים על יום הולדת');
    expect(html).not.toContain('aria-label="בטל: הבוט יסיים כל הודעה בלב');
  });

  it('"בטל" asks before it acts — and words it by what will happen', () => {
    const waiting = view({ history: history({ askingId: 44 }) });
    expect(waiting).toContain(TEACH_TEXT.undoAskWaiting);
    expect(waiting).toContain('>השאר<');
    const kept = view({ history: history({ askingId: 43 }) });
    expect(kept).toContain(TEACH_TEXT.undoAsk);
    expect(view()).not.toContain(TEACH_TEXT.undoAsk);
  });

  it('a row that could not be taken back says so, under the row', () => {
    expect(view({ history: history({ rowError: { id: 43, text: TEACH_TEXT.undoFailed } }) })).toContain(TEACH_TEXT.undoFailed);
  });

  it('marks the row whose card is open, and offers more rows when there are more', () => {
    expect(view({ history: history({ openId: 43 }) }).match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).not.toContain(TEACH_TEXT.more);
    expect(view({ history: history({ more: true, count: 31 }) })).toContain(`>${TEACH_TEXT.more}<`);
  });

  it('says what will be here when nothing was taught yet', () => {
    const empty = view({ history: history({ rows: [], count: 0 }) });
    expect(empty).toContain(TEACH_TEXT.historyEmpty);
    expect(empty).not.toContain('<ul');
  });
});

describe('while the bot thinks', () => {
  const html = view({ slot: { kind: 'thinking', wrote: 'כששואלים על מחיר, קודם לשאול על איזה חוג', since: NOW.getTime() } });

  it('shows what he wrote and "הבוט חושב", and the big box steps aside', () => {
    expect(html).toContain('>כתבת<');
    expect(html).toContain('כששואלים על מחיר, קודם לשאול על איזה חוג');
    expect(html).toContain(TEACH_TEXT.thinking);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain(`<h2>${TEACH_TEXT.title}</h2>`);
  });

  it('the list stays where it was', () => {
    expect(html).toContain(TEACH_TEXT.historyTitle);
  });
});

describe('the card: a change that waits for an approval', () => {
  const html = card(thread());

  it('is one card with the three parts, in order: understood, what changes, an example', () => {
    expect(html.match(/<section[^>]*aria-label="הבנתי כך"/g)).toHaveLength(1);
    const at = (text: string) => html.indexOf(text);
    expect(at('>הבנתי כך<')).toBeGreaterThan(-1);
    expect(at('>הבנתי כך<')).toBeLessThan(at('מעכשיו הבוט ישאל על איזה חוג מדובר לפני שיענה על מחיר'));
    expect(at('מעכשיו הבוט ישאל')).toBeLessThan(at('>דוגמה<'));
    expect(html).toContain('כששואלים על מחיר, הבוט ישאל קודם על איזה חוג מדובר ורק אז יענה');
    // The server sends the sentence without "הבנתי כך:" — the screen writes the heading once.
    expect(html.match(/הבנתי כך/g)?.length).toBe(2);
  });

  it('a new thing has no "היה"', () => {
    expect(html).toContain('>מה ישתנה<');
    expect(html).not.toContain('<span>היה</span>');
  });

  it('the example is a short conversation: the customer asks, and each answer holds its place until it arrives', () => {
    expect(html).toContain('>לקוח שואל<');
    expect(html).toContain('כמה עולה חוג?');
    expect(html).toContain('>היום הבוט עונה<');
    expect(html).toContain('>אחרי השינוי<');
    expect(html.match(/התשובה בדרך/g)).toHaveLength(2);
  });

  it('warns, in amber and in plain words, when this differs from what the bot knows today', () => {
    expect(html).toContain(TEACH_TEXT.heed);
    expect(html).toContain('מחיר — היום כתוב שם שעונים מחיר מיד');
  });

  it('two buttons and no more: "מאשר" and "לא בדיוק" — and it says nothing has changed yet', () => {
    expect(html).toContain(TEACH_TEXT.nothingYet);
    const buttons = [...unfolded(html).matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, '').trim());
    expect(buttons.filter(Boolean)).toEqual(['מאשר', 'לא בדיוק']);
    // The third is the card's own "×".
    expect(html).toContain(`aria-label="${TEACH_TEXT.closeHint}"`);
  });

  it('no word of a developer is read without opening "פרטים טכניים" — where the code names are', () => {
    expect(unfolded(html)).not.toMatch(TECHNICAL);
    expect(html).toContain('פרטים טכניים');
    expect(html).toContain('behavior_rule');
    expect(html).toContain('price_needs_course');
  });

  it('his own words stand at the top, folded to a line', () => {
    expect(html).toMatch(/<details[^>]*><summary><b>כתבת<\/b>/);
  });

  it('an update shows "היה" above "יהיה"', () => {
    const update = card(
      thread({
        changes: [
          rawTeachChange({
            plain: { headline: 'מעכשיו הבוט יפעל אחרת בנושא מחיר', rule: 'שואלים קודם', why: '', is_new: false, before: 'עונים מחיר מיד', after: 'שואלים קודם על איזה חוג' },
            technical: { action: 'update', kind: 'behavior_rule', item_id: 12, title: 'מחיר' },
          }),
        ],
      }),
    );
    expect(update).toContain('<span>היה</span><span>עונים מחיר מיד</span>');
    expect(update).toContain('<span>יהיה</span><span>שואלים קודם על איזה חוג</span>');
  });

  it('the example fills in as its parts arrive, and says so when a part will not come', () => {
    const whole = card(thread({ preview: { question: 'כמה עולה חוג?', before: 'החוגים עולים ₪260', after: 'על איזה חוג מדובר?', pending: false } }));
    expect(whole).toContain('החוגים עולים ₪260');
    expect(whole).toContain('על איזה חוג מדובר?');
    expect(whole).not.toContain('התשובה בדרך');
    const stalled = card(thread(), { previewStalled: true });
    expect(stalled).toContain(TEACH_TEXT.exampleStalled);
    expect(stalled).not.toContain('התשובה בדרך');
    expect(card(thread({ preview: null }))).not.toContain('>דוגמה<');
  });

  it('says what the bot is not sure of, under the card', () => {
    expect(card(thread({ notes: ['לא בטוח שהבנתי עד הסוף — כדאי לקרוא היטב לפני שמאשרים'] }))).toContain('לא בטוח שהבנתי עד הסוף');
  });

  it('"לא בדיוק" opens a short field: "מה לתקן?"', () => {
    const fixing = card(thread(), { fixing: true });
    expect(fixing).toContain(`placeholder="${TEACH_TEXT.whatToFix}"`);
    expect(fixing).toContain(`>${TEACH_TEXT.sendFix}<`);
    expect(fixing).toContain(`>${TEACH_TEXT.cancel}<`);
    expect(fixing).not.toContain('>מאשר<');
    // A correction that could not be sent is back in the field.
    expect(card(thread(), { fixing: true, unsent: 'רק כשהילד חולה', error: TEACH_TEXT.sayFailed })).toContain('>רק כשהילד חולה</textarea>');
  });

  it('while "מאשר" is on its way the buttons wait, and the card says what is happening', () => {
    const approving = card(thread(), { busy: 'approving' });
    expect(approving).toContain(TEACH_TEXT.saving);
    expect(approving).toContain('בודק שהבוט באמת עונה כך');
    expect(approving.match(/<button[^>]*disabled=""/g)?.length).toBe(2);
  });

  it('while the bot reads a correction: what he wrote, the dots, and no button to press', () => {
    const reading = card(thread(), { busy: 'saying', said: 'רק כשהילד חולה, לא כשהוא בחופשה', saidAt: NOW.getTime() });
    expect(reading).toContain('רק כשהילד חולה, לא כשהוא בחופשה');
    expect(reading).toContain(TEACH_TEXT.thinking);
    expect(reading).toContain('aria-busy="true"');
    expect(reading).not.toContain('>מאשר<');
  });

  it('a press that did not go through says why, in the card', () => {
    const failed = card(thread(), { error: TEACH_TEXT.approveFailed });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(TEACH_TEXT.approveFailed);
    expect(failed).toContain('>מאשר<');
  });

  it('a change that can no longer be approved as it is leaves only "לא בדיוק", with the reason said', () => {
    const stuck = card(thread({ needs_approval: false, changes: [rawTeachChange({ moved: true })], notes: ['מה שהשינוי הזה נוגע בו נערך בינתיים. כדאי להסביר שוב'] }));
    expect(stuck).not.toContain('>מאשר<');
    expect(stuck).toContain('>לא בדיוק<');
    expect(stuck).toContain('נערך בינתיים');
  });

  it('with no connection the words are kept as written, and the card says so in plain Hebrew', () => {
    const kept = card(
      thread({
        understood: '',
        preview: null,
        conflicts: [],
        reply: 'כרגע אין לי חיבור שמאפשר לי להבין הסבר בעצמי, אז לא שיניתי דבר. שמרתי את מה שכתבת מילה במילה, וזה מחכה לאישור שלך.',
        changes: [rawTeachChange({ plain: { headline: 'מעכשיו הבוט יפעל לפי מה שכתבת, מילה במילה', rule: 'כששואלים על מחיר, קודם לשאול על איזה חוג', why: '', is_new: true, before: null, after: null } })],
        technical: { model: 'refine_stub', reason: 'ANTHROPIC_API_KEY is not set', outcome: 'stub' },
      }),
    );
    expect(kept).toContain('כרגע אין לי חיבור');
    expect(kept).toContain('מעכשיו הבוט יפעל לפי מה שכתבת, מילה במילה');
    expect(kept).toContain('>מאשר<');
    // The reason is a developer's: folded.
    expect(unfolded(kept)).not.toContain('ANTHROPIC_API_KEY');
    expect(kept).toContain('ANTHROPIC_API_KEY is not set');
  });
});

describe('the card: the bot asks instead of guessing', () => {
  const asked = thread({ needs_answer: true, needs_approval: false, question: 'על איזה חוגים מדובר — על כולם, או רק על קפוארה?', changes: [], preview: null, conflicts: [], understood: '' });
  const html = card(asked);

  it('shows only the one question, and a field for the answer', () => {
    expect(html).toContain(TEACH_TEXT.question);
    expect(html).toContain('על איזה חוגים מדובר — על כולם, או רק על קפוארה?');
    expect(html).toContain(`placeholder="${TEACH_TEXT.answerHere}"`);
    expect(html).toContain(`>${TEACH_TEXT.sendAnswer}<`);
    expect(html).not.toContain('>מאשר<');
    expect(html).not.toContain('>לא בדיוק<');
    expect(html).not.toContain('>הבנתי כך<');
    expect(html).not.toContain('>דוגמה<');
  });

  it('there is one place to write: the big box steps aside until he answers', () => {
    expect(composerShown(slotOf(asked))).toBe(false);
    expect(view({ slot: slotOf(asked) }).match(/<textarea/g)).toHaveLength(1);
  });
});

describe('the card: after "מאשר"', () => {
  it('turns into "נשמר" with the line of the check — and the box is free again', () => {
    const html = card(saved());
    expect(html).toContain('>נשמר<');
    expect(html).toContain(TEACH_TEXT.savedLine);
    expect(html).toContain('בדקתי שיחה אחת — הבוט עונה נכון');
    expect(html).not.toContain('>מאשר<');
    expect(html).not.toContain(`>${TEACH_TEXT.undoChange}<`);
    expect(composerShown(slotOf(saved()))).toBe(true);
    expect(view({ slot: slotOf(saved()) })).toContain(`placeholder="${TEACH_TEXT.example}"`);
  });

  it('what changed, the example and what was checked are a press away', () => {
    const html = card(saved());
    expect(unfolded(html)).not.toContain('מעכשיו הבוט ישאל');
    expect(html).toContain('מה השתנה');
    expect(html).toContain(TEACH_TEXT.checkDetails);
    expect(html).toContain('>עכשיו הבוט עונה<');
    // Folded, the change itself is still in the card: what was kept, in "עכשיו" and not "יהיה".
    expect(html).toContain('מעכשיו הבוט ישאל על איזה חוג מדובר לפני שיענה על מחיר');
    expect(html).not.toContain('<span>יהיה</span>');
    expect(unfolded(html)).not.toMatch(TECHNICAL);
  });

  it('a check that is still running waits with dots, and is asked for again by the screen', () => {
    const html = card(saved({ check: rawTeachCheck({ ran: 0, passed: 0, pending: true, summary: 'הבדיקה עוד רצה', details: [], lines: [] }) }));
    expect(html).toContain(TEACH_TEXT.checkRunning);
    expect(html).not.toContain(`>${TEACH_TEXT.undoChange}<`);
  });

  it('a conversation that did not pass is said plainly, with "בטל את השינוי" beside it — the change stays until he decides', () => {
    const failed = saved({
      check: rawTeachCheck({ ran: 3, passed: 2, summary: 'אחת מתוך שלוש לא עברה: שאלתי "כמה עולה חוג?" — הבוט עדיין ענה מחיר', details: [{ question: 'כמה עולה חוג?', answer: 'החוג עולה ₪260', passed: false, line: 'הבוט עדיין ענה מחיר' }] }),
    });
    const html = card(failed);
    expect(html).toContain('>נשמר<');
    expect(html).toContain('אחת מתוך שלוש לא עברה');
    expect(html).toContain(TEACH_TEXT.undoChange);
    // Asked first; nothing is taken back on one press.
    const asking = card(failed, { confirmingUndo: true });
    expect(asking).toContain(TEACH_TEXT.undoAsk);
    expect(asking).toContain(`>${TEACH_TEXT.keep}<`);
  });

  it('a check that had nothing to run says so quietly', () => {
    const html = card(saved({ check: rawTeachCheck({ ran: 0, passed: 0, summary: 'אין לי שיחת בדיקה שנוגעת לשינוי הזה', details: [], lines: [] }) }));
    expect(html).toContain('אין לי שיחת בדיקה שנוגעת לשינוי הזה');
    expect(html).not.toContain(`>${TEACH_TEXT.undoChange}<`);
  });
});

describe('the card: taken back, or nothing to change', () => {
  it('a change that was taken back says the bot answers as before', () => {
    const undone = thread({
      state: 'undone',
      state_label: 'בוטל',
      needs_approval: false,
      can_undo: false,
      reply: 'ביטלתי את השינוי — הבוט חזר לענות כמו לפני',
      changes: [rawTeachChange({ status: 'undone', status_label: 'בוטל', can_undo: false })],
    });
    const html = card(undone);
    expect(html).toContain('>בוטל<');
    expect(html).toContain('הבוט חזר לענות כמו לפני');
    expect(html).toContain('מה בוטל');
    expect(html).not.toContain('>מאשר<');
    expect(composerShown(slotOf(undone))).toBe(true);
  });

  it('when the bot will not write something (a price), it says where that is fixed, and changes nothing', () => {
    const nothing = thread({
      state: 'nothing',
      state_label: 'לא שונה דבר',
      needs_approval: false,
      understood: '',
      changes: [],
      preview: null,
      conflicts: [],
      reply: 'מחיר אני לא כותב לידע של הבוט — הוא מגיע מכרטיס החוג.',
      notes: ['את המחיר מתקנים בכרטיס החוג, והבוט יקרא אותו משם.'],
    });
    const html = card(nothing);
    expect(html).toContain('מחיר אני לא כותב לידע של הבוט');
    expect(html).toContain('את המחיר מתקנים בכרטיס החוג');
    // Nothing is asked of him: the only button is the card's own "×".
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(`aria-label="${TEACH_TEXT.close}"`);
  });
});

describe('the whole screen around a card', () => {
  it('while a card waits for him: the card, the list — and one place to press', () => {
    const html = view({ slot: slotOf(thread()), history: history({ openId: 41 }) });
    expect(html).toContain('>מאשר<');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain(`<h2>${TEACH_TEXT.title}</h2>`);
    expect(html).toContain(TEACH_TEXT.historyTitle);
  });

  it('an earlier explanation opened from the list holds its place while it is read, and says so when it cannot be', () => {
    const opening = view({ slot: { kind: 'opening' } });
    expect(opening).toContain('aria-busy="true"');
    expect(opening).not.toContain('<textarea');
    const failed = view({ slot: { kind: 'openFailed', text: 'לא נמצא.' } });
    expect(failed).toContain(TEACH_TEXT.openFailed);
    expect(failed).toContain('נסה שוב');
    expect(failed).toContain('<textarea');
  });

  it('on a phone the box keeps clear of the floating button of the proposals', () => {
    expect(view({ fabUp: true })).toContain('data-fab=""');
    expect(view()).not.toContain('data-fab');
  });
});

describe('a server that does not have "ללמד" yet', () => {
  const html = view({ availability: 'unavailable' });

  it('says kindly that the screen will open after the next update — and nothing else', () => {
    expect(html).toContain(TEACH_TEXT.notBuiltTitle);
    expect(html).toContain('ייפתח לבד');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain(TEACH_TEXT.historyTitle);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(/404|405|שגיאה/);
  });

  it('a real failure of the first read is one sentence and "נסה שוב"', () => {
    const failed = view({ availability: 'failed', loadError: 'אין הרשאה' });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(TEACH_TEXT.listFailed);
    expect(failed).toContain('אין הרשאה');
    expect(failed).toContain('נסה שוב');
  });

  it('waiting for the first read is a grey shape of the screen', () => {
    const loading = view({ availability: 'loading' });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('<textarea');
  });
});
