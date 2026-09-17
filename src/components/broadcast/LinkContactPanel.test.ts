/**
 * The number on the link panel is the one the office types into ManyChat's
 * search, so it has to read the way an Israeli number is written.
 */
import { describe, expect, it } from 'vitest';
import { localPhone } from './LinkContactPanel';

describe('localPhone', () => {
  it('turns the international form the server returns into the local one', () => {
    expect(localPhone('972548185646')).toBe('054-8185646');
    expect(localPhone('+972548185646')).toBe('054-8185646');
  });

  it('leaves a local number local', () => {
    expect(localPhone('0548185646')).toBe('054-8185646');
  });

  it('does not invent a dash for a number of another length', () => {
    expect(localPhone('97231234567')).toBe('031234567');
    expect(localPhone('')).toBe('');
  });
});
