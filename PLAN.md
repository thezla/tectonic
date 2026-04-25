# React + TypeScript Refactor Plan

## Goal

Refactor Tectonic from a no-build vanilla JS app into a modern React + TypeScript codebase while preserving the current design, gameplay, multiplayer behavior, LAN discovery, SSE updates, deployment behavior, and mobile layout.

The target outcome is a codebase that is easier to read, type-check, test, and change without making the app feel or behave differently.

## Current App Shape

- Frontend is a single large `public/app.js` file that owns DOM queries, rendering, game state, match state, API calls, SSE, timers, and input handling.
- Styling is centralized in `public/style.css` and should be preserved initially.
- HTML is mostly static structure in `public/index.html`.
- Backend is a Node HTTP server in `server.js` serving static files, JSON APIs, SSE match events, and LAN discovery.
- Shared puzzle logic lives in `src/shared/puzzle.js` and `src/shared/validate.js`.
- Tests are smoke scripts in `scripts/`.
- Render deployment currently runs `npm install` and then `npm start`, so introducing a frontend build requires deployment script changes.

## Proposed Stack

- React
- TypeScript
- Vite
- Node ESM server retained initially
- CSS retained as plain CSS during migration
- Vitest for unit tests once TypeScript is introduced

Avoid adding a large framework such as Next.js unless deployment, routing, SSR, or API structure needs change later.

## Migration Principles

- Preserve existing UX, visual design, copy, and responsive behavior.
- Keep the backend API contract stable during the frontend migration.
- Move behavior in small vertical slices, not a full rewrite.
- Convert shared logic to TypeScript before React state relies on it.
- Prefer simple React state and effects over introducing global state libraries.
- Keep CSS class names stable where practical to minimize visual regressions.
- Add types around API payloads, match state, puzzle state, and board values early.
- Avoid compatibility shims unless they are needed for deployment or an intermediate migration step.

## Phase 1: Add Build Tooling

1. Add Vite, React, TypeScript, and related scripts.
2. Create `tsconfig.json`, `vite.config.ts`, and a React entrypoint under `src/client/`.
3. Update `package.json` scripts:
   - `dev` for Vite dev server.
   - `build` for production frontend and server builds.
   - `start` for the built Node server or the current Node server during the first transition.
   - `check` for TypeScript plus server syntax checks.
   - `test` for existing smoke tests.
4. Configure Vite dev proxying so `/api/*` and `/shared/*` requests still reach the Node server during local development.
5. Keep the existing server running while making it able to serve built Vite assets from `dist/client`.
6. Keep `public/style.css` available unchanged at first.
7. Update `render.yaml` so deployment runs the production build before `npm start`.

## Phase 2: Type Shared Domain Logic

1. Rename shared modules:
   - `src/shared/puzzle.js` to `src/shared/puzzle.ts`.
   - `src/shared/validate.js` to `src/shared/validate.ts`.
2. Define core types:
   - `Puzzle`
   - `CellValue`
   - `BoardValues`
   - `ValidationResult`
   - `RegionId`
3. Preserve all existing function behavior.
4. Update imports in server, tests, and frontend.
5. Add or keep tests that verify puzzle generation, uniqueness, region connectivity, and board validation.

## Phase 3: Type API Contracts

1. Add `src/shared/api.ts` for request and response types.
2. Define:
   - `MatchStatus`
   - `PlayerRole`
   - `MatchPlayerState`
   - `MatchState`
   - `MatchSession`
   - `MatchEvent`
   - `DiscoveryMatch`
3. Use these types from both server and client.
4. Keep endpoint URLs and payload shapes unchanged.

## Phase 4: Split Client Logic Before Rebuilding UI

Create client modules that mirror existing responsibilities:

- `src/client/api.ts`
  Handles `fetch`, `postJson`, puzzle loading, match creation, joining, leaving, closing, rematching, progress, and finish requests.
- `src/client/matchEvents.ts`
  Wraps `EventSource`, parses match events, and exposes a cleanup function.
- `src/client/board.ts`
  Contains display helpers such as region colors, border widths, cell labels, filled counts, and scored filled counts.
- `src/client/status.ts`
  Contains board message, match status, battle strip text, and control state derivation.

This reduces the risk of translating the entire `public/app.js` directly into one large React component.

## Phase 5: Build React App Shell

