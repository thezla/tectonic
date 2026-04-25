import dgram from 'node:dgram';
import os from 'node:os';

import type { DiscoveryMatch } from '../shared/api.js';
import { createId, type MatchRecord } from './matches.js';

type DiscoveryEntry = DiscoveryMatch & {
  lastSeenAt: number;
};

type DiscoveryServiceOptions = {
  port: number;
  cloudMode: boolean;
  enabledByEnv: boolean;
  getJoinableMatches: () => MatchRecord[];
};

const DISCOVERY_INTERVAL_MS = 2000;
const DISCOVERY_TTL_MS = 7000;

export function createDiscoveryService({ port, cloudMode, enabledByEnv, getJoinableMatches }: DiscoveryServiceOptions) {
  const instanceId = createId(10);
  const discoveryPort = Number.parseInt(process.env.DISCOVERY_PORT ?? '32145', 10);
  const remoteDiscoveryEntries = new Map<string, DiscoveryEntry>();
  const socket = !cloudMode && enabledByEnv ? dgram.createSocket('udp4') : null;
  let enabled = Boolean(socket);

  function getSnapshot(): DiscoveryMatch[] {
    if (!enabled) {
      return [];
    }

    const now = Date.now();
    const localAddress = getLanAddress();
    const localEntries: DiscoveryMatch[] = getJoinableMatches().map((match) => ({
      instanceId,
      matchId: match.id,
      roomCode: match.id,
      host: os.hostname(),
      hostAddress: localAddress,
      port,
      status: match.status,
      origin: `http://${localAddress}:${port}`,
      source: 'local' as const,
      updatedAt: now,
    }));

    const remoteEntries = [...remoteDiscoveryEntries.values()].filter(
      (entry) => entry.lastSeenAt + DISCOVERY_TTL_MS > now,
    );

    return [...localEntries, ...remoteEntries.map(({ lastSeenAt, ...entry }) => entry)];
  }

  function start(): void {
    if (!socket) {
      return;
    }

    socket.on('error', (error) => {
      console.warn(`LAN discovery disabled: ${error.message}`);
      enabled = false;
      socket.close();
    });
    socket.on('message', handleDiscoveryMessage);
    socket.on('listening', () => {
      socket.setBroadcast(true);
    });
    socket.bind(discoveryPort);
    setInterval(() => {
      pruneDiscoveryEntries();
      broadcastDiscovery();
    }, DISCOVERY_INTERVAL_MS);
  }

  function broadcastDiscovery(): void {
    if (!enabled || !socket) {
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

    socket.send(payload, discoveryPort, '255.255.255.255');
  }

  function handleDiscoveryMessage(message: Buffer): void {
    if (!enabled) {
      return;
    }

    try {
      const payload = JSON.parse(message.toString('utf8'));

      if (payload.type !== 'tectonic-discovery' || payload.instanceId === instanceId) {
        return;
      }

      const now = Date.now();
      const announcedMatchIds = new Set<string>();

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

  function pruneDiscoveryEntries(): void {
    if (!enabled) {
      return;
    }

    const now = Date.now();

    for (const [key, entry] of remoteDiscoveryEntries.entries()) {
      if (entry.lastSeenAt + DISCOVERY_TTL_MS <= now) {
        remoteDiscoveryEntries.delete(key);
      }
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    getSnapshot,
    start,
  };
}

function getLanAddress(): string {
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
