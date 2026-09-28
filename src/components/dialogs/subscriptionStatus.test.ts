/**
 * The child card's "סטטוס מנוי" badge follows the child's status. It used to
 * read "פעיל" for every child without a past date — 621 of 625 non-active
 * children in production.
 */
import { describe, expect, it } from 'vitest';
import { subscriptionBadge } from './subscriptionStatus';

const TODAY = new Date(2026, 8, 27, 10, 0); // 27.9.2026, local time

describe('subscriptionBadge', () => {
  it('shows an active child as פעיל with the date they are paid up to', () => {
    expect(subscriptionBadge({ status: 'active', paid_until_date: '2026-10-15' }, TODAY)).toEqual({
      label: 'פעיל · שולם עד 15.10.2026',
      variant: 'secondary',
    });
  });

  it('shows an active child with no paid-until date as פעיל', () => {
    // A payment that has just gone through, before the date is written.
    expect(subscriptionBadge({ status: 'active', paid_until_date: null }, TODAY)).toEqual({
      label: 'פעיל',
      variant: 'secondary',
    });
  });

  it('counts the paid-until day itself as paid', () => {
    expect(subscriptionBadge({ status: 'active', paid_until_date: '2026-09-27' }, TODAY).label).toBe(
      'פעיל · שולם עד 27.9.2026',
    );
  });

  it('marks an active child whose paid-until date is behind us as ended', () => {
    expect(subscriptionBadge({ status: 'active', paid_until_date: '2026-09-26' }, TODAY)).toEqual({
      label: 'הסתיים · שולם עד 26.9.2026',
      variant: 'destructive',
    });
  });

  it('never shows פעיל for a child who is not active, dates or no dates', () => {
    const cases: Array<[string, string]> = [
      ['payment_problem', 'בעיה באשראי'],
      ['pending', 'בתהליך רישום'],
      ['trial_signed', 'נרשם לניסיון'],
      ['trial_completed', 'ביצע ניסיון'],
      ['inactive', 'לא פעיל'],
      ['ghost', 'רפאים'],
    ];
    for (const [status, label] of cases) {
      for (const paid_until_date of [null, '2026-12-31', '2026-01-01']) {
        const badge = subscriptionBadge({ status, paid_until_date }, TODAY);
        expect(badge.label).toBe(label);
        expect(badge.label).not.toContain('פעיל ·');
      }
    }
  });

  it('flags a failed card in red and leaves the rest quiet', () => {
    expect(subscriptionBadge({ status: 'payment_problem' }, TODAY).variant).toBe('destructive');
    expect(subscriptionBadge({ status: 'pending' }, TODAY).variant).toBe('outline');
    expect(subscriptionBadge({ status: 'inactive' }, TODAY).variant).toBe('outline');
  });

  it('reads an old stored status as the one it became', () => {
    expect(subscriptionBadge({ status: 'not_paid' }, TODAY).label).toBe('בעיה באשראי');
    expect(subscriptionBadge({ status: 'expired', paid_until_date: '2027-01-01' }, TODAY).label).toBe('לא פעיל');
  });

  it('says it does not know rather than פעיל for an unknown status', () => {
    expect(subscriptionBadge({ status: null }, TODAY).label).toBe('לא מוגדר');
    expect(subscriptionBadge({ status: 'something_else' }, TODAY).label).toBe('לא מוגדר');
  });
});
