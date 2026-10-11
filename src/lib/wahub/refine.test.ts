import { describe, expect, it } from 'vitest';

import {
  AUTO_APPLIED_NOTE,
  NO_SELECTION,
  REFINE_START,
  REFINE_TEXT,
  autoAppliedProposals,
  changeActionLabel,
  changeKey,
  changeRows,
  changeState,
  decidedByPerson,
  excerptLine,
  excerptOf,
  excerptPreview,
  excerptTitle,
  isAutoApplied,
  isUndoneProposal,
  pressMessage,
  readRefineChange,
  readRefineThread,
  readRefineThreads,
  refinePlaceholder,
  refineReducer,
  selectableIds,
  selectedInOrder,
  selectionLabel,
  shadowExcerpt,
  shadowMessageIds,
  startSelection,
  threadTitle,
  undoPlan,
  type RefineChatState,
} from './refine';
import { makeMessage, makeProposal, makeShadowReply } from './testFixtures';

const ORDER = [11, 12, 13, 14, 15, 16];

// ---------------------------------------------------------------------------
// Marking messages
// ---------------------------------------------------------------------------

describe('marking messages for "דיוק"', () => {
  it('nothing is marked until "דיוק" is pressed, and a press on a bubble then does nothing', () => {
    expect(NO_SELECTION.active).toBe(false);
    expect(pressMessage(NO_SELECTION, 12, ORDER)).toBe(NO_SELECTION);
  });

  it('"דיוק" starts with nothing marked; a press marks, a second press unmarks', () => {
    let selection = startSelection();
    expect(selection.active).toBe(true);
    expect(selection.ids.size).toBe(0);

    selection = pressMessage(selection, 12, ORDER);
    expect([...selection.ids]).toEqual([12]);
    selection = pressMessage(selection, 14, ORDER);
    expect(selectedInOrder(selection, ORDER)).toEqual([12, 14]);

    selection = pressMessage(selection, 12, ORDER);
    expect(selectedInOrder(selection, ORDER)).toEqual([14]);
    expect(selection.active).toBe(true);
  });

  it('Shift marks the whole stretch from the last bubble marked to this one', () => {
    let selection = pressMessage(startSelection(), 12, ORDER);
    selection = pressMessage(selection, 15, ORDER, true);
    expect(selectedInOrder(selection, ORDER)).toEqual([12, 13, 14, 15]);
  });

  it('the stretch works upwards too, and keeps what was already marked', () => {
    let selection = pressMessage(startSelection(), 16, ORDER);
    selection = pressMessage(selection, 14, ORDER);
    selection = pressMessage(selection, 11, ORDER, true);
    expect(selectedInOrder(selection, ORDER)).toEqual([11, 12, 13, 14, 16]);
  });

  it('Shift with nothing marked before is an ordinary press', () => {
    const selection = pressMessage(startSelection(), 13, ORDER, true);
    expect(selectedInOrder(selection, ORDER)).toEqual([13]);
  });

  it('after a bubble is unmarked, Shift does not measure from it', () => {
    let selection = pressMessage(startSelection(), 12, ORDER);
    selection = pressMessage(selection, 12, ORDER);
    selection = pressMessage(selection, 15, ORDER, true);
    expect(selectedInOrder(selection, ORDER)).toEqual([15]);
  });

  it('what is marked is handed over in the conversation\'s order, whatever order it was pressed in', () => {
    let selection = startSelection();
    for (const id of [15, 11, 13]) selection = pressMessage(selection, id, ORDER);
    expect(selectedInOrder(selection, ORDER)).toEqual([11, 13, 15]);
  });

  it('a bubble still on its way (an id below zero) cannot be marked', () => {
    const messages = [makeMessage(11), makeMessage(-3, { local_state: 'sending' }), makeMessage(12)];
    const order = selectableIds(messages);
    expect(order).toEqual([11, 12]);
    const selection = pressMessage(startSelection(), -3, order);
    expect(selection.ids.size).toBe(0);
  });

  it('"ביטול" is the empty selection: nothing marked, the mode off', () => {
    const selection = pressMessage(startSelection(), 12, ORDER);
    expect(selection.ids.size).toBe(1);
    expect(NO_SELECTION.ids.size).toBe(0);
    expect(NO_SELECTION.anchor).toBeNull();
  });

  it('the bar says how many are marked', () => {
    expect(selectionLabel(0)).toBe('בחרו הודעות');
    expect(selectionLabel(1)).toBe('נבחרה הודעה אחת');
    expect(selectionLabel(4)).toBe('נבחרו 4 הודעות');
  });
});

