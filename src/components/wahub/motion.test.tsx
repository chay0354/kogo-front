import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TypingBubble } from './chats/MessageBubble';
import m from './motion.module.css';
import { CountUp, Fold, ThinkingDots, Tick } from './shared/motion';
import s from './wahub.module.css';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const css = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const MOTION = css('./motion.module.css');
const WAHUB = css('./wahub.module.css');
const REFINE = css('./refine/refine.module.css');
// Future leads, the clock and the note (13.10.2026): the same rules, read from the same variables.
const FUTURE = css('./future.module.css');

/** Every `animation` / `transition` declaration of a stylesheet, whole. */
function moves(sheet: string): string[] {
  return sheet.match(/(?:^|[\s;{])(?:animation|transition)(?:-duration|-delay)?\s*:[^;}]+/g)?.map((line) => line.trim().replace(/\s+/g, ' ')) ?? [];
}

/** The lengths written out in a declaration (not the shared variables), in milliseconds. */
function literalTimes(declaration: string): number[] {
  const value = declaration.slice(declaration.indexOf(':') + 1).replace(/cubic-bezier\([^)]*\)/g, '');
  return [...value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map(([, amount, unit]) => Number(amount) * (unit === 's' ? 1000 : 1));
}

describe('the motion layer: one set of lengths and curves', () => {
  it('the lengths are 120–280ms', () => {
    const lengths = [...MOTION.matchAll(/--m-(press|fast|base|slow):\s*(\d+)ms/g)].map(([, name, value]) => [name, Number(value)] as const);
    expect(lengths.map(([name]) => name)).toEqual(['press', 'fast', 'base', 'slow']);
    for (const [, value] of lengths) {
      expect(value).toBeGreaterThanOrEqual(120);
      expect(value).toBeLessThanOrEqual(280);
    }
  });

  it('"reduce motion" turns everything off, for the whole section', () => {
    const block = MOTION.slice(MOTION.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('.motion *');
    expect(block).toContain('animation-duration: 0.01ms !important');
    expect(block).toContain('animation-iteration-count: 1 !important');
    expect(block).toContain('transition-duration: 0.01ms !important');
  });

  it('nothing loops but "thinking", a shape that waits, a spinner and the recording dot', () => {
    for (const [name, sheet] of [
      ['motion', MOTION],
      ['wahub', WAHUB],
      ['refine', REFINE],
      ['future', FUTURE],
    ] as const) {
      const loops = moves(sheet).filter((line) => /\binfinite\b/.test(line));
      for (const line of loops) {
        expect(line, `${name}: ${line}`).toMatch(/mThinking|shimmer|spin|recPulse/);
      }
    }
  });

  it('a move written out in full is no longer than 280ms — only the allowed ones run longer', () => {
    // The loops; the live dot's three rings; the quiet "מתעדכן…", which waits before it shows; a word of success that leaves by itself.
    const allowed = /infinite|pulse|refreshIn|mSaved/;
    for (const [name, sheet] of [
      ['motion', MOTION],
      ['wahub', WAHUB],
      ['refine', REFINE],
      ['future', FUTURE],
    ] as const) {
      for (const line of moves(sheet)) {
        if (allowed.test(line)) continue;
        for (const time of literalTimes(line)) expect(time, `${name}: ${line}`).toBeLessThanOrEqual(280);
      }
    }
  });

  it('what moves is transform and opacity — a keyframe touches nothing else (a height never animates)', () => {
    for (const [name, sheet] of [
      ['motion', MOTION],
      ['wahub', WAHUB],
      ['refine', REFINE],
      ['future', FUTURE],
    ] as const) {
      const frames = [...sheet.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)];
      expect(frames.length).toBeGreaterThan(0);
      for (const [, keyframe, body] of frames) {
        const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map(([, property]) => property);
        for (const property of properties) expect(['transform', 'opacity'], `${name}: @keyframes ${keyframe}`).toContain(property);
      }
    }
  });
});

