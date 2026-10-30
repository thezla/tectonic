import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { SOLO_STORAGE_KEY } from './soloStorage.js';

const puzzle = { width: 2, height: 2, regions: [0, 0, 1, 1], givens: [1, null, null, null] };

function setupBrowser(search = '', saved = JSON.stringify({ version: 1, puzzle, values: [1, 2, null, null] })) {
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
  vi.stubGlobal('window', { location: { search }, localStorage: storage });
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('solo startup rendering', () => {
  it('renders the Soft Terrain identity with options kept inside the dialog', () => {
    setupBrowser();
    const markup = renderToStaticMarkup(<App />);
    expect(markup).toContain('<h1 class="wordmark">');
    expect(markup).toContain('class="tile-mark" aria-hidden="true"');
    expect(markup).toContain('<p class="mode-label">Solo puzzle</p>');
    expect(markup).toContain('Fill the regions.<br/> Mind the neighbors.');
    expect(markup).toContain('<p class="game-description">Fill each region with the numbers 1 through its size, using each number once. Matching numbers must not touch, even diagonally.</p>');
    expect(markup).toContain('2 × 2 / Number puzzle');
    expect(markup).toContain('aria-label="Open game options"');

    const dialogStart = markup.indexOf('<dialog');
    const dialogEnd = markup.indexOf('</dialog>');
    for (const control of ['new-game', 'reset-game', 'host-race', 'join-race']) {
      const controlIndex = markup.indexOf(`id="${control}"`);
      expect(controlIndex).toBeGreaterThan(dialogStart);
      expect(controlIndex).toBeLessThan(dialogEnd);
    }
    expect(markup.indexOf('class="solo-completion-area"')).toBeGreaterThan(markup.indexOf('id="board"'));
    expect(markup).not.toContain('class="battle-strip"');
  });

  it('renders the saved puzzle and entries on the first render, before mount effects', () => {
    const storage = setupBrowser();
    const markup = renderToStaticMarkup(<App />);
    expect(storage.getItem).toHaveBeenCalledWith(SOLO_STORAGE_KEY);
    expect(markup).toContain('Cell 1, region size 2, value 1, given clue');
    expect(markup).toContain('Cell 2, region size 2, value 2');
    expect(markup).toContain('Cell 3, region size 2, value empty');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(['?join=ABCD', '?join=bad'])('does not even read solo progress for a join link: %s', (search) => {
    const storage = setupBrowser(search);
    const markup = renderToStaticMarkup(<App />);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(markup).not.toContain('Cell 1,');
  });

  it('leaves corrupt saves for the normal new-puzzle startup path', () => {
    const storage = setupBrowser('', '{broken');
    expect(renderToStaticMarkup(<App />)).not.toContain('Cell 1,');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
