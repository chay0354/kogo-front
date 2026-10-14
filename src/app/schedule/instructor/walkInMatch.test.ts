import { describe, expect, it } from 'vitest';
import { findSimilarChild, normalizeNamePart } from './walkInMatch';

const REGISTER = [
  { child_id: '1', child_name: 'נועם כהן' },
  { child_id: '2', child_name: 'מיכאל לוי' },
  { child_id: '3', child_name: 'נועה ישראלי' },
  { child_id: '4', child_name: 'דניאל אבו-חצירא' },
];

const find = (first_name: string, last_name: string) => findSimilarChild({ first_name, last_name }, REGISTER)?.child_id ?? null;

describe('findSimilarChild', () => {
  it('finds the same name typed again', () => {
    expect(find('נועם', 'כהן')).toBe('1');
  });

  it('forgives the spelling an instructor types in a hurry', () => {
    expect(find('נעם', 'כהן')).toBe('1');
    expect(find('נועם', 'כהו')).toBe('1');
    expect(find('מכאל', 'לוי')).toBe('2');
    expect(find('דניאל', 'אבוחצירא')).toBe('4');
    expect(find('נועה', 'ישראל')).toBe('3');
    expect(find('דני', 'אבו-חצירא')).toBe('4');
  });

  it('finds first and last swapped', () => {
    expect(find('כהן', 'נועם')).toBe('1');
  });

  it('never matches on a first name alone', () => {
    expect(find('נועם', 'פרידמן')).toBeNull();
  });

  it('keeps two first names a letter apart as two children', () => {
    expect(find('נועה', 'כהן')).toBeNull();
  });

  it('offers nothing for a different child or an empty box', () => {
    expect(find('יואב', 'שמעוני')).toBeNull();
    expect(find('', 'כהן')).toBeNull();
  });

  it('prefers the exact name over a close one', () => {
    const register = [
      { child_id: 'a', child_name: 'נעם כהן' },
      { child_id: 'b', child_name: 'נועם כהן' },
    ];
    expect(findSimilarChild({ first_name: 'נועם', last_name: 'כהן' }, register)?.child_id).toBe('b');
  });
});

describe('normalizeNamePart', () => {
  it('drops geresh, niqqud and final letters', () => {
    expect(normalizeNamePart("ג'ורג'")).toBe('גורג');
    expect(normalizeNamePart('שָׁלוֹם')).toBe('שלומ');
  });
});
