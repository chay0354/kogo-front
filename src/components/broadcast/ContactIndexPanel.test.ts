/**
 * The broadcast results offer the one-time ManyChat fix only for the rows it
 * fixes, and check each of their numbers once.
 */
import { describe, expect, it } from 'vitest';
import type { BroadcastRow } from '@/lib/whatsappApi';
import { unfindablePhones } from './ContactIndexPanel';

const row = (over: Partial<BroadcastRow>): BroadcastRow => ({
  child_id: Math.random().toString(36),
  child_name: 'ילד',
  parent_name: 'הורה',
  phone: '972545757056',
  status: 'failed',
  reason: 'contact_unfindable',
  ...over,
});

describe('unfindablePhones', () => {
  it('takes the failed rows ManyChat has but Kogo cannot find', () => {
    expect(unfindablePhones([row({}), row({ phone: '972544440462' })])).toEqual(['972545757056', '972544440462']);
  });

  it('leaves out rows that failed for another reason, were sent, or were skipped', () => {
    expect(
      unfindablePhones([
        row({ reason: null }),
        row({ status: 'sent', reason: null }),
        row({ status: 'skipped', reason: 'no_parent_phone' }),
        row({ phone: '' }),
      ]),
    ).toEqual([]);
  });

  it('lists siblings on one phone once', () => {
    expect(unfindablePhones([row({}), row({})])).toEqual(['972545757056']);
  });
});
