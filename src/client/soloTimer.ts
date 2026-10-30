import type { Puzzle } from '../shared/api.js';

export const SOLO_TIMER_STORAGE_KEY = 'tectonic.solo-timer.v1';

export type SoloTimer = {
  puzzleKey: string;
  elapsedMs: number;
  runningSince: number | null;
  completed: boolean;
  eligible: boolean;
};

type TimerStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function getSoloPuzzleKey(puzzle: Puzzle): string {
  return JSON.stringify([puzzle.width, puzzle.height, puzzle.regions, puzzle.givens]);
}

export function createSoloTimer(puzzleKey: string): SoloTimer {
  return { puzzleKey, elapsedMs: 0, runningSince: null, completed: false, eligible: true };
}

export function pauseSoloTimer(timer: SoloTimer, now: number): SoloTimer {
  return {
    ...timer,
    elapsedMs: timer.elapsedMs + (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince)),
    runningSince: null,
  };
}

export function advanceSoloTimer(
  timer: SoloTimer,
  input: { isRace: boolean; isLoading: boolean; solved: boolean },
  now: number,
): SoloTimer {
  const paused = pauseSoloTimer(timer, now);

  if (input.isRace) {
    return { ...paused, elapsedMs: 0, completed: false, eligible: false };
  }

  if (!paused.eligible || input.isLoading || paused.completed) {
    return paused;
  }

  if (input.solved) {
    return { ...paused, completed: true };
  }

  return { ...paused, runningSince: now };
}

export function readSoloTimer(puzzleKey: string, storage: TimerStorage | null): SoloTimer {
  const fresh = createSoloTimer(puzzleKey);

  try {
    const saved: unknown = JSON.parse(storage?.getItem(SOLO_TIMER_STORAGE_KEY) ?? 'null');

    if (!saved || typeof saved !== 'object') {
      return fresh;
    }

    const record = saved as Record<string, unknown>;

    if (record.version !== 1 || record.puzzleKey !== puzzleKey
      || typeof record.elapsedMs !== 'number' || !Number.isFinite(record.elapsedMs) || record.elapsedMs < 0
      || typeof record.completed !== 'boolean' || typeof record.eligible !== 'boolean'
      || (record.completed && !record.eligible)) {
      return fresh;
    }

    return { ...fresh, elapsedMs: record.elapsedMs, completed: record.completed, eligible: record.eligible };
  } catch {
    return fresh;
  }
}

export function writeSoloTimer(timer: SoloTimer, storage: TimerStorage | null): void {
  try {
    storage?.setItem(SOLO_TIMER_STORAGE_KEY, JSON.stringify({
      version: 1,
      puzzleKey: timer.puzzleKey,
      elapsedMs: timer.elapsedMs,
      completed: timer.completed,
      eligible: timer.eligible,
    }));
  } catch {
    return;
  }
}

export function formatSoloElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return [hours > 0 ? `${hours}h` : '', minutes > 0 || hours > 0 ? `${minutes}m` : '', `${seconds}s`]
    .filter(Boolean).join(' ');
}
