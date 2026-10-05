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

  it('is never taller than the overlay it stands in, and says nothing in viewport units', () => {
    const modal = rule('.termsModal');

    // The overlay is the visible part of the sheet (#kogo-sheet-layer). Inside the
    // host's frame vh / svh measure the frame, which is longer than the screen.
    expect(modal).toContain('max-height: min(640px, 100%)');
    expect(modal).not.toMatch(/\d(vh|svh|dvh|lvh)\b/);
  });

  it('keeps the head and the foot whole while the text between them scrolls', () => {
    expect(css).toMatch(/\.termsHeader,\s*\.termsFooter\s*\{\s*flex: none;/);
    expect(rule('.termsBody')).toContain('overflow-y: auto');
    expect(rule('.termsBody')).toContain('overscroll-behavior: contain');
  });

  it('opens in the layer the page keeps over the visible part of the sheet, not inside the sheet', () => {
    // Inside the sheet "fixed" is the sheet: longer than the screen, and scrolling.
    // The window then stood off-centre, its approving button below the fold.
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
    const pageCss = readFileSync(new URL('../page.module.css', import.meta.url), 'utf8');
    const form = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

    expect(page).toContain("const SHEET_LAYER_ID = 'kogo-sheet-layer'");
    expect(page).toContain('<div id={SHEET_LAYER_ID} className={styles.sheetLayer} />');
    expect(pageCss).toMatch(/\.sheetLayer\s*\{[^}]*position: fixed;[^}]*inset: 0;/);
    expect(form).toContain("document.getElementById('kogo-sheet-layer')");
    expect(form).toContain('createPortal(termsModal, sheetLayer)');
  });
});
