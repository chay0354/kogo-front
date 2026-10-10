import { describe, expect, test } from 'vitest';

import type { WahubKnowledgeItem, WahubKnowledgeProposal } from '@/types/wahub';
import {
  DEFAULT_WEEKLY,
  KNOWLEDGE_TAB_KINDS,
  attachShadowReplies,
  belongsTo,
  completeWeekly,
  contactStatuses,
  diffChange,
  filterKnowledge,
  filterShadowReplies,
  formatChangeValue,
  groupKnowledgeByKind,
  israelWeekday,
  isStubModel,
  mergeShadowReplies,
  officeOpenNow,
  pendingCount,
  specialDayLine,
  splitSpecialDays,
  toolLabel,
  validityLine,
  validityState,
} from './bot';
import { makeContact, makeKnowledgeItem, makeMessage, makeProposal, makeShadowReply } from './testFixtures';

const item = makeKnowledgeItem;
const reply = makeShadowReply;
const proposal = (id: number, status: WahubKnowledgeProposal['status']) => makeProposal(id, { status, status_label: status, source_label: 'סריקה' });

// A Friday in Israel, 11:00.
const FRIDAY = new Date('2026-10-09T11:00:00+03:00');
// A Wednesday, 14:05 Israel time.
const WEDNESDAY = new Date('2026-10-07T14:05:00+03:00');

