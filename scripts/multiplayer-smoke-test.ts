import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { BoardValues, MatchEvent, MatchState, MatchStatus, Puzzle } from '../src/shared/api.js';
import { getAllowedValues, validateBoard } from '../src/shared/validate.js';

const port = 3112;
const TEST_TIMEOUT_MS = 30000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverProcess = spawn(process.execPath, ['--import', 'tsx', 'src/server/server.ts'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PORT: String(port),
  },
  stdio: 'ignore',
});
const testTimeout = setTimeout(() => {
  serverProcess.kill();
  console.error('Multiplayer smoke test timed out.');
  process.exit(1);
}, TEST_TIMEOUT_MS);

type ReaderState = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  buffer: string;
};

type SseReadResult = {
  payload: MatchEvent;
  readerState: ReaderState;
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/discovery/matches`);

      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await wait(100);
  }

  throw new Error('Server did not start in time.');
}

async function postJson<TResponse>(path: string, payload: unknown): Promise<TResponse> {
  const response = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${path} (${response.status}) ${await response.text()}`);
  }

  return response.json() as Promise<TResponse>;
}

function readBufferedSseEvent(readerState: ReaderState): SseReadResult | ReaderState | null {
  const { reader, buffer } = readerState;
  const marker = buffer.indexOf('\n\n');

  if (marker === -1) {
    return null;
  }

  const chunk = buffer.slice(0, marker);
  const dataLine = chunk
    .split('\n')
    .find((line) => line.startsWith('data: '));

  if (!dataLine) {
    return {
      reader,
      buffer: buffer.slice(marker + 2),
    };
  }

  return {
    payload: JSON.parse(dataLine.slice(6)) as MatchEvent,
    readerState: {
      reader,
      buffer: buffer.slice(marker + 2),
    },
  };
}

async function readNextSseEvent(readerState: ReaderState): Promise<SseReadResult> {
  const { reader } = readerState;
  let { buffer } = readerState;

  while (true) {
    const bufferedEvent = readBufferedSseEvent({ reader, buffer });

    if (bufferedEvent && 'payload' in bufferedEvent) {
      return bufferedEvent;
    }

    if (bufferedEvent) {
      buffer = bufferedEvent.buffer;
      continue;
    }

    const { done, value } = await reader.read();

    if (done) {
      throw new Error('SSE stream ended unexpectedly.');
    }

    buffer += new TextDecoder().decode(value, { stream: true });
  }
}

async function waitForFinishedMatchEvent(readerState: ReaderState, winnerPlayerId: string): Promise<ReaderState> {
  let nextReaderState = readerState;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const event = await readNextSseEvent(nextReaderState);
    nextReaderState = event.readerState;
    if (
      event.payload.type === 'match_state' &&
      event.payload.match.status === 'finished' &&
      event.payload.match.winnerPlayerId === winnerPlayerId
    ) {
      return nextReaderState;
    }
  }

  throw new Error('Guest did not receive finished match state over SSE.');
}

async function waitForMatchStatusEvent(readerState: ReaderState, status: MatchStatus): Promise<ReaderState> {
  let nextReaderState = readerState;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const event = await readNextSseEvent(nextReaderState);
    nextReaderState = event.readerState;

    if (event.payload.type === 'match_state' && event.payload.match.status === status) {
      return nextReaderState;
    }
  }

  throw new Error(`Guest did not receive ${status} match state over SSE.`);
}

function solvePuzzle(puzzle: Puzzle): BoardValues {
  const values = [...puzzle.givens];

  function search(): boolean {
    let bestIndex: number | null = null;
    let bestCandidates: number[] | null = null;

    for (let index = 0; index < values.length; index += 1) {
      if (Number.isInteger(values[index])) {
        continue;
      }

      const candidates = getAllowedValues(puzzle, values, index);

      if (candidates.length === 0) {
        return false;
      }

      if (bestCandidates === null || candidates.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = candidates;
      }
    }

    if (bestIndex === null || bestCandidates === null) {
      return validateBoard(puzzle, values).solved;
    }

    for (const candidate of bestCandidates) {
      values[bestIndex] = candidate;

      if (validateBoard(puzzle, values).conflicts.size === 0 && search()) {
        return true;
      }

      values[bestIndex] = null;
    }

    return false;
  }

  if (!search()) {
    throw new Error('Could not solve multiplayer smoke-test puzzle.');
  }

  return values;
}

