import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MatchSession } from '../../shared/api.js';
import { BoardView } from './BoardView.js';

const puzzle = { width: 2, height: 2, regions: [0, 0, 0, 0], givens: [1, null, null, null] };
const result = { conflicts: new Set<number>(), completedRegions: new Set<number>(), solved: false };
const session: MatchSession = {
  matchId: 'match',
  playerId: 'host',
  role: 'host',
  match: {
    matchId: 'match',
    roomCode: 'ABCD',
    puzzleRevision: 1,
    status: 'waiting',
    winnerPlayerId: null,
    startsAt: null,
    players: [],
  },
};

function renderBoard(boardLocked = false, matchSession: MatchSession | null = null, showLockedOverlay = boardLocked) {
  return renderToStaticMarkup(
    <BoardView
      puzzle={puzzle}
      values={[1, 2, null, null]}
      result={result}
      boardLocked={boardLocked}
      selectedIndex={1}
      showLockedOverlay={showLockedOverlay}
      lockedOverlayTitle="Waiting for challenger"
      matchSession={matchSession}
      onSelectCell={() => {}}
      onCycleCell={() => {}}
      onClearCell={() => {}}
    />,
  );
}

describe('styled board states', () => {
  it('preserves the given, selected, and editable cell distinctions', () => {
    const markup = renderBoard();
    expect(markup).toContain('class="cell given" disabled=""');
    expect(markup).toContain('class="cell selected"');
    expect(markup.match(/disabled=""/g)).toHaveLength(1);
    expect(markup).toContain('grid-template-columns:repeat(2, minmax(0, 1fr))');
  });

  it('isolates animated values inside stable, accessible cell buttons', () => {
    const markup = renderBoard();
    expect(markup.match(/class="cell-value"/g)).toHaveLength(4);
    expect(markup).toContain('<span class="cell-value">1</span>');
    expect(markup).toContain('<span class="cell-value">2</span>');
    expect(markup).toContain('<span class="cell-value"></span>');
    expect(markup).toContain('aria-label="Cell 2, region size 4, value 2"');
    expect(markup.match(/<button /g)).toHaveLength(4);
  });

  it('locks every cell and shows the room code on the waiting overlay', () => {
    const markup = renderBoard(true, session);
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).toContain('class="board locked"');
    expect(markup).toContain('Host room code');
    expect(markup).toContain('aria-label="Race room code"');
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('value="ABCD"');
    expect(markup).toContain('aria-hidden="false"');
    expect(markup).toContain('Copy code');
    expect(markup).toContain('Share link');
    expect(markup).toContain('Waiting for challenger');
  });

  it('can hide the winner overlay without unlocking cells or leaking its room code', () => {
    const markup = renderBoard(true, session, false);
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).toContain('aria-hidden="true" hidden=""');
    expect(markup).not.toContain('ABCD');
    expect(markup).not.toContain('Copy code');
    expect(markup).not.toContain('Share link');
  });
});
