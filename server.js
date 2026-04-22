import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPuzzle, createPuzzleWithSolution } from './src/shared/puzzle.js';
import { validateBoard } from './src/shared/validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const sharedDir = path.join(__dirname, 'src', 'shared');
const matches = new Map();
const MATCH_START_DELAY_MS = 5000;
const cloudMode = process.env.CLOUD_MODE === 'true';
const lanDiscoveryEnabled = !cloudMode && process.env.LAN_DISCOVERY_ENABLED !== 'false';
const DISCOVERY_PORT = Number.parseInt(process.env.DISCOVERY_PORT ?? '32145', 10);
const DISCOVERY_INTERVAL_MS = 2000;
const DISCOVERY_TTL_MS = 7000;
const instanceId = createId(10);
const discoverySocket = lanDiscoveryEnabled ? dgram.createSocket('udp4') : null;
const remoteDiscoveryEntries = new Map();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': MIME_TYPES['.json'],
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveFile(request, response, filePath) {
  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(content);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      sendText(response, 404, 'Not found');
      return;
    }

    console.error(error);
    sendText(response, 500, 'Internal server error');
  }
}

function resolveUnder(baseDir, subPath) {
  const resolvedPath = path.resolve(baseDir, subPath);

  if (resolvedPath !== baseDir && !resolvedPath.startsWith(`${baseDir}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function resolveStaticPath(urlPath) {
  const normalizedPath = path.normalize(urlPath);

  if (urlPath === '/') {
    return path.join(publicDir, 'index.html');
  }

  if (urlPath.startsWith('/shared/')) {
    return resolveUnder(sharedDir, normalizedPath.replace(/^\/shared\//, ''));
  }

  return resolveUnder(publicDir, normalizedPath.slice(1));
}

function createId(length = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}

function createUniqueMatchId() {
  let matchId = createId();

  while (matches.has(matchId)) {
    matchId = createId();
  }

  return matchId;
}

function buildMatchState(match) {
  return {
    matchId: match.id,
    roomCode: match.id,
    puzzleRevision: match.puzzleRevision,
    status: match.status,
    winnerPlayerId: match.winnerPlayerId,
    startsAt: match.startsAt,
    players: ['host', 'guest'].map((role) => {
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

function sendSseEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastMatchState(match) {
  const payload = {
    type: 'match_state',
    match: buildMatchState(match),
  };

  for (const response of match.subscribers) {
    sendSseEvent(response, payload);
  }
}

function broadcastEvent(match, payload) {
  for (const response of match.subscribers) {
    sendSseEvent(response, payload);
  }
}

function getPlayerRecord(match, playerId) {
  if (match.players.host?.id === playerId) {
    return match.players.host;
  }

  if (match.players.guest?.id === playerId) {
    return match.players.guest;
  }

  return null;
}

function resetHostToWaiting(match) {
  if (match.startTimer) {
    clearTimeout(match.startTimer);
    match.startTimer = null;
  }

  match.players.guest = null;
  match.status = 'waiting';
  match.winnerPlayerId = null;
  match.startsAt = null;

  if (match.players.host) {
    match.players.host.filledCount = match.givenCount;
  }
}

function assignPuzzleToMatch(match, puzzle, solution) {
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

function startCountdown(match) {
  if (match.startTimer) {
    clearTimeout(match.startTimer);
  }

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

function resetMatchForRematch(match) {
  const { puzzle, solution } = createPuzzleWithSolution();
  assignPuzzleToMatch(match, puzzle, solution);
  match.winnerPlayerId = null;

  if (match.players.guest) {
    startCountdown(match);
  } else {
    if (match.startTimer) {
      clearTimeout(match.startTimer);
      match.startTimer = null;
    }

    match.status = 'waiting';
    match.startsAt = null;
  }
}

function closeMatch(match, reason) {
  if (match.startTimer) {
    clearTimeout(match.startTimer);
    match.startTimer = null;
  }

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

function createMatch() {
  const { puzzle, solution } = createPuzzleWithSolution();
  const playerId = createId(8);
  const match = {
    id: createUniqueMatchId(),
    puzzle: null,
    solution: null,
    givenCount: 0,
    puzzleRevision: 0,
    status: 'waiting',
    winnerPlayerId: null,
    startsAt: null,
    startTimer: null,
    subscribers: new Set(),
    players: {
      host: {
        id: playerId,
        role: 'host',
        filledCount: 0,
        connected: false,
      },
      guest: null,
    },
  };

  assignPuzzleToMatch(match, puzzle, solution);

  matches.set(match.id, match);

  return {
    match,
    playerId,
  };
}

function attachEventStream(request, response, match, playerId) {
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

function sendMatchResponse(response, match, playerId, role) {
  sendJson(response, 200, {
    matchId: match.id,
    roomCode: match.id,
    playerId,
    role,
    puzzle: match.puzzle,
    match: buildMatchState(match),
  });
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (
        address.family === 'IPv4' &&
        !address.internal &&
        !address.address.startsWith('169.254.')
      ) {
        return address.address;
      }
    }
  }

  return '127.0.0.1';
}

function getJoinableMatches() {
  return [...matches.values()].filter((match) => match.status === 'waiting');
}

function getDiscoverySnapshot() {
  if (!lanDiscoveryEnabled) {
    return [];
  }

  const now = Date.now();
  const localAddress = getLanAddress();
  const localEntries = getJoinableMatches().map((match) => ({
    instanceId,
    matchId: match.id,
    roomCode: match.id,
    host: os.hostname(),
    hostAddress: localAddress,
    port,
    status: match.status,
    origin: `http://${localAddress}:${port}`,
    source: 'local',
    updatedAt: now,
  }));

  const remoteEntries = [...remoteDiscoveryEntries.values()].filter(
    (entry) => entry.lastSeenAt + DISCOVERY_TTL_MS > now,
  );

  return [...localEntries, ...remoteEntries.map(({ lastSeenAt, ...entry }) => entry)];
}

