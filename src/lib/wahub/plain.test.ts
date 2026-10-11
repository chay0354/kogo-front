import { describe, expect, it } from 'vitest';

import { changeHeading, plainOfChange, plainOfProposal } from './plain';
import { proposalExcerpt, readRefineChange, refinePlaceholder, REFINE_START } from './refine';
import { makeProposal } from './testFixtures';

/**
 * The card the owner could not read (11.10): a new behaviour rule, shown as a
 * table of "מפתח: repeated_question / סוג: behavior_rule / מתי לומר…" with a
 * red column of dashes where "before" would be.
 */
const NEW_RULE = makeProposal(31, {
  source: 'reviewer',
  source_label: 'סריקה יזומה',
  title: 'לקוח שחוזר על שאלה',
  explanation: 'הלקוח שאל פעמיים על המחיר, והבוט ענה פעמיים את אותה תשובה כללית.',
  change: {
    action: 'create',
    item_id: null,
    kind: 'behavior_rule',
    before: null,
    after: {
      kind: 'behavior_rule',
      key: 'repeated_question',
      title: 'לקוח שחוזר על שאלה',
      body: 'אם הלקוח חוזר על אותה שאלה – התשובה הקודמת לא ענתה לו. עונים ישירות על השאלה.',
      when_to_say: 'internal',
      example_bad: 'כפי שציינתי, החוג מתקיים בימי שני.',
      example_good: 'החוג עולה 280 ₪ לחודש.',
    },
  },
  change_kind_label: 'כלל התנהגות',
});

const UPDATE = makeProposal(32, {
  title: 'לעדכן את מחיר חוג הקפוארה',
  explanation: 'נציגה ענתה מעל הבוט שהמחיר 280 ₪.',
  change: {
    action: 'update',
    item_id: 7,
    kind: 'fact',
    before: { title: 'מחיר חוג קפוארה', body: 'החוג עולה 250 ₪ לחודש.', when_to_say: 'if_asked', example_good: '' },
    after: { title: 'מחיר חוג קפוארה', body: 'החוג עולה 280 ₪ לחודש.', when_to_say: 'proactive', example_good: 'החוג עולה 280 ₪ לחודש.' },
  },
  change_kind_label: 'עובדה',
});

describe('a new item, in words', () => {
  const plain = plainOfProposal(NEW_RULE);

  it('is headed by what it is, says why, and gives the rule as one paragraph', () => {
    expect(plain.headline).toBe('לקוח שחוזר על שאלה');
    expect(plain.why).toBe('הלקוח שאל פעמיים על המחיר, והבוט ענה פעמיים את אותה תשובה כללית.');
    expect(plain.rule).toBe('אם הלקוח חוזר על אותה שאלה – התשובה הקודמת לא ענתה לו. עונים ישירות על השאלה.');
  });

  it('has no "before": nothing to show as "היה"', () => {
    expect(plain.isNew).toBe(true);
    expect(plain.rows).toEqual([]);
  });

  it('keeps the examples apart from the rule', () => {
    expect(plain.exampleBad).toBe('כפי שציינתי, החוג מתקיים בימי שני.');
    expect(plain.exampleGood).toBe('החוג עולה 280 ₪ לחודש.');
    expect(plain.rule).not.toContain('כפי שציינתי');
  });

  it('files the kind, the key and "when to say" under the technical details — in Hebrew, the code names beside them', () => {
    expect(plain.tech).toEqual([
      { key: 'kind', label: 'סוג', value: 'כלל התנהגות', code: 'behavior_rule' },
      { key: 'key', label: 'מפתח', value: '', code: 'repeated_question' },
      { key: 'when_to_say', label: 'מתי לומר', value: 'הנחיה פנימית' },
      { key: 'item', label: 'שם הרשומה', value: 'לקוח שחוזר על שאלה' },
    ]);
    // No code name anywhere a person reads first.
    for (const words of [plain.headline, plain.why, plain.rule]) {
      expect(words).not.toMatch(/behavior_rule|repeated_question|internal/);
    }
  });
});

