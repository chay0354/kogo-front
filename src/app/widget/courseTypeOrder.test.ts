import { describe, expect, test } from 'vitest';
import { sortWidgetCourseTypes } from './courseTypeOrder';

describe('sortWidgetCourseTypes', () => {
  test('puts capoeira, dance, aerial, then breakdance', () => {
    const names = sortWidgetCourseTypes([
      { id: '4', name: 'ברייקדאנס' },
      { id: '3', name: 'אקרובטיקה אווירית' },
      { id: '2', name: 'מחול' },
      { id: '1', name: 'קפוארה' },
    ]).map((row) => row.name);
    expect(names).toEqual(['קפוארה', 'מחול', 'אקרובטיקה אווירית', 'ברייקדאנס']);
  });

  test('skips missing types and keeps the rest after', () => {
    const names = sortWidgetCourseTypes([
      { id: 'z', name: 'יוגה' },
      { id: 'a', name: 'אקרובטיקה אווירית' },
      { id: 'c', name: 'קפואירה' },
    ]).map((row) => row.name);
    expect(names).toEqual(['קפואירה', 'אקרובטיקה אווירית', 'יוגה']);
  });
});