describe('the knowledge list', () => {
  test('groups by kind in the fixed order, every known kind present even when empty, inactive items last', () => {
    const groups = groupKnowledgeByKind([
      item(1, { kind: 'fact', title: 'ב', is_active: false }),
      item(2, { kind: 'fact', title: 'א' }),
      item(3, { kind: 'phrasing', kind_label: 'נוסח' }),
    ]);
    expect(groups.map((group) => group.kind)).toEqual(KNOWLEDGE_TAB_KINDS.map((def) => def.kind));
    const facts = groups.find((group) => group.kind === 'fact');
    expect(facts?.items.map((entry) => entry.id)).toEqual([2, 1]);
    expect(groups.find((group) => group.kind === 'special_day')).toBeUndefined();
  });

  test('a kind the screen does not know is appended under the server\'s label', () => {
    const groups = groupKnowledgeByKind([item(1, { kind: 'mystery' as never, kind_label: 'סוג חדש' })]);
    expect(groups[groups.length - 1]).toMatchObject({ kind: 'mystery', label: 'סוג חדש' });
  });

  test('filters by search (title, body, alias, scope), by kind and by scope, and hides inactive items unless asked', () => {
    const items = [
      item(1, { title: 'מסלול קבוע', body: 'אי אפשר להחליף ימים' }),
      item(2, { kind: 'alias', what_customer_writes: 'מרכז זמיר', means: 'כפר גנים', title: '' }),
      item(3, { title: 'ישן', is_active: false }),
      item(4, { title: 'ביגוד', scope: { level: 'branch', id: 'b1', label: 'מינץ' } }),
    ];
    expect(filterKnowledge(items, { search: 'זמיר' }).map((entry) => entry.id)).toEqual([2]);
    expect(filterKnowledge(items, { search: 'להחליף' }).map((entry) => entry.id)).toEqual([1]);
    expect(filterKnowledge(items, { search: 'מינץ' }).map((entry) => entry.id)).toEqual([4]);
    expect(filterKnowledge(items, { kind: 'alias' }).map((entry) => entry.id)).toEqual([2]);
    expect(filterKnowledge(items, { scopeLevel: 'branch' }).map((entry) => entry.id)).toEqual([4]);
    expect(filterKnowledge(items, {}).map((entry) => entry.id)).toEqual([1, 2, 4]);
    expect(filterKnowledge(items, { includeInactive: true }).map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });

  test('says where an item stands against today', () => {
    const today = '2026-10-10';
    expect(validityState(item(1), today)).toBe('always');
    expect(validityState(item(1, { valid_until: '2026-10-01' }), today)).toBe('expired');
    expect(validityState(item(1, { valid_from: '2026-11-01' }), today)).toBe('future');
    expect(validityState(item(1, { valid_from: '2026-10-01', valid_until: '2026-12-31' }), today)).toBe('current');
    expect(validityLine(item(1, { valid_until: '2026-10-01' }), today, FRIDAY)).toBe('פג תוקף ב-1.10');
    expect(validityLine(item(1, { valid_from: '2026-11-01' }), today, FRIDAY)).toBe('יחול מ-1.11');
    expect(validityLine(item(1), today, FRIDAY)).toBe('');
  });
});

describe('"איפה זה שייך"', () => {
  test('asks what it is first', () => {
    expect(belongsTo({})).toEqual({ target: 'ask', question: 'what' });
  });

  test('how the bot behaves or writes is a rule; a sentence is a phrasing; a flow is a topic', () => {
    expect(belongsTo({ what: 'behavior' })).toEqual({ target: 'kind', kind: 'behavior_rule' });
    expect(belongsTo({ what: 'style' })).toEqual({ target: 'kind', kind: 'style_rule' });
    expect(belongsTo({ what: 'phrasing' })).toEqual({ target: 'kind', kind: 'phrasing' });
    expect(belongsTo({ what: 'topic' })).toEqual({ target: 'kind', kind: 'topic' });
  });

  test('a price, an address or a discount is already in Kogo, with the card to edit', () => {
    expect(belongsTo({ what: 'info' })).toEqual({ target: 'ask', question: 'kogo' });
    const price = belongsTo({ what: 'info', kogo: 'price' });
    expect(price.target).toBe('kogo');
    if (price.target === 'kogo') {
      expect(price.fact.where).toBe('כרטיס החוג');
      expect(price.fact.href).toBe('/courses');
    }
    const address = belongsTo({ what: 'info', kogo: 'address' });
    if (address.target === 'kogo') expect(address.fact.href).toBe('/branches');
  });

  test('other information asks which kind, and lands on it', () => {
    expect(belongsTo({ what: 'info', kogo: 'none' })).toEqual({ target: 'ask', question: 'info' });
    expect(belongsTo({ what: 'info', kogo: 'none', info: 'contact' })).toEqual({ target: 'kind', kind: 'contact' });
    expect(belongsTo({ what: 'info', kogo: 'none', info: 'alias' })).toEqual({ target: 'kind', kind: 'alias' });
  });
});

describe('open right now, by the hours on screen', () => {
  const special = (overrides: Partial<WahubKnowledgeItem>) =>
    item(9, { kind: 'special_day', title: 'פסח', state: 'closed', date_from: '2026-10-07', date_to: '2026-10-08', ...overrides });

  test('knows the weekday in Israel', () => {
    expect(israelWeekday(FRIDAY)).toBe('fri');
    expect(israelWeekday(WEDNESDAY)).toBe('wed');
    // 23:30 UTC on Tuesday is already Wednesday 02:30 in Israel.
    expect(israelWeekday(new Date('2026-10-06T23:30:00Z'))).toBe('wed');
  });

  test('a weekday inside the hours is open until the closing time', () => {
    expect(officeOpenNow(DEFAULT_WEEKLY, [], WEDNESDAY)).toMatchObject({ open: true, by: 'weekly', label: 'פתוח עד 18:00' });
  });

  test('before the opening hour it is closed and says when it opens; after closing it says it closed', () => {
    expect(officeOpenNow(DEFAULT_WEEKLY, [], new Date('2026-10-07T09:00:00+03:00'))).toMatchObject({
      open: false,
      label: 'סגור · נפתח ב-10:30',
    });
    expect(officeOpenNow(DEFAULT_WEEKLY, [], new Date('2026-10-07T18:00:00+03:00'))).toMatchObject({
      open: false,
      label: 'סגור · נסגר ב-18:00',
    });
  });

  test('a closed day is closed all day, with the day\'s own message or the default', () => {
    expect(officeOpenNow(DEFAULT_WEEKLY, [], FRIDAY, 'סגור, נחזור ביום ראשון')).toMatchObject({
      open: false,
      label: 'סגור היום',
      message: 'סגור, נחזור ביום ראשון',
    });
    const weekly = completeWeekly({ ...DEFAULT_WEEKLY, fri: { open: false, from: '', to: '', message: 'שבת שלום' } });
    expect(officeOpenNow(weekly, [], FRIDAY, 'ברירת מחדל').message).toBe('שבת שלום');
  });

  test('a special closed day overrides the week', () => {
    const result = officeOpenNow(DEFAULT_WEEKLY, [special({ message: 'חג שמח' })], WEDNESDAY, 'ברירת מחדל');
    expect(result).toMatchObject({ open: false, by: 'special', label: 'סגור · פסח', message: 'חג שמח' });
    expect(result.special?.id).toBe(9);
  });

  test('a special day with other hours is open inside them only', () => {
    const day = special({ state: 'hours', hours_from: '10:00', hours_to: '13:00', title: 'ערב חג' });
    expect(officeOpenNow(DEFAULT_WEEKLY, [day], new Date('2026-10-07T11:00:00+03:00'))).toMatchObject({
      open: true,
      label: 'פתוח עד 13:00 · ערב חג',
    });
    expect(officeOpenNow(DEFAULT_WEEKLY, [day], WEDNESDAY)).toMatchObject({ open: false, label: 'סגור · ערב חג' });
  });

  test('quiet activity closes until its hour and then falls back to the week', () => {
    const day = special({ state: 'quiet', hours_to: '15:00', title: 'יום שקט' });
    expect(officeOpenNow(DEFAULT_WEEKLY, [day], WEDNESDAY)).toMatchObject({ open: false, label: 'פעילות שקטה עד 15:00 · יום שקט' });
    expect(officeOpenNow(DEFAULT_WEEKLY, [day], new Date('2026-10-07T16:00:00+03:00'))).toMatchObject({ open: true });
  });

  test('an inactive or out-of-range special day does not count; "open as usual" leaves the week in charge', () => {
    expect(officeOpenNow(DEFAULT_WEEKLY, [special({ is_active: false })], WEDNESDAY).open).toBe(true);
    expect(officeOpenNow(DEFAULT_WEEKLY, [special({ date_from: '2026-12-01', date_to: '2026-12-02' })], WEDNESDAY).open).toBe(true);
    expect(officeOpenNow(DEFAULT_WEEKLY, [special({ state: 'open' })], WEDNESDAY)).toMatchObject({ open: true, by: 'weekly' });
  });

  test('a missing day in the server\'s week is a closed day', () => {
    const weekly = completeWeekly({ sun: { open: true, from: '09:00', to: '12:00' } });
    expect(weekly.sat).toEqual({ open: false, from: '', to: '', message: '' });
    expect(weekly.sun).toEqual({ open: true, from: '09:00', to: '12:00', message: '' });
  });

  test('a special day reads as one line, and the list is cut into ahead and over', () => {
    expect(specialDayLine(special({}), FRIDAY)).toBe('7.10–8.10 · סגור');
    expect(specialDayLine(special({ state: 'hours', hours_from: '10:00', hours_to: '13:00', date_to: null }), FRIDAY)).toBe(
      '7.10 · שעות שונות 10:00–13:00',
    );
    expect(specialDayLine(special({ state: 'quiet', hours_to: '13:00', date_to: '2026-10-07' }), FRIDAY)).toBe('7.10 · פעילות שקטה עד 13:00');
    const { upcoming, past } = splitSpecialDays(
      [special({ id: 1, date_from: '2026-10-20', date_to: null }), special({ id: 2 }), special({ id: 3, date_from: '2026-10-09', date_to: '2026-10-11' })],
      '2026-10-09',
    );
    expect(upcoming.map((entry) => entry.id)).toEqual([3, 1]);
    expect(past.map((entry) => entry.id)).toEqual([2]);
  });
});

describe('shadow replies', () => {
  test('hang under the message they answer; the newer wins; a reply to a message not on screen is left out', () => {
    const messages = [makeMessage(1), makeMessage(2), makeMessage(3)];
    const map = attachShadowReplies(messages, [
      reply(10, { after_message_id: 1, created_at: '2026-10-10T10:00:00+03:00' }),
      reply(11, { after_message_id: 1, created_at: '2026-10-10T10:05:00+03:00' }),
      reply(12, { after_message_id: 3 }),
      reply(13, { after_message_id: 99 }),
      reply(14, { after_message_id: null }),
    ]);
    expect(map.get(1)?.id).toBe(11);
    expect(map.get(3)?.id).toBe(12);
    expect(map.has(2)).toBe(false);
    expect(map.size).toBe(2);
  });

  test('filter by the verdict', () => {
    const list = [reply(1), reply(2, { verdict: 'good' }), reply(3, { verdict: 'bad', verdict_note: 'טעות' })];
    expect(filterShadowReplies(list, 'awaiting').map((entry) => entry.id)).toEqual([1]);
    expect(filterShadowReplies(list, 'good').map((entry) => entry.id)).toEqual([2]);
    expect(filterShadowReplies(list, 'bad').map((entry) => entry.id)).toEqual([3]);
    expect(filterShadowReplies(list, 'all')).toHaveLength(3);
  });

  test('lists merge by id, newest first', () => {
    const merged = mergeShadowReplies([[reply(1), reply(2)], [reply(2, { verdict: 'good' }), reply(5)]]);
    expect(merged.map((entry) => entry.id)).toEqual([5, 2, 1]);
    expect(merged[1].verdict).toBe('good');
  });

  test('tools read in words; "stub" is a stand-in answer', () => {
    expect(toolLabel('find_courses')).toBe('חיפוש חוגים');
    expect(toolLabel({ name: 'office_hours_now' })).toBe('שעות המשרד עכשיו');
    expect(toolLabel('something_else')).toBe('something_else');
    expect(isStubModel('stub')).toBe(true);
    expect(isStubModel('claude-x')).toBe(false);
    expect(isStubModel(undefined)).toBe(false);
  });
});

describe('proposals', () => {
  test('the floating button counts the pending list when it has one, the summary otherwise, and nothing before either', () => {
    expect(pendingCount(undefined, undefined)).toBe(0);
    expect(pendingCount({ pending: 3 }, undefined)).toBe(3);
    expect(pendingCount({ pending: 3 }, [proposal(1, 'pending'), proposal(2, 'applied')])).toBe(1);
    expect(pendingCount({ pending: -1 }, undefined)).toBe(0);
  });

  test('a change reads before/after, only what differs on an update and everything on a new item', () => {
    const update = diffChange(
      { title: 'ישן', body: 'אותו דבר', when_to_say: 'if_asked', id: 4 },
      { title: 'חדש', body: 'אותו דבר', when_to_say: 'proactive', id: 4 },
    );
    expect(update).toEqual([
      { key: 'title', label: 'כותרת', before: 'ישן', after: 'חדש', changed: true },
      { key: 'when_to_say', label: 'מתי לומר', before: 'רק אם שואלים', after: 'מיוזמה כשרלוונטי', changed: true },
    ]);
    const created = diffChange(null, { kind: 'phrasing', title: 'אין קבוצה', is_active: true });
    expect(created.map((row) => [row.label, row.before, row.after])).toEqual([
      ['סוג', '—', 'phrasing'],
      ['כותרת', '—', 'אין קבוצה'],
      ['פעיל', '—', 'כן'],
    ]);
  });

  test('values read as words: a scope by its label, a list line by line, nothing as a dash', () => {
    expect(formatChangeValue({ level: 'branch', id: 'x', label: 'מינץ' })).toBe('מינץ');
    expect(formatChangeValue([{ kind: 'ask', text: 'באיזה סניף?' }, { kind: 'say', text: 'הנה' }])).toBe('ask – באיזה סניף?\nsay – הנה');
    expect(formatChangeValue(null)).toBe('—');
    expect(formatChangeValue(false)).toBe('לא');
  });
});

describe('the statuses of one conversation', () => {
  test('the bot answers: who answers is the bot, the person group is quiet, the window is open', () => {
    const contact = makeContact(1, {
      chat: { waiting_since: '2026-10-09T10:40:00+03:00', can_free_text: true, window_closes_at: '2026-10-10T09:00:00+03:00', unread_count: 2 },
      kogo: { outcome: 'not_found', outcome_label: 'לא נמצא במערכת' },
    });
    const result = contactStatuses(contact, FRIDAY, { count: 2, lastAt: '2026-10-09T10:50:00+03:00' });
    expect(result.primary).toEqual({ label: 'מי עונה', value: 'בוט', tone: 'neutral' });
    expect(result.groups.map((group) => group.title)).toEqual(['הבוט', 'הנציג', 'השיחה']);
    const bot = result.groups[0].rows;
    expect(bot[1]).toEqual({ label: 'תשובה ללקוח', value: 'הלקוח מחכה 20 דק׳', tone: 'warning' });
    expect(bot[2].value).toBe('2 הצעות · האחרונה לפני 10 דק׳');
    expect(result.groups[1].rows[0]).toEqual({ label: 'בקשת נציג', value: 'אין', tone: 'muted' });
    const conversation = result.groups[2].rows;
    expect(conversation[0]).toEqual({ label: 'לא נקראו', value: '2 הודעות', tone: 'warning' });
    expect(conversation[1]).toEqual({ label: 'חלון 24 שעות', value: 'פתוח עד 09:00', tone: 'success' });
    expect(conversation[3]).toEqual({ label: 'במערכת', value: 'לא נמצא במערכת', tone: 'neutral' });
  });

  test('a person took over and the customer asked for one: the bot is silent, the request is loud', () => {
    const contact = makeContact(1, {
      chat: { handled_by: 'human', needs_human: true, needs_human_reason: 'ביקש נציג', needs_human_at: '2026-10-09T10:55:00+03:00', can_free_text: false },
      followup: { status: 'waiting_us', status_label: 'לחזור אליו', is_due: true },
    });
    const result = contactStatuses(contact, FRIDAY);
    expect(result.primary.value).toBe('נציג');
    expect(result.groups[0].rows[0].value).toBe('שותק – נציג לקח את השיחה');
    expect(result.groups[0].rows).toHaveLength(2);
    expect(result.groups[1].rows[0]).toEqual({ label: 'בקשת נציג', value: 'ביקש נציג · לפני 5 דק׳', tone: 'danger' });
    expect(result.groups[2].rows[1]).toEqual({ label: 'חלון 24 שעות', value: 'נסגר – רק תבנית', tone: 'warning' });
    expect(result.groups[2].rows[2]).toEqual({ label: 'סימון מעקב', value: 'לחזור אליו', tone: 'danger' });
  });
});
