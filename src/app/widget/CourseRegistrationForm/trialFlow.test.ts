import { describe, expect, it } from 'vitest';
import { trialNextStep, trialWhen } from './trialFlow';

describe('trialNextStep', () => {
  it('sends a paid trial through the full consents flow', () => {
    expect(trialNextStep(true)).toBe('consents');
  });

  it('sends a free trial to the summary-and-confirm screen', () => {
    expect(trialNextStep(false)).toBe('trial_confirm');
  });
});

describe('trialWhen', () => {
  it('says the day, the short date and the hours of a date the server listed', () => {
    expect(trialWhen('2026-10-06', { day_name: 'שלישי', start_time: '16:00', end_time: '16:45' }))
      .toEqual({ day: 'יום שלישי · 6.10', hours: '16:00–16:45' });
  });

  it('drops the seconds, and does not say "day" twice', () => {
    expect(trialWhen('2026-11-15', { day_name: 'יום ראשון', start_time: '18:00:00', end_time: '18:45:00' }))
      .toEqual({ day: 'יום ראשון · 15.11', hours: '18:00–18:45' });
  });

  it('reads the day from the date when the server listed none, and says no hours', () => {
    // 7.10.2026 is a Wednesday.
    expect(trialWhen('2026-10-07')).toEqual({ day: 'יום רביעי · 7.10', hours: '' });
    expect(trialWhen('2026-10-07', { day_name: '', start_time: '19:00' })).toEqual({ day: 'יום רביעי · 7.10', hours: '' });
  });

  it('shows a date it cannot read as it is', () => {
    expect(trialWhen('')).toEqual({ day: '', hours: '' });
    expect(trialWhen('בקרוב')).toEqual({ day: 'בקרוב', hours: '' });
  });
});
