# Tectonic – Agent Progress Log

This file tracks UI/UX work and significant changes made to the project.

---

## Project Overview

**Tectonic** is a browser-based number puzzle game (similar to a Kakuro/Suguru variant).
Players fill regions with numbers 1–N (where N is the region size) such that identical
numbers never touch, even diagonally.

The stack is intentionally minimal:
- **Frontend**: Vanilla JS (`public/app.js`), plain CSS (`public/style.css`), single HTML file (`public/index.html`)
- **Backend**: Node.js HTTP server (`server.js`) with Socket-like SSE for multiplayer
- **Shared logic**: `src/shared/puzzle.js` (generation) and `src/shared/validate.js` (validation)

---

## Change History

### Mobile-friendly UI pass (PR #1 – `codex/make-ui-mobile-friendly`)

**Goal**: Make the game playable on mobile screens without pinch-zoom or layout overflow.

Changes:
- Added `viewport` meta tag and `touch-action: manipulation` on interactive elements to prevent double-tap zoom.
- Constrained `--board-max-width` with `min(94vw, 56dvh)` on small screens so the board always fits the viewport.
- Reduced padding, gap, and font sizes under a `max-width: 860px` media query.
- Prevented unintended zoom on board cell taps by scoping `touchstart` zoom prevention to the board element only.

---

### Controls moved to modal menu (commit `406a95d`)

**Goal**: Free up vertical space on mobile by removing the always-visible puzzle controls header.

Changes:
- Moved "New puzzle", "Reset", multiplayer controls, and room code display into a `<dialog>` options modal triggered by a hamburger button (`☰`).
- The board panel is now the primary visible element; controls are accessed on demand.
- Added a `board-room-code` card directly on the board panel so the active room code remains visible without opening the modal.
- Added `battle-strip` progress meters (you vs. opponent fill percentage) always visible below the controls.

---

### Locked board overlay + room code size reduction (current session)

**Goal**: Further compress the vertical layout by removing the standalone locked-state message card and instead overlaying the message on the board itself.

Changes:

#### `public/index.html`
- Wrapped `#board` in a new `.board-wrapper` div.
- Added `#board-locked-overlay` (with `#board-locked-overlay-title`) as an absolutely-positioned sibling inside `.board-wrapper`. This overlay is shown only when the board is in a `locked` tone state (loading, waiting, countdown, finished).

#### `public/app.js`
- Added DOM references for `#board-locked-overlay` and `#board-locked-overlay-title`.
- Updated `updateBoardPresentation()`: when `tone === 'locked'`, hide the `#board-message` card (`hidden = true`) and show the overlay with the title text. For all other tones (info, warning, success), the board-message card is shown normally and the overlay is hidden.

#### `public/style.css`
- Added `.board-wrapper` — a `position: relative` grid container sized to `--board-max-width`, wrapping the board.
- Added `.board-locked-overlay` — absolutely positioned overlay (inset 0) with a semi-transparent frosted background (`rgba(238,242,246,0.82)` + `backdrop-filter: blur(2px)`), centered text, `z-index: 2`.
- Added `.board-locked-overlay-title` — styled to match the locked tone title color and a compact font size.
- Reduced `.board-room-code-value` font size:
  - Desktop: `clamp(1.75rem, 5vw, 2.7rem)` → `clamp(1.4rem, 4vw, 2.1rem)`
  - Mobile: `clamp(1.3rem, 6.8vw, 1.8rem)` → `clamp(1.1rem, 5.5vw, 1.5rem)`

---

### Room code merged into overlay + battle strip (current session)

**Goal**: Eliminate the standalone room-code card. Surface the code on the locked-board overlay in big lettering while the board is locked, and inline in the battle-strip header (small font) once the race is active. Also fix a bug where the "Host room code" UI would not reset when the host closed the race.

Changes:

#### `public/index.html`
- Removed the `<section id="board-room-code">` card entirely.
- Extended `#board-locked-overlay` with a new `#board-locked-overlay-room-code` block containing `#board-locked-overlay-label` (e.g. "Host room code") and `#board-locked-overlay-code` (the big value). The locked title now sits beneath the code.
- Wrapped `#battle-title` in a new `.battle-title-group` flex row and added `<span id="battle-room-code">` (hidden by default) next to it.

#### `public/style.css`
- Removed all `.board-room-code*` rules (desktop + mobile media query).
- Updated `.board-locked-overlay` to use `place-content: center; justify-items: center; gap: 0.6rem;` so the room-code block and title stack neatly.
- Added `.board-locked-overlay-label` (small uppercase tracked text, using `--room-code-title`) and `.board-locked-overlay-code` (big tracked numerals matching the old `.board-room-code-value` size: `clamp(1.6rem, 6vmin, 2.6rem)` desktop / `clamp(1.3rem, 8vw, 2rem)` mobile).
- Added `.battle-title-group` (flex, baseline-aligned, wrap) and `.battle-room-code` (small 0.78rem uppercase tracked, with a `·` separator via `::before`).

