import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateBoard } from '../shared/validate.js';
import { buildMatchState, closeMatch, createGuest, createMatch, finishMatch, getPlayerRecord } from './matches.js';

describe('matches', () => {
  let session: ReturnType<typeof createMatch>;
  let guestId: string;

  beforeEach(() => {
    session = createMatch();
    guestId = createGuest(session.match);
  });

  afterEach(() => {
    closeMatch(session.match, 'Test cleanup');
  });

  it('creates a 32-byte hexadecimal host token while keeping the human room code', () => {
    expect(session.playerId).toMatch(/^[0-9a-f]{64}$/);
    expect(session.match.players.host?.id).toBe(session.playerId);
    expect(session.match.id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('creates a distinct 32-byte hexadecimal guest token', () => {
    expect(guestId).toMatch(/^[0-9a-f]{64}$/);
    expect(guestId).not.toBe(session.playerId);
    expect(session.match.players.guest?.id).toBe(guestId);
  });

  it('authenticates each player only with their exact token', () => {
    expect(getPlayerRecord(session.match, session.playerId)).toBe(session.match.players.host);
    expect(getPlayerRecord(session.match, guestId)).toBe(session.match.players.guest);

    const alteredToken = `${session.playerId[0] === '0' ? '1' : '0'}${session.playerId.slice(1)}`;
    const invalidCredentials: unknown[] = [
      alteredToken,
      session.playerId.slice(0, -1),
      `${guestId}0`,
      session.match.id,
      '',
      null,
      undefined,
      123,
      { id: session.playerId },
    ];

    for (const credential of invalidCredentials) {
      expect(getPlayerRecord(session.match, credential)).toBeNull();
    }
  });

  it.each(['host', 'guest'] as const)('publishes only the winning %s role, never either player credential', (role) => {
    const player = session.match.players[role]!;
    session.match.status = 'active';

    expect(finishMatch(session.match, player, session.match.solution)).toBe(true);

    const state = buildMatchState(session.match);
    expect(state.status).toBe('finished');
    expect(state.winnerRole).toBe(role);
    expect(state).not.toHaveProperty('winnerPlayerId');
    expect(JSON.stringify(state)).not.toContain(session.playerId);
    expect(JSON.stringify(state)).not.toContain(guestId);
    expect(player.filledCount).toBe(session.match.solution.length);
  });

  it('rejects malformed or incorrect finishes without changing the room', () => {
    session.match.status = 'active';
    const before = buildMatchState(session.match);
    const solution = session.match.solution;

    for (const values of [
      [],
      solution.slice(0, -1),
      [...solution, 999],
      [null, ...solution.slice(1)],
      [String(solution[0]), ...solution.slice(1)],
      [solution[0] + 1, ...solution.slice(1)],
    ]) {
      expect(finishMatch(session.match, session.match.players.host!, values)).toBe(false);
      expect(buildMatchState(session.match)).toEqual(before);
    }
  });

  it('rejects a rule-valid board that changes an original clue', () => {
    session.match.status = 'active';
    session.match.puzzle = { width: 2, height: 2, regions: [0, 0, 0, 0], givens: [1, null, null, null] };
    session.match.solution = [1, 2, 3, 4];
    const changedClue = [2, 1, 3, 4];

    expect(validateBoard(session.match.puzzle, changedClue).solved).toBe(true);
    expect(finishMatch(session.match, session.match.players.host!, changedClue)).toBe(false);
    expect(session.match.status).toBe('active');
    expect(session.match.winnerRole).toBeNull();
  });
});
