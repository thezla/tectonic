import type { BoardValues, Puzzle } from '../shared/api.js';
import { buildRegionCells, validateBoard } from '../shared/validate.js';

export const SOLO_STORAGE_KEY = 'tectonic.solo.v1';

export type SoloProgress = {
  puzzle: Puzzle;
  values: BoardValues;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDimension(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 50;
}

function parseProgress(data: unknown): SoloProgress | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.puzzle)) {
    return null;
  }

  const { width, height, regions, givens } = data.puzzle;
  const { values } = data;

  if (!isDimension(width) || !isDimension(height)) {
    return null;
  }

  const cellCount = width * height;

  if (
    !Array.isArray(regions) || regions.length !== cellCount ||
    !Array.isArray(givens) || givens.length !== cellCount ||
    !Array.isArray(values) || values.length !== cellCount ||
    !regions.every((region) => Number.isSafeInteger(region) && region >= 0)
  ) {
    return null;
  }

  const puzzle: Puzzle = { width, height, regions: [...regions], givens: [...givens] };

  for (const [regionId, cells] of buildRegionCells(puzzle)) {
    if (cells.length > 5) {
      return null;
    }

    const visited = new Set([cells[0]]);
    const queue = [cells[0]];

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const neighbors = [index - width, index + width];

      if (index % width > 0) neighbors.push(index - 1);
      if (index % width < width - 1) neighbors.push(index + 1);

      for (const neighbor of neighbors) {
        if (neighbor >= 0 && neighbor < cellCount && regions[neighbor] === regionId && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (visited.size !== cells.length) {
      return null;
    }

    for (const index of cells) {
      const given: unknown = givens[index];
      const value: unknown = values[index];
      const inRange = (entry: unknown) => entry === null || (Number.isInteger(entry) && Number(entry) >= 1 && Number(entry) <= cells.length);

      if (!inRange(given) || !inRange(value) || (given !== null && value !== given)) {
        return null;
      }
    }
  }

  if (validateBoard(puzzle, puzzle.givens).conflicts.size > 0) {
    return null;
  }

  return { puzzle, values: [...values] };
}

export function loadSoloProgress(storage?: Pick<Storage, 'getItem'>): SoloProgress | null {
  try {
    const saved = (storage ?? window.localStorage).getItem(SOLO_STORAGE_KEY);
    return saved === null ? null : parseProgress(JSON.parse(saved));
  } catch {
    return null;
  }
}

export function saveSoloProgress(puzzle: Puzzle, values: BoardValues, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const progress = parseProgress({ version: 1, puzzle, values });

    if (progress) {
      (storage ?? window.localStorage).setItem(SOLO_STORAGE_KEY, JSON.stringify({ version: 1, ...progress }));
    }
  } catch {
    return;
  }
}
