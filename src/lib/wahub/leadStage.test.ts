import { describe, expect, it } from 'vitest';
import type { WahubLead } from '@/types/wahub';
import {
  LEADS_TWO_PANE_FROM,
  defaultStage,
  findStage,
  knownHeadline,
  leadActOf,
  leadDaysText,
  leadOf,
  leadStageLabel,
  leadTone,
  oldestText,
  parseStage,
  readLeadBoard,
  showsInList,
  stageRows,
  temperatureLabel,
} from './leadStage';
import { makeContact } from './testFixtures';

const NOW = new Date('2026-10-11T12:00:00+03:00');

function lead(overrides: Partial<WahubLead> = {}): WahubLead {
  return {
    stage: 'answered_silent',
    stage_label: 'קיבל תשובה ולא נרשם',
    group: 'act',
    since: '2026-10-07T10:00:00+03:00',
    days: 4,
    reason: 'שאל על קפוארה בראש העין לפני 4 ימים. רק הבוט ענה. לא נרשם.',
    next_step: 'להתקשר ולהציע שיעור ניסיון',
    human_touched: false,
    temperature: 'warm',
    ...overrides,
  };
}

describe('the lead state of a contact', () => {
  it('is read as the server sent it', () => {
    const mine = lead();
    expect(leadOf(makeContact(1, { lead: mine }))).toBe(mine);
  });

  it('is nothing on a server that does not send it, or sends something that cannot be shown', () => {
    expect(leadOf(makeContact(1))).toBeNull();
    expect(leadOf(makeContact(1, { lead: null }))).toBeNull();
    expect(leadOf(null)).toBeNull();
    expect(leadOf(makeContact(1, { lead: lead({ stage: '' }) }))).toBeNull();
    expect(leadOf(makeContact(1, { lead: { ...lead(), group: 'someday' as never } }))).toBeNull();
  });

  it('a state the screen never heard of is still shown, by the label the server gave it', () => {
    const unknown = lead({ stage: 'came_back', stage_label: 'חזר אלינו', group: 'wait' });
    expect(leadOf(makeContact(1, { lead: unknown }))).toBe(unknown);
    expect(leadStageLabel(unknown)).toBe('חזר אלינו');
    // With no label at all: the contract's own wording, and last the key itself.
    expect(leadStageLabel({ stage: 'trial_done', stage_label: '' })).toBe('עשה ניסיון ולא נרשם');
    expect(leadStageLabel({ stage: 'came_back', stage_label: '' })).toBe('came_back');
  });

  it('only a state that calls for action is worth a tag in the conversations list', () => {
    expect(showsInList(lead({ group: 'act' }))).toBe(true);
    expect(showsInList(lead({ group: 'wait', stage: 'in_conversation' }))).toBe(false);
    expect(showsInList(lead({ group: 'closed', stage: 'registered' }))).toBe(false);
    expect(showsInList(null)).toBe(false);
  });
});

describe('the colour of a state', () => {
  it('what waits for us is amber', () => {
    expect(leadTone({ group: 'act', stage: 'answered_silent' })).toBe('warning');
    expect(leadTone({ group: 'act', stage: 'needs_reply' })).toBe('warning');
  });

  it('red is kept for the person who asked for a human, and for a charge that failed', () => {
    expect(leadTone({ group: 'act', stage: 'needs_reply' }, true)).toBe('danger');
    expect(leadTone({ group: 'act', stage: 'signup_failed' })).toBe('danger');
    // Asking for a person does not redden a state that is about something else.
    expect(leadTone({ group: 'act', stage: 'trial_done' }, true)).toBe('warning');
  });

  it('in progress is navy; closed is quiet, green only for who registered or is a customer', () => {
    expect(leadTone({ group: 'wait', stage: 'trial_booked' })).toBe('primary');
    expect(leadTone({ group: 'closed', stage: 'registered' })).toBe('success');
    expect(leadTone({ group: 'closed', stage: 'customer' })).toBe('success');
    expect(leadTone({ group: 'closed', stage: 'not_relevant' })).toBe('muted');
    expect(leadTone({ group: 'closed', stage: 'cold' })).toBe('muted');
  });
});

