/**
 * "מה זה אומר?" — the bubble on a lead's state (the owner, 14.10.2026): every state a screen can show has its
 * two lines, the point is bold, and the bubble says what happens next and who does it.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEAD_V2_STAGE_LABELS } from '@/lib/wahub/leadsV2';
import { LEAD_STAGE_LABELS } from '@/lib/wahub/leadStage';
import { OPENED_HELP, STAGE_HELP, helpParts, nextStepHelp, stageHelp, stageHelpText } from '@/lib/wahub/stageHelp';
import { HoverHelp, StageHelp, StagesLegend, onScreenShift } from './StageHelp';

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

  it('the first line adds to the state\'s name, and never says it again (nothing is said twice)', () => {
    const plain = (text: string) => text.replace(/[^\u05d0-\u05ea ]/g, '').replace(/\s+/g, ' ').trim();
    for (const [stage, label] of Object.entries(LEAD_V2_STAGE_LABELS)) {
      const help = stageHelp(stage);
      if (!help) continue;
      const what = plain(help.what);
      expect(what.includes(plain(label)), `${stage}: "${help.what}" repeats "${label}"`).toBe(false);
    }
  });

  it('the marks become bold parts, and a plain sentence for a reader', () => {
    expect(helpParts('**הבוט מזכיר** אחרי יום')).toEqual([
      { text: 'הבוט מזכיר', bold: true },
      { text: ' אחרי יום', bold: false },
    ]);
    expect(helpParts('בלי סימן')).toEqual([{ text: 'בלי סימן', bold: false }]);
    expect(stageHelpText('will_check')).toBe('ענה שקודם יבדוק או ישאל מישהו, ויחזור אלינו. הבוט שואל פעם אחת, יום אחרי. לא ענה — עובר אליך');
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
    expect(html).toContain('שלחו לו קישור להרשמה');
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

describe('the bubble stays on the screen', () => {
  it('a bubble cut on the left moves right, one cut on the right moves left, one on the screen stays', () => {
    // The production case of 14.10.2026: 243 pixels wide, from -41 to 202, on a 400-pixel phone.
    expect(onScreenShift(-41, 202, 400)).toBe(53);
    expect(onScreenShift(300, 420, 400)).toBe(-32);
    expect(onScreenShift(50, 300, 400)).toBe(0);
    // Wider than the screen: its start at the edge.
    expect(onScreenShift(-10, 500, 400)).toBe(22);
  });

  it('the state is marked, so that the round buttons of the head on a phone leave it as words', () => {
    expect(renderToStaticMarkup(<StageHelp stage="link_sent">קיבל קישור</StageHelp>)).toContain('data-stage-help=""');
  });
});

describe('the words behind a lead\'s next step (the owner, 14.10.2026: "זה לא מראה לי בועה")', () => {
  it('an external branch says why nobody sees the registration, and what the bot does', () => {
    const help = nextStepHelp({ stage: 'in_conversation' }, { text: 'סניף חיצוני — ההרשמה מול העירייה', tone: 'quiet' });
    expect(help?.what).toContain('Kogo לא רואה אם נרשם');
    expect(help?.now).toContain('**הבוט בודק איתו פעם אחת**');
  });

  it('a step that will not go out says what it was and why, and that it will not leave late', () => {
    const help = nextStepHelp(
      { stage: 'answered_silent' },
      { text: 'היה נשלח עכשיו — השליחה כבויה', tone: 'held', detail: 'הבוט יציע שיעור ניסיון' },
    );
    expect(help).toEqual({
      what: 'הבוט יציע שיעור ניסיון, אבל השליחה כבויה',
      now: '**לא ייצא באיחור:** כשמדליקים, יוצא רק מה שהגיע זמנו אחרי ההדלקה',
    });
    const planned = nextStepHelp({ stage: 'trial_done' }, { text: 'הבוט ישלח את הקישור להרשמה מחר ב-10:30 · לא ייצא: החזרות האוטומטיות כבויות', tone: 'held' });
    expect(planned?.what).toBe('הבוט היה אמור לשלוח הודעה, אבל החזרות האוטומטיות כבויות');
  });

  it('any other line is the lead\'s state', () => {
    expect(nextStepHelp({ stage: 'link_sent' }, { text: 'הבוט יזכיר את הקישור מחר ב-10:30', tone: 'bot' })).toEqual(STAGE_HELP.link_sent);
    expect(nextStepHelp({ stage: 'nothing_new' }, { text: 'משהו', tone: 'quiet' })).toBeNull();
  });

  it('on a row, the line is what it was — the bubble opens only for a mouse resting on it', () => {
    const html = renderToStaticMarkup(
      <HoverHelp help={STAGE_HELP.link_sent} className="next" data-next="bot">
        <span>הבוט יזכיר</span>
      </HoverHelp>,
    );
    expect(html).toBe('<span class="next" style="position:relative" data-next="bot"><span>הבוט יזכיר</span></span>');
    const open = renderToStaticMarkup(
      <HoverHelp help={STAGE_HELP.link_sent} className="next" data-next="bot" defaultOpen>
        <span>הבוט יזכיר</span>
      </HoverHelp>,
    );
    expect(open).toContain('role="tooltip"');
    expect(open).toContain('<b>הבוט מזכיר</b>');
  });
});

describe('"לא רלוונטי · אין מה להציע", and the class that opened (the owner, 15.10.2026)', () => {
  it('nothing to offer: why, and that the lead comes back by itself when a class that fits opens', () => {
    expect(STAGE_HELP.nothing_to_offer).toEqual({
      what: 'אין סניף באזור, אין חוג לגיל, או שהחוג מלא',
      now: 'המערכת בודקת כל יום. **אם ייפתח חוג שמתאים, הליד יחזור אליך**',
    });
    expect(stageHelpText('nothing_to_offer')).toBe(
      'אין סניף באזור, אין חוג לגיל, או שהחוג מלא. המערכת בודקת כל יום. אם ייפתח חוג שמתאים, הליד יחזור אליך',
    );
  });

  it('a class that opened is a question of the office\'s with words of its own — not "nobody answered him"', () => {
    expect(stageHelp('needs_reply', 'נפתח חוג שמתאים')).toEqual(OPENED_HELP);
    expect(OPENED_HELP.now).toContain('**מחכה לך:**');
    // Any other question waiting for its answer keeps its own two lines.
    expect(stageHelp('needs_reply', 'שאל ולא קיבל מענה')).toBe(STAGE_HELP.needs_reply);
    expect(stageHelp('needs_reply')).toBe(STAGE_HELP.needs_reply);
    // The bubble on the state, and the one on the office's step of the row.
    const html = renderToStaticMarkup(
      <StageHelp stage="needs_reply" title="נפתח חוג שמתאים" defaultOpen>
        נפתח חוג שמתאים
      </StageHelp>,
    );
    expect(html).toContain('הבדיקה היומית מצאה חוג עם מקום');
    expect(html).not.toContain(STAGE_HELP.needs_reply.what);
    const step = nextStepHelp(
      { stage: 'needs_reply', stage_label: 'נפתח חוג שמתאים' },
      { text: 'מחכה לך: נפתח: קפוארה גן חובה בראש העין — להציע לו', tone: 'office' },
    );
    expect(step).toEqual(OPENED_HELP);
  });
});
