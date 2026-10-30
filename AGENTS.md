# Tectonic – Agent Guide

## Project Overview

Tectonic is a browser-based number puzzle with solo play and two-player races.
Fill each region with numbers 1–N, where N is the region size. Each number appears
once per region, and identical numbers must not touch, even diagonally.

Keep the stack small: React, TypeScript, Vite, plain CSS, and a Node HTTP server.
Multiplayer updates use Server-Sent Events (SSE), not WebSockets.

## Code Map

- `src/client/App.tsx`: game state, input handling, and multiplayer orchestration.
- `src/client/components/`: board, cells, options dialog, race progress, and discovery UI.
- `src/client/hooks/useDiscovery.ts`: LAN discovery polling.
- `src/client/api.ts`: HTTP API calls.
- `src/client/matchEvents.ts`: SSE subscriptions and event parsing.
- `src/client/board.ts` and `src/client/status.ts`: board helpers and derived UI state.
- `src/client/style.css`: visual design and responsive layouts.
- `src/shared/api.ts`: shared domain and API types.
- `src/shared/puzzle.ts` and `src/shared/validate.ts`: generation, solving, and validation.
- `src/server/server.ts`: HTTP routes and server entrypoint.
- `src/server/matches.ts`: in-memory rooms, players, countdowns, rematches, and SSE.
- `src/server/discovery.ts`: UDP-based LAN discovery.
- `src/server/http.ts`: request parsing, responses, and static file serving.
- `scripts/`: puzzle and multiplayer smoke tests.
- `render.yaml`: Render deployment configuration.

The old `public/*` client and root `server.js` have been removed. Edit the
TypeScript sources, not generated files under `dist/`.

## Development Commands

- `npm install`: install dependencies.
- `npm run dev:server`: start the backend on port 3000 by default.
- `npm run dev`: start Vite in another terminal; `/api` requests proxy to port 3000.
- `npm run check`: type-check client, server, shared code, and test scripts.
- `npm test`: run Vitest unit tests, puzzle smoke tests, and multiplayer smoke tests.
- `npm run build`: compile the server and build the frontend.
- `npm start`: build, then serve the production app from the Node server.

Multiplayer smoke tests start their own server on port 3112 and exercise the
five-second countdown. Puzzle smoke tests check generated solutions, uniqueness,
region connectivity, and layout variety.

## Behavior to Preserve

- Keep the board usable on mobile without pinch-zoom or horizontal overflow.
- Keep puzzle and multiplayer controls in the hamburger-triggered options dialog.
- Keep the multiplayer battle strip as the persistent race progress/status surface;
  do not reintroduce a standalone status card above the board.
- Lock editing during loading, waiting, countdown, and finished multiplayer states.
  Overlay visibility is separate from editing: the winner's success state currently
  hides the overlay while keeping the board locked.
- Show the room code prominently on the locked overlay when it is visible, and
  inline in the battle-strip header only during an active race.
- Close the options dialog after successfully hosting or joining a race.
- Keep the five-second countdown for initial races and rematches.
- Let the host start a fresh puzzle in the same room after a race finishes.
  Preserve the room code, notify guests, and use `puzzleRevision` to resync clients.
- Clear room-code displays and multiplayer state when leaving or closing a room.
- Preserve keyboard input, touch interactions, and LAN discovery behavior.

## Change Guidelines

- Keep changes focused and follow the existing TypeScript and React conventions.
- Reuse shared types and validation logic instead of duplicating rules between
  client and server. Keep shared modules usable in both environments.
- Preserve API routes and SSE event contracts unless a change explicitly requires
  coordinated client/server updates.
- Keep existing CSS classes and responsive behavior when changing components.
- Add regression coverage alongside existing unit or smoke tests for changed behavior.
- Run `npm run check` and relevant tests for code changes; use `npm run build` to
  validate build or deployment changes.
- Keep this guide current when architecture, commands, or core behavior changes.
  Use Git history for historical change logs rather than expanding this file.

## Deployment and Operational Notes

- The Node server serves both `/api` and the built frontend in `dist/client`.
  Compiled server output starts at `dist/server/server/server.js`.
- `PORT` sets the HTTP port (default 3000).
- `CLOUD_MODE=true` disables LAN discovery; Render sets this automatically.
- `LAN_DISCOVERY_ENABLED=false` also disables discovery, and `DISCOVERY_PORT`
  overrides its UDP port (default 32145).
- Rooms live only in server memory and are lost on restart. Do not assume durable
  sessions or support for multiple independent server instances.
- Render currently builds during deployment and again through `npm start`.
  Account for both commands when changing the deployment flow.

## Solo Resume

- `src/client/soloStorage.ts` stores versioned, validated solo puzzles and entries
  in localStorage. Startup restores them unless a join link takes precedence.
- Only boards loaded as solo are saved; race boards, including those retained
  after leaving a race, never replace solo progress. New solo puzzles and resets
  update the save. Storage failures are non-fatal; no credentials or timing data
  are stored, and unrelated storage keys are left untouched.

## Race Invitations

- Existing hosts and guests can copy an invitation from the options dialog.
  Links retain the public origin and app path with only `?join=ROOMCODE`, never
  URL credentials, previous query parameters, or fragments. Opening a link uses
  the existing join flow; it does not grant the sender's player identity.
- Clipboard copying requires a supported secure context. If unavailable or denied,
  show a selectable read-only link for manual copying. Feedback resets when the
  dialog closes or the room changes; stale clipboard completions are ignored.

## Known UX Limitations

- The locked overlay shows the status title, not the derived detail text.
- After a win, the room code remains available in the options dialog but is hidden
  on both the overlay and the battle-strip header.
- Only the host initiates rematches; guests do not explicitly confirm them.
