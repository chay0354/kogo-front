import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import tailwind from '../../tailwind.config';

/**
 * The admin's type (docs/CHANGE-IMPACT-2026-10-12-CRM-ROUND-FONT-AND-CLARITY.md):
 * the round face is in force where the admin shell is on the page, and nowhere
 * else — the customer pages (the widget, the payment and card pages, signing)
 * have an approved look of their own, in Heebo, and must stay exactly as they
 * were. The rule is read from the files that carry it.
 */

const APP = path.resolve(__dirname);
const read = (file: string) => readFileSync(path.join(APP, file), 'utf8');
const css = read('globals.css');

/** Every file under a folder of the app, by its path from the app's root. */
function filesUnder(folder: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(path.join(APP, dir))) {
      const file = path.join(dir, name);
      if (statSync(path.join(APP, file)).isDirectory()) walk(file);
      else out.push(file);
    }
  };
  walk(folder);
  return out;
}

/** The customer-facing pages: outside the admin's route group, each with a look of its own. */
const CUSTOMER_PAGES = ['widget', 'pay', 'c', 's', 'rc', 'card-link', 'replace-card', 'update-card', 'store-closed', 'signing-certificate'];

describe('the admin\'s type is set only where the admin shell is', () => {
  it('`font-sans` and `font-display` read a variable, and without one both are Heebo', () => {
    const fonts = (tailwind.theme?.extend as { fontFamily: Record<string, string[]> }).fontFamily;
    expect(fonts.sans).toEqual(['var(--font-app, "Heebo")', 'sans-serif']);
    expect(fonts.display).toEqual(['var(--font-display, var(--font-app, "Heebo"))', 'sans-serif']);
  });

  it('the variables are set under the shell\'s own mark — on the document, so a dialog or a toast drawn outside the shell is in the same type', () => {
    const rule = /html:has\(\[data-app-font='round'\]\),\s*\[data-app-font='round'\]\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/--font-app:\s*'Fredoka', 'Heebo';/);
    expect(rule![1]).toMatch(/--font-display:\s*'Fredoka', 'Heebo';/);
    // Nowhere else: no rule sets them for the whole document, whatever page is on it.
    const everywhere = css.replace(rule![0], '');
    expect(everywhere).not.toMatch(/--font-app\s*:/);
    expect(everywhere).not.toMatch(/--font-display\s*:/);
  });

  it('the fonts come the way Heebo always did — one request to Google Fonts, with display=swap — and Heebo is still among them', () => {
    const imports = css.match(/@import url\('([^']+)'\)/g) ?? [];
    expect(imports).toHaveLength(1);
    expect(imports[0]).toContain('fonts.googleapis.com/css2?');
    expect(imports[0]).toContain('family=Heebo:wght@300;400;500;600;700;800');
    expect(imports[0]).toContain('family=Fredoka:wght@300..700');
    expect(imports[0]).toContain('display=swap');
  });

  it('the mark is on the admin\'s layout, and on no customer page', () => {
    expect(read('(crm)/layout.tsx')).toContain('data-app-font="round"');
    expect(read('layout.tsx')).not.toContain('data-app-font');
    for (const page of CUSTOMER_PAGES) {
      for (const file of filesUnder(page)) {
        if (!/\.(tsx?|css)$/.test(file)) continue;
        const source = read(file);
        expect(source, file).not.toContain('data-app-font');
        expect(source, file).not.toContain('Fredoka');
        expect(source, file).not.toMatch(/--font-(app|display)\s*:/);
      }
    }
  });

  it('headings take the display face at no specificity, so a class that names a family of its own still wins', () => {
    expect(css).toMatch(/:where\(html:has\(\[data-app-font='round'\]\)\) :where\(h1, h2, h3\)/);
    // Figures in a table keep one width wherever the face has such figures.
    expect(css).toMatch(/:where\(html:has\(\[data-app-font='round'\]\)\) :where\(table\)\s*\{\s*font-variant-numeric: tabular-nums;/);
  });
});
