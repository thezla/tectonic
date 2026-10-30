import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('motion accessibility policy', () => {
  it('disables animations and transitions for elements, decorations, and dialog backdrops', () => {
    const reducedMotion = stylesheet.slice(stylesheet.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotion).toMatch(/\*,\s*\*::before,\s*\*::after,\s*\*::backdrop\s*\{\s*animation: none !important;\s*transition: none !important;/);
    expect(reducedMotion).toContain('transform: none;');
  });

  it('keeps decorative motion finite instead of continuously distracting during play', () => {
    expect(stylesheet).not.toMatch(/\binfinite\b/);
  });
});
