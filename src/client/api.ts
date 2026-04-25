import type { BoardValues, DiscoveryResponse, MatchResponse, MatchResetPayload, MatchState, Puzzle } from '../shared/api.js';

export async function postJson<TResponse>(url: string, payload: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<TResponse>;
}

export async function loadPuzzle(): Promise<Puzzle> {
  const response = await fetch('/api/puzzle', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Could not load a puzzle.');
  }

  return response.json() as Promise<Puzzle>;
}

export async function loadDiscoveredMatches(): Promise<DiscoveryResponse> {
  const response = await fetch('/api/discovery/matches', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Could not load hosted games.');
  }

  return response.json() as Promise<DiscoveryResponse>;
}

export function createMatch(): Promise<MatchResponse> {
  return postJson<MatchResponse>('/api/matches', {});
}

export function joinMatch(roomCode: string): Promise<MatchResponse> {
  return postJson<MatchResponse>(`/api/matches/${roomCode}/join`, {});
}

export function leaveMatch(matchId: string, playerId: string): Promise<{ match: MatchState }> {
  return postJson<{ match: MatchState }>(`/api/matches/${matchId}/leave`, { playerId });
}

export function closeMatch(matchId: string, playerId: string): Promise<{ closed: true }> {
  return postJson<{ closed: true }>(`/api/matches/${matchId}/close`, { playerId });
}

export function startRematch(matchId: string, playerId: string): Promise<MatchResetPayload> {
  return postJson<MatchResetPayload>(`/api/matches/${matchId}/rematch`, { playerId });
}

export function reportProgress(matchId: string, playerId: string, filledCount: number): Promise<{ match: MatchState }> {
  return postJson<{ match: MatchState }>(`/api/matches/${matchId}/progress`, { playerId, filledCount });
}

export function submitMatchFinish(matchId: string, playerId: string, values: BoardValues): Promise<{ match: MatchState }> {
  return postJson<{ match: MatchState }>(`/api/matches/${matchId}/finish`, { playerId, values });
}
