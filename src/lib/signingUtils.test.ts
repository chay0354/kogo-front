/**
 * The signature's display rules: nothing new shows until the server says
 * enabled, and a fingerprint is written the way Acrobat shows it, so the
 * office and the customer compare like with like.
 */
import { describe, expect, it } from 'vitest';
import type { SigningStatus } from './signingApi';
import {
  formatFingerprint,
  formatSigningStamp,
  formatValidity,
  isSigningConfigured,
  localIsoStamp,
  isSigningOn,
  signingBackendLabel,
} from './signingUtils';

function status(overrides: Partial<SigningStatus> = {}): SigningStatus {
  return {
    enabled: false,
    consent_enforced: false,
    backend: 'none',
    key_id: null,
    cert_fingerprint: null,
    cert_subject: null,
    last_signed_at: null,
    counts: { held: 0, paper_pending: 0, signed_today: 0 },
    ...overrides,
  };
}

describe('isSigningOn — hidden when disabled', () => {
  it('is off with no status, a failed request or a server without the feature', () => {
    expect(isSigningOn(null)).toBe(false);
    expect(isSigningOn(undefined)).toBe(false);
  });

  it('is off while the switch is off, even with a key in place', () => {
    expect(isSigningOn(status({ enabled: false, backend: 'gcp_kms', key_id: 'k/1' }))).toBe(false);
  });

  it('is on only when the server says enabled', () => {
    expect(isSigningOn(status({ enabled: true }))).toBe(true);
  });
});

describe('isSigningConfigured', () => {
  it('needs a backend and a key', () => {
    expect(isSigningConfigured(status())).toBe(false);
    expect(isSigningConfigured(status({ backend: 'gcp_kms' }))).toBe(false);
    expect(isSigningConfigured(status({ backend: 'gcp_kms', key_id: 'k/1' }))).toBe(true);
    expect(isSigningConfigured(null)).toBe(false);
  });
});

describe('signingBackendLabel', () => {
  it('names each backend, and says so when none is set', () => {
    expect(signingBackendLabel('gcp_kms')).toBe('Google Cloud KMS (HSM)');
    expect(signingBackendLabel('local')).toContain('לבדיקות');
    expect(signingBackendLabel('none')).toBe('לא הוגדר');
    expect(signingBackendLabel(null)).toBe('לא הוגדר');
  });
});

describe('formatFingerprint', () => {
  const hex = '0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const shown =
    '0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9';

  it('writes bare hex as upper-case pairs split by colons', () => {
    expect(formatFingerprint(hex)).toBe(shown);
  });

  it('gives the same answer whatever separators it arrived with', () => {
    expect(formatFingerprint(shown.toLowerCase())).toBe(shown);
    expect(formatFingerprint(hex.match(/.{2}/g)!.join(' '))).toBe(shown);
    expect(formatFingerprint(`  ${hex}\n`)).toBe(shown);
  });

  it('shows anything that is not whole bytes of hex as it came', () => {
    expect(formatFingerprint('abc')).toBe('abc');
    expect(formatFingerprint('not-a-fingerprint')).toBe('not-a-fingerprint');
  });

  it('is empty for nothing', () => {
    expect(formatFingerprint(null)).toBe('');
    expect(formatFingerprint('   ')).toBe('');
  });
});

describe('formatSigningStamp and formatValidity', () => {
  it('shows a moment on Israel\'s clock, whatever offset it came with', () => {
    expect(formatSigningStamp('2026-09-23T14:05:59+03:00')).toBe('23.9.2026 14:05');
    // The API writes UTC: 15:19Z is 18:19 in Israel (summer time).
    expect(formatSigningStamp('2026-09-24T15:19:26.734501Z')).toBe('24.9.2026 18:19');
    expect(formatSigningStamp('2026-09-24T22:30:00+00:00')).toBe('25.9.2026 01:30');
    // Winter: UTC+2.
    expect(formatSigningStamp('2026-12-01T10:00:00Z')).toBe('1.12.2026 12:00');
  });

  it('reads a value without an offset off the text, not the browser clock', () => {
    expect(formatSigningStamp('2026-09-23T14:05:59')).toBe('23.9.2026 14:05');
    expect(formatSigningStamp('2026-09-03')).toBe('3.9.2026');
    expect(formatSigningStamp(null)).toBe('');
    expect(formatSigningStamp('garbage')).toBe('');
  });

  it('writes a validity range, or the side of it that is known', () => {
    expect(formatValidity('2026-09-01T00:00:00Z', '2036-08-31T20:59:59Z')).toBe('1.9.2026 – 31.8.2036');
    expect(formatValidity(null, '2036-08-31')).toBe('עד 31.8.2036');
    expect(formatValidity('2026-09-01', null)).toBe('מ-1.9.2026');
    expect(formatValidity(null, null)).toBe('');
  });
});

describe('localIsoStamp', () => {
  it('writes the office clock, not UTC, so a print made here reads at the hour it was made', () => {
    const at = new Date(2026, 8, 23, 23, 37, 5);
    expect(localIsoStamp(at)).toBe('2026-09-23T23:37:05');
    expect(formatSigningStamp(localIsoStamp(at))).toBe('23.9.2026 23:37');
  });
});