describe('how long, in words', () => {
  it('"היום", "אתמול", "לפני 4 ימים" from the server\'s count of days', () => {
    expect(leadDaysText({ days: 0, since: null }, NOW)).toBe('היום');
    expect(leadDaysText({ days: 1, since: null }, NOW)).toBe('אתמול');
    expect(leadDaysText({ days: 2, since: null }, NOW)).toBe('לפני יומיים');
    expect(leadDaysText({ days: 4, since: null }, NOW)).toBe('לפני 4 ימים');
  });

  it('with no count, from the moment the state began; with neither, nothing', () => {
    expect(leadDaysText({ days: null, since: '2026-10-08T11:00:00+03:00' }, NOW)).toBe('לפני 3 ימים');
    expect(leadDaysText({ days: null, since: '2026-10-11T09:00:00+03:00' }, NOW)).toBe('היום');
    expect(leadDaysText({ days: null, since: null }, NOW)).toBe('');
    expect(leadDaysText({ days: null, since: 'not a date' }, NOW)).toBe('');
  });

  it('"הוותיק: לפני 3 ימים" on a state\'s row, and nothing for a state with nobody in it', () => {
    expect(oldestText(3)).toBe('הוותיק: לפני 3 ימים');
    expect(oldestText(0)).toBe('הוותיק: היום');
    expect(oldestText(null)).toBe('');
    expect(oldestText(undefined)).toBe('');
  });

  it('the temperature dot has a word behind it', () => {
    expect(temperatureLabel('hot')).toBe('חם');
    expect(temperatureLabel('warm')).toBe('מתעניין');
    expect(temperatureLabel('cold')).toBe('קר');
    expect(temperatureLabel('')).toBe('');
    expect(temperatureLabel(undefined)).toBe('');
  });
});