try {
  await waitForServer();

  const host = await postJson<{ matchId: string; playerId: string; puzzle: Puzzle }>('/api/matches', {});
  const givenCount = host.puzzle.givens.filter((value) => value !== null).length;
  const boardSize = host.puzzle.givens.length;
  const waitingProgress = await postJson<{ match: MatchState }>(`/api/matches/${host.matchId}/progress`, {
    playerId: host.playerId,
    filledCount: -1,
  });

  if (waitingProgress.match.status !== 'waiting' || waitingProgress.match.players[0].filledCount !== givenCount) {
    throw new Error('Inactive progress changed waiting match state.');
  }

  const guest = await postJson<{ playerId: string; puzzle: Puzzle }>(`/api/matches/${host.matchId}/join`, {});

  if (JSON.stringify(host.puzzle) !== JSON.stringify(guest.puzzle)) {
    throw new Error('Host and guest did not receive the same puzzle.');
  }

  const eventController = new AbortController();
  const guestEventsResponse = await fetch(
    `http://localhost:${port}/api/matches/${host.matchId}/events?playerId=${guest.playerId}`,
    { signal: eventController.signal },
  );
  if (!guestEventsResponse.body) {
    throw new Error('Guest SSE response had no body.');
  }

  let readerState: ReaderState = {
    reader: guestEventsResponse.body.getReader(),
    buffer: '',
  };
  const initialEvent = await readNextSseEvent(readerState);
  readerState = initialEvent.readerState;

  if (initialEvent.payload.type !== 'match_state') {
    throw new Error('Guest did not receive initial match_state event.');
  }

  readerState = await waitForMatchStatusEvent(readerState, 'active');

  async function reportAndCheckProgress(playerId: string, filledCount: number): Promise<MatchState> {
    const progress = await postJson<{ match: MatchState }>(`/api/matches/${host.matchId}/progress`, {
      playerId,
      filledCount,
    });
    const role = playerId === host.playerId ? 'host' : 'guest';

    if (progress.match.players.find((player) => player.role === role)?.filledCount !== filledCount) {
      throw new Error(`Valid ${role} progress was not saved.`);
    }

    const event = await readNextSseEvent(readerState);
    readerState = event.readerState;

    if (event.payload.type !== 'match_state' || JSON.stringify(event.payload.match) !== JSON.stringify(progress.match)) {
      throw new Error('Progress SSE did not match saved state, or rejected progress was broadcast.');
    }

    return progress.match;
  }

  for (const filledCount of [0, Math.max(0, givenCount - 1), givenCount, boardSize, givenCount + 1]) {
    await reportAndCheckProgress(host.playerId, filledCount);
  }

  const invalidCounts = [undefined, null, '3', true, {}, [], givenCount + 0.5, -1, boardSize + 1];
  const invalidBodies = invalidCounts.map((filledCount) => JSON.stringify({ playerId: host.playerId, filledCount }));
  invalidBodies.push(`{"playerId":"${host.playerId}","filledCount":`);
  let guestFilledCount = givenCount;

  for (const body of invalidBodies) {
    const response = await fetch(`http://localhost:${port}/api/matches/${host.matchId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    await response.text();

    if (response.status !== 400) {
      throw new Error(`Invalid progress ${body} returned ${response.status}, expected 400.`);
    }

    guestFilledCount = guestFilledCount === givenCount ? boardSize : givenCount;
    const state = await reportAndCheckProgress(guest.playerId, guestFilledCount);

    if (state.players.find((player) => player.role === 'host')?.filledCount !== givenCount + 1) {
      throw new Error('Rejected progress changed the host progress.');
    }
  }

  const solvedValues = solvePuzzle(host.puzzle);
  const finish = await postJson<{ match: { winnerPlayerId: string | null; status: MatchStatus } }>(`/api/matches/${host.matchId}/finish`, {
    playerId: host.playerId,
    values: solvedValues,
  });

  if (finish.match.winnerPlayerId !== host.playerId || finish.match.status !== 'finished') {
    throw new Error('Host finish did not end the match correctly.');
  }

  readerState = await waitForFinishedMatchEvent(readerState, host.playerId);

  const finishedProgress = await postJson<{ match: MatchState }>(`/api/matches/${host.matchId}/progress`, {
    playerId: host.playerId,
    filledCount: 'invalid',
  });

  if (
    finishedProgress.match.status !== 'finished' ||
    finishedProgress.match.winnerPlayerId !== host.playerId ||
    finishedProgress.match.players[0].filledCount !== boardSize
  ) {
    throw new Error('Inactive progress changed finished match state.');
  }

  await readerState.reader.cancel();
  readerState.reader.releaseLock();
  eventController.abort();

  const lateFinish = await postJson<{ match: { winnerPlayerId: string | null } }>(`/api/matches/${host.matchId}/finish`, {
    playerId: guest.playerId,
    values: solvedValues,
  });

  if (lateFinish.match.winnerPlayerId !== host.playerId) {
    throw new Error('Late finish changed the winner.');
  }

  console.log('Multiplayer smoke test passed.');
  clearTimeout(testTimeout);
} finally {
  serverProcess.kill();

  try {
    await Promise.race([once(serverProcess, 'exit'), wait(1000)]);
  } catch {
    // Process may already be gone.
  }
}
