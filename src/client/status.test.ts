import { describe, expect, it } from 'vitest';

import type { BoardValues, MatchSession, Puzzle, ValidationResult } from '../shared/api.js';
import { getBoardStatus, getEditableBoardState, getMatchStatus } from './status.js';

const puzzle: Puzzle = {
  width: 2,
  height: 2,
  regions: [0, 0, 1, 1],
  givens: [1, null, null, 2],
};
const values: BoardValues = [1, null, null, 2];
const clearResult: ValidationResult = {
  completedRegions: new Set(),
  conflicts: new Set(),
  solved: false,
};

function createMatchSession(status: MatchSession['match']['status'], role: MatchSession['role'] = 'host'): MatchSession {
  return {
    matchId: 'ABCD',
    playerId: `${role}-player`,
    role,
    match: {
      matchId: 'ABCD',
      roomCode: 'ABCD',
      puzzleRevision: 1,
      status,
      winnerPlayerId: null,
      startsAt: status === 'countdown' ? Date.now() + 5000 : null,
      players: [
        { role: 'host', joined: true, connected: true, filledCount: 2 },
        { role: 'guest', joined: role === 'guest', connected: role === 'guest', filledCount: 2 },
      ],
    },
  };
}

describe('status helpers', () => {
  it('locks editing during loading and inactive multiplayer states', () => {
    expect(getEditableBoardState(true, null)).toBe(false);
    expect(getEditableBoardState(false, null)).toBe(true);
    expect(getEditableBoardState(false, createMatchSession('waiting'))).toBe(false);
    expect(getEditableBoardState(false, createMatchSession('countdown'))).toBe(false);
    expect(getEditableBoardState(false, createMatchSession('active'))).toBe(true);
    expect(getEditableBoardState(false, createMatchSession('finished'))).toBe(false);
  });

  it('keeps no-match copy aligned with LAN discovery availability', () => {
    expect(getMatchStatus(null, true)).toContain('local network');
    expect(getMatchStatus(null, false)).toContain('room code');
  });

  it('reports conflicted active race boards as non-scoring progress', () => {
    const conflictResult: ValidationResult = {
      ...clearResult,
      conflicts: new Set([1]),
    };

    expect(getBoardStatus(values, conflictResult, createMatchSession('active'))).toContain('do not count');
  });

  it('reports solved boards with the existing solved copy', () => {
    const solvedResult: ValidationResult = {
      completedRegions: new Set(puzzle.regions),
      conflicts: new Set(),
      solved: true,
    };

    expect(getBoardStatus(values, solvedResult, null)).toBe('Solved. Every region is complete and no matching numbers touch.');
  });
});
