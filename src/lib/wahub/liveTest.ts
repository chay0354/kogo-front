import type { WahubStatus } from '@/types/wahub';

/**
 * Live test (docs/WAHUB-CONTRACT-LIVE-TEST.md): the new bot answers one real
 * person — the owner's own number — through ManyChat. Everyone else is untouched.
 */

/**
 * How many people are in a live test, by the server's status. The contract
 * names the field and not its shape, so a number and a list are both read.
 * Null on a server built before the live test — nothing about it is shown then.
 */
export function liveTestCount(status: Pick<WahubStatus, 'live_test_contacts'> | null | undefined): number | null {
  const value = status?.live_test_contacts;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  if (Array.isArray(value)) return value.length;
  return null;
}
