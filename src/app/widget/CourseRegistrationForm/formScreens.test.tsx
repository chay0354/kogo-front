import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LessonHead from './LessonHead';
import ResultScreen from './ResultScreen';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

describe('LessonHead', () => {
  it('writes the class name once, and a tag for the day, the hours and the place', () => {
    const html = renderToStaticMarkup(
      <LessonHead name="קפוארה 3-4.5 בוי יום שני" line="יום שני · 16:45-17:30 · פתח תקווה" />,
    );

    expect(html.split('קפוארה').length - 1).toBe(1);
    expect(html).toContain('<span>יום שני</span>');
    expect(html).toContain('<span dir="ltr">16:45-17:30</span>');
    expect(html).toContain('<span>פתח תקווה</span>');
  });

  it('shows the name alone when there is no single day to show', () => {
    const html = renderToStaticMarkup(<LessonHead name="ריקוד" line="" />);

    expect(html).toContain('ריקוד');
    expect(html.match(/<span/g)?.length).toBe(1); // the icon only
  });
});

describe('ResultScreen', () => {
  it('shows the title, the lines under it and the buttons', () => {
    const html = renderToStaticMarkup(
      <ResultScreen tone="stop" title="התשלום נכשל" actions={<button type="button">נסה שנית</button>}>
        <p>הכרטיס לא חויב.</p>
      </ResultScreen>,
    );

    expect(html).toContain('התשלום נכשל');
    expect(html).toContain('הכרטיס לא חויב.');
    expect(html).toContain('נסה שנית');
  });

  it('turns a ring instead of a sign while something is being checked', () => {
    const waiting = renderToStaticMarkup(<ResultScreen tone="wait" busy title="בודקים את התשלום" />);
    const still = renderToStaticMarkup(<ResultScreen tone="wait" title="עדיין אין אישור מחברת הסליקה" />);

    expect(waiting).not.toContain('<svg');
    expect(still).toContain('<svg');
  });
});
