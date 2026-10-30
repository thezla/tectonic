import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeMatch, createGuest, createMatch, getPlayerRecord } from './matches.js';

describe('player credentials', () => {
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
});