#### `public/app.js`
- Dropped DOM refs for the removed `boardRoomCode*` elements.
- Added refs for `#board-locked-overlay-room-code`, `#board-locked-overlay-label`, `#board-locked-overlay-code`, and `#battle-room-code`.
- Added a `resetRoomCodeDisplays()` helper that clears both the overlay code block and the inline battle-strip code.
- Simplified `updateMatchStatus()` to delegate room-code UI to the other updaters and to call `resetRoomCodeDisplays()` in the no-match branch.
- Extended `updateBoardPresentation()` to populate the overlay room code (with `data-role="host"|"guest"`) whenever the board is locked AND a match session exists.
- Extended `updateBattleStrip()` to show the inline code only when `matchSession.match.status === 'active'` (to avoid duplicating the overlay's big code during locked phases), and to clear it in the no-match branch.
- Patched `resetToSoloMode()` to call `resetRoomCodeDisplays()` + `updateBattleStrip()` immediately after nulling `matchSession`, fixing the bug where the Host room code persisted on screen after "Close race".

---

### Standalone board message removed (current session)

**Goal**: Eliminate the remaining text-only status card above the board and rely on the locked-board overlay plus the battle strip instead.

Changes:

#### `public/index.html`
- Removed the standalone `#board-message` element from the board panel entirely.

#### `public/app.js`
- Dropped DOM refs for `#board-message`, `#board-message-title`, and `#board-message-detail`.
- Simplified `updateBoardPresentation()` so it only manages the locked board styling, overlay title, and overlay room-code content.
- Kept `getBoardMessage()` as the source of locked overlay titles, but non-locked board states no longer render a separate message card.

#### `public/style.css`
- Removed all `.board-message*` rules and the corresponding mobile overrides.
- Removed the now-unused non-locked `--board-message-*` theme tokens and old room-code card color tokens from `:root`.
- Left the battle strip styles intact as the persistent multiplayer status surface.

---

### Persistent room rematch + menu overlap fix (current session)

**Goal**: Let the host start another multiplayer game in the same room after a race finishes, instead of forcing the room to end. Also stop the hamburger menu button from overlapping the board area.

Changes:

#### `public/index.html`
- Added a new hidden-by-default `#next-race` button to the multiplayer session controls in the options modal.

#### `public/app.js`
- Added a DOM ref and click handler for `#next-race`.
- Changed multiplayer controls so any active match session keeps solo/host/join controls locked; finished matches are no longer treated as disposable from the client.
- Added `startNextRace()` for the host, calling a new `/api/matches/:id/rematch` endpoint.
- Extended match event handling with `handleMatchReset()` and updated `handleMatchState()` to accept an optional puzzle payload.
- Added puzzle-revision-aware client syncing so reconnecting clients can detect a rematch and load the fresh puzzle when the room state changes.
- Updated finished-state modal copy so hosts are prompted to start the next race or close the room, while guests are told to wait for the host.

#### `server.js`
- Added `puzzleRevision` to match state.
- Added `assignPuzzleToMatch()` and `resetMatchForRematch()` helpers to generate and install a fresh puzzle while keeping the same room alive.
- Added a host-only `POST /api/matches/:roomCode/rematch` endpoint.
- Reused `startCountdown()` for both join and rematch flows.
- Updated the initial SSE `match_state` event to include the current puzzle so reconnecting clients can resync after a rematch.
- Broadcasts `match_reset` with the new puzzle + updated match state whenever the host starts the next race.

#### `public/style.css`
- Increased `.board-panel` top padding on desktop and mobile so the absolutely positioned hamburger menu no longer covers the battle strip, board, or locked overlay text.

---

## Current State

- The board panel is compact on mobile: hamburger menu → options modal for controls, always-visible battle strip.
- Locked states (loading, waiting for opponent, countdown, game over) overlay the board directly. When a match session is active, the overlay also surfaces the room code prominently (big lettering) above the locked title.
- Once the race is active (board unlocked), the room code is shown inline next to the "Head-to-head race" title in the battle-strip header, in small tracked font.
- When a multiplayer race finishes, the host can start the next race in the same room with a fresh puzzle and the same room code; connected guests are carried into the new countdown automatically.
- Closing a hosted race or leaving as a guest immediately clears both room-code surfaces; the modal returns to "Solo mode".
- There is no standalone text-status box above the board anymore; locked messaging lives on the board overlay, and multiplayer progress/status lives in the battle strip.

---

## Known Considerations / Potential Next Steps

- The overlay currently shows only the locked `title` text (plus room code). The former `detail` text is no longer surfaced in the board area.
- When the local player wins a race (`tone === 'success'`), the overlay is hidden and the inline code is also hidden (since `status === 'finished'`). The race code is still visible in the options modal. If surfacing it inline post-victory is desired, extend the `showInlineRoomCode` check in `updateBattleStrip()`.
- The room rematch flow currently relies on the host to start the next race; guests do not explicitly confirm rematches.
- Consider animating the overlay fade-in/out to match the existing `160ms ease` transition style used elsewhere.
- The battle strip is always visible during a multiplayer match; consider hiding it during countdown/waiting when there is no meaningful progress to display.
