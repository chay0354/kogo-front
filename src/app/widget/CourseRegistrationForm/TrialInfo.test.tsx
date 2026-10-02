import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TrialInfo from './TrialInfo';
import { TRIAL_INFO_LABEL, trialInfoLines, trialInfoOpenAfter } from './trialInfoCopy';

// The component is compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const ONE_TIME = 'שיעור הניסיון חד־פעמי לכל ילד. אישור ותזכורת יישלחו בוואטסאפ.';
const DETAILS_KEPT =
  'הפרטים נשמרים אצלנו, ובמקרה שתרצו להירשם לחוג נזהה אתכם לפי תעודת זהות וטלפון ונמלא אותם עבורכם.';
const PAID_IS_CREDITED = 'עלות שיעור ניסיון בתשלום תקוזז מהתשלום הראשון.';

describe('trialInfoLines', () => {
  it('says two things of a free trial, in the owner\'s words', () => {
    expect(trialInfoLines(false)).toEqual([ONE_TIME, DETAILS_KEPT]);
  });

  it('adds that the cost is credited only for a trial that costs money', () => {
    expect(trialInfoLines(true)).toEqual([ONE_TIME, DETAILS_KEPT, PAID_IS_CREDITED]);
  });
});

describe('trialInfoOpenAfter', () => {
  it('opens on a press on the line, and closes on the next one', () => {
    expect(trialInfoOpenAfter(false, 'line')).toBe(true);
    expect(trialInfoOpenAfter(true, 'line')).toBe(false);
  });

  it('closes on a press anywhere else, and stays closed', () => {
    expect(trialInfoOpenAfter(true, 'elsewhere')).toBe(false);
    expect(trialInfoOpenAfter(false, 'elsewhere')).toBe(false);
  });
});

describe('TrialInfo', () => {
  it('shows only the line while closed', () => {
    const html = renderToStaticMarkup(<TrialInfo paid />);
    expect(html).toContain(TRIAL_INFO_LABEL);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(ONE_TIME);
    expect(html).not.toContain('role="note"');
  });

  it('shows the two lines of a free trial when open, and not the one about the cost', () => {
    const html = renderToStaticMarkup(<TrialInfo paid={false} defaultOpen />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(ONE_TIME);
    expect(html).toContain(DETAILS_KEPT);
    expect(html).not.toContain(PAID_IS_CREDITED);
  });

  it('shows all three lines of a paid trial when open', () => {
    const html = renderToStaticMarkup(<TrialInfo paid defaultOpen />);
    for (const line of [ONE_TIME, DETAILS_KEPT, PAID_IS_CREDITED]) expect(html).toContain(line);
  });
});