describe('the server\'s own wording', () => {
  it('is used when it is sent: "מעכשיו הבוט…", the rule, why, and the labels', () => {
    const plain = plainOfProposal({
      ...NEW_RULE,
      plain: {
        headline: 'מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה',
        rule: 'כשלקוח שואל שוב את אותה שאלה, הבוט עונה עליה ישירות ולא חוזר על התשובה הקודמת.',
        why: 'לקוח שאל פעמיים על המחיר ולא קיבל תשובה.',
        example_bad: 'כפי שציינתי…',
        example_good: 'החוג עולה 280 ₪.',
        kind_label: 'כלל התנהגות',
        when_label: 'הנחיה פנימית',
        is_new: true,
      },
    });
    expect(plain.headline).toBe('מעכשיו הבוט עונה ישירות כשלקוח חוזר על שאלה');
    expect(plain.rule).toContain('עונה עליה ישירות');
    expect(plain.why).toBe('לקוח שאל פעמיים על המחיר ולא קיבל תשובה.');
    expect(plain.exampleBad).toBe('כפי שציינתי…');
    expect(plain.isNew).toBe(true);
    expect(plain.tech.find((row) => row.key === 'when_to_say')?.value).toBe('הנחיה פנימית');
  });

  it('a part it leaves empty falls back to the change itself', () => {
    const plain = plainOfProposal({ ...NEW_RULE, plain: { headline: 'מעכשיו הבוט עונה ישירות', rule: '', why: '' } });
    expect(plain.headline).toBe('מעכשיו הבוט עונה ישירות');
    expect(plain.rule).toContain('עונים ישירות על השאלה');
    expect(plain.why).toContain('הלקוח שאל פעמיים');
    // `is_new` was not said: read from the change.
    expect(plain.isNew).toBe(true);
  });

  it('`is_new` from the server is the last word', () => {
    expect(plainOfProposal({ ...UPDATE, plain: { is_new: true } }).rows).toEqual([]);
  });
});

describe('an update, in words', () => {
  const plain = plainOfProposal(UPDATE);

  it('shows "היה / יהיה" only for what the item says and what really changed', () => {
    expect(plain.isNew).toBe(false);
    expect(plain.rows).toEqual([{ key: 'body', label: 'תוכן', before: 'החוג עולה 250 ₪ לחודש.', after: 'החוג עולה 280 ₪ לחודש.' }]);
  });

  it('a change in how the item is filed is a technical detail, with what it was', () => {
    expect(plain.tech.find((row) => row.key === 'when_to_say')?.value).toBe('מיוזמה כשרלוונטי (היה: רק אם שואלים)');
    expect(plain.tech.find((row) => row.key === 'item')).toEqual({ key: 'item', label: 'רשומה', value: '#7 · מחיר חוג קפוארה' });
    expect(plain.rows.some((row) => row.key === 'when_to_say')).toBe(false);
  });

  it('an example that was added is with the examples, not among the rows', () => {
    expect(plain.exampleGood).toBe('החוג עולה 280 ₪ לחודש.');
    expect(plain.rows.some((row) => row.key === 'example_good')).toBe(false);
  });

  it('with nothing the item says changed, the rule itself is the paragraph', () => {
    const filed = plainOfProposal({
      ...UPDATE,
      change: { action: 'update', item_id: 7, kind: 'fact', before: { body: 'החוג עולה 280 ₪ לחודש.', when_to_say: 'if_asked' }, after: { body: 'החוג עולה 280 ₪ לחודש.', when_to_say: 'proactive' } },
    });
    expect(filed.rows).toEqual([]);
    expect(filed.rule).toBe('החוג עולה 280 ₪ לחודש.');
  });
});