describe('the scroll fixes stay in the stylesheet', () => {
  it('a group of lead states keeps its height, so the column scrolls instead of cutting rows off', () => {
    expect(WAHUB).toMatch(/\.leadsStages > \* \{\s*flex: none;/);
  });

  it('the proposals panel keeps its scroll to itself', () => {
    const body = WAHUB.slice(WAHUB.indexOf('.fabPanelBody {'), WAHUB.indexOf('}', WAHUB.indexOf('.fabPanelBody {')));
    expect(body).toContain('overscroll-behavior: contain');
    const scrim = WAHUB.slice(WAHUB.indexOf('.fabScrim {'), WAHUB.indexOf('}', WAHUB.indexOf('.fabScrim {')));
    expect(scrim).toContain('overscroll-behavior: contain');
  });

  it('on a phone the end of a tab and of the conversations list keeps clear of the floating button', () => {
    expect(WAHUB).toMatch(/\.wahub:has\(\.fab\) \.panel \{\s*padding-bottom: \d+px;/);
    expect(WAHUB).toMatch(/\.wahub:has\(\.fab\) \.listScroll \{\s*padding-bottom: \d+px;/);
  });

  it('a conversation is drawn into the room above a phone\'s keyboard', () => {
    expect(WAHUB).toMatch(/\.wahub\.shell\[data-chat-open\]\[data-keyboard\] \{\s*height: var\(--kbd-height\);/);
  });

  it('nothing is sized by 100vh — a phone\'s bars would hide its foot', () => {
    for (const sheet of [WAHUB, REFINE, MOTION, FUTURE]) expect(sheet).not.toMatch(/(?<!max-)height:\s*100vh/);
  });
});

describe('the clock\'s bubble and the note keep to the layer', () => {
  it('every length is one of the layer\'s own — nothing is timed by hand', () => {
    for (const line of moves(FUTURE)) expect(literalTimes(line), line).toEqual([]);
  });

  it('on a phone the bubble is a sheet inside the conversation, so a keyboard lifts it instead of covering it', () => {
    const phone = FUTURE.slice(FUTURE.indexOf('@media (max-width: 767px)'));
    expect(phone).toMatch(/\.anchor \{\s*position: static;/);
    expect(phone).toMatch(/\.later \{[^}]*bottom: 0;/);
    expect(phone).not.toMatch(/position: fixed/);
    // Its buttons are pinned to its foot, clear of the home bar; its body scrolls by itself.
    expect(phone).toMatch(/\.laterFoot \{[^}]*env\(safe-area-inset-bottom/);
    expect(FUTURE).toMatch(/\.laterBody \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
  });

  it('"reduce motion" stops what it adds', () => {
    const block = FUTURE.slice(FUTURE.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const name of ['.later', '.scrim', '.step', '.strip', '.noteBox']) expect(block).toContain(name);
  });
});

describe('the pieces', () => {
  it('"thinking" is three dots; with a name it is announced, without one it is decoration', () => {
    const plain = renderToStaticMarkup(<ThinkingDots />);
    expect(plain.match(/<i><\/i>/g)).toHaveLength(3);
    expect(plain).toContain('aria-hidden="true"');
    expect(plain).toContain(m.thinking);
    const named = renderToStaticMarkup(<ThinkingDots label="הבוט חושב" />);
    expect(named).toContain('role="status"');
    expect(named).toContain('aria-label="הבוט חושב"');
    expect(named).not.toContain('aria-hidden');
  });

  it('"הבוט כותב…" in a conversation carries the same three dots', () => {
    const html = renderToStaticMarkup(<TypingBubble />);
    expect(html).toContain(s.typing);
    expect(html).toContain(m.thinking);
    expect(html.match(/<i><\/i>/g)).toHaveLength(3);
    // It pops in from the answering side, like the answer it stands in for.
    expect(html).toContain(m.messageOut);
  });

  it('a folded section is not in the page at all', () => {
    expect(renderToStaticMarkup(<Fold open={false}>סוד</Fold>)).toBe('');
  });

  it('an open one is drawn open, with its content and the id its button names', () => {
    const html = renderToStaticMarkup(
      <Fold open id="panel-1" innerClassName="inner">
        תוכן
      </Fold>,
    );
    expect(html).toContain('id="panel-1"');
    expect(html).toContain('data-open=""');
    expect(html).toContain('תוכן');
    expect(html).toContain(m.fold);
    expect(html).toContain(m.foldInner);
    expect(html).toContain('inner');
  });

  it('a number is drawn at its real value where nothing can count it up (the server, a reader)', () => {
    expect(renderToStaticMarkup(<CountUp value={1234} />)).toBe('<span>1,234</span>');
    expect(renderToStaticMarkup(<CountUp value={0} />)).toBe('<span>0</span>');
  });

  it('a tick is decoration: the word beside it says what happened', () => {
    const html = renderToStaticMarkup(<Tick />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(m.tick);
  });
});