1. Replace static interactive markup with a React root.
2. Keep `public/index.html` minimal:
   - Root element.
   - CSS link or Vite CSS import.
   - React entry script.
3. Create `src/client/App.tsx`.
4. Model top-level state:
   - `puzzle`
   - `values`
   - `selectedIndex`
   - `isLoadingPuzzle`
   - `matchSession`
   - discovery state
   - modal open state
5. Port initialization behavior:
   - Load discovered matches.
   - Handle `?join=CODE`.
   - Load solo puzzle by default.
   - Cleanup SSE and discovery timers on unmount.
6. Use effects carefully for timers, SSE, discovery polling, progress debounce, countdown refresh, and `beforeunload` cleanup.

## Phase 6: Componentize UI

Create small components around existing UI sections:

- `OptionsModal`
- `GameControls`
- `MultiplayerControls`
- `HostedGamesList`
- `BattleStrip`
- `BoardPanel`
- `Board`
- `Cell`
- `BoardLockedOverlay`

Keep class names aligned with the current CSS so the design remains unchanged.

## Phase 7: Port Board Interaction

1. Replace manual `innerHTML` rendering with React rendering.
2. Preserve current interactions:
   - Click cycles cell value.
   - Right click clears cell.
   - Long press clears cell.
   - Keyboard number entry applies to selected cell.
   - Backspace, Delete, and `0` clear selected cell.
   - Double click prevention remains scoped to the board.
3. Keep board lock rules identical:
   - Loading locks board.
   - Waiting locks board.
   - Countdown locks board.
   - Finished match locks board.
   - Active multiplayer and solo puzzle allow valid edits.
4. Preserve board accessibility details such as cell labels, button disabled states, dialog labels, and visible status text.

## Phase 8: Port Multiplayer Flow

1. Preserve existing endpoints:
   - `GET /api/puzzle`
   - `GET /api/discovery/matches`
   - `POST /api/matches`
   - `POST /api/matches/:id/join`
   - `POST /api/matches/:id/leave`
   - `POST /api/matches/:id/close`
   - `POST /api/matches/:id/rematch`
   - `POST /api/matches/:id/progress`
   - `POST /api/matches/:id/finish`
   - `GET /api/matches/:id/events`
2. Preserve SSE behavior:
   - `match_state`
   - `match_reset`
   - `match_closed`
3. Preserve puzzle revision handling for rematches.
4. Preserve progress debounce behavior.
5. Preserve opponent gain animation behavior.
6. Preserve host and guest control visibility.
7. Preserve modal auto-close after successful host and join actions.
8. Preserve direct LAN-discovery join redirects across origins.

## Phase 9: Convert Server To TypeScript

1. Rename `server.js` to `src/server/server.ts` or `server.ts`.
2. Add server-side types for internal match records.
3. Keep the Node HTTP server implementation initially.
4. Preserve LAN discovery behavior and environment variables:
   - `PORT`
   - `CLOUD_MODE`
   - `LAN_DISCOVERY_ENABLED`
   - `DISCOVERY_PORT`
5. Compile server output separately from client output.
6. Update start scripts to run built server output.
7. Keep static path safety checks when switching from `public` files to Vite output files.

## Phase 10: Testing And Verification

1. Keep existing smoke tests passing throughout the migration.
2. Convert smoke tests to TypeScript after shared/server migration.
3. Add unit tests for:
   - Validation helpers.
   - Board display helpers.
   - Match status derivation.
   - Control state derivation.
4. Add a lightweight browser test later if needed for:
   - Loading a solo puzzle.
   - Cycling and clearing cells.
   - Opening and closing the modal.
   - Hosting and joining a match.
5. Manually verify desktop and mobile layouts after the React UI is in place.
6. Verify production build locally with the Node server, not only Vite dev mode.

## Behavior Regression Testing

Use this checklist during and after the migration to confirm the app still behaves like the current version.

### Automated Checks

1. Run the existing puzzle smoke test before and after shared logic conversion.
2. Run the multiplayer smoke test before and after server conversion.
3. Add tests for pure client helpers before moving UI into React:
   - Board lock state derivation.
   - Board overlay message derivation.
   - Battle strip title, delta, counts, and room-code visibility.
   - Button enabled, disabled, and hidden states for solo, host, guest, countdown, active, and finished states.
