import { describe, expect, it } from 'vitest';
import { identificationSwitchLine, readIdentificationSwitch } from './widgetIdentificationApi';

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
