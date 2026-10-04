import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.module.css', import.meta.url), 'utf8');

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  expect(match, `${selector} should exist`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('the registration terms modal viewport contract', () => {
  it('keeps safe space around the modal, including the phone safe area', () => {
    const overlay = rule('.termsOverlay');

    expect(overlay).toContain('box-sizing: border-box');
    expect(overlay).toContain('padding: 16px');
    expect(overlay).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('caps iframe viewport units by the host-reported visible overlay', () => {
    const modal = rule('.termsModal');

    expect(modal).toContain('max-height: min(70vh, 100%)');
    expect(modal).toContain('max-height: min(70dvh, 100%)');
  });
});
