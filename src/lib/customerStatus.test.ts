import { describe, it, expect } from 'vitest';
import {
  CHILD_STATUSES,
  getChildStatus,
  getCustomerTableStatus,
  normalizeChildStatus,
} from './customerUtils';
import type { ChildWithDetails } from '@/types/customer';

/** `status` is typed loosely on purpose: some of these tests feed it values the
 *  database may still hold but the type no longer admits. */
function child(over: Record<string, unknown>): ChildWithDetails {
  return {
    id: 'c1',
    first_name: 'ילד',
    last_name: 'בדיקה',
    status: 'pending',
    ...over,
  } as unknown as ChildWithDetails;
}

describe('the list of statuses', () => {
  it('is exactly the six that exist', () => {
    expect([...CHILD_STATUSES]).toEqual([
      'active',
      'trial_signed',
      'trial_completed',
      'pending',
      'payment_problem',
      'ghost',
    ]);
  });

  it('gives each of them a Hebrew label', () => {
    for (const status of CHILD_STATUSES) {
      const label = getChildStatus(child({ status })).hebrewStatus;
      expect(label).not.toBe('לא מוגדר');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('labels פעיל as money in, not merely enrolled', () => {
    expect(getChildStatus(child({ status: 'active' })).description).toContain('הכסף');
  });
});

describe('statuses written before the list was settled', () => {
  it('reads not_paid as a card problem', () => {
    expect(normalizeChildStatus('not_paid')).toBe('payment_problem');
    expect(getChildStatus(child({ status: 'not_paid' })).hebrewStatus).toBe('בעיה באשראי');
  });

  it('does not leave inactive or expired showing "לא מוגדר"', () => {
    for (const legacy of ['inactive', 'non_active', 'expired', 'trial']) {
      expect(getChildStatus(child({ status: legacy })).hebrewStatus).not.toBe('לא מוגדר');
    }
  });

  it('still says "לא מוגדר" for something genuinely unknown', () => {
    expect(getChildStatus(child({ status: 'wat' })).hebrewStatus).toBe('לא מוגדר');
    expect(normalizeChildStatus('wat')).toBeNull();
  });
});

describe('the customers table', () => {
  it('shows the stored status, not one invented from enrolments', () => {
    // The old rule redrew any child with a non-trial enrolment as פעיל, whether
    // or not a shekel had ever arrived — which is what פעיל is meant to mean.
    const unpaid = child({
      status: 'pending',
      enrollments: [{ id: 'e1', trial_lesson_date: null }],
    });
    expect(getCustomerTableStatus(unpaid).hebrewStatus).toBe('בתהליך רישום');
  });

  it('does not turn a completed trial back into נרשם לניסיון', () => {
    const doneTrial = child({
      status: 'trial_completed',
      enrollments: [{ id: 'e1', trial_lesson_date: '2026-09-01' }],
    });
    expect(getCustomerTableStatus(doneTrial).hebrewStatus).toBe('ביצע ניסיון');
  });

  it('agrees with the profile view for every status', () => {
    for (const status of CHILD_STATUSES) {
      expect(getCustomerTableStatus(child({ status }))).toEqual(getChildStatus(child({ status })));
    }
  });
});
