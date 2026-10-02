import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TrialInfo from './TrialInfo';
import { TRIAL_INFO_LABEL, trialInfoArrow, trialInfoLines, trialInfoOpenAfter } from './trialInfoCopy';

// The component is compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const ONE_PER_CHILD = 'שיעור ניסיון אחד לכל ילד.';
const SENT_ON_WHATSAPP = 'אישור ותזכורת יישלחו בוואטסאפ.';
const KNOWN_NEXT_TIME = 'בהרשמה לחוג נזהה אתכם לפי ת.ז. וטלפון ונמלא את הפרטים.';
const PAID_IS_CREDITED = 'עלות שיעור הניסיון תקוזז מהתשלום הראשון.';

describe('trialInfoLines', () => {
  it('says three short things of a free trial, in the owner\'s words', () => {
    expect(trialInfoLines(false)).toEqual([ONE_PER_CHILD, SENT_ON_WHATSAPP, KNOWN_NEXT_TIME]);
  });

  it('adds that the cost is credited only for a trial that costs money', () => {
    expect(trialInfoLines(true)).toEqual([ONE_PER_CHILD, SENT_ON_WHATSAPP, KNOWN_NEXT_TIME, PAID_IS_CREDITED]);
  });

  it('keeps the words that open it to two', () => {
    expect(TRIAL_INFO_LABEL).toBe('חשוב לדעת');
  });
});

describe('trialInfoOpenAfter', () => {
  it('opens on a press on the words, and closes on the next one', () => {
    expect(trialInfoOpenAfter(false, 'line')).toBe(true);
    expect(trialInfoOpenAfter(true, 'line')).toBe(false);
  });

  it('closes on a press anywhere else, and stays closed', () => {
    expect(trialInfoOpenAfter(true, 'elsewhere')).toBe(false);
    expect(trialInfoOpenAfter(false, 'elsewhere')).toBe(false);
  });
});

describe('trialInfoArrow', () => {
  it('points at the middle of the words, wherever they stand in the line', () => {
    // The words alone at the right of the line: 60 wide, ending where the line ends (4 inside the box).
    expect(trialInfoArrow(304, 300, 240, 60)).toBe(28);
    // The words at the end of a sentence, well to the left.
    expect(trialInfoArrow(304, 300, 70, 60)).toBe(198);
  });

  it('stays inside the box', () => {
    expect(trialInfoArrow(304, 300, 300, 60)).toBe(14);
    expect(trialInfoArrow(304, 200, 0, 60)).toBe(174);
  });
});

describe('TrialInfo', () => {
  it('shows only the two words while closed', () => {
    const html = renderToStaticMarkup(<TrialInfo paid />);
    expect(html).toContain(TRIAL_INFO_LABEL);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(ONE_PER_CHILD);
    expect(html).not.toContain('role="note"');
  });

  it('shows the three lines of a free trial when open, and not the one about the cost', () => {
    const html = renderToStaticMarkup(<TrialInfo paid={false} defaultOpen />);
    expect(html).toContain('aria-expanded="true"');
    for (const line of [ONE_PER_CHILD, SENT_ON_WHATSAPP, KNOWN_NEXT_TIME]) expect(html).toContain(line);
    expect(html).not.toContain(PAID_IS_CREDITED);
  });

  it('shows all four lines of a paid trial when open', () => {
    const html = renderToStaticMarkup(<TrialInfo paid defaultOpen />);
    for (const line of trialInfoLines(true)) expect(html).toContain(line);
  });

  it('says nothing about the terms: a free trial asks for no consent to them', () => {
    for (const open of [false, true]) {
      const html = renderToStaticMarkup(<TrialInfo paid={false} defaultOpen={open} />);
      expect(html).not.toContain('תקנון');
    }
  });
});
