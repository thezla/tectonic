import http from 'node:http';
import path from 'node:path';

import type { BoardValues } from '../shared/api.js';
import { createPuzzle } from '../shared/puzzle.js';
import { validateBoard } from '../shared/validate.js';
import { createDiscoveryService } from './discovery.js';
import { readJsonBody, sendJson, sendText, serveStaticFile } from './http.js';
import {
  attachEventStream,
  broadcastEvent,
  broadcastMatchState,
  buildMatchState,
  closeMatch,
  createGuest,
  createMatch,
  finishMatch,
  getJoinableMatches,
  getPlayerRecord,
  matches,
  resetHostToWaiting,
  resetMatchForRematch,
  sendMatchResponse,
} from './matches.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const publicDir = path.join(process.cwd(), 'dist', 'client');
const discovery = createDiscoveryService({
  port,
  cloudMode: process.env.CLOUD_MODE === 'true',
  enabledByEnv: process.env.LAN_DISCOVERY_ENABLED !== 'false',
  getJoinableMatches,
});

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Missing URL');
    return;
  }

  const requestUrl = new URL(request.url, 'http://localhost');
  const matchRoute = getMatchRoute(requestUrl.pathname);

  if (request.method === 'GET' && requestUrl.pathname === '/api/puzzle') {
    sendJson(response, 200, createPuzzle());
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/discovery/matches') {
    sendJson(response, 200, {
      enabled: discovery.enabled,
      matches: discovery.getSnapshot(),
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/matches') {
    const { match, playerId } = createMatch();
    sendMatchResponse(response, match, playerId, 'host');
    return;
  }

  if (matchRoute && (await handleMatchRoute(request, response, matchRoute, requestUrl))) {
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method not allowed');
    return;
  }

  await serveStaticFile(request, response, publicDir, requestUrl.pathname);
});

discovery.start();
server.listen(port, () => {
  console.log(`Tectonic is running at http://localhost:${port}`);
});

type MatchRoute = {
  roomCode: string;
  action: 'events' | 'join' | 'leave' | 'close' | 'rematch' | 'progress' | 'finish';
};

function getMatchRoute(pathname: string): MatchRoute | null {
  const match = pathname.match(/^\/api\/matches\/([A-Z0-9]+)\/(events|join|leave|close|rematch|progress|finish)$/);

  if (!match) {
    return null;
  }

  return {
    roomCode: match[1],
    action: match[2] as MatchRoute['action'],
  };
}

async function handleMatchRoute(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  route: MatchRoute,
  requestUrl: URL,
): Promise<boolean> {
  if (request.method === 'GET' && route.action === 'events') {
    handleEventsRoute(request, response, route.roomCode, requestUrl);
    return true;
  }

  if (request.method !== 'POST') {
    return false;
  }

  if (route.action === 'join') {
    handleJoinRoute(response, route.roomCode);
    return true;
  }

  const match = matches.get(route.roomCode);

  if (!match) {
    sendText(response, 404, 'Match not found');
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const player = getPlayerRecord(match, body.playerId);

    if (!player) {
      sendText(response, 403, 'Unknown player');
      return true;
    }

    if (route.action === 'leave') {
      if (player.role !== 'guest') {
        sendText(response, 403, 'Only guests can leave a hosted race');
        return true;
      }

      resetHostToWaiting(match);
      broadcastMatchState(match);
      sendJson(response, 200, { match: buildMatchState(match) });
      return true;
    }

    if (route.action === 'close') {
      if (player.role !== 'host') {
        sendText(response, 403, 'Only the host can close a race');
        return true;
      }

      closeMatch(match, 'host_closed');
      sendJson(response, 200, { closed: true });
      return true;
    }

    if (route.action === 'rematch') {
      if (player.role !== 'host') {
        sendText(response, 403, 'Only the host can start the next race');
        return true;
      }

      if (match.status !== 'finished') {
        sendText(response, 409, 'Match is not finished');
        return true;
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
      return true;
    }

    if (route.action === 'progress') {
      if (match.status !== 'active') {
        sendJson(response, 200, { match: buildMatchState(match) });
        return true;
      }

      if (Number.isInteger(body.filledCount)) {
        player.filledCount = body.filledCount as number;
      }

      broadcastMatchState(match);
      sendJson(response, 200, { match: buildMatchState(match) });
      return true;
    }

    if (route.action === 'finish') {
      if (match.status === 'finished') {
        sendJson(response, 200, { match: buildMatchState(match) });
        return true;
      }

      if (match.status !== 'active' || !Array.isArray(body.values)) {
        sendText(response, 400, 'Invalid finish attempt');
        return true;
      }

      const values = body.values as BoardValues;
      const result = validateBoard(match.puzzle, values);

      if (!result.solved) {
        sendText(response, 400, 'Board is not solved');
        return true;
      }

      finishMatch(match, player, values);
      sendJson(response, 200, { match: buildMatchState(match) });
      return true;
    }
  } catch (error) {
    console.error(error);
    sendText(response, 400, 'Invalid JSON body');
    return true;
  }

  return false;
}

function handleJoinRoute(response: http.ServerResponse, roomCode: string): void {
  const match = matches.get(roomCode);

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

  const playerId = createGuest(match);
  sendMatchResponse(response, match, playerId, 'guest');
  broadcastMatchState(match);
}

function handleEventsRoute(request: http.IncomingMessage, response: http.ServerResponse, roomCode: string, requestUrl: URL): void {
  const match = matches.get(roomCode);
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
}
