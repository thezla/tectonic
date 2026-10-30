import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MatchSession } from '../../shared/api.js';
import { BattleStrip } from './BattleStrip.js';

const matchSession: MatchSession = {
  matchId: 'match',
  playerId: 'host',
  role: 'host',
  match: {
    matchId: 'match',
    roomCode: 'ABCD',
    puzzleRevision: 1,
    status: 'active',
    winnerPlayerId: null,
    startsAt: null,
    players: [{ role: 'guest', joined: true, connected: true, filledCount: 2 }],
  },
};
const props = {
  matchSession,
  values: [1, null, null, null],
  result: { conflicts: new Set<number>(), completedRegions: new Set<number>(), solved: false },
  opponentBurst: null,
};

describe('animated race progress', () => {
  it('keeps the progress lane stable while restarting only the decorative burst', () => {
    const first = BattleStrip({ ...props, opponentBurst: { key: 1, amount: 1 } });
    const second = BattleStrip({ ...props, opponentBurst: { key: 2, amount: 2 } });
    const firstLane = first.props.children[1].props.children[1];
    const secondLane = second.props.children[1].props.children[1];
    expect(firstLane.key).toBeNull();
    expect(secondLane.key).toBeNull();
    expect(firstLane.props.children[2].key).toBe('1');
    expect(secondLane.props.children[2].key).toBe('2');
  });

  it('preserves live progress and the active-race room code', () => {
    const markup = renderToStaticMarkup(<BattleStrip {...props} />);
    expect(markup).toContain('>ABCD</span>');
    expect(markup).toContain('style="width:25%"');
    expect(markup).toContain('style="width:50%"');
  });

  it.each(['waiting', 'countdown', 'finished'] as const)('does not reveal the inline room code during %s', (status) => {
    const session = { ...matchSession, match: { ...matchSession.match, status } };
    expect(renderToStaticMarkup(<BattleStrip {...props} matchSession={session} />)).not.toContain('ABCD');
  });
});
