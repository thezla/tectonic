import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getRegionPalette } from './board.js';

describe('Soft Terrain region palette', () => {
  it('cycles through the six region tints from the approved mockup', () => {
    const palette = getRegionPalette(36);
    expect(palette).toHaveLength(36);
    expect(palette.slice(0, 6)).toEqual([
      'var(--region-1)', 'var(--region-2)', 'var(--region-3)',
      'var(--region-4)', 'var(--region-5)', 'var(--region-6)',
    ]);
    expect(palette.slice(6, 12)).toEqual(palette.slice(0, 6));
  });

  it('retains the mockup charcoal, lavender, mint, and exact region color mixes', () => {
    const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
    expect(stylesheet).toContain('color-scheme: dark;');
    expect(stylesheet).toContain('background: #0a0a0a;');
    expect(stylesheet).toContain('--panel: color-mix(in srgb, #c084fc 10%, #111111);');
    expect(stylesheet).toContain('--accent: #2dd4bf;');
    const tints = ['#346bf1', '#2dd4bf', '#fbbf24', '#c084fc', '#fb7185', '#a3e635'];
    tints.forEach((tint, index) => {
      expect(stylesheet).toContain(`--region-${index + 1}: color-mix(in srgb, ${tint} 22%, #111111);`);
    });
  });

  it('keeps region colors stable regardless of the total number of regions', () => {
    expect(getRegionPalette(12).slice(0, 6)).toEqual(getRegionPalette(6));
    expect(getRegionPalette(0)).toEqual([]);
  });
});
