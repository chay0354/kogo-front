import { describe, expect, test } from 'vitest';
import { drawerCourseTitle, resolveWidgetExternalLink } from './page.utils';
import { COGOMELO_APPROVAL_PHRASE, INSTRUCTORS_TRACK_TITLE, stripWidgetApprovalPhrase } from '@/lib/courseUtils';

const CARDCOM = 'https://secure.cardcom.solutions/EA/EA5/eIkY6Sol20OGBKtIK3aGTQ/PaymentSP';

describe('resolveWidgetExternalLink', () => {
  test('opens a course link even when the branch is not external', () => {
    expect(
      resolveWidgetExternalLink(CARDCOM, { is_external: false, external_link: '' }),
    ).toBe(CARDCOM);
  });

  test('keeps other courses on the Kogo form when only the branch could have a link', () => {
    expect(
      resolveWidgetExternalLink('', { is_external: false, external_link: 'https://example.com' }),
    ).toBe('');
  });

  test('falls back to the branch link on an external branch', () => {
    expect(
      resolveWidgetExternalLink('', { is_external: true, external_link: 'https://ccym.org.il' }),
    ).toBe('https://ccym.org.il');
  });

  test('prefers the course link over the branch link', () => {
    expect(
      resolveWidgetExternalLink(CARDCOM, {
        is_external: true,
        external_link: 'https://ccym.org.il',
      }),
    ).toBe(CARDCOM);
  });
});

describe('drawerCourseTitle', () => {
  test('names the course without a hashtag after it', () => {
    expect(
      drawerCourseTitle({ courseName: 'קפוארה גיל 6-8', isBundle: false, isInstructors: false }),
    ).toBe('קפוארה גיל 6-8');
  });

  test('reads exactly like the catalogue row beside it', () => {
    const name = `קפוארה גיל 6-8 - ${COGOMELO_APPROVAL_PHRASE}`;
    expect(drawerCourseTitle({ courseName: name, isBundle: false, isInstructors: false })).toBe(
      stripWidgetApprovalPhrase(name),
    );
  });

  test('keeps the track in brackets so a parent knows which one they picked', () => {
    expect(
      drawerCourseTitle({
        courseName: 'קפוארה גיל 6-8',
        bundleName: 'ראשון + רביעי',
        isBundle: true,
        isInstructors: false,
      }),
    ).toBe('קפוארה גיל 6-8 (ראשון + רביעי)');
  });

  test('falls back to twice a week when the bundle has no name of its own', () => {
    expect(
      drawerCourseTitle({ courseName: 'קפוארה', bundleName: '', isBundle: true, isInstructors: false }),
    ).toBe('קפוארה (פעמיים בשבוע)');
  });

  test('gives an instructors course its own track title instead', () => {
    expect(
      drawerCourseTitle({ courseName: 'קפוארה', isBundle: true, isInstructors: true }),
    ).toBe(`קפוארה (${INSTRUCTORS_TRACK_TITLE})`);
  });

  test('lets a price option speak for itself, brackets and all', () => {
    expect(
      drawerCourseTitle({
        courseName: 'קפוארה',
        priceOptionTitle: 'כרטיסייה 10 כניסות',
        bundleName: 'ראשון + רביעי',
        isBundle: true,
        isInstructors: false,
      }),
    ).toBe('כרטיסייה 10 כניסות');
  });
});