const RAW_BOARD = {
  // Out of order on purpose: the screen puts the groups in the contract's order.
  groups: [
    {
      key: 'closed',
      label: 'סגור',
      total: 9,
      stages: [
        { key: 'registered', label: 'נרשם', hint: '', next_step: '', count: 5, oldest_days: 12 },
        { key: 'cold', label: 'ליד ישן', hint: '', next_step: '', count: 4, oldest_days: 60 },
      ],
    },
    {
      key: 'act',
      label: 'דורש טיפול',
      total: 4,
      stages: [
        { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', hint: 'h', next_step: 'לענות לו', count: 0, oldest_days: null },
        { key: 'trial_done', label: 'עשה ניסיון ולא נרשם', hint: '', next_step: 'להתקשר', count: 4, oldest_days: 7 },
      ],
    },
    {
      key: 'wait',
      label: 'בתהליך',
      total: 2,
      stages: [{ key: 'trial_booked', label: 'רשום לשיעור ניסיון', hint: '', next_step: '', count: 2, oldest_days: 1 }],
    },
  ],
  checked_at: '2026-10-11T11:57:00+03:00',
  pending_scan: 31,
};

describe('the board as the server sends it', () => {
  const board = readLeadBoard(RAW_BOARD);

  it('always has the three groups, in the order needs handling / in progress / closed', () => {
    expect(board.groups.map((group) => group.key)).toEqual(['act', 'wait', 'closed']);
    expect(board.groups.map((group) => group.label)).toEqual(['דורש טיפול', 'בתהליך', 'סגור']);
    expect(board.groups.map((group) => group.total)).toEqual([4, 2, 9]);
    expect(board.pending_scan).toBe(31);
    expect(board.checked_at).toBe('2026-10-11T11:57:00+03:00');
  });

  it('keeps a state that has nobody in it', () => {
    expect(board.groups[0].stages.map((stage) => [stage.key, stage.count])).toEqual([
      ['needs_reply', 0],
      ['trial_done', 4],
    ]);
  });

  it('an answer with nothing in it is three empty groups, not a broken screen', () => {
    for (const raw of [null, {}, { groups: 'nonsense' }, { groups: [] }]) {
      const empty = readLeadBoard(raw);
      expect(empty.groups.map((group) => group.key)).toEqual(['act', 'wait', 'closed']);
      expect(empty.groups.every((group) => group.total === 0 && group.stages.length === 0)).toBe(true);
      expect(empty.pending_scan).toBe(0);
    }
  });

  it('a group that came without a total is the sum of its states; a state without a label gets the contract\'s', () => {
    const loose = readLeadBoard({
      groups: [{ key: 'act', stages: [{ key: 'trial_done', count: '3' }, { key: 'callback_due', count: 2 }, { count: 7 }] }],
    });
    expect(loose.groups[0].total).toBe(5);
    expect(loose.groups[0].label).toBe('דורש טיפול');
    expect(loose.groups[0].stages.map((stage) => stage.label)).toEqual(['עשה ניסיון ולא נרשם', 'הגיע הזמן לחזור אליו']);
  });

  it('finds a state by its key, with the group it sits in', () => {
    expect(findStage(board, 'trial_booked')?.group.key).toBe('wait');
    expect(findStage(board, 'trial_booked')?.stage.count).toBe(2);
    expect(findStage(board, 'nonsense')).toBeNull();
    expect(findStage(board, null)).toBeNull();
    expect(findStage(null, 'trial_booked')).toBeNull();
  });

  it('a wide screen opens on the first state that has someone to handle', () => {
    // "שאל ולא קיבל תשובה" is first on the list but empty: the next one with people is chosen.
    expect(defaultStage(board)).toBe('trial_done');
  });

  it('with nobody to handle it opens on what is in progress; a closed state is never opened by itself', () => {
    const quiet = readLeadBoard({
      groups: [
        { key: 'act', stages: [{ key: 'needs_reply', count: 0 }] },
        { key: 'wait', stages: [{ key: 'in_conversation', count: 3 }] },
        { key: 'closed', stages: [{ key: 'registered', count: 8 }] },
      ],
    });
    expect(defaultStage(quiet)).toBe('in_conversation');
    const closedOnly = readLeadBoard({ groups: [{ key: 'closed', stages: [{ key: 'registered', count: 8 }] }] });
    expect(defaultStage(closedOnly)).toBeNull();
    expect(defaultStage(null)).toBeNull();
  });
});

describe('"דורש טיפול" of the day\'s summary', () => {
  it('is the total and the states that have someone in them', () => {
    expect(
      leadActOf({
        lead_act: {
          total: 6,
          stages: [
            { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', count: 2 },
            { key: 'trial_done', label: 'עשה ניסיון ולא נרשם', count: 4 },
            { key: 'callback_due', label: 'הגיע הזמן לחזור אליו', count: 0 },
          ],
        },
      }),
    ).toEqual({
      total: 6,
      stages: [
        { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', count: 2 },
        { key: 'trial_done', label: 'עשה ניסיון ולא נרשם', count: 4 },
      ],
    });
  });

  it('is nothing on a server that does not send it', () => {
    expect(leadActOf({})).toBeNull();
    expect(leadActOf(null)).toBeNull();
    expect(leadActOf({ lead_act: { total: 3 } as never })).toBeNull();
  });

  it('nobody to handle is a real answer: zero, with no states', () => {
    expect(leadActOf({ lead_act: { total: 0, stages: [] } })).toEqual({ total: 0, stages: [] });
  });
});

describe('a stage key in the address', () => {
  it('is a plain key or nothing', () => {
    expect(parseStage('needs_reply')).toBe('needs_reply');
    expect(parseStage('trial2')).toBe('trial2');
    expect(parseStage('')).toBeNull();
    expect(parseStage(null)).toBeNull();
    expect(parseStage('Needs Reply')).toBeNull();
    expect(parseStage('a'.repeat(60))).toBeNull();
    expect(parseStage('../x')).toBeNull();
  });
});

describe('"מה ידוע" in short', () => {
  it('is the summary when there is one', () => {
    expect(knownHeadline(makeContact(1, { known: { summary: ' שאלה על קפוארה לבן 5. ' } }).known)).toBe('שאלה על קפוארה לבן 5.');
  });

  it('otherwise the facts in a row, each once', () => {
    const known = makeContact(1, {
      known: { topic_label: 'שיעור ניסיון', course_type: 'קפוארה', branch_name: 'פסגות אפק', city: 'ראש העין', child_age: '5', interest_label: 'מתעניין' },
    }).known;
    expect(knownHeadline(known)).toBe('שיעור ניסיון · קפוארה · פסגות אפק, ראש העין · גיל 5 · מתעניין');
    expect(knownHeadline(makeContact(1, { known: { branch_name: 'יהוד', city: 'יהוד' } }).known)).toBe('יהוד');
  });

  it('with nothing known it is empty, and the card says so in its own words', () => {
    expect(knownHeadline(makeContact(1).known)).toBe('');
  });
});

describe('the people of a state, page by page', () => {
  const inStage = (id: number, stage: string) => makeContact(id, { lead: lead({ stage }) });

  it('every person once, in the server\'s order, across the pages read so far', () => {
    const rows = stageRows(
      [{ results: [inStage(1, 'trial_done'), inStage(2, 'trial_done')] }, { results: [inStage(2, 'trial_done'), inStage(3, 'trial_done')] }],
      'trial_done',
    );
    expect(rows.map((contact) => contact.id)).toEqual([1, 2, 3]);
  });

  it('a row that came back without the state asked for is left out — a server that ignores the filter fills nothing', () => {
    const rows = stageRows([{ results: [inStage(1, 'trial_done'), inStage(2, 'cold'), makeContact(3)] }], 'trial_done');
    expect(rows.map((contact) => contact.id)).toEqual([1]);
  });

  it('a search across all states keeps every row', () => {
    const rows = stageRows([{ results: [inStage(1, 'trial_done'), inStage(2, 'cold'), makeContact(3)] }], null);
    expect(rows.map((contact) => contact.id)).toEqual([1, 2, 3]);
    expect(stageRows(undefined, 'trial_done')).toEqual([]);
  });

  it('the states and the people stand side by side from a width that holds both', () => {
    expect(LEADS_TWO_PANE_FROM).toBeGreaterThanOrEqual(300 + 480);
  });
});
