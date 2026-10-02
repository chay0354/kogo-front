import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

// The components are compiled with the classic JSX runtime here, which looks for React by name —
// and these modules build small icons as they load, so they are loaded after the name is set.
(globalThis as { React?: typeof React }).React = React;

let FoldStrip: typeof import('./KnownParentCard').FoldStrip;
let childDetailsFilled: typeof import('./AdditionalChildSection').childDetailsFilled;
let createEmptyAdditionalChild: typeof import('./AdditionalChildSection').createEmptyAdditionalChild;

beforeAll(async () => {
  ({ FoldStrip } = await import('./KnownParentCard'));
  ({ childDetailsFilled, createEmptyAdditionalChild } = await import('./AdditionalChildSection'));
});

describe('FoldStrip', () => {
  it('offers "edit" while folded and "close" while open', () => {
    const folded = renderToStaticMarkup(<FoldStrip title="דנה כהן" note="הורה · 0501234567" open={false} onToggle={() => undefined} />);
    const opened = renderToStaticMarkup(<FoldStrip title="דנה כהן" open onToggle={() => undefined} />);

    expect(folded).toContain('דנה כהן');
    expect(folded).toContain('הורה · 0501234567');
    expect(folded).toContain('עריכה');
    expect(folded).toContain('aria-expanded="false"');
    expect(opened).toContain('סגירה');
  });

  it('does not offer to close a part that has something missing', () => {
    const html = renderToStaticMarkup(<FoldStrip title="דנה" open missing onToggle={() => undefined} />);

    expect(html).not.toContain('סגירה');
    expect(html).not.toContain('<svg');
  });
});

describe('the details of a child added in the form', () => {
  const kid = { id: 'k1', firstName: 'תמר', lastName: 'כ••••', idNumber: '••••••••6', birthDate: '••/••/•••8', gender: 'female' as const };
  const typedChild = () => ({
    ...createEmptyAdditionalChild('c2'),
    firstName: 'נועם', lastName: 'כהן', idNumber: '123456782', birthDate: '2018-03-02', gender: 'female' as const,
  });

  it('are in once every one of them was typed', () => {
    const typed = typedChild();
    expect(childDetailsFilled(typed)).toBe(true);
    expect(childDetailsFilled({ ...typed, idNumber: '' })).toBe(false);
    expect(childDetailsFilled({ ...typed, gender: '' })).toBe(false);
    expect(childDetailsFilled(createEmptyAdditionalChild('c3'))).toBe(false);
  });

  it('are in for a child chosen from the list, until a hidden field is opened and left empty', () => {
    const chosen = { ...createEmptyAdditionalChild('c2'), known: kid, knownAsked: true, firstName: 'תמר', gender: 'female' as const };

    expect(childDetailsFilled(chosen)).toBe(true);
    expect(childDetailsFilled({ ...chosen, openedFields: ['idNumber'] })).toBe(false);
  });
});
