import { describe, expect, test } from 'vitest';

import { draftProblem, draftToWrite } from './KnowledgeEditor';

type Draft = Parameters<typeof draftToWrite>[0];

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    kind: 'fact',
    title: 'אפשר להישאר בשיעור?',
    body: 'לא. אפשר להיכנס קצת, והמדריך אומר מתי ללכת.',
    scopeLevel: 'business',
    scopeId: '',
    valid_from: '',
    valid_until: '',
    when_to_say: 'if_asked',
    example_good: '',
    example_bad: '',
    source_note: '',
    key: '',
    url: '',
    what_customer_writes: '',
    means: '',
    role: '',
    phone: '',
    when: '',
    how: '',
    verbatim: false,
    triggers: '',
    handoff_reason: '',
    tag: '',
    certainty: '',
    age: '',
    personality: '',
    voice: '',
    address_default: '',
    forbidden_phrases: '',
    steps: [],
    date_from: '',
    date_to: '',
    state: 'closed',
    hours_from: '',
    hours_to: '',
    message: '',
    ...overrides,
  };
}

describe('the knowledge form', () => {
  test('a fact is written with the columns flat, the scope as scope_level + scope_id, and its certainty', () => {
    expect(draftToWrite(draft({ certainty: 'unsure' }))).toEqual({
      kind: 'fact',
      title: 'אפשר להישאר בשיעור?',
      body: 'לא. אפשר להיכנס קצת, והמדריך אומר מתי ללכת.',
      scope_level: 'business',
      scope_id: null,
      valid_from: null,
      valid_until: null,
      when_to_say: 'if_asked',
      example_good: '',
      example_bad: '',
      source_note: '',
      certainty: 'unsure',
    });
    expect(draftProblem(draft())).toBe('');
  });

  test('a branch scope carries the branch id; without one it cannot be saved', () => {
    const body = draftToWrite(draft({ scopeLevel: 'branch', scopeId: 'b-1' }));
    expect(body.scope_level).toBe('branch');
    expect(body.scope_id).toBe('b-1');
    expect(draftProblem(draft({ scopeLevel: 'branch', scopeId: '' }))).toBe('בחרו על מי זה חל');
  });

  test('the kinds the server refuses without a body are refused here first', () => {
    expect(draftProblem(draft({ kind: 'behavior_rule', body: '' }))).toBe('חסר התוכן');
    expect(draftProblem(draft({ kind: 'topic', body: '' }))).toBe('חסר התוכן');
    expect(draftProblem(draft({ kind: 'contact', body: '' }))).toBe('');
  });

  test('an alias needs both sides and gets its title from them', () => {
    expect(draftProblem(draft({ kind: 'alias', title: '' }))).toBe('מה הלקוח כותב?');
    expect(draftProblem(draft({ kind: 'alias', title: '', what_customer_writes: 'מרכז זמיר' }))).toBe('למה הוא מתכוון?');
    const body = draftToWrite(draft({ kind: 'alias', title: '', what_customer_writes: ' מרכז זמיר ', means: 'כפר גנים' }));
    expect(body.title).toBe('מרכז זמיר ← כפר גנים');
    expect(body.what_customer_writes).toBe('מרכז זמיר');
    expect(body.means).toBe('כפר גנים');
  });

  test('a phrasing needs a key and its text; a link needs a full address', () => {
    expect(draftProblem(draft({ kind: 'phrasing', key: '' }))).toBe('לנוסח צריך מפתח (שם קצר באנגלית)');
    expect(draftProblem(draft({ kind: 'phrasing', key: 'voice_note', body: '' }))).toBe('חסר הטקסט של הנוסח');
    expect(draftProblem(draft({ kind: 'link', url: 'www.cogo.co.il' }))).toBe('הקישור צריך להתחיל ב-https://');
    expect(draftToWrite(draft({ kind: 'link', key: 'site', url: 'https://cogo.co.il', when: 'כשמבקשים את האתר' }))).toMatchObject({
      key: 'site',
      url: 'https://cogo.co.il',
      when: 'כשמבקשים את האתר',
    });
    expect(draftToWrite(draft({ kind: 'phrasing', key: 'voice_note', verbatim: true, when: 'הודעה קולית' }))).toMatchObject({ verbatim: true, when: 'הודעה קולית' });
  });

  test('a topic keeps only the steps that have text, its trigger lines, and where it hands off', () => {
    const body = draftToWrite(
      draft({
        kind: 'topic',
        triggers: 'אני רוצה לבטל\n\n להפסיק את החוג ',
        handoff_reason: 'תלונה',
        steps: [
          { kind: 'ask', text: 'באיזה סניף?', condition: '', next: ' שלב 2 ' },
          { kind: 'say', text: '   ' },
          { kind: 'handoff', text: 'מעבירה לנציג', condition: 'ענה על סניף' },
        ],
      }),
    );
    expect(body.steps).toEqual([
      { kind: 'ask', text: 'באיזה סניף?', next: 'שלב 2' },
      { kind: 'handoff', text: 'מעבירה לנציג', condition: 'ענה על סניף' },
    ]);
    expect(body.triggers).toEqual(['אני רוצה לבטל', 'להפסיק את החוג']);
    expect(body.handoff_reason).toBe('תלונה');
  });

  test('a special day needs a date and, with other hours, the hours; its hours are dropped when it is simply closed', () => {
    expect(draftProblem(draft({ kind: 'special_day', date_from: '' }))).toBe('חסר תאריך');
    expect(draftProblem(draft({ kind: 'special_day', date_from: '2026-04-21', date_to: '2026-04-20' }))).toBe('תאריך הסיום לפני ההתחלה');
    expect(draftProblem(draft({ kind: 'special_day', date_from: '2026-04-21', state: 'hours' }))).toBe('חסרות השעות');
    expect(draftProblem(draft({ kind: 'special_day', date_from: '2026-04-21', state: 'quiet' }))).toBe('עד איזו שעה?');
    const closed = draftToWrite(draft({ kind: 'special_day', date_from: '2026-04-21', date_to: '2026-04-28', state: 'closed', hours_from: '10:00', hours_to: '13:00', message: 'חג שמח' }));
    expect(closed).toMatchObject({ date_from: '2026-04-21', date_to: '2026-04-28', state: 'closed', hours_from: null, hours_to: null, message: 'חג שמח' });
    const hours = draftToWrite(draft({ kind: 'special_day', date_from: '2026-05-11', state: 'hours', hours_from: '10:00', hours_to: '13:00' }));
    expect(hours).toMatchObject({ date_to: null, hours_from: '10:00', hours_to: '13:00' });
  });

  test('validity dates must be in order', () => {
    expect(draftProblem(draft({ valid_from: '2026-11-01', valid_until: '2026-10-01' }))).toBe('תאריך "עד" לפני "מתאריך"');
    expect(draftToWrite(draft({ valid_from: '2026-10-01', valid_until: '2026-12-31' }))).toMatchObject({ valid_from: '2026-10-01', valid_until: '2026-12-31' });
  });

  test('a contact carries its name (the title) and the four referral fields the server keeps', () => {
    expect(draftToWrite(draft({ kind: 'contact', title: 'גלעד', role: 'אירועים', phone: '050-0000000', when: 'ימי הולדת', how: 'מסירת מספר' }))).toMatchObject({
      name: 'גלעד',
      role: 'אירועים',
      phone: '050-0000000',
      when: 'ימי הולדת',
      how: 'מסירת מספר',
    });
  });

  test('the profile is written with its own fields; forbidden phrases one per line', () => {
    expect(draftToWrite(draft({ kind: 'profile', title: 'דנה', age: '25', voice: 'נקבה', forbidden_phrases: 'אשמח לעזור!\nבהצלחה' }))).toMatchObject({
      name: 'דנה',
      age: '25',
      voice: 'נקבה',
      forbidden_phrases: ['אשמח לעזור!', 'בהצלחה'],
    });
  });
});
