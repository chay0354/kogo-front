import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LessonHead from './LessonHead';
import RegistrationOverview from './RegistrationOverview';
import ResultScreen from './ResultScreen';
import SelectedLessonCard from './SelectedLessonCard';

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

describe('SelectedLessonCard', () => {
  it('writes which class it is, its name, and a tag for the day, the hours and the place', () => {
    const html = renderToStaticMarkup(
      <SelectedLessonCard caption="חוג 2" name="ג׳ודו ג׳–ד׳" line="יום ראשון · 18:00-18:45 · כפר סבא" onChange={() => undefined} onRemove={() => undefined} />,
    );

    expect(html).toContain('חוג 2');
    expect(html).toContain('<span>יום ראשון</span>');
    expect(html).toContain('<span dir="ltr">18:00-18:45</span>');
    expect(html).toContain('<span>כפר סבא</span>');
    expect(html).toContain('החלפה');
    expect(html).toContain('הסרה');
  });

  it('offers nothing to do on the class the form was opened for', () => {
    const html = renderToStaticMarkup(<SelectedLessonCard caption="חוג 1" name="קפוארה" line="יום שלישי · 16:00-16:45" />);

    expect(html).not.toContain('<button');
  });

  it('says it is being replaced while the list is open for it, and hides its buttons', () => {
    const html = renderToStaticMarkup(
      <SelectedLessonCard caption="חוג 2" name="ג׳ודו" line="" replacing onChange={() => undefined} onRemove={() => undefined} />,
    );

    expect(html).toContain('מחליפים את החוג הזה');
    expect(html).not.toContain('<button');
  });
});

describe('RegistrationOverview', () => {
  const kids = [
    { key: 'primary', name: 'איתי', mark: 'א', lessons: ['קפוארה · יום שלישי', 'ג׳ודו · יום ראשון'], missing: '' as const },
    { key: 'c2', name: 'ילד/ה 2', mark: '2', lessons: [], missing: 'lesson' as const },
    { key: 'c3', name: 'נועם', mark: 'נ', lessons: ['ריקוד · יום שני'], missing: 'details' as const },
  ];

  it('lists every child with their classes, and marks what is missing', () => {
    const html = renderToStaticMarkup(<RegistrationOverview kids={kids} onGo={() => undefined} />);

    expect(html).toContain('בהרשמה הזאת');
    expect(html).toContain('3 ילדים · 3 חוגים');
    expect(html).toContain('ג׳ודו · יום ראשון');
    expect(html).toContain('חסר חוג');
    expect(html).toContain('חסרים פרטים');
    expect(html).not.toContain('₪');
  });

  it('is not shown for one child with one class', () => {
    const html = renderToStaticMarkup(
      <RegistrationOverview kids={[{ ...kids[0], lessons: ['קפוארה · יום שלישי'] }]} onGo={() => undefined} />,
    );

    expect(html).toBe('');
  });
});
