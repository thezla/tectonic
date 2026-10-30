import { describe, expect, it } from 'vitest';

import type { Puzzle } from '../shared/api.js';
import { validateBoard } from '../shared/validate.js';
import { loadSoloProgress, saveSoloProgress } from './soloStorage.js';
import {
  advanceSoloTimer,
  createSoloTimer,
  formatSoloElapsed,
  getSoloPuzzleKey,
  pauseSoloTimer,
  readSoloTimer,
  SOLO_TIMER_STORAGE_KEY,
  writeSoloTimer,
} from './soloTimer.js';

const puzzle: Puzzle = { width: 2, height: 1, regions: [0, 0], givens: [1, null] };
const puzzleKey = getSoloPuzzleKey(puzzle);
const playing = { isRace: false, isLoading: false, solved: false };

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === SOLO_TIMER_STORAGE_KEY ? value : null,
    setItem: (key: string, next: string) => {
      expect(key).toBe(SOLO_TIMER_STORAGE_KEY);
      value = next;
    },
  };
}

describe('solo timer', () => {
  it('measures elapsed time from timestamps rather than interval counts', () => {
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    const ticked = advanceSoloTimer(started, playing, 1729);
    expect(ticked.elapsedMs).toBe(1629);
    expect(pauseSoloTimer(ticked, 2300).elapsedMs).toBe(2200);
    expect(pauseSoloTimer(started, 50).elapsedMs).toBe(0);
  });

  it('freezes on the solve transition, including between ticks, without repeating completion', () => {
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    const solved = advanceSoloTimer(started, { ...playing, solved: true }, 1567);
    expect(solved).toMatchObject({ elapsedMs: 1467, completed: true, runningSince: null });
    expect(advanceSoloTimer(solved, { ...playing, solved: true }, 9999)).toEqual(solved);
    expect(advanceSoloTimer(solved, playing, 10000)).toEqual(solved);
    expect(pauseSoloTimer(solved, 20000)).toEqual(solved);
  });

  it('pauses loading and does not turn a solved loading board into a win', () => {
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    const loading = advanceSoloTimer(started, { ...playing, isLoading: true, solved: true }, 600);
    expect(loading).toMatchObject({ elapsedMs: 500, completed: false, runningSince: null });
    const resumed = advanceSoloTimer(loading, playing, 3000);
    expect(advanceSoloTimer(resumed, playing, 3400).elapsedMs).toBe(900);
  });

  it('excludes hidden, closed-tab, and unmounted time by persisting only accumulated elapsed', () => {
    const storage = memoryStorage();
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    writeSoloTimer(pauseSoloTimer(started, 800), storage);
    const restored = readSoloTimer(puzzleKey, storage);
    expect(restored).toMatchObject({ elapsedMs: 700, runningSince: null });
    const resumed = advanceSoloTimer(restored, playing, 100000);
    expect(advanceSoloTimer(resumed, playing, 100500).elapsedMs).toBe(1200);
    expect(storage.getItem(SOLO_TIMER_STORAGE_KEY)).not.toContain('runningSince');
  });

  it.each([false, true])('restores solo entries with their independent timer (completed: %s)', (completed) => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    };
    const values = completed ? [1, 2] : [1, null];
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    const checkpoint = pauseSoloTimer(advanceSoloTimer(started, { ...playing, solved: completed }, 800), 800);
    saveSoloProgress(puzzle, values, storage);
    writeSoloTimer(checkpoint, storage);

    const restored = loadSoloProgress(storage)!;
    expect(restored).toEqual({ puzzle, values });
    const timer = readSoloTimer(getSoloPuzzleKey(restored.puzzle), storage);
    const resumed = advanceSoloTimer(timer, {
      ...playing,
      solved: validateBoard(restored.puzzle, restored.values).solved,
    }, 100000);
    expect(resumed).toMatchObject({ elapsedMs: 700, completed, eligible: true });
    expect(advanceSoloTimer(resumed, { ...playing, solved: completed }, 100500).elapsedMs)
      .toBe(completed ? 700 : 1200);
  });

  it('never credits race completion or an abandoned race board as a solo win', () => {
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 100);
    for (const solved of [false, true]) {
      const race = advanceSoloTimer(started, { ...playing, isRace: true, solved }, 1000);
      expect(race).toMatchObject({ elapsedMs: 0, eligible: false, completed: false, runningSince: null });
      const leftRace = advanceSoloTimer(race, { ...playing, solved: true }, 2000);
      expect(leftRace).toEqual(race);
      const storage = memoryStorage();
      writeSoloTimer(leftRace, storage);
      expect(advanceSoloTimer(readSoloTimer(puzzleKey, storage), { ...playing, solved: true }, 5000)).toEqual(race);
    }
  });

  it('starts reset and new puzzle attempts at zero, including after a solved or abandoned board', () => {
    const solved = advanceSoloTimer(createSoloTimer(puzzleKey), { ...playing, solved: true }, 100);
    const storage = memoryStorage();
    writeSoloTimer(solved, storage);
    const reset = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 1000);
    expect(reset).toMatchObject({ elapsedMs: 0, completed: false, eligible: true, runningSince: 1000 });
    const nextKey = getSoloPuzzleKey({ ...puzzle, givens: [null, 2] });
    expect(readSoloTimer(nextKey, storage)).toEqual(createSoloTimer(nextKey));
    expect(getSoloPuzzleKey({ ...puzzle, regions: [...puzzle.regions], givens: [...puzzle.givens] })).toBe(puzzleKey);
    expect(getSoloPuzzleKey({ ...puzzle, regions: [1, 1] })).not.toBe(puzzleKey);
    expect(getSoloPuzzleKey({ ...puzzle, width: 1, height: 2 })).not.toBe(puzzleKey);
  });

  it('restores completed elapsed without restarting the clock', () => {
    const storage = memoryStorage();
    const started = advanceSoloTimer(createSoloTimer(puzzleKey), playing, 0);
    writeSoloTimer(advanceSoloTimer(started, { ...playing, solved: true }, 12345), storage);
    const restored = readSoloTimer(puzzleKey, storage);
    expect(advanceSoloTimer(restored, { ...playing, solved: true }, 99999)).toMatchObject({
      elapsedMs: 12345, completed: true, runningSince: null,
    });
  });

  it('tolerates malformed, wrong-version, and disabled storage', () => {
    const valid = { version: 1, puzzleKey, elapsedMs: 500, completed: false, eligible: true };
    for (const raw of ['{', 'null', '[]', '42', JSON.stringify({ ...valid, version: 2 }),
      ...[-1, null, '500'].map((elapsedMs) => JSON.stringify({ ...valid, elapsedMs })),
      JSON.stringify({ ...valid, completed: 'true' }), JSON.stringify({ ...valid, eligible: null }),
      JSON.stringify({ ...valid, eligible: false, completed: true }),
      JSON.stringify(valid).replace('500', '1e999')]) {
      expect(readSoloTimer(puzzleKey, memoryStorage(raw))).toEqual(createSoloTimer(puzzleKey));
    }
    const disabled = {
      getItem: () => { throw new Error('Disabled'); },
      setItem: () => { throw new Error('Quota exceeded'); },
    };
    expect(readSoloTimer(puzzleKey, disabled)).toEqual(createSoloTimer(puzzleKey));
    expect(readSoloTimer(puzzleKey, null)).toEqual(createSoloTimer(puzzleKey));
    expect(() => writeSoloTimer(createSoloTimer(puzzleKey), disabled)).not.toThrow();
    expect(() => writeSoloTimer(createSoloTimer(puzzleKey), null)).not.toThrow();
  });

  it('formats seconds, minutes, and hours readably without rounding up', () => {
    expect(formatSoloElapsed(999)).toBe('0s');
    expect(formatSoloElapsed(65099)).toBe('1m 5s');
    expect(formatSoloElapsed(3600000)).toBe('1h 0m 0s');
    expect(formatSoloElapsed(3661000)).toBe('1h 1m 1s');
  });
});
