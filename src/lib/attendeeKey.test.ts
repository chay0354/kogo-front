import { describe, expect, it } from 'vitest';
import { attendeeKey } from './scheduleUtils';

describe('attendeeKey', () => {
  it('uses the child id for a registered child', () => {
    expect(attendeeKey({ attendee_id: 'c-1', child_id: 'c-1' })).toBe('c-1');
  });

  it('uses the student id for a municipality child, who has no child id', () => {
    expect(attendeeKey({ attendee_id: 'e-1', child_id: null })).toBe('e-1');
  });

  it('falls back to child_id from a server that predates attendee_id', () => {
    expect(attendeeKey({ child_id: 'c-2' })).toBe('c-2');
  });

  it('never produces the string "null", which would collide across rows', () => {
    const a = attendeeKey({ child_id: null });
    const b = attendeeKey({});
    expect(a).toBe('');
    expect(b).toBe('');
    expect(String(a)).not.toBe('null');
  });
});
