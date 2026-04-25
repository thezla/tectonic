import type { BoardValues, MatchSession, Puzzle, ValidationResult } from '../shared/api.js';
import { getFilledCount } from './board.js';

export type BoardMessageTone = 'locked' | 'info' | 'warning' | 'success';

export type BoardMessage = {
  tone: BoardMessageTone;
  title: string;
  detail: string;
};

export function getEditableBoardState(isLoadingPuzzle: boolean, matchSession: MatchSession | null): boolean {
  return !isLoadingPuzzle && (!matchSession || matchSession.match.status === 'active');
}

export function getBoardMessage(
  puzzle: Puzzle | null,
  values: BoardValues,
  result: ValidationResult | null,
  isLoadingPuzzle: boolean,
  matchSession: MatchSession | null,
  fallbackStatus: string,
): BoardMessage {
  if (isLoadingPuzzle) {
    return {
      tone: 'locked',
      title: 'Loading puzzle…',
      detail: 'The board is temporarily locked while the next puzzle state is prepared.',
    };
  }

  if (!puzzle) {
    return {
      tone: 'info',
      title: 'Preparing the board',
      detail: fallbackStatus,
    };
  }

  if (matchSession?.match.status === 'waiting') {
    return {
      tone: 'locked',
      title: 'Board locked while the race fills',
      detail: 'Waiting for another player to join. The board unlocks as soon as both players are connected.',
    };
  }

  if (matchSession?.match.status === 'countdown') {
    const remainingSeconds = Math.max(1, Math.ceil(((matchSession.match.startsAt ?? Date.now()) - Date.now()) / 1000));

    return {
      tone: 'locked',
      title: `Race starts in ${remainingSeconds}…`,
      detail: 'The board stays locked during the countdown so both players begin at the same time.',
    };
  }

  if (matchSession?.match.status === 'finished') {
    const playerWon = matchSession.match.winnerPlayerId === matchSession.playerId;

    return {
      tone: playerWon ? 'success' : 'locked',
      title: playerWon ? 'You won the race' : 'Race finished',
      detail: playerWon
        ? 'You finished first. The board is now locked for both players.'
        : 'The other player finished first. The board is now locked for both players.',
    };
  }

  if (result?.solved) {
    return {
      tone: 'success',
      title: 'Puzzle solved',
      detail: 'Every region is complete and no matching numbers touch.',
    };
  }

  if (result && result.conflicts.size > 0) {
    return {
      tone: 'warning',
      title: 'Fix the highlighted conflict',
      detail: 'Matching numbers may not touch, even diagonally.',
    };
  }

  if (matchSession?.match.status === 'active') {
    return {
      tone: 'info',
      title: 'Keep the board clean',
      detail: 'Every conflict-free placement pushes your battle bar forward.',
    };
  }

  return {
    tone: 'info',
    title: 'Puzzle in progress',
    detail: `${getFilledCount(values)}/${values.length} cells filled.`,
  };
}

export function getMatchStatus(matchSession: MatchSession | null, lanDiscoveryEnabled: boolean): string {
  if (!matchSession) {
    return lanDiscoveryEnabled
      ? 'Host a race or join one from another device on your local network.'
      : 'Host a race or join one by room code.';
  }

  if (matchSession.match.status === 'waiting') {
    return 'Waiting for another player to join. The board will unlock as soon as the second player joins the race.';
  }

  if (matchSession.match.status === 'countdown') {
    const remainingSeconds = Math.max(1, Math.ceil(((matchSession.match.startsAt ?? Date.now()) - Date.now()) / 1000));
    return `Race starts in ${remainingSeconds}… Get ready.`;
  }

  if (matchSession.match.status === 'finished') {
    if (matchSession.role === 'host') {
      return matchSession.match.winnerPlayerId === matchSession.playerId
        ? 'You won the race. Start the next race when ready or close the room.'
        : 'You lost the race. Start the next race when ready or close the room.';
    }

    return matchSession.match.winnerPlayerId === matchSession.playerId
      ? 'You won the race. Waiting for the host to start the next race or close the room.'
      : 'You lost the race. Waiting for the host to start the next race or close the room.';
  }

  return 'Race in progress. The battle strip shows live progress.';
}

export function getBoardStatus(values: BoardValues, result: ValidationResult, matchSession: MatchSession | null): string {
  if (result.solved) {
    return 'Solved. Every region is complete and no matching numbers touch.';
  }

  if (result.conflicts.size > 0) {
    return matchSession?.match.status === 'active'
      ? 'There is a rule conflict on the board. Conflicted cells do not count toward your race score.'
      : 'There is a rule conflict on the board.';
  }

  if (matchSession?.match.status === 'active') {
    return 'Your board is clear. Keep going.';
  }

  return `Puzzle in progress: ${getFilledCount(values)}/${values.length} cells filled.`;
}
