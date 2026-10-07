import { describe, expect, it } from 'vitest';
import { BRANCH_NEEDED, branchMissing, categoryNeeded, pickedBranchesBusiness } from './incomePlace';

const BUSINESSES = [
  { id: 'b-branches', name: 'סניפים' },
  { id: 'b-courses', name: 'חוגים' },
  { id: 'b-spaced', name: ' סניפים ' },
];

describe('pickedBranchesBusiness', () => {
  it('knows the business סניפים by the id picked in the list', () => {
    expect(pickedBranchesBusiness(BUSINESSES, 'b-branches')).toBe(true);
    expect(pickedBranchesBusiness(BUSINESSES, 'b-spaced')).toBe(true);
  });

  it('is false for any other business, for none, and for one not in the list', () => {
    expect(pickedBranchesBusiness(BUSINESSES, 'b-courses')).toBe(false);
    expect(pickedBranchesBusiness(BUSINESSES, '')).toBe(false);
    expect(pickedBranchesBusiness(BUSINESSES, null)).toBe(false);
    expect(pickedBranchesBusiness(BUSINESSES, 'gone')).toBe(false);
    expect(pickedBranchesBusiness([], 'b-branches')).toBe(false);
  });
});

describe('branchMissing', () => {
  it('asks for a branch under סניפים when none was chosen', () => {
    expect(branchMissing(true, '')).toBe(BRANCH_NEEDED);
    expect(branchMissing(true, null)).toBe(BRANCH_NEEDED);
  });

  it('asks for nothing once a branch is chosen', () => {
    expect(branchMissing(true, 'branch-1')).toBe('');
  });

  it('asks for nothing when the family has a branch the server falls back to', () => {
    expect(branchMissing(true, '', 'family-branch')).toBe('');
    expect(branchMissing(true, '', null)).toBe(BRANCH_NEEDED);
    expect(branchMissing(true, '', '')).toBe(BRANCH_NEEDED);
  });

  it('never asks under another business: the branch stays optional there', () => {
    expect(branchMissing(false, '')).toBe('');
    expect(branchMissing(false, null)).toBe('');
  });
});

describe('categoryNeeded', () => {
  it('is never needed under סניפים', () => {
    expect(categoryNeeded(true, true)).toBe(false);
    expect(categoryNeeded(true, false)).toBe(false);
  });

  it('follows the window under any other business', () => {
    expect(categoryNeeded(false, true)).toBe(true);
    expect(categoryNeeded(false, false)).toBe(false);
  });
});
