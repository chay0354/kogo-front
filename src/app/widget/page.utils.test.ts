import { describe, expect, test } from 'vitest';
import { resolveWidgetExternalLink } from './page.utils';

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
