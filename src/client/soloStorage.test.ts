import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Puzzle } from '../shared/api.js';
import { createPuzzleWithSolution } from '../shared/puzzle.js';
import { loadSoloProgress, saveSoloProgress, SOLO_STORAGE_KEY } from './soloStorage.js';

const puzzle: Puzzle = {
  width: 2,
  height: 2,
  regions: [0, 0, 1, 1],
  givens: [1, null, null, null],
};
const values = [1, 2, 2, null];

function createStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value); }),
  };
}

function readData(data: unknown) {
  return loadSoloProgress({ getItem: () => JSON.stringify(data) });
}

afterEach(() => vi.unstubAllGlobals());

describe('solo storage', () => {
  it('round-trips a puzzle and conflicting entries without treating mistakes as corruption', () => {
    const storage = createStorage();
    saveSoloProgress(puzzle, values, storage);
    expect(loadSoloProgress(storage)).toEqual({ puzzle, values });
    expect(storage.setItem).toHaveBeenCalledWith(SOLO_STORAGE_KEY, expect.any(String));
  });

  it('accepts generated puzzles and completed boards', () => {
    const { puzzle: generated, solution } = createPuzzleWithSolution();
    expect(readData({ version: 1, puzzle: generated, values: solution })).toEqual({ puzzle: generated, values: solution });
  });

  it('returns null for absent, malformed, or obsolete saves', () => {
    expect(loadSoloProgress(createStorage())).toBeNull();
    expect(loadSoloProgress({ getItem: () => '{broken' })).toBeNull();
    for (const data of [null, [], {}, { version: 0, puzzle, values }, { version: 2, puzzle, values }]) {
      expect(readData(data)).toBeNull();
    }
  });

  it.each([
    { width: 0 }, { height: -1 }, { width: 2.5 }, { width: '2' },
    { height: 51 }, { width: null }, { regions: null },
    { regions: [0, 0, 1] }, { regions: [0, 0, 1, -1] },
    { regions: [0, 0, 1, 1.5] }, { regions: [0, 0, 1, '1'] },
    { regions: [0, 1, 1, 0] },
    { width: 3, height: 2, regions: [0, 0, 0, 0, 0, 0], givens: [null, null, null, null, null, null] },
    { givens: [] }, { givens: [1, null, null, 3] }, { givens: [1, 1, null, null] },
    { givens: [1, null, 1, null] }, { givens: [1, null, null, '2'] },
  ])('rejects invalid puzzle structure or clues: %j', (changes) => {
    expect(readData({ version: 1, puzzle: { ...puzzle, ...changes }, values })).toBeNull();
  });

  it('rejects conflicting clues even when the entries match them', () => {
    for (const givens of [[1, 1, null, null], [1, null, 1, null]]) {
      expect(readData({ version: 1, puzzle: { ...puzzle, givens }, values: givens })).toBeNull();
    }
  });

  it('rejects oversized regions and does not connect regions across row boundaries', () => {
    const oversized = { width: 3, height: 2, regions: [0, 0, 0, 0, 0, 0], givens: Array(6).fill(null) };
    expect(readData({ version: 1, puzzle: oversized, values: oversized.givens })).toBeNull();
    const wrapped = { ...puzzle, regions: [0, 1, 1, 2], givens: Array(4).fill(null) };
    expect(readData({ version: 1, puzzle: wrapped, values: wrapped.givens })).toBeNull();
  });

  it.each([
    null, [], [1, 2, 2], [1, 2, 2, null, null],
    [null, 2, 2, null], [2, 2, 2, null], [1, 3, 2, null],
    [1, 0, 2, null], [1, -1, 2, null], [1, 1.5, 2, null],
    [1, '2', 2, null], [1, {}, 2, null],
  ].map((savedValues) => ({ savedValues })))('rejects malformed entries or overwritten givens: %j', ({ savedValues }) => {
    expect(readData({ version: 1, puzzle, values: savedValues })).toBeNull();
  });

  it('replaces progress for a new puzzle and reset without touching unrelated keys', () => {
    const storage = createStorage();
    storage.setItem('tectonic.elapsed', 'timer-owned');
    saveSoloProgress(puzzle, values, storage);
    const nextPuzzle = { ...puzzle, givens: [null, 2, null, null] };
    saveSoloProgress(nextPuzzle, [1, 2, null, null], storage);
    expect(loadSoloProgress(storage)).toEqual({ puzzle: nextPuzzle, values: [1, 2, null, null] });
    saveSoloProgress(nextPuzzle, [...nextPuzzle.givens], storage);
    expect(loadSoloProgress(storage)).toEqual({ puzzle: nextPuzzle, values: nextPuzzle.givens });
    expect(storage.entries.get('tectonic.elapsed')).toBe('timer-owned');
    expect(storage.entries.size).toBe(2);
  });

  it('writes only the puzzle schema and entries, not credentials or extra fields', () => {
    const storage = createStorage();
    const extendedPuzzle = { ...puzzle, playerId: 'private-token', solution: [1, 2, 2, 1] };
    saveSoloProgress(extendedPuzzle, values, storage);
    expect(JSON.parse(storage.entries.get(SOLO_STORAGE_KEY)!)).toEqual({ version: 1, puzzle, values });
    expect(readData({ version: 1, puzzle: extendedPuzzle, values, matchId: 'room' })).toEqual({ puzzle, values });
  });

  it('does not replace a valid save with invalid state', () => {
    const storage = createStorage();
    saveSoloProgress(puzzle, values, storage);
    saveSoloProgress(puzzle, [], storage);
    expect(loadSoloProgress(storage)).toEqual({ puzzle, values });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('handles denied reads and quota errors without throwing or deleting the previous save', () => {
    expect(loadSoloProgress({ getItem: () => { throw new Error('denied'); } })).toBeNull();
    const storage = createStorage();
    saveSoloProgress(puzzle, values, storage);
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveSoloProgress(puzzle, puzzle.givens, storage)).not.toThrow();
    expect(loadSoloProgress(storage)).toEqual({ puzzle, values });
  });

  it('handles unavailable localStorage, including a throwing property getter', () => {
    const browser = Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } });
    vi.stubGlobal('window', browser);
    expect(loadSoloProgress()).toBeNull();
    expect(() => saveSoloProgress(puzzle, values)).not.toThrow();
    vi.stubGlobal('window', undefined);
    expect(loadSoloProgress()).toBeNull();
    expect(() => saveSoloProgress(puzzle, values)).not.toThrow();
  });
});
