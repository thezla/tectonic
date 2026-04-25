import type { BoardValues, MatchSession, ValidationResult } from '../../shared/api.js';
import { getOpponentPlayerState, getScoredFilledCount } from '../board.js';

type OpponentBurst = {
  key: number;
  amount: number;
};

type BattleStripProps = {
  matchSession: MatchSession;
  values: BoardValues;
  result: ValidationResult;
  opponentBurst: OpponentBurst | null;
};

export function BattleStrip({ matchSession, values, result, opponentBurst }: BattleStripProps) {
  const totalCells = values.length;
  const localCount = getScoredFilledCount(values, result);
  const opponent = getOpponentPlayerState(matchSession);
  const opponentCount = opponent?.filledCount ?? 0;
  const localPercent = totalCells > 0 ? (localCount / totalCells) * 100 : 0;
  const opponentPercent = totalCells > 0 ? (opponentCount / totalCells) * 100 : 0;
  const delta = localCount - opponentCount;
  const showInlineRoomCode = matchSession.match.status === 'active';
  const title = matchSession.match.status === 'finished' ? 'Battle result' : 'Head-to-head race';
  const deltaText = getBattleDeltaText(matchSession, opponent?.joined ?? false, delta);

  return (
    <section id="battle-strip" className="battle-strip" aria-label="Battle progress">
      <div className="battle-strip-header">
        <div className="battle-title-group">
          <p id="battle-title" className="battle-title">{title}</p>
          <span id="battle-room-code" className="battle-room-code" hidden={!showInlineRoomCode}>{showInlineRoomCode ? matchSession.match.roomCode : ''}</span>
        </div>
        <span id="battle-delta" className="battle-delta">{deltaText}</span>
      </div>
      <div className="battle-lanes">
        <div className="battle-lane battle-lane-you">
          <div className="battle-lane-label-row">
            <span className="battle-lane-label">You</span>
            <span id="battle-you-count" className="battle-lane-count">{localCount}/{totalCells}</span>
          </div>
          <div className="battle-meter">
            <div id="battle-you-fill" className="battle-meter-fill battle-meter-fill-you" style={{ width: `${localPercent}%` }} />
          </div>
        </div>
        <div className={`battle-lane battle-lane-opponent${opponentBurst ? ' battle-lane-hit' : ''}`} key={opponentBurst?.key ?? 'opponent'}>
          <div className="battle-lane-label-row">
            <span className="battle-lane-label">Opponent</span>
            <span id="battle-opponent-count" className="battle-lane-count">{opponentCount}/{totalCells}</span>
          </div>
          <div className="battle-meter">
            <div id="battle-opponent-fill" className="battle-meter-fill battle-meter-fill-opponent" style={{ width: `${opponentPercent}%` }} />
          </div>
          <span id="battle-opponent-burst" className="battle-opponent-burst" aria-hidden="true">+{opponentBurst?.amount ?? 1}</span>
        </div>
      </div>
    </section>
  );
}

function getBattleDeltaText(matchSession: MatchSession, opponentJoined: boolean, delta: number): string {
  if (matchSession.match.status === 'waiting') {
    return 'Waiting for challenger';
  }

  if (matchSession.match.status === 'countdown') {
    return 'Both players locked in';
  }

  if (matchSession.match.status === 'finished') {
    return matchSession.match.winnerPlayerId === matchSession.playerId ? 'Victory' : 'Defeat';
  }

  if (!opponentJoined) {
    return 'Awaiting opponent';
  }

  if (delta > 0) {
    return `Ahead by ${delta}`;
  }

  if (delta < 0) {
    return `Behind by ${Math.abs(delta)}`;
  }

  return 'Dead even';
}