// ---------------------------------------------------------------------------
// The marked piece of the conversation
// ---------------------------------------------------------------------------

describe('the marked piece of the conversation', () => {
  const messages = [
    makeMessage(1, { text: 'כמה עולה חוג קפוארה?' }),
    makeMessage(2, { direction: 'out', sender: 'bot', sender_label: 'בוט', text: 'אבדוק ואחזור אליך.' }),
    makeMessage(3, { direction: 'out', sender: 'bot', new_bot: true, text: 'החוג עולה 280 ₪ לחודש.' }),
    makeMessage(4, { direction: 'out', sender: 'office', sender_name: 'שלי', text: 'היי, מדברת שלי' }),
    makeMessage(5, { message_type: 'voice', text: '', has_media: true, media_url: 'demo/5.webm', transcript: 'אפשר לבוא מחר?' }),
    makeMessage(6, { message_type: 'image', text: '', has_media: true, media_url: 'demo/6.jpg' }),
  ];

  it('quotes the marked messages in the conversation\'s order, each with who said it', () => {
    const lines = excerptOf(messages, [4, 1, 2]);
    expect(lines.map((line) => line.id)).toEqual([1, 2, 4]);
    expect(lines.map((line) => line.label)).toEqual(['הלקוח', 'הבוט', 'משרד · שלי']);
    expect(lines[0].text).toBe('כמה עולה חוג קפוארה?');
  });

  it('tells the new bot from the old one', () => {
    expect(excerptLine(messages[2])).toMatchObject({ who: 'new_bot', label: 'בוט חדש' });
    expect(excerptLine(messages[1])).toMatchObject({ who: 'bot', label: 'הבוט' });
  });

  it('a recording says its transcript, a picture says it is one — never a file path', () => {
    expect(excerptLine(messages[4]).text).toBe('🎤 הודעה קולית “אפשר לבוא מחר?”');
    expect(excerptLine(messages[5]).text).toBe('🖼️ תמונה');
  });

  it('an id that is not on screen is left out', () => {
    expect(excerptOf(messages, [1, 99]).map((line) => line.id)).toEqual([1]);
  });

  it('folded: a title with the count, and one line', () => {
    expect(excerptTitle(1)).toBe('הודעה אחת שנבחרה');
    expect(excerptTitle(3)).toBe('3 הודעות שנבחרו');
    expect(excerptPreview(excerptOf(messages, [1]))).toBe('כמה עולה חוג קפוארה?');
    expect(excerptPreview([{ id: 1, who: 'customer', label: 'הלקוח', text: 'א'.repeat(200) }]).length).toBe(90);
    expect(excerptPreview([])).toBe('');
  });

  it('"לתקן" on a shadow reply: the customer\'s message, the old bot\'s answer, and the answer being fixed', () => {
    const reply = makeShadowReply(31, {
      after_message_id: 1,
      text: 'החוג עולה 250 ₪.',
      old_bot_reply: { text: 'אבדוק ואחזור אליך.', sent_at: null },
    });
    const { messageIds, lines } = shadowExcerpt(reply, messages);
    expect(messageIds).toEqual([1]);
    expect(lines.map((line) => line.who)).toEqual(['customer', 'bot', 'shadow']);
    expect(lines[0].text).toBe('כמה עולה חוג קפוארה?');
    expect(lines[2]).toMatchObject({ id: null, label: 'הבוט החדש היה עונה', text: 'החוג עולה 250 ₪.' });
  });

  it('a reply to a burst names every message it covers', () => {
    expect(shadowMessageIds(makeShadowReply(31, { after_message_id: 5, covers_message_ids: [4, 5] }))).toEqual([4, 5]);
    expect(shadowMessageIds(makeShadowReply(31, { after_message_id: null }))).toEqual([]);
  });

  it('away from the conversation (the bot tab) the customer\'s words come from the reply itself', () => {
    const reply = makeShadowReply(31, { after_message_id: 77, customer_text: 'יש חוג בשבת?', text: 'כן.' });
    const { messageIds, lines } = shadowExcerpt(reply);
    expect(messageIds).toEqual([77]);
    expect(lines[0]).toMatchObject({ id: 77, who: 'customer', text: 'יש חוג בשבת?' });
    expect(lines[lines.length - 1].who).toBe('shadow');
  });
});

