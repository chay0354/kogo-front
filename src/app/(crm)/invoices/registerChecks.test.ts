/**
 * Registering a check plan: every check carries whether it is crossed "לא
 * סחיר" in the customer's name (audit M3, 30.9.2026). The server reads a check
 * it is not told about as not crossed, and sends the plan's originals to paper.
 */
import { describe, expect, it } from 'vitest';
import { checkPlanChecks, crossedChecksNote, type CheckDraftRow } from './checkPlanRules';

function row(overrides: Partial<CheckDraftRow> = {}): CheckDraftRow {
  return {
    date: '2026-10-01',
    bank: '12',
    branch: '600',
    accountNumber: '123456',
    checkNumber: '7001',
    amount: '350',
    crossed: false,
    ...overrides,
  };
}

describe('checkPlanChecks', () => {
  it('sends check_crossed with every check, as ticked', () => {
    expect(checkPlanChecks([row({ crossed: true }), row({ checkNumber: '7002' })])).toEqual([
      { date: '2026-10-01', bank: '12', branch: '600', account_number: '123456', check_number: '7001', amount: 350, check_crossed: true },
      { date: '2026-10-01', bank: '12', branch: '600', account_number: '123456', check_number: '7002', amount: 350, check_crossed: false },
    ]);
  });

  it('leaves out a row with no date or no amount', () => {
    expect(checkPlanChecks([row({ date: '' }), row({ amount: '0' }), row({ amount: '' }), row({ checkNumber: '9' })]))
      .toHaveLength(1);
  });
});

describe('crossedChecksNote', () => {
  it('says the originals go by mail only when every check is crossed', () => {
    expect(crossedChecksNote([row({ crossed: true }), row({ crossed: true })])).toContain('במייל');
    expect(crossedChecksNote([row({ crossed: true }), row({ crossed: false })])).toContain('על נייר');
    expect(crossedChecksNote([])).toBe('');
  });
});