function pruneDiscoveryEntries() {
  if (!lanDiscoveryEnabled) {
    return;
  }

  const now = Date.now();

  for (const [key, entry] of remoteDiscoveryEntries.entries()) {
    if (entry.lastSeenAt + DISCOVERY_TTL_MS <= now) {
      remoteDiscoveryEntries.delete(key);
    }
  }
}

function broadcastDiscovery() {
  if (!lanDiscoveryEnabled || !discoverySocket) {
    return;
  }

  const joinableMatches = getJoinableMatches();

  if (joinableMatches.length === 0) {
    return;
  }

  const address = getLanAddress();
  const payload = Buffer.from(
    JSON.stringify({
      type: 'tectonic-discovery',
      instanceId,
      host: os.hostname(),
      hostAddress: address,
      port,
      matches: joinableMatches.map((match) => ({
        matchId: match.id,
        roomCode: match.id,
        status: match.status,
        updatedAt: Date.now(),
      })),
    }),
  );

  discoverySocket.send(payload, DISCOVERY_PORT, '255.255.255.255');
}

function handleDiscoveryMessage(message) {
  if (!lanDiscoveryEnabled) {
    return;
  }

  try {
    const payload = JSON.parse(message.toString('utf8'));

    if (payload.type !== 'tectonic-discovery' || payload.instanceId === instanceId) {
      return;
    }

    const now = Date.now();
    const announcedMatchIds = new Set();

    for (const match of payload.matches ?? []) {
      if (match.status !== 'waiting') {
        continue;
      }

      announcedMatchIds.add(match.matchId);
      remoteDiscoveryEntries.set(`${payload.instanceId}:${match.matchId}`, {
        instanceId: payload.instanceId,
        matchId: match.matchId,
        roomCode: match.roomCode,
        host: payload.host,
        hostAddress: payload.hostAddress,
        port: payload.port,
        status: match.status,
        origin: `http://${payload.hostAddress}:${payload.port}`,
        source: 'remote',
        updatedAt: match.updatedAt,
        lastSeenAt: now,
      });
    }

    for (const key of [...remoteDiscoveryEntries.keys()]) {
      if (!key.startsWith(`${payload.instanceId}:`)) {
        continue;
      }

      const [, matchId] = key.split(':');

      if (!announcedMatchIds.has(matchId)) {
        remoteDiscoveryEntries.delete(key);
      }
    }

    pruneDiscoveryEntries();
  } catch {
    // Ignore invalid discovery packets.
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Missing URL');
    return;
  }

  const requestUrl = new URL(request.url, 'http://localhost');
  const eventsMatch = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/events$/);
  const joinMatch = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/join$/);
  const leaveMatch = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/leave$/);
  const closeMatchRequest = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/close$/);
  const rematchRequest = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/rematch$/);
  const progressMatch = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/progress$/);
  const finishMatch = requestUrl.pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/finish$/);

  if (request.method === 'GET' && requestUrl.pathname === '/api/puzzle') {
    sendJson(response, 200, createPuzzle());
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/discovery/matches') {
    sendJson(response, 200, {
      enabled: lanDiscoveryEnabled,
      matches: getDiscoverySnapshot(),
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/matches') {
    const { match, playerId } = createMatch();
    sendMatchResponse(response, match, playerId, 'host');
    return;
  }

  if (request.method === 'POST' && joinMatch) {
    const match = matches.get(joinMatch[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    if (match.status === 'finished') {
      sendText(response, 409, 'Match already finished');
      return;
    }

    if (match.players.guest) {
      sendText(response, 409, 'Match is full');
      return;
    }

    const playerId = createId(8);
    match.players.guest = {
      id: playerId,
      role: 'guest',
      filledCount: match.givenCount,
      connected: false,
    };
    startCountdown(match);
    sendMatchResponse(response, match, playerId, 'guest');
    broadcastMatchState(match);
    return;
  }

  if (request.method === 'POST' && leaveMatch) {
    const match = matches.get(leaveMatch[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    try {
      const body = await readJsonBody(request);
      const player = getPlayerRecord(match, body.playerId);

      if (!player) {
        sendText(response, 403, 'Unknown player');
        return;
      }

      if (player.role !== 'guest') {
        sendText(response, 403, 'Only guests can leave a hosted race');
        return;
      }

      resetHostToWaiting(match);
      broadcastMatchState(match);
      sendJson(response, 200, { match: buildMatchState(match) });
    } catch (error) {
      console.error(error);
      sendText(response, 400, 'Invalid JSON body');
    }

    return;
  }

  if (request.method === 'POST' && closeMatchRequest) {
    const match = matches.get(closeMatchRequest[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    try {
      const body = await readJsonBody(request);
      const player = getPlayerRecord(match, body.playerId);

      if (!player) {
        sendText(response, 403, 'Unknown player');
        return;
      }

      if (player.role !== 'host') {
        sendText(response, 403, 'Only the host can close a race');
        return;
      }

      closeMatch(match, 'host_closed');
      sendJson(response, 200, { closed: true });
    } catch (error) {
      console.error(error);
      sendText(response, 400, 'Invalid JSON body');
    }

    return;
  }

  if (request.method === 'POST' && rematchRequest) {
    const match = matches.get(rematchRequest[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    try {
      const body = await readJsonBody(request);
      const player = getPlayerRecord(match, body.playerId);

      if (!player) {
        sendText(response, 403, 'Unknown player');
        return;
      }

      if (player.role !== 'host') {
        sendText(response, 403, 'Only the host can start the next race');
        return;
      }

      if (match.status !== 'finished') {
        sendText(response, 409, 'Match is not finished');
        return;
      }

      resetMatchForRematch(match);
      broadcastEvent(match, {
        type: 'match_reset',
        puzzle: match.puzzle,
        match: buildMatchState(match),
      });
      sendJson(response, 200, {
        puzzle: match.puzzle,
        match: buildMatchState(match),
      });
    } catch (error) {
      console.error(error);
      sendText(response, 400, 'Invalid JSON body');
    }

    return;
  }

  if (request.method === 'GET' && eventsMatch) {
    const match = matches.get(eventsMatch[1]);
    const playerId = requestUrl.searchParams.get('playerId');

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    if (!playerId) {
      sendText(response, 400, 'Missing playerId');
      return;
    }

    attachEventStream(request, response, match, playerId);
    return;
  }

  if (request.method === 'POST' && progressMatch) {
    const match = matches.get(progressMatch[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    try {
      const body = await readJsonBody(request);
      const player = getPlayerRecord(match, body.playerId);

      if (!player) {
        sendText(response, 403, 'Unknown player');
        return;
      }

      if (match.status !== 'active') {
        sendJson(response, 200, { match: buildMatchState(match) });
        return;
      }

      if (Number.isInteger(body.filledCount)) {
        player.filledCount = body.filledCount;
      }

      broadcastMatchState(match);
      sendJson(response, 200, { match: buildMatchState(match) });
    } catch (error) {
      console.error(error);
      sendText(response, 400, 'Invalid JSON body');
    }

    return;
  }

  if (request.method === 'POST' && finishMatch) {
    const match = matches.get(finishMatch[1]);

    if (!match) {
      sendText(response, 404, 'Match not found');
      return;
    }

    try {
      const body = await readJsonBody(request);
      const player = getPlayerRecord(match, body.playerId);

      if (!player) {
        sendText(response, 403, 'Unknown player');
        return;
      }

      if (match.status === 'finished') {
        sendJson(response, 200, { match: buildMatchState(match) });
        return;
      }

      if (match.status !== 'active' || !Array.isArray(body.values)) {
        sendText(response, 400, 'Invalid finish attempt');
        return;
      }

      const result = validateBoard(match.puzzle, body.values);

      if (!result.solved) {
        sendText(response, 400, 'Board is not solved');
        return;
      }

      player.filledCount = body.values.filter((value) => value !== null).length;
      if (match.startTimer) {
        clearTimeout(match.startTimer);
        match.startTimer = null;
      }
      match.status = 'finished';
      match.winnerPlayerId = player.id;
      match.startsAt = null;
      broadcastMatchState(match);
      sendJson(response, 200, { match: buildMatchState(match) });
    } catch (error) {
      console.error(error);
      sendText(response, 400, 'Invalid JSON body');
    }

    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  const filePath = resolveStaticPath(requestUrl.pathname);

  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  await serveFile(request, response, filePath);
});

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (lanDiscoveryEnabled && discoverySocket) {
  discoverySocket.on('message', handleDiscoveryMessage);
  discoverySocket.on('listening', () => {
    discoverySocket.setBroadcast(true);
  });
  discoverySocket.bind(DISCOVERY_PORT);
  setInterval(() => {
    pruneDiscoveryEntries();
    broadcastDiscovery();
  }, DISCOVERY_INTERVAL_MS);
}

server.listen(port, () => {
  console.log(`Tectonic is running at http://localhost:${port}`);
});
