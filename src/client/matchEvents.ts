import type { MatchEvent } from '../shared/api.js';

export function openMatchEventStream(
  matchId: string,
  playerId: string,
  onEvent: (event: MatchEvent) => void,
  onError: () => void,
): EventSource {
  const eventSource = new EventSource(
    `/api/matches/${matchId}/events?playerId=${encodeURIComponent(playerId)}`,
  );

  eventSource.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as MatchEvent);
    } catch (error) {
      console.error(error);
    }
  };

  eventSource.onerror = onError;

  return eventSource;
}
