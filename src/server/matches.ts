import type { IncomingMessage, ServerResponse } from 'node:http';

import type { MatchState, PlayerRole, Puzzle } from '../shared/api.js';
import { createPuzzleWithSolution } from '../shared/puzzle.js';
import { sendJson, sendText } from './http.js';

const MATCH_START_DELAY_MS = 5000;

export type PlayerRecord = {
  id: string;
  role: PlayerRole;
  filledCount: number;
  connected: boolean;
};

export type MatchRecord = {
  id: string;
  puzzle: Puzzle;
  solution: number[];
  givenCount: number;
  puzzleRevision: number;
  status: MatchState['status'];
  winnerPlayerId: string | null;
  startsAt: number | null;
  startTimer: NodeJS.Timeout | null;
  subscribers: Set<ServerResponse>;
  players: {
    host: PlayerRecord | null;
    guest: PlayerRecord | null;
  };
};

export const matches = new Map<string, MatchRecord>();

export function createId(length = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}

export function buildMatchState(match: MatchRecord): MatchState {
  return {
    matchId: match.id,
    roomCode: match.id,
    puzzleRevision: match.puzzleRevision,
    status: match.status,
    winnerPlayerId: match.winnerPlayerId,
    startsAt: match.startsAt,
    players: (['host', 'guest'] as const).map((role) => {
      const player = match.players[role];

      return {
        role,
        joined: Boolean(player),
        connected: player?.connected ?? false,
        filledCount: player?.filledCount ?? match.givenCount,
      };
    }),
  };
}

export function createMatch(): { match: MatchRecord; playerId: string } {
  const { puzzle, solution } = createPuzzleWithSolution();
  const playerId = createId(8);
  const match = {
    id: createUniqueMatchId(),
    puzzle,
    solution,
    givenCount: 0,
    puzzleRevision: 0,
    status: 'waiting',
    winnerPlayerId: null,
    startsAt: null,
    startTimer: null,
    subscribers: new Set<ServerResponse>(),
    players: {
      host: {
        id: playerId,
        role: 'host',
        filledCount: 0,
        connected: false,
      },
      guest: null,
    },
  } satisfies MatchRecord;

  assignPuzzleToMatch(match, puzzle, solution);
  matches.set(match.id, match);

  return { match, playerId };
}

export function createGuest(match: MatchRecord): string {
  const playerId = createId(8);
  match.players.guest = {
    id: playerId,
    role: 'guest',
    filledCount: match.givenCount,
    connected: false,
  };
  startCountdown(match);
  return playerId;
}

export function getPlayerRecord(match: MatchRecord, playerId: unknown): PlayerRecord | null {
  if (match.players.host?.id === playerId) {
    return match.players.host;
  }

  if (match.players.guest?.id === playerId) {
    return match.players.guest;
  }

  return null;
}

export function resetHostToWaiting(match: MatchRecord): void {
  clearStartTimer(match);
  match.players.guest = null;
  match.status = 'waiting';
  match.winnerPlayerId = null;
  match.startsAt = null;

  if (match.players.host) {
    match.players.host.filledCount = match.givenCount;
  }
}

export function resetMatchForRematch(match: MatchRecord): void {
  const { puzzle, solution } = createPuzzleWithSolution();
  assignPuzzleToMatch(match, puzzle, solution);
  match.winnerPlayerId = null;

  if (match.players.guest) {
    startCountdown(match);
  } else {
    clearStartTimer(match);
    match.status = 'waiting';
    match.startsAt = null;
  }
}

export function closeMatch(match: MatchRecord, reason: string): void {
  clearStartTimer(match);
  broadcastEvent(match, {
    type: 'match_closed',
    reason,
    roomCode: match.id,
  });

  for (const response of match.subscribers) {
    response.end();
  }

  match.subscribers.clear();
  matches.delete(match.id);
}

export function attachEventStream(request: IncomingMessage, response: ServerResponse, match: MatchRecord, playerId: string): void {
  const player = getPlayerRecord(match, playerId);

  if (!player) {
    sendText(response, 403, 'Unknown player');
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });

  player.connected = true;
  match.subscribers.add(response);
  sendSseEvent(response, {
    type: 'match_state',
    match: buildMatchState(match),
    puzzle: match.puzzle,
  });
  broadcastMatchState(match);

  request.on('close', () => {
    match.subscribers.delete(response);
    player.connected = false;
    if (matches.has(match.id)) {
      broadcastMatchState(match);
    }
  });
}

export function sendMatchResponse(response: ServerResponse, match: MatchRecord, playerId: string, role: PlayerRole): void {
  sendJson(response, 200, {
    matchId: match.id,
    roomCode: match.id,
    playerId,
    role,
    puzzle: match.puzzle,
    match: buildMatchState(match),
  });
}

export function broadcastMatchState(match: MatchRecord): void {
  broadcastEvent(match, {
    type: 'match_state',
    match: buildMatchState(match),
  });
}

export function broadcastEvent(match: MatchRecord, payload: unknown): void {
  for (const response of match.subscribers) {
    sendSseEvent(response, payload);
  }
}

export function finishMatch(match: MatchRecord, player: PlayerRecord, values: unknown[]): void {
  player.filledCount = values.filter((value) => value !== null).length;
  clearStartTimer(match);
  match.status = 'finished';
  match.winnerPlayerId = player.id;
  match.startsAt = null;
  broadcastMatchState(match);
}

export function getJoinableMatches(): MatchRecord[] {
  return [...matches.values()].filter((match) => match.status === 'waiting');
}

function createUniqueMatchId(): string {
  let matchId = createId();

  while (matches.has(matchId)) {
    matchId = createId();
  }

  return matchId;
}

function assignPuzzleToMatch(match: MatchRecord, puzzle: Puzzle, solution: number[]): void {
  match.puzzle = puzzle;
  match.solution = solution;
  match.givenCount = puzzle.givens.filter((value) => value !== null).length;
  match.puzzleRevision = (match.puzzleRevision ?? 0) + 1;

  if (match.players.host) {
    match.players.host.filledCount = match.givenCount;
  }

  if (match.players.guest) {
    match.players.guest.filledCount = match.givenCount;
  }
}

function startCountdown(match: MatchRecord): void {
  clearStartTimer(match);
  match.status = 'countdown';
  match.winnerPlayerId = null;
  match.startsAt = Date.now() + MATCH_START_DELAY_MS;
  match.startTimer = setTimeout(() => {
    if (!matches.has(match.id) || match.status !== 'countdown') {
      return;
    }

    match.status = 'active';
    match.startsAt = null;
    match.startTimer = null;
    broadcastMatchState(match);
  }, MATCH_START_DELAY_MS);
}

function clearStartTimer(match: MatchRecord): void {
  if (match.startTimer) {
    clearTimeout(match.startTimer);
    match.startTimer = null;
  }
}

function sendSseEvent(response: ServerResponse, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}