4. Add component tests or browser tests for the critical UI flows once React components exist.

### Solo Game Manual Checks

1. App loads a puzzle automatically on first visit.
2. `New puzzle` loads a different playable board in solo mode.
3. `Reset` restores the current puzzle to its givens.
4. Clicking an editable cell cycles through valid values and then clears.
5. Right click clears an editable cell.
6. Long press clears a filled editable cell on touch/pointer devices.
7. Number keys set the selected cell value.
8. `Backspace`, `Delete`, and `0` clear the selected cell.
9. Given cells cannot be edited.
10. Invalid conflicts are highlighted.
11. Completed regions are highlighted.
12. Solving the puzzle shows the same solved status behavior as before.

### Multiplayer Manual Checks

1. Host can create a room and the options modal closes automatically.
2. Host sees the room code in the locked board overlay while waiting.
3. Guest can join by code and the options modal closes automatically.
4. Host and guest receive the same puzzle.
5. Countdown lasts 5 seconds and keeps both boards locked.
6. Board unlocks for both players when the race becomes active.
7. During an active race, the room code appears inline in the battle strip header.
8. Local progress updates when conflict-free cells are filled.
9. Opponent progress updates over SSE and triggers the gain animation.
10. Conflicted local cells do not count toward race progress.
11. First solved board wins and locks both players.
12. Host can start the next race in the same room with a fresh puzzle.
13. Guest receives the rematch puzzle and returns to countdown automatically.
14. Guest can leave and host returns to waiting state.
15. Host can close the room and guest returns to solo mode.
16. Stale room-code displays clear after leaving or closing a room.

### LAN Discovery Checks

1. Hosted waiting rooms appear in `Hosted games on your network` when LAN discovery is enabled.
2. Hosted games are hidden when `CLOUD_MODE=true` or LAN discovery is disabled.
3. Joining a discovered game on the same origin joins directly.
4. Joining a discovered game on another origin redirects with `?join=CODE`.

### Visual And Responsive Checks

1. Desktop layout matches the current board panel, modal, battle strip, and overlay spacing.
2. Mobile layout does not require pinch-zoom and does not overflow horizontally.
3. The hamburger button does not overlap the battle strip, board, or locked overlay text.
4. Locked board overlay room code and title remain centered and readable.
5. Battle strip meters and labels remain readable on narrow screens.
6. Dialog open, close, backdrop click, and close button behavior match the current app.

### Production Checks

1. `npm run build` completes successfully.
2. `npm start` serves the built React app through the Node server.
3. A hard refresh on `/` loads the app without Vite dev server involvement.
4. API routes still return JSON and are not intercepted by static asset serving.
5. SSE connections stay open and reconnect behavior remains acceptable after production build.

## Phase 11: Cleanup

1. Remove old `public/app.js` after React replacement is complete.
2. Remove obsolete static HTML sections once React owns them.
3. Remove any compatibility glue that is only needed during migration.
4. Keep `public/style.css` or move it to `src/client/style.css` once Vite owns all frontend assets.
5. Update `AGENTS.md` or project notes with the new architecture.
6. Update README or deployment notes if one is added later.

## Suggested Target Structure

```text
src/
  client/
    App.tsx
    main.tsx
    api.ts
    board.ts
    status.ts
    matchEvents.ts
    components/
      BattleStrip.tsx
      Board.tsx
      BoardLockedOverlay.tsx
      BoardPanel.tsx
      Cell.tsx
      HostedGamesList.tsx
      MultiplayerControls.tsx
      OptionsModal.tsx
    style.css
  server/
    server.ts
  shared/
    api.ts
    puzzle.ts
    validate.ts
scripts/
  smoke-test.ts
  multiplayer-smoke-test.ts
public/
  favicon or static-only assets
```

## Acceptance Criteria

- The app looks the same on desktop and mobile.
- Solo puzzle creation, reset, validation, conflicts, completed regions, and solved state behave the same.
- Multiplayer host, join, leave, close, rematch, countdown, progress, finish, and SSE reconnect behavior remain intact.
- LAN hosted game discovery still works outside cloud mode.
- Existing smoke tests pass.
- TypeScript check passes.
- Production build runs through the existing Node server.
- Render deployment builds before starting the server.
- The large imperative client file is replaced by typed, focused modules and React components.