// ---------------------------------------------------------------------------
// Reading the server
// ---------------------------------------------------------------------------

const CHANGE = {
  proposal_id: 51,
  action: 'update',
  item_id: 7,
  kind_label: 'עובדה',
  title: 'מחיר חוג קפוארה',
  before: { body: 'החוג עולה 250 ₪ לחודש.' },
  after: { body: 'החוג עולה 280 ₪ לחודש.' },
  applied: true,
};

const ANSWER = {
  thread: 9,
  status: 'open',
  reply: 'הבנתי: המחיר שהבוט אמר לא נכון. שיניתי: עדכנתי את מחיר חוג הקפוארה ל-280 ₪.',
  needs_answer: false,
  changes: [CHANGE],
  turns: [
    { role: 'operator', text: 'המחיר לא נכון, זה 280', changes: [], created_at: '2026-10-11T13:00:00+03:00' },
    { role: 'system', text: 'הבנתי: המחיר שהבוט אמר לא נכון. שיניתי: עדכנתי את מחיר חוג הקפוארה ל-280 ₪.', changes: [CHANGE], created_at: '2026-10-11T13:00:20+03:00' },
  ],
};

describe('reading the server\'s answer', () => {
  it('the answer to POST refine/, as the contract writes it', () => {
    const thread = readRefineThread(ANSWER)!;
    expect(thread.id).toBe(9);
    expect(thread.status).toBe('open');
    expect(thread.needs_answer).toBe(false);
    expect(thread.reply).toContain('הבנתי');
    expect(thread.turns.map((turn) => turn.role)).toEqual(['operator', 'system']);
    expect(thread.changes).toHaveLength(1);
    expect(thread.changes[0]).toMatchObject({ proposal_id: 51, action: 'update', item_id: 7, kind_label: 'עובדה', applied: true, undone: false });
  });

  it('`thread` may be the thread itself; a row of the list carries its own id', () => {
    const nested = readRefineThread({ ...ANSWER, thread: { id: 9, contact: 12, message_ids: [3, 4], created_at: '2026-10-11T13:00:00+03:00' } })!;
    expect(nested).toMatchObject({ id: 9, contact_id: 12, message_ids: [3, 4] });
    const row = readRefineThread({ id: 4, contact: 12, message_ids: [1], status: 'done', turns: ANSWER.turns })!;
    expect(row).toMatchObject({ id: 4, status: 'done', contact_id: 12 });
    // A row with turns and no `changes` of its own: where its last answer left them.
    expect(row.changes).toHaveLength(1);
    expect(row.reply).toContain('הבנתי');
  });

  it('something that is not a thread is not read as one', () => {
    expect(readRefineThread(null)).toBeNull();
    expect(readRefineThread({ detail: 'ok' })).toBeNull();
    expect(readRefineThread('<html>')).toBeNull();
  });

  it('the list: plain or paged, newest first', () => {
    const rows = [
      { id: 1, created_at: '2026-10-10T10:00:00+03:00', turns: [] },
      { id: 2, created_at: '2026-10-11T10:00:00+03:00', turns: [] },
    ];
    expect(readRefineThreads(rows).map((thread) => thread.id)).toEqual([2, 1]);
    expect(readRefineThreads({ count: 2, results: rows }).map((thread) => thread.id)).toEqual([2, 1]);
    expect(readRefineThreads({ detail: 'x' })).toEqual([]);
  });

  it('an earlier thread is named by what the operator first wrote', () => {
    expect(threadTitle(readRefineThread(ANSWER)!)).toBe('המחיר לא נכון, זה 280');
    expect(threadTitle({ turns: [], reply: '' })).toBe('דיוק');
  });

  it('a change: not applied when the server does not say so; "בוטל" when it does', () => {
    expect(readRefineChange({ ...CHANGE, applied: false })).toMatchObject({ applied: false, undone: false });
    expect(readRefineChange({ ...CHANGE, undone: true })).toMatchObject({ applied: false, undone: true });
    expect(readRefineChange({ ...CHANGE, status_label: 'בוטל' })).toMatchObject({ applied: false, undone: true });
    expect(readRefineChange({ action: 'create', kind: 'fact', after: { title: 'חניה', body: 'יש חניה ברחוב.' } })).toMatchObject({
      action: 'create',
      title: 'חניה',
      proposal_id: null,
      applied: false,
    });
    expect(readRefineChange('x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A change card
// ---------------------------------------------------------------------------

describe('a change card', () => {
  const change = readRefineChange(CHANGE)!;

  it('says what was done and where it stands', () => {
    expect(changeActionLabel('create')).toBe('רשומה חדשה');
    expect(changeActionLabel('update')).toBe('עדכון רשומה');
    expect(changeActionLabel('deactivate')).toBe('רשומה כובתה');
    expect(changeState(change)).toBe('applied');
    expect(changeState({ ...change, applied: false })).toBe('waiting');
    expect(changeState({ ...change, applied: false, undone: true })).toBe('undone');
  });

  it('before and after, by field, in words', () => {
    expect(changeRows(change)).toEqual([
      { key: 'body', label: 'תוכן', before: 'החוג עולה 250 ₪ לחודש.', after: 'החוג עולה 280 ₪ לחודש.', changed: true },
    ]);
  });

  it('a new item: every field written, nothing before', () => {
    const rows = changeRows(readRefineChange({ action: 'create', before: null, after: { title: 'חניה', body: 'יש חניה ברחוב.' } })!);
    expect(rows.map((row) => [row.label, row.before, row.after])).toEqual([
      ['כותרת', '—', 'חניה'],
      ['תוכן', '—', 'יש חניה ברחוב.'],
    ]);
  });

  it('an item switched off with nothing else said is "פעיל: כן ← לא"', () => {
    expect(changeRows(readRefineChange({ action: 'deactivate', before: { title: 'רישום מוקדם' }, after: null })!)).toEqual([
      { key: 'is_active', label: 'פעיל', before: 'כן', after: 'לא', changed: true },
    ]);
  });

  it('plain text on either side is one row', () => {
    expect(changeRows(readRefineChange({ action: 'update', before: 'ישן', after: 'חדש' })!)).toEqual([
      { key: 'text', label: 'תוכן', before: 'ישן', after: 'חדש', changed: true },
    ]);
  });

  it('a card is told from the others by its proposal, or by its place', () => {
    expect(changeKey(change, 0)).toBe('p51');
    expect(changeKey({ proposal_id: null }, 2)).toBe('i2');
  });

  it('"בטל": one applied change takes the thread\'s own undo; one of several takes its own proposal\'s', () => {
    const other = { ...change, proposal_id: 52 };
    expect(undoPlan([change], 0)).toEqual({ via: 'thread' });
    expect(undoPlan([change, other], 1)).toEqual({ via: 'proposal', proposalId: 52 });
    // The other one was already taken back: this is now the only applied change.
    expect(undoPlan([change, { ...other, applied: false, undone: true }], 0)).toEqual({ via: 'thread' });
    // Several applied, and this card has no proposal to name: only the whole thread can go back.
    expect(undoPlan([{ ...change, proposal_id: null }, other], 0)).toEqual({ via: 'thread' });
    // Nothing to take back.
    expect(undoPlan([{ ...change, applied: false }], 0)).toBeNull();
    expect(undoPlan([change], 3)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The small chat
// ---------------------------------------------------------------------------

describe('where the small chat stands', () => {
  const answered = (state: RefineChatState = REFINE_START) =>
    refineReducer(refineReducer(state, { type: 'sending', text: 'המחיר לא נכון, זה 280' }), {
      type: 'answered',
      thread: readRefineThread(ANSWER)!,
    });

  it('starts empty, asking what was wrong', () => {
    expect(REFINE_START.phase).toBe('idle');
    expect(refinePlaceholder(REFINE_START)).toBe('מה לא היה טוב כאן?');
  });

  it('a line typed shows at once, and the system is thinking', () => {
    const state = refineReducer(REFINE_START, { type: 'sending', text: 'המחיר לא נכון' });
    expect(state.phase).toBe('thinking');
    expect(state.bubbles).toEqual([{ key: 'p0', role: 'operator', text: 'המחיר לא נכון', pending: true }]);
    expect(REFINE_TEXT.thinking).toBe('המערכת חושבת…');
  });

  it('the answer: the turns as the server holds them, the changes, and no question', () => {
    const state = answered();
    expect(state.phase).toBe('idle');
    expect(state.threadId).toBe(9);
    expect(state.bubbles.map((bubble) => bubble.role)).toEqual(['operator', 'system']);
    expect(state.bubbles.every((bubble) => !bubble.pending)).toBe(true);
    expect(state.bubbles[1].text).toContain('שיניתי');
    expect(state.changes).toHaveLength(1);
    expect(state.needsAnswer).toBe(false);
    expect(refinePlaceholder(state)).toBe('רוצים לדייק עוד? כתבו כאן…');
  });

  it('a question: nothing is applied, and the box asks for the answer', () => {
    const thread = readRefineThread({
      thread: 9,
      status: 'open',
      reply: 'לאיזה סניף הכוונה – רמת גן או יהוד?',
      needs_answer: true,
      changes: [{ ...CHANGE, applied: false }],
      turns: [],
    })!;
    const state = refineReducer(refineReducer(REFINE_START, { type: 'sending', text: 'המחיר לא נכון' }), { type: 'answered', thread });
    expect(state.needsAnswer).toBe(true);
    expect(state.changes[0].applied).toBe(false);
    expect(refinePlaceholder(state)).toBe('התשובה שלך…');
    // The server sent no turns: what she wrote is not wiped, and the question stands after it.
    expect(state.bubbles.map((bubble) => [bubble.role, bubble.text])).toEqual([
      ['operator', 'המחיר לא נכון'],
      ['system', 'לאיזה סניף הכוונה – רמת גן או יהוד?'],
    ]);
  });

  it('a failure: her bubble does not stay as if it were sent, and the reason is said', () => {
    const state = refineReducer(refineReducer(REFINE_START, { type: 'sending', text: 'המחיר לא נכון' }), { type: 'failed', error: 'אין הרשאה' });
    expect(state.phase).toBe('idle');
    expect(state.bubbles).toEqual([]);
    expect(state.error).toBe('אין הרשאה');
  });

  it('a server without refine/: "עוד לא זמין", not an error', () => {
    const state = refineReducer(refineReducer(REFINE_START, { type: 'sending', text: 'x' }), { type: 'unavailable' });
    expect(state.phase).toBe('unavailable');
    expect(state.error).toBe('');
    expect(state.bubbles).toEqual([]);
    expect(REFINE_TEXT.notBuiltTitle).toBe('הדיוק עוד לא זמין');
    // "בדקו שוב" found the server: the chat is usable again.
    expect(refineReducer(state, { type: 'available' }).phase).toBe('idle');
    expect(refineReducer(REFINE_START, { type: 'available' })).toBe(REFINE_START);
  });

  it('"בטל": the card is marked "בוטל" — also when the server only says "not applied"', () => {
    const before = answered();
    const during = refineReducer(before, { type: 'undoing', key: 'p51' });
    expect(during.undoing).toBe('p51');

    const bare = refineReducer(during, { type: 'undone', keys: 'all', thread: null });
    expect(bare.undoing).toBeNull();
    expect(changeState(bare.changes[0])).toBe('undone');

    const said = readRefineThread({ ...ANSWER, changes: [{ ...CHANGE, applied: false }] })!;
    expect(changeState(refineReducer(during, { type: 'undone', keys: 'all', thread: said }).changes[0])).toBe('undone');

    // A server that answers with no cards at all does not make them vanish from the screen.
    const none = readRefineThread({ ...ANSWER, changes: [] })!;
    const kept = refineReducer(during, { type: 'undone', keys: 'all', thread: none });
    expect(kept.changes).toHaveLength(1);
    expect(changeState(kept.changes[0])).toBe('undone');
  });

  it('"בטל" on one card of several leaves the others as they were', () => {
    const two = { ...answered(), changes: [readRefineChange(CHANGE)!, readRefineChange({ ...CHANGE, proposal_id: 52 })!] };
    const state = refineReducer(refineReducer(two, { type: 'undoing', key: 'p52' }), { type: 'undone', keys: ['p52'], thread: null });
    expect(state.changes.map(changeState)).toEqual(['applied', 'undone']);
  });

  it('a card taken back earlier stays "בוטל" when the server\'s next answer only says "not applied"', () => {
    const two = { ...answered(), changes: [readRefineChange(CHANGE)!, readRefineChange({ ...CHANGE, proposal_id: 52 })!] };
    // The second card is taken back by its own proposal…
    const one = refineReducer(refineReducer(two, { type: 'undoing', key: 'p52' }), { type: 'undone', keys: ['p52'], thread: null });
    // …then the first, with the thread's undo, and the server answers with both as "not applied".
    const said = readRefineThread({ ...ANSWER, changes: [{ ...CHANGE, applied: false }, { ...CHANGE, proposal_id: 52, applied: false }] })!;
    const both = refineReducer(refineReducer(one, { type: 'undoing', key: 'p51' }), { type: 'undone', keys: 'all', thread: said });
    expect(both.changes.map(changeState)).toEqual(['undone', 'undone']);
    // A later answer that applies the same proposal again is believed.
    const again = readRefineThread({ ...ANSWER, changes: [{ ...CHANGE, applied: true }, { ...CHANGE, proposal_id: 52, applied: false }] })!;
    expect(refineReducer(both, { type: 'answered', thread: again }).changes.map(changeState)).toEqual(['applied', 'undone']);
  });

  it('"בטל" that failed: the card stays applied and the reason is said', () => {
    const state = refineReducer(refineReducer(answered(), { type: 'undoing', key: 'p51' }), { type: 'undoFailed', error: 'הביטול לא נשמר' });
    expect(state.undoing).toBeNull();
    expect(changeState(state.changes[0])).toBe('applied');
    expect(state.error).toBe('הביטול לא נשמר');
  });

  it('an earlier thread opened: its own turns, changes and marked messages', () => {
    const earlier = readRefineThread({ ...ANSWER, thread: { id: 4, message_ids: [1, 2] } })!;
    const state = refineReducer(refineReducer(answered(), { type: 'loading' }), { type: 'opened', thread: earlier });
    expect(state.threadId).toBe(4);
    expect(state.openedMessageIds).toEqual([1, 2]);
    expect(state.phase).toBe('idle');
    // "דיוק חדש על מה שסימנתי" starts clean.
    expect(refineReducer(state, { type: 'reset' })).toEqual(REFINE_START);
  });
});

// ---------------------------------------------------------------------------
// "עודכן לבד"
// ---------------------------------------------------------------------------

describe('proposals applied without a press', () => {
  const auto = makeProposal(1, { status: 'applied', decision_note: AUTO_APPLIED_NOTE, decided_at: '2026-10-11T09:00:00+03:00' });
  const newer = makeProposal(2, { status: 'approved', decision_note: `${AUTO_APPLIED_NOTE} (דיוק)`, decided_at: '2026-10-11T11:00:00+03:00' });
  const byHand = makeProposal(3, { status: 'applied', decision_note: 'נראה טוב', decided_by_name: 'דור', decided_at: '2026-10-11T12:00:00+03:00' });
  const waiting = makeProposal(4);
  const rejected = makeProposal(5, { status: 'rejected', decision_note: 'לא נכון' });
  const flagged = makeProposal(6, { status: 'undone', status_label: 'בוטל', decision_note: 'בוטל', auto_applied: true, decided_at: '2026-10-11T10:00:00+03:00' });

  it('are told by the server\'s note on the decision, or by its flag', () => {
    expect(AUTO_APPLIED_NOTE).toBe('אושר אוטומטית');
    expect(isAutoApplied(auto)).toBe(true);
    expect(isAutoApplied(newer)).toBe(true);
    expect(isAutoApplied(flagged)).toBe(true);
    expect(isAutoApplied(byHand)).toBe(false);
    expect(isAutoApplied(waiting)).toBe(false);
    expect(isAutoApplied(rejected)).toBe(false);
    // The flag, when the server sends it, is the last word.
    expect(isAutoApplied({ ...auto, auto_applied: false })).toBe(false);
  });

  it('the list is newest first, and one that was taken back stays on it, marked', () => {
    const list = autoAppliedProposals([auto, byHand, waiting, newer, rejected, flagged]);
    expect(list.map((proposal) => proposal.id)).toEqual([2, 6, 1]);
    expect(isUndoneProposal(flagged)).toBe(true);
    expect(isUndoneProposal(auto)).toBe(false);
  });

  it('everything else is a person\'s to decide', () => {
    expect(decidedByPerson([auto, byHand, waiting, newer, rejected, flagged]).map((proposal) => proposal.id)).toEqual([3, 4, 5]);
  });
});
