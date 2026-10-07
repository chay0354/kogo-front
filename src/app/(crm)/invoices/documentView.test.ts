import { describe, expect, it } from 'vitest';
import { hasSignedOriginal, signatureLine, signedMoment, viewFilename } from './documentView';

describe('whether a document was signed, said in the viewer', () => {
  it('says it was signed, and when, in the studio\'s own time', () => {
    // 09:30 UTC on 7.10.2026 is 12:30 in Israel.
    expect(signatureLine({ signed_original_id: 'abc', signed_at: '2026-10-07T09:30:40.500102+00:00' }))
      .toBe('נחתם דיגיטלית · 7.10.2026, 12:30');
  });

  it('crosses midnight with the studio, not with UTC', () => {
    expect(signedMoment('2026-10-06T22:15:00+00:00')).toBe('7.10.2026, 01:15');
  });

  it('says only that it was signed when the moment is missing or unreadable', () => {
    expect(signatureLine({ signed_original_id: 'abc', signed_at: '' })).toBe('נחתם דיגיטלית');
    expect(signatureLine({ signed_original_id: 'abc', signed_at: 'not a date' })).toBe('נחתם דיגיטלית');
  });

  it('says nothing of a document with no signed original', () => {
    expect(signatureLine({ signed_original_id: null, signed_at: '' })).toBe('');
    expect(signatureLine({})).toBe('');
    expect(hasSignedOriginal({ signed_original_id: null })).toBe(false);
    expect(hasSignedOriginal({ signed_original_id: 'abc' })).toBe(true);
  });
});

describe('the name a shown file is kept under', () => {
  it('names a copy as a copy, and the signed file by its number alone', () => {
    expect(viewFilename('TI-2026-000003', 'copy')).toBe('TI-2026-000003 - העתק.pdf');
    expect(viewFilename('TI-2026-000003', 'original')).toBe('TI-2026-000003.pdf');
  });

  it('keeps a number with a slash in it one file name', () => {
    expect(viewFilename('INV/2026:7', 'copy')).toBe('INV-2026-7 - העתק.pdf');
    expect(viewFilename('', 'original')).toBe('מסמך.pdf');
  });
});