describe('other changes', () => {
  it('an item switched off says so in a sentence', () => {
    const plain = plainOfChange(readRefineChange({ action: 'deactivate', title: 'רישום מוקדם', before: { title: 'רישום מוקדם', body: 'עד 31.8' }, after: null, applied: true })!);
    expect(plain.action).toBe('deactivate');
    expect(plain.rule).toBe('הרשומה "רישום מוקדם" כובתה. הבוט כבר לא משתמש בה.');
    expect(plain.rows).toEqual([]);
  });

  it('a change of the small chat: named after its item, and no "why" — the system\'s bubble has said it', () => {
    const plain = plainOfChange(readRefineChange({ proposal_id: 51, action: 'update', item_id: 7, kind_label: 'עובדה', title: 'מחיר חוג קפוארה', before: { body: '250' }, after: { body: '280' }, applied: true })!);
    expect(plain.headline).toBe('מחיר חוג קפוארה');
    expect(plain.why).toBe('');
    expect(plain.rows).toEqual([{ key: 'body', label: 'תוכן', before: '250', after: '280' }]);
    expect(plain.tech).toEqual([
      { key: 'kind', label: 'סוג', value: 'עובדה', code: undefined },
      { key: 'item', label: 'רשומה', value: '#7 · מחיר חוג קפוארה' },
    ]);
  });

  it('the server\'s wording of a change is used too — all but its "why", which the bubble above has said', () => {
    const plain = plainOfChange(
      readRefineChange({ action: 'create', title: 'לקוח שחוזר על שאלה', before: null, after: { body: 'עונים ישירות.' }, applied: true, plain: { headline: 'מעכשיו הבוט עונה ישירות', rule: 'הבוט עונה ישירות על שאלה שחוזרת.', why: 'הלקוחה שאלה פעמיים.', is_new: true } })!,
    );
    expect(plain.headline).toBe('מעכשיו הבוט עונה ישירות');
    expect(plain.rule).toBe('הבוט עונה ישירות על שאלה שחוזרת.');
    expect(plain.why).toBe('');
  });

  it('plain text on both sides is "היה / יהיה" of one row', () => {
    const plain = plainOfChange(readRefineChange({ action: 'update', title: 'נוסח סגירה', before: 'תודה שפנית אלינו', after: 'תודה!', applied: false })!);
    expect(plain.rows).toEqual([{ key: 'text', label: 'תוכן', before: 'תודה שפנית אלינו', after: 'תודה!' }]);
  });

  it('a link or an alias has no body: what it holds is said as lines', () => {
    const plain = plainOfProposal(
      makeProposal(40, { title: 'קישור להרשמה', change: { action: 'create', item_id: null, kind: 'link', before: null, after: { title: 'קישור להרשמה', url: 'https://example.test/signup', when: 'כשמבקשים להירשם' } } }),
    );
    expect(plain.rule).toBe('כתובת: https://example.test/signup\nמתי: כשמבקשים להירשם');
  });

  it('a change with nothing at all still has a headline', () => {
    expect(plainOfChange(readRefineChange({ action: 'update', before: null, after: null })!).headline).toBe('שינוי בידע של הבוט');
  });
});

describe('the heading over the change, and "דיוק" on a proposal', () => {
  it('"מה ישתנה" while it waits, "מה השתנה" once it is in the knowledge', () => {
    expect(changeHeading('waiting')).toBe('מה ישתנה');
    expect(changeHeading('applied')).toBe('מה השתנה');
    expect(changeHeading('undone')).toBe('מה בוטל');
    expect(changeHeading('rejected')).toBe('מה הוצע');
  });

  it('the small chat quotes the proposal: what the bot would do, and the change', () => {
    expect(proposalExcerpt(plainOfProposal(NEW_RULE))).toEqual([
      { id: null, who: 'system', label: 'ההצעה', text: 'לקוח שחוזר על שאלה' },
      { id: null, who: 'system', label: 'מה ישתנה', text: 'אם הלקוח חוזר על אותה שאלה – התשובה הקודמת לא ענתה לו. עונים ישירות על השאלה.' },
    ]);
    expect(proposalExcerpt(plainOfProposal(UPDATE))[1].text).toBe('תוכן: החוג עולה 280 ₪ לחודש.');
  });

  it('and asks what to change in it', () => {
    expect(refinePlaceholder(REFINE_START, true)).toBe('מה לשנות בהצעה?');
    expect(refinePlaceholder(REFINE_START)).toBe('מה לא היה טוב כאן?');
    expect(refinePlaceholder({ ...REFINE_START, needsAnswer: true }, true)).toBe('התשובה שלך…');
  });
});
