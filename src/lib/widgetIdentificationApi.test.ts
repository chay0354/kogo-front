import { describe, expect, it } from 'vitest';
import { identificationLocked, identificationSwitchLine, readIdentificationSwitch } from './widgetIdentificationApi';

const day = (iso: string) => iso.slice(0, 10);

describe('readIdentificationSwitch', () => {
  it('reads the state and the history', () => {
    const state = readIdentificationSwitch({
      blocked: true, blocked_at: '2026-10-02T08:00:00Z', reason: 'בקשת ההורה', consent_at: null,
      history: [{ blocked: true, reason: 'בקשת ההורה', changed_at: '2026-10-02T08:00:00Z', changed_by_name: 'משרד' }],
    });
    expect(state?.blocked).toBe(true);
    expect(state?.history).toHaveLength(1);
    expect(state?.history[0].changed_by_name).toBe('משרד');
  });

  it('reads the lock and who opened one before', () => {
    const state = readIdentificationSwitch({
      blocked: false, locked_until: '2026-10-03T11:11:00Z',
      releases: [{ released_at: '2026-10-02T12:00:00Z', released_by_name: 'משרד' }],
    });
    expect(state?.locked_until).toBe('2026-10-03T11:11:00Z');
    expect(state?.releases).toEqual([{ released_at: '2026-10-02T12:00:00Z', released_by_name: 'משרד' }]);
  });

  it('knows of no lock on a server that says nothing of one', () => {
    const state = readIdentificationSwitch({ blocked: false });
    expect(state?.locked_until).toBeNull();
    expect(state?.releases).toEqual([]);
  });

  it('is null for an answer that is not the switch', () => {
    expect(readIdentificationSwitch(null)).toBeNull();
    expect(readIdentificationSwitch({})).toBeNull();
    expect(readIdentificationSwitch({ blocked: 'true' })).toBeNull();
  });
});

describe('identificationSwitchLine', () => {
  it('says when and why it was switched off', () => {
    const state = readIdentificationSwitch({ blocked: true, blocked_at: '2026-10-02T08:00:00Z', reason: 'בקשת ההורה' });
    expect(identificationSwitchLine(state!, day)).toBe('כבוי · 2026-10-02 · סיבה: בקשת ההורה');
  });

  it('says a family is on, and whether the parent has agreed yet', () => {
    expect(identificationSwitchLine(readIdentificationSwitch({ blocked: false, consent_at: '2026-10-01T08:00:00Z' })!, day)).toBe('פעיל');
    expect(identificationSwitchLine(readIdentificationSwitch({ blocked: false, consent_at: null })!, day))
      .toBe('פעיל · ההורה עוד לא אישר בתקנון');
  });
});

describe('identificationLocked', () => {
  const at = Date.parse('2026-10-02T12:00:00Z');

  it('is locked until the time the server gave', () => {
    const state = readIdentificationSwitch({ blocked: false, locked_until: '2026-10-03T11:11:00Z' })!;
    expect(identificationLocked(state, at)).toBe(true);
    expect(identificationLocked(state, Date.parse('2026-10-03T11:12:00Z'))).toBe(false);
  });

  it('is not locked without a time, or with one that cannot be read', () => {
    expect(identificationLocked(readIdentificationSwitch({ blocked: false })!, at)).toBe(false);
    expect(identificationLocked(readIdentificationSwitch({ blocked: false, locked_until: 'soon' })!, at)).toBe(false);
  });
});
