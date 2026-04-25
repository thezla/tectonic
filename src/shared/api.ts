export type CellValue = number | null;

export type BoardValues = CellValue[];

export type RegionId = number;

export type Puzzle = {
  width: number;
  height: number;
  regions: RegionId[];
  givens: BoardValues;
};

export type PuzzleWithSolution = {
  puzzle: Puzzle;
  solution: number[];
};

export type ValidationResult = {
  completedRegions: Set<RegionId>;
  conflicts: Set<number>;
  solved: boolean;
};

export type MatchStatus = 'waiting' | 'countdown' | 'active' | 'finished';

export type PlayerRole = 'host' | 'guest';

export type MatchPlayerState = {
  role: PlayerRole;
  joined: boolean;
  connected: boolean;
  filledCount: number;
};

export type MatchState = {
  matchId: string;
  roomCode: string;
  puzzleRevision: number;
  status: MatchStatus;
  winnerPlayerId: string | null;
  startsAt: number | null;
  players: MatchPlayerState[];
};

export type MatchSession = {
  matchId: string;
  playerId: string;
  role: PlayerRole;
  match: MatchState;
};

export type MatchResponse = MatchSession & {
  roomCode: string;
  puzzle: Puzzle;
};

export type MatchResetPayload = {
  type?: 'match_reset';
  puzzle: Puzzle;
  match: MatchState;
};

export type MatchEvent =
  | { type: 'match_state'; match: MatchState; puzzle?: Puzzle }
  | { type: 'match_reset'; puzzle: Puzzle; match: MatchState }
  | { type: 'match_closed'; reason: string; roomCode: string };

export type DiscoveryMatch = {
  instanceId: string;
  matchId: string;
  roomCode: string;
  host: string;
  hostAddress: string;
  port: number;
  status: MatchStatus;
  origin: string;
  source: 'local' | 'remote';
  updatedAt: number;
};

export type DiscoveryResponse = {
  enabled: boolean;
  matches: DiscoveryMatch[];
};
