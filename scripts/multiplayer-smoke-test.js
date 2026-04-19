import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { getAllowedValues, validateBoard } from '../src/shared/validate.js';

const port = 3112;
const TEST_TIMEOUT_MS = 10000;
const serverProcess = spawn('node', ['server.js'], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
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

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/`);

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

async function postJson(path, payload) {
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

  return response.json();
}

async function readNextSseEvent(readerState) {
  const { reader } = readerState;
  let { buffer } = readerState;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      throw new Error('SSE stream ended unexpectedly.');
    }

    buffer += new TextDecoder().decode(value, { stream: true });
    const marker = buffer.indexOf('\n\n');

    if (marker === -1) {
      continue;
    }

    const chunk = buffer.slice(0, marker);
    const dataLine = chunk
      .split('\n')
      .find((line) => line.startsWith('data: '));

    if (!dataLine) {
      readerState.buffer = buffer.slice(marker + 2);
      continue;
    }

    return {
      payload: JSON.parse(dataLine.slice(6)),
      readerState: {
        reader,
        buffer: buffer.slice(marker + 2),
      },
    };
  }
}

async function waitForFinishedMatchEvent(readerState, winnerPlayerId) {
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

function solvePuzzle(puzzle) {
  const values = [...puzzle.givens];

  function search() {
    let bestIndex = null;
    let bestCandidates = null;

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

  const host = await postJson('/api/matches', {});
  const guest = await postJson(`/api/matches/${host.matchId}/join`, {});

  if (JSON.stringify(host.puzzle) !== JSON.stringify(guest.puzzle)) {
    throw new Error('Host and guest did not receive the same puzzle.');
  }

  const eventController = new AbortController();
  const guestEventsResponse = await fetch(
    `http://localhost:${port}/api/matches/${host.matchId}/events?playerId=${guest.playerId}`,
    { signal: eventController.signal },
  );
  let readerState = {
    reader: guestEventsResponse.body.getReader(),
    buffer: '',
  };
  const initialEvent = await readNextSseEvent(readerState);
  readerState = initialEvent.readerState;

  if (initialEvent.payload.type !== 'match_state') {
    throw new Error('Guest did not receive initial match_state event.');
  }

  await postJson(`/api/matches/${host.matchId}/progress`, {
    playerId: host.playerId,
    filledCount: host.puzzle.givens.filter((value) => value !== null).length,
  });

  const solvedValues = solvePuzzle(host.puzzle);
  const finish = await postJson(`/api/matches/${host.matchId}/finish`, {
    playerId: host.playerId,
    values: solvedValues,
  });

  if (finish.match.winnerPlayerId !== host.playerId || finish.match.status !== 'finished') {
    throw new Error('Host finish did not end the match correctly.');
  }

  readerState = await waitForFinishedMatchEvent(readerState, host.playerId);

  await readerState.reader.cancel();
  readerState.reader.releaseLock();
  eventController.abort();

  const lateFinish = await postJson(`/api/matches/${host.matchId}/finish`, {
    playerId: guest.playerId,
    values: solvedValues,
  });

  if (lateFinish.match.winnerPlayerId !== host.playerId) {
    throw new Error('Late finish changed the winner.');
  }

  console.log('Multiplayer smoke test passed.');
  clearTimeout(testTimeout);
  process.exit(0);
} finally {
  serverProcess.kill();

  try {
    await once(serverProcess, 'exit');
  } catch {
    // Process may already be gone.
  }
}
