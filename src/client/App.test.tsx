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
