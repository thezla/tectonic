import { describe, expect, it } from 'vitest';

import { createRaceInvitation } from './invitation.js';

describe('createRaceInvitation', () => {
  it('uses the public origin and current app path', () => {
    expect(createRaceInvitation('https://puzzle.example/play/', 'ABCD'))
      .toBe('https://puzzle.example/play/?join=ABCD');
  });

  it('removes credentials, old room codes, tokens, other queries, and fragments', () => {
    const location = 'https://user:password@puzzle.example/?join=OLD1&playerId=secret&token=private#credentials';

    expect(createRaceInvitation(location, 'NEW2')).toBe('https://puzzle.example/?join=NEW2');
  });

  it('supports local HTTP locations and preserves their ports', () => {
    expect(createRaceInvitation('http://192.168.1.10:3000/?playerId=secret', 'AB12'))
      .toBe('http://192.168.1.10:3000/?join=AB12');
  });

  it('encodes the room code as a single join parameter', () => {
    const invitation = new URL(createRaceInvitation('https://puzzle.example/', 'A&B#'));

    expect([...invitation.searchParams]).toEqual([['join', 'A&B#']]);
    expect(invitation.hash).toBe('');
  });

  it('does not let a double-slash path change the public origin', () => {
    expect(createRaceInvitation('https://puzzle.example//other.example/', 'ABCD'))
      .toBe('https://puzzle.example//other.example/?join=ABCD');
  });

  it('rejects non-web locations', () => {
    expect(() => createRaceInvitation('file:///game/index.html', 'ABCD')).toThrow('HTTP or HTTPS');
  });
});
