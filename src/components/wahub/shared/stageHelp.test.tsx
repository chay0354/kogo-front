/**
 * "מה זה אומר?" — the bubble on a lead's state (the owner, 14.10.2026): every state a screen can show has its
 * two lines, the point is bold, and the bubble says what happens next and who does it.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEAD_V2_STAGE_LABELS } from '@/lib/wahub/leadsV2';
import { LEAD_STAGE_LABELS } from '@/lib/wahub/leadStage';
import { STAGE_HELP, helpParts, stageHelp, stageHelpText } from '@/lib/wahub/stageHelp';
import { StageHelp, StagesLegend } from './StageHelp';

// The components are compiled with the classic JSX of the tests, which reads `React` from the global scope.
(globalThis as { React?: typeof React }).React = React;

describe('the words of every state', () => {
  it('every state either list of states knows has its two lines', () => {
    for (const stage of [...Object.keys(LEAD_V2_STAGE_LABELS), ...Object.keys(LEAD_STAGE_LABELS)]) {
      const help = stageHelp(stage);
      if (!help) continue;
      expect(help.what.length, stage).toBeGreaterThan(5);
      expect(help.now.length, stage).toBeGreaterThan(5);
    }
    for (const stage of Object.keys(LEAD_V2_STAGE_LABELS)) expect(stageHelp(stage), stage).not.toBeNull();
  });

  it('short lines, no full stop at the end, the point marked', () => {
    for (const [stage, help] of Object.entries(STAGE_HELP)) {
      for (const line of [help.what, help.now]) {
        expect(line.length, stage).toBeLessThan(130);
        expect(line.endsWith('.'), stage).toBe(false);
      }
    }
    expect(STAGE_HELP.link_sent.now).toContain('**הבוט מזכיר**');
    expect(STAGE_HELP.nothing_to_offer.now).toContain('בודקת כל יום');
  });

  it('the marks become bold parts, and a plain sentence for a reader', () => {
    expect(helpParts('**הבוט מזכיר** אחרי יום')).toEqual([
      { text: 'הבוט מזכיר', bold: true },
      { text: ' אחרי יום', bold: false },
    ]);
    expect(helpParts('בלי סימן')).toEqual([{ text: 'בלי סימן', bold: false }]);
    expect(stageHelpText('will_check')).toBe('אמר שיבדוק ויחזור. הבוט שואל פעם אחת, יום אחרי. לא ענה — עובר אליך');
    expect(stageHelpText('nonsense')).toBe('');
  });
});

describe('the bubble', () => {
  it('closed: the state as it was, with a dotted way in and nothing more', () => {
    const html = renderToStaticMarkup(<StageHelp stage="link_sent">קיבל קישור ועוד לא נרשם</StageHelp>);
    expect(html).toContain('<button type="button"');
    expect(html).toContain('קיבל קישור ועוד לא נרשם');
    expect(html).toContain('title="מה זה אומר?"');
    expect(html).not.toContain('role="tooltip"');
  });

  it('open: its name, what it means, and what happens next, the point in bold', () => {
    const html = renderToStaticMarkup(
      <StageHelp stage="link_sent" title="קיבל קישור ועוד לא נרשם" defaultOpen>
        קיבל קישור ועוד לא נרשם
      </StageHelp>,
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('קיבל קישור להרשמה ועוד לא נרשם');
    expect(html).toContain('<b>הבוט מזכיר</b>');
  });

  it('in a row that opens a conversation it is not a button inside a button', () => {
    const html = renderToStaticMarkup(<StageHelp stage="in_conversation" inRow>בשיחה</StageHelp>);
    expect(html).not.toContain('<button');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it('a state with no words of its own is shown as it was', () => {
    expect(renderToStaticMarkup(<StageHelp stage="something_new">מצב חדש</StageHelp>)).toBe('מצב חדש');
  });

  it('beside the filter: every state of the list, with its two lines', () => {
    const stages = [
      { key: 'link_sent', label: 'קיבל קישור ועוד לא נרשם' },
      { key: 'in_conversation', label: 'בשיחה' },
      { key: 'unknown_one', label: 'מצב לא מוכר' },
    ];
    const closed = renderToStaticMarkup(<StagesLegend stages={stages} />);
    expect(closed).toContain('aria-label="מה אומר כל מצב?"');
    expect(closed).not.toContain('<dl>');
    const open = renderToStaticMarkup(<StagesLegend stages={stages} defaultOpen />);
    expect(open).toContain('<dt>קיבל קישור ועוד לא נרשם</dt>');
    expect(open).toContain('<dt>בשיחה</dt>');
    expect(open).not.toContain('מצב לא מוכר');
    expect(renderToStaticMarkup(<StagesLegend stages={[{ key: 'unknown_one', label: 'x' }]} />)).toBe('');
  });
});
