/**
 * The results screen puts who did not get a broadcast on top, with a reason
 * the office can act on, and does not pass free text off as delivered.
 */
import { describe, expect, it } from 'vitest';
import type { BroadcastRow } from './whatsappApi';
import { plainReason, recipientsOf, splitOutcome } from './broadcastOutcome';
import { dockSummary, type RunSnapshot } from './broadcastRun';

const row = (over: Partial<BroadcastRow>): BroadcastRow => ({
  child_id: over.child_id ?? 'c1',
  child_name: 'אור שלמה',
  parent_name: 'נעמה שלמה',
  phone: '972545757056',
  status: 'sent',
  method: 'flow',
  ...over,
});

describe('splitOutcome', () => {
  it('sorts every phone — own and extra — into failed, free text, delivered and skipped', () => {
    const rows = [
      row({ child_id: 'a', status: 'failed', reason: 'contact_unfindable', error: 'איש הקשר: ...' }),
      row({
        child_id: 'b',
        extra_phones: [
          { parent_name: 'אבא', phone: '972521111111', status: 'failed', error: 'האוטומציה (x): Flow not found' },
          { parent_name: 'סבתא', phone: '031234567', status: 'skipped', reason: 'not_mobile' },
        ],
      }),
      row({ child_id: 'c', method: 'text' }),
      row({ child_id: 'd', status: 'skipped', reason: 'no_parent_phone' }),
    ];
    const outcome = splitOutcome(rows);
    expect(outcome.failed.map((r) => [r.childId, r.extra])).toEqual([['a', false], ['b', true]]);
    expect(outcome.freeText.map((r) => r.childId)).toEqual(['c']);
    expect(outcome.delivered.map((r) => r.childId)).toEqual(['b']);
    expect(outcome.skipped.map((r) => [r.childId, r.reason])).toEqual([['b', 'not_mobile'], ['d', 'no_parent_phone']]);
  });

  it('keeps one key per phone, so a list never repeats one', () => {
    const keys = recipientsOf([
      row({ child_id: 'a', extra_phones: [{ parent_name: 'אבא', phone: '972521111111', status: 'sent', method: 'flow' }] }),
    ]).map((r) => r.key);
    expect(new Set(keys).size).toBe(2);
  });
});

describe('plainReason', () => {
  it.each([
    [{ reason: 'contact_unfindable', error: 'איש הקשר: Validation error' }, 'לא מוצא את איש הקשר', 'קישור לאיש קשר'],
    [{ reason: null, error: 'איש הקשר: מספר הטלפון אינו רשום ב-WhatsApp — לא ניתן לשלוח הודעה.' }, 'לא רשום בוואטסאפ', 'בכרטיס הלקוח'],
    [{ reason: null, error: 'האוטומציה (content1): Flow not found' }, 'סירב להפעיל את האוטומציה', 'פעילה'],
    [{ reason: null, error: 'שליחת הטקסט: Subscriber blocked' }, 'סירב לשלוח', 'ManyChat'],
    [{ reason: null, error: 'missing_flow_ns' }, 'לא נמצאה', 'אוטומציה אחרת'],
    [{ reason: null, error: 'איש הקשר: שגיאת רשת ב-ManyChat' }, 'לא הצלחנו למצוא', 'בעוד כמה דקות'],
    [{ reason: null, error: 'something new' }, 'ManyChat החזיר שגיאה', 'לדווח למפתח'],
  ])('%o reads as a reason and a step', (input, why, action) => {
    const reason = plainReason(input);
    expect(reason.why).toContain(why);
    expect(reason.action).toContain(action);
  });
});

describe('the corner button', () => {
  const snapshot = (phase: RunSnapshot['phase'], sentRows: BroadcastRow[]) =>
    ({ phase, sentRows, previewRows: [], total: 5 }) as unknown as RunSnapshot;

  it('says a failure while the run is still sending', () => {
    const d = dockSummary(snapshot('sending', [row({}), row({ child_id: 'x', status: 'failed' })]));
    expect(d).toMatchObject({ tone: 'warn', detail: '2/5 · נכשלו 1' });
  });

  it('counts a failed extra phone, and the sent ones, when the run ends', () => {
    const d = dockSummary(snapshot('done', [
      row({ extra_phones: [{ parent_name: 'אבא', phone: '972521111111', status: 'failed' }] }),
      row({ child_id: 'y', extra_phones: [{ parent_name: 'אמא', phone: '972522222222', status: 'sent', method: 'flow' }] }),
    ]));
    expect(d).toMatchObject({ tone: 'warn', detail: 'נשלחו 3 · נכשלו 1' });
  });

  it('stays calm when nothing failed', () => {
    expect(dockSummary(snapshot('sending', [row({})]))).toMatchObject({ tone: 'send', detail: '1/5' });
    expect(dockSummary(snapshot('done', [row({})]))).toMatchObject({ tone: 'done', detail: 'נשלחו 1' });
  });
});
