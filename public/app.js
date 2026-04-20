import { getRegionSizes, validateBoard } from '/shared/validate.js';

const boardElement = document.querySelector('#board');
const boardPanelElement = document.querySelector('.board-panel');
const openMenuButton = document.querySelector('#open-menu');
const closeMenuButton = document.querySelector('#close-menu');
const optionsModalElement = document.querySelector('#options-modal');
const boardRoomCodeElement = document.querySelector('#board-room-code');
const boardRoomCodeLabelElement = document.querySelector('#board-room-code-label');
const boardRoomCodeValueElement = document.querySelector('#board-room-code-value');
const boardRoomCodeDetailElement = document.querySelector('#board-room-code-detail');
const boardMessageElement = document.querySelector('#board-message');
const boardMessageTitleElement = document.querySelector('#board-message-title');
const boardMessageDetailElement = document.querySelector('#board-message-detail');
const battleStripElement = document.querySelector('#battle-strip');
const battleTitleElement = document.querySelector('#battle-title');
const battleDeltaElement = document.querySelector('#battle-delta');
const battleYouCountElement = document.querySelector('#battle-you-count');
const battleOpponentCountElement = document.querySelector('#battle-opponent-count');
const battleYouFillElement = document.querySelector('#battle-you-fill');
const battleOpponentFillElement = document.querySelector('#battle-opponent-fill');
const battleOpponentLaneElement = document.querySelector('.battle-lane-opponent');
const statusElement = document.querySelector('#status');
const newGameButton = document.querySelector('#new-game');
const resetButton = document.querySelector('#reset-game');
const hostRaceButton = document.querySelector('#host-race');
const joinRaceButton = document.querySelector('#join-race');
const leaveRaceButton = document.querySelector('#leave-race');
const closeRaceButton = document.querySelector('#close-race');
const joinCodeInput = document.querySelector('#join-code');
const hostedGamesListElement = document.querySelector('#hosted-games-list');
const roomCodeElement = document.querySelector('#room-code');
const matchStatusElement = document.querySelector('#match-status');

let puzzle = null;
let values = [];
let selectedIndex = null;
let isLoadingPuzzle = false;
let matchSession = null;
let eventSource = null;
let isSubmittingFinish = false;
let progressUpdateTimeoutId = null;
let lastReportedFilledCount = null;
let countdownRefreshTimeoutId = null;
let discoveryPollTimeoutId = null;
let discoveredMatches = [];
let opponentGainAnimationTimeoutId = null;
let renderFrameRequested = false;
let lanDiscoveryEnabled = true;
const LONG_PRESS_DURATION_MS = 420;

function isMultiplayerMode() {
  return matchSession !== null;
}

function canReplaceFinishedMatch() {
  return matchSession !== null && matchSession.match.status === 'finished';
}

function leaveFinishedMatch() {
  if (!canReplaceFinishedMatch()) {
    return;
  }

  closeEventSource();
  clearCountdownRefresh();
  matchSession = null;
  isSubmittingFinish = false;
  lastReportedFilledCount = null;
}

function getEditableBoardState() {
  return !isLoadingPuzzle && (!matchSession || matchSession.match.status === 'active');
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function scheduleRender() {
  if (renderFrameRequested) {
    return;
  }

  renderFrameRequested = true;
  window.requestAnimationFrame(() => {
    renderFrameRequested = false;
    renderBoard();
  });
}

function resetToSoloMode(message, keepCurrentBoard = false) {
  closeEventSource();
  clearCountdownRefresh();
  clearTimeout(progressUpdateTimeoutId);
  progressUpdateTimeoutId = null;
  matchSession = null;
  isSubmittingFinish = false;
  lastReportedFilledCount = keepCurrentBoard && puzzle ? getFilledCount() : null;
  roomCodeElement.textContent = 'Solo mode';
  matchStatusElement.textContent = message;

  if (keepCurrentBoard && puzzle) {
    renderBoard();
    return;
  }

  void loadPuzzle();
}

function clearCountdownRefresh() {
  if (countdownRefreshTimeoutId !== null) {
    clearTimeout(countdownRefreshTimeoutId);
    countdownRefreshTimeoutId = null;
  }
}

function scheduleCountdownRefresh() {
  clearCountdownRefresh();

  if (!matchSession || matchSession.match.status !== 'countdown' || !matchSession.match.startsAt) {
    return;
  }

  countdownRefreshTimeoutId = window.setTimeout(() => {
    renderBoard();
  }, 200);
}

function clearDiscoveryRefresh() {
  if (discoveryPollTimeoutId !== null) {
    clearTimeout(discoveryPollTimeoutId);
    discoveryPollTimeoutId = null;
  }
}

function renderDiscoveredMatches() {
  const hostedGamesSection = document.querySelector('.hosted-games');

  if (hostedGamesSection) {
    hostedGamesSection.hidden = !lanDiscoveryEnabled;
  }

  if (!lanDiscoveryEnabled) {
    hostedGamesListElement.innerHTML = '';
    return;
  }

  hostedGamesListElement.innerHTML = '';

  if (discoveredMatches.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'status hosted-games-empty';
    emptyState.textContent = 'No joinable hosted games found yet.';
    hostedGamesListElement.append(emptyState);
    return;
  }

  for (const match of discoveredMatches) {
    const card = document.createElement('article');
    card.className = 'hosted-game-card';

    const meta = document.createElement('div');
    meta.className = 'hosted-game-meta';

    const title = document.createElement('p');
    title.className = 'hosted-game-title';
    title.textContent = match.host || 'Room host';

    const code = document.createElement('span');
    code.className = 'hosted-game-code';
    code.textContent = `Code ${match.roomCode}`;

    meta.append(title, code);

    const detail = document.createElement('p');
    detail.className = 'hosted-game-detail';
    detail.textContent = `${match.hostAddress}:${match.port}`;

    const actions = document.createElement('div');
    actions.className = 'hosted-game-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Join';
    button.disabled = isLoadingPuzzle || (isMultiplayerMode() && !canReplaceFinishedMatch());
    button.addEventListener('click', () => {
      void joinDiscoveredMatch(match);
    });

    actions.append(button);
    card.append(meta, detail, actions);
    hostedGamesListElement.append(card);
  }
}

async function refreshDiscoveredMatches() {
  try {
    const response = await fetch('/api/discovery/matches', { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('Could not load hosted games.');
    }

    const payload = await response.json();
    lanDiscoveryEnabled = payload.enabled !== false;
    discoveredMatches = payload.matches ?? [];
    renderDiscoveredMatches();
  } catch (error) {
    console.error(error);
  } finally {
    clearDiscoveryRefresh();

    if (lanDiscoveryEnabled) {
      discoveryPollTimeoutId = window.setTimeout(() => {
        void refreshDiscoveredMatches();
      }, 2000);
    }
  }
}

function updateControlStates() {
  const multiplayerLocked = isMultiplayerMode() && !canReplaceFinishedMatch();
  const boardLocked = !getEditableBoardState();
  const isGuest = matchSession?.role === 'guest';
  const isHost = matchSession?.role === 'host';

  newGameButton.disabled = isLoadingPuzzle || multiplayerLocked;
  resetButton.disabled =
    isLoadingPuzzle ||
    puzzle === null ||
    boardLocked ||
    (matchSession !== null && matchSession.match.status === 'finished');
  hostRaceButton.disabled = isLoadingPuzzle || multiplayerLocked;
  joinRaceButton.disabled = isLoadingPuzzle || multiplayerLocked || joinCodeInput.value.trim().length !== 4;
  joinCodeInput.disabled = isLoadingPuzzle || multiplayerLocked;
  leaveRaceButton.hidden = !isGuest;
  closeRaceButton.hidden = !isHost;
  leaveRaceButton.disabled = isLoadingPuzzle || !isGuest;
  closeRaceButton.disabled = isLoadingPuzzle || !isHost;
  renderDiscoveredMatches();
}

function getRegionPalette(regionCount) {
  return Array.from({ length: regionCount }, (_, index) => {
    const hue = Math.round((index * 360) / Math.max(regionCount, 1));
    return `hsl(${hue} 42% 87%)`;
  });
}

function getNeighborIndex(index, rowOffset, columnOffset) {
  const row = Math.floor(index / puzzle.width);
  const column = index % puzzle.width;
  const nextRow = row + rowOffset;
  const nextColumn = column + columnOffset;

  if (
    nextRow < 0 ||
    nextRow >= puzzle.height ||
    nextColumn < 0 ||
    nextColumn >= puzzle.width
  ) {
    return null;
  }

  return nextRow * puzzle.width + nextColumn;
}

function getRegionBorderWidth(index, rowOffset, columnOffset) {
  const neighborIndex = getNeighborIndex(index, rowOffset, columnOffset);

  if (neighborIndex === null) {
    return 3;
  }

  return puzzle.regions[index] === puzzle.regions[neighborIndex] ? 1 : 3;
}

function getCellLabel(index, regionSizes) {
  const given = puzzle.givens[index];
  const value = values[index];
  const regionSize = regionSizes[puzzle.regions[index]];
  const displayValue = value ?? 'empty';
  const clue = given !== null ? ', given clue' : '';

  return `Cell ${index + 1}, region size ${regionSize}, value ${displayValue}${clue}`;
}

function getFilledCount() {
  return values.filter((value) => value !== null).length;
}

function getScoredFilledCount(result) {
  if (!puzzle) {
    return 0;
  }

  let filledCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && !result.conflicts.has(index)) {
      filledCount += 1;
    }
  }

  return filledCount;
}

function getLocalPlayerState() {
  if (!matchSession) {
    return null;
  }

  return matchSession.match.players.find((player) => player.role === matchSession.role) ?? null;
}

function getOpponentPlayerState() {
  if (!matchSession) {
    return null;
  }

  return matchSession.match.players.find((player) => player.role !== matchSession.role && player.joined) ?? null;
}

function triggerOpponentGainAnimation(gainAmount) {
  if (!battleOpponentLaneElement) {
    return;
  }

  clearTimeout(opponentGainAnimationTimeoutId);
  battleOpponentLaneElement.classList.remove('battle-lane-hit');
  void battleOpponentLaneElement.offsetWidth;

  const burstElement = document.querySelector('#battle-opponent-burst');

  if (burstElement) {
    burstElement.textContent = `+${gainAmount}`;
  }

  battleOpponentLaneElement.classList.add('battle-lane-hit');
  opponentGainAnimationTimeoutId = window.setTimeout(() => {
    battleOpponentLaneElement.classList.remove('battle-lane-hit');
  }, 700);
}

function updateMatchStatus() {
  if (!matchSession) {
    roomCodeElement.textContent = 'Solo mode';
    if (boardRoomCodeElement) {
      boardRoomCodeElement.hidden = true;
      delete boardRoomCodeElement.dataset.role;
    }
    matchStatusElement.textContent = lanDiscoveryEnabled
      ? 'Host a race or join one from another device on your local network.'
      : 'Host a race or join one by room code.';
    return;
  }

  roomCodeElement.textContent = `Race code: ${matchSession.match.roomCode}`;

  if (boardRoomCodeElement && boardRoomCodeLabelElement && boardRoomCodeValueElement && boardRoomCodeDetailElement) {
    const isHost = matchSession.role === 'host';
    let detail = 'You are connected to this race room.';

    if (isHost && matchSession.match.status === 'waiting') {
      detail = 'Share this code with another player to unlock the board and start the race.';
    } else if (isHost && matchSession.match.status === 'countdown') {
      detail = 'Both players are connected. The race begins when the countdown ends.';
    } else if (isHost && matchSession.match.status === 'finished') {
      detail = 'This room stays tied to the finished race until you close it.';
    } else if (isHost) {
      detail = 'Keep this code handy if another player needs to reconnect to your race.';
    } else if (matchSession.match.status === 'waiting') {
      detail = 'You are connected and waiting for the host to begin the race.';
    } else if (matchSession.match.status === 'countdown') {
      detail = 'You are locked in. The race starts as soon as the countdown ends.';
    }

    boardRoomCodeElement.hidden = false;
    boardRoomCodeElement.dataset.role = isHost ? 'host' : 'guest';
    boardRoomCodeLabelElement.textContent = isHost ? 'Host room code' : 'Race room code';
    boardRoomCodeValueElement.textContent = matchSession.match.roomCode;
    boardRoomCodeDetailElement.textContent = detail;
  }

  if (matchSession.match.status === 'waiting') {
    matchStatusElement.textContent = 'Waiting for another player to join. The board will unlock as soon as the second player joins the race.';
    return;
  }

  if (matchSession.match.status === 'countdown') {
    const remainingSeconds = Math.max(
      1,
      Math.ceil((matchSession.match.startsAt - Date.now()) / 1000),
    );
    matchStatusElement.textContent = `Race starts in ${remainingSeconds}… Get ready.`;
    return;
  }

  if (matchSession.match.status === 'finished') {
    matchStatusElement.textContent =
      matchSession.match.winnerPlayerId === matchSession.playerId
        ? 'You won the race. The match is over for both players.'
        : 'You lost the race. The other player finished first.';
    return;
  }

  matchStatusElement.textContent = 'Race in progress. The battle strip shows live progress.';
}

function getBoardMessage(result) {
  if (isLoadingPuzzle) {
    return {
      tone: 'locked',
      title: 'Loading puzzle…',
      detail: 'The board is temporarily locked while the next puzzle state is prepared.',
    };
  }

  if (!puzzle) {
    return {
      tone: 'info',
      title: 'Preparing the board',
      detail: statusElement.textContent,
    };
  }

  if (matchSession?.match.status === 'waiting') {
    return {
      tone: 'locked',
      title: 'Board locked while the race fills',
      detail: 'Waiting for another player to join. The board unlocks as soon as both players are connected.',
    };
  }

  if (matchSession?.match.status === 'countdown') {
    const remainingSeconds = Math.max(1, Math.ceil((matchSession.match.startsAt - Date.now()) / 1000));

    return {
      tone: 'locked',
      title: `Race starts in ${remainingSeconds}…`,
      detail: 'The board stays locked during the countdown so both players begin at the same time.',
    };
  }

  if (matchSession?.match.status === 'finished') {
    const playerWon = matchSession.match.winnerPlayerId === matchSession.playerId;

    return {
      tone: playerWon ? 'success' : 'locked',
      title: playerWon ? 'You won the race' : 'Race finished',
      detail: playerWon
        ? 'You finished first. The board is now locked for both players.'
        : 'The other player finished first. The board is now locked for both players.',
    };
  }

  if (result?.solved) {
    return {
      tone: 'success',
      title: 'Puzzle solved',
      detail: 'Every region is complete and no matching numbers touch.',
    };
  }

  if (result && result.conflicts.size > 0) {
    return {
      tone: 'warning',
      title: 'Fix the highlighted conflict',
      detail: 'Matching numbers may not touch, even diagonally.',
    };
  }

  if (matchSession?.match.status === 'active') {
    return {
      tone: 'info',
      title: 'Keep the board clean',
      detail: 'Every conflict-free placement pushes your battle bar forward.',
    };
  }

  return {
    tone: 'info',
    title: 'Puzzle in progress',
    detail: `${getFilledCount()}/${values.length} cells filled.`,
  };
}

function updateBoardPresentation(result = null) {
  const boardLocked = !getEditableBoardState();
  const { tone, title, detail } = getBoardMessage(result);

  boardPanelElement.classList.toggle('locked', boardLocked);
  boardElement.classList.toggle('locked', boardLocked);
  boardMessageElement.dataset.tone = tone;
  boardMessageTitleElement.textContent = title;
  boardMessageDetailElement.textContent = detail;
}

function updateBattleStrip() {
  if (!battleStripElement) {
    return;
  }

  const multiplayerActive = Boolean(matchSession);
  battleStripElement.hidden = !multiplayerActive;

  if (!multiplayerActive) {
    return;
  }

  const totalCells = values.length || puzzle?.givens?.length || 0;
  const result = puzzle ? validateBoard(puzzle, values) : null;
  const localCount = result ? getScoredFilledCount(result) : 0;
  const opponent = getOpponentPlayerState();
  const opponentCount = opponent?.filledCount ?? 0;
  const localPercent = totalCells > 0 ? (localCount / totalCells) * 100 : 0;
  const opponentPercent = totalCells > 0 ? (opponentCount / totalCells) * 100 : 0;
  const delta = localCount - opponentCount;

  battleTitleElement.textContent = matchSession.match.status === 'finished' ? 'Battle result' : 'Head-to-head race';
  battleYouCountElement.textContent = `${localCount}/${totalCells}`;
  battleOpponentCountElement.textContent = `${opponentCount}/${totalCells}`;
  battleYouFillElement.style.width = `${localPercent}%`;
  battleOpponentFillElement.style.width = `${opponentPercent}%`;

  if (matchSession.match.status === 'waiting') {
    battleDeltaElement.textContent = 'Waiting for challenger';
    return;
  }

  if (matchSession.match.status === 'countdown') {
    battleDeltaElement.textContent = 'Both players locked in';
    return;
  }

  if (matchSession.match.status === 'finished') {
    battleDeltaElement.textContent =
      matchSession.match.winnerPlayerId === matchSession.playerId ? 'Victory' : 'Defeat';
    return;
  }

  if (!opponent?.joined) {
    battleDeltaElement.textContent = 'Awaiting opponent';
    return;
  }

  if (delta > 0) {
    battleDeltaElement.textContent = `Ahead by ${delta}`;
  } else if (delta < 0) {
    battleDeltaElement.textContent = `Behind by ${Math.abs(delta)}`;
  } else {
    battleDeltaElement.textContent = 'Dead even';
  }
}

function updateStatus(result) {
  if (result.solved) {
    statusElement.textContent = 'Solved. Every region is complete and no matching numbers touch.';
    return;
  }

  if (result.conflicts.size > 0) {
    statusElement.textContent = matchSession?.match.status === 'active'
      ? 'There is a rule conflict on the board. Conflicted cells do not count toward your race score.'
      : 'There is a rule conflict on the board.';
    return;
  }

  if (matchSession?.match.status === 'active') {
    statusElement.textContent = 'Your board is clear. Keep going.';
    return;
  }

  statusElement.textContent = `Puzzle in progress: ${getFilledCount()}/${values.length} cells filled.`;
}

async function postJson(url, payload) {
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

  return response.json();
}

function scheduleProgressUpdate(result) {
  if (!matchSession || matchSession.match.status !== 'active') {
    return;
  }

  const filledCount = getScoredFilledCount(result);

  if (lastReportedFilledCount === filledCount) {
    return;
  }

  clearTimeout(progressUpdateTimeoutId);
  progressUpdateTimeoutId = window.setTimeout(async () => {
    try {
      await postJson(`/api/matches/${matchSession.matchId}/progress`, {
        playerId: matchSession.playerId,
        filledCount,
      });
      lastReportedFilledCount = filledCount;
    } catch (error) {
      console.error(error);
    }
  }, 80);
}

async function submitFinish() {
  if (!matchSession || matchSession.match.status !== 'active' || isSubmittingFinish) {
    return;
  }

  isSubmittingFinish = true;

  try {
    await postJson(`/api/matches/${matchSession.matchId}/finish`, {
      playerId: matchSession.playerId,
      values,
    });
  } catch (error) {
    console.error(error);
  } finally {
    isSubmittingFinish = false;
  }
}

function renderBoard() {
  renderFrameRequested = false;
  updateControlStates();

  if (!puzzle) {
    boardElement.innerHTML = '';
    updateMatchStatus();
    updateBoardPresentation();
    return;
  }

  const result = validateBoard(puzzle, values);
  const regionSizes = getRegionSizes(puzzle);
  const regionCount = Math.max(...puzzle.regions) + 1;
  const regionPalette = getRegionPalette(regionCount);
  const boardLocked = !getEditableBoardState();

  boardElement.innerHTML = '';
  boardElement.style.gridTemplateColumns = `repeat(${puzzle.width}, minmax(0, 1fr))`;

  for (let index = 0; index < values.length; index += 1) {
    const cell = document.createElement('button');
    const row = Math.floor(index / puzzle.width);
    const column = index % puzzle.width;
    const value = values[index];
    const given = puzzle.givens[index];
    const regionId = puzzle.regions[index];
    const isSelected = selectedIndex === index;
    const canEdit = !given && !boardLocked;

    cell.type = 'button';
    cell.className = 'cell';
    cell.textContent = value ?? '';
    cell.disabled = !canEdit;
    cell.ariaLabel = getCellLabel(index, regionSizes);
    cell.style.setProperty('--region-color', regionPalette[regionId]);
    cell.style.borderTopWidth = `${getRegionBorderWidth(index, -1, 0)}px`;
    cell.style.borderBottomWidth = `${getRegionBorderWidth(index, 1, 0)}px`;
    cell.style.borderLeftWidth = `${getRegionBorderWidth(index, 0, -1)}px`;
    cell.style.borderRightWidth = `${getRegionBorderWidth(index, 0, 1)}px`;

    if (column === 0) {
      cell.style.borderLeftWidth = '3px';
    }

    if (column === puzzle.width - 1) {
      cell.style.borderRightWidth = '3px';
    }

    if (row === 0) {
      cell.style.borderTopWidth = '3px';
    }

    if (row === puzzle.height - 1) {
      cell.style.borderBottomWidth = '3px';
    }

    if (given !== null) {
      cell.classList.add('given');
    }

    if (result.conflicts.has(index)) {
      cell.classList.add('invalid');
    }

    if (result.completedRegions.has(regionId)) {
      cell.classList.add('region-complete');
    }

    if (isSelected) {
      cell.classList.add('selected');
    }

    if (boardLocked && given === null) {
      cell.classList.add('locked');
    }

    let longPressTimeoutId = null;
    let suppressClick = false;

    const clearLongPressTimeout = () => {
      if (longPressTimeoutId !== null) {
        clearTimeout(longPressTimeoutId);
        longPressTimeoutId = null;
      }
    };

    cell.addEventListener('pointerdown', (event) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      suppressClick = false;
      clearLongPressTimeout();
      longPressTimeoutId = window.setTimeout(() => {
        longPressTimeoutId = null;

        if (!canEdit || values[index] === null) {
          return;
        }

        selectedIndex = index;
        setSelectedCellValue(null);
        suppressClick = true;
      }, LONG_PRESS_DURATION_MS);
    });

    cell.addEventListener('pointerup', clearLongPressTimeout);
    cell.addEventListener('pointercancel', clearLongPressTimeout);
    cell.addEventListener('pointerleave', clearLongPressTimeout);

    cell.addEventListener('click', (event) => {
      if (!canEdit) {
        return;
      }

      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        return;
      }

      selectedIndex = index;
      cycleCellValue(index);
    });

    cell.addEventListener('contextmenu', (event) => {
      if (!canEdit) {
        return;
      }

      event.preventDefault();
      selectedIndex = index;
      setSelectedCellValue(null);
    });

    boardElement.append(cell);
  }

  updateStatus(result);
  updateMatchStatus();
  updateBoardPresentation(result);
  updateBattleStrip();
  scheduleCountdownRefresh();

  if (matchSession && matchSession.match.status === 'active') {
    scheduleProgressUpdate(result);

    if (result.solved) {
      void submitFinish();
    }
  }
}

function cycleCellValue(index) {
  const regionSizes = getRegionSizes(puzzle);
  const maxValue = regionSizes[puzzle.regions[index]];
  const currentValue = values[index] ?? 0;
  const nextValue = currentValue >= maxValue ? null : currentValue + 1;

  values[index] = nextValue;
  scheduleRender();
}

function setSelectedCellValue(value) {
  if (selectedIndex === null || puzzle.givens[selectedIndex] !== null || !getEditableBoardState()) {
    return;
  }

  const regionSizes = getRegionSizes(puzzle);
  const maxValue = regionSizes[puzzle.regions[selectedIndex]];

  if (value === null) {
    values[selectedIndex] = null;
    scheduleRender();
    return;
  }

  if (value >= 1 && value <= maxValue) {
    values[selectedIndex] = value;
    scheduleRender();
  }
}

function applyPuzzle(nextPuzzle) {
  puzzle = nextPuzzle;
  values = [...puzzle.givens];
  selectedIndex = null;
  lastReportedFilledCount = getFilledCount();
  renderBoard();
}

function handleMatchState(match) {
  if (!matchSession) {
    return;
  }

  const previousStatus = matchSession.match.status;
  const previousOpponentCount = getOpponentPlayerState()?.filledCount ?? 0;
  matchSession.match = match;
  const nextOpponentCount = getOpponentPlayerState()?.filledCount ?? 0;

  if (matchSession.role === 'host' && previousStatus !== 'waiting' && match.status === 'waiting' && puzzle) {
    values = [...puzzle.givens];
    selectedIndex = null;
    lastReportedFilledCount = getFilledCount();
  }

  if (match.status === 'active' && nextOpponentCount > previousOpponentCount) {
    triggerOpponentGainAnimation(nextOpponentCount - previousOpponentCount);
  }

  renderBoard();
}

function openMatchEventStream() {
  closeEventSource();
  eventSource = new EventSource(
    `/api/matches/${matchSession.matchId}/events?playerId=${encodeURIComponent(matchSession.playerId)}`,
  );

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (payload.type === 'match_state') {
        handleMatchState(payload.match);
        return;
      }

      if (payload.type === 'match_closed') {
        resetToSoloMode('Host closed the race. Continuing in solo mode.', true);
      }
    } catch (error) {
      console.error(error);
    }
  };

  eventSource.onerror = () => {
    matchStatusElement.textContent = 'Connection to the race was interrupted. Trying to reconnect…';
  };
}

async function loadPuzzle() {
  if (isLoadingPuzzle) {
    return;
  }

  leaveFinishedMatch();

  if (isMultiplayerMode()) {
    return;
  }

  isLoadingPuzzle = true;
  selectedIndex = null;
  document.activeElement?.blur?.();
  updateControlStates();
  statusElement.textContent = 'Loading puzzle…';
  updateBoardPresentation();

  try {
    const response = await fetch('/api/puzzle', { cache: 'no-store' });

    if (!response.ok) {
      throw new Error('Could not load a puzzle.');
    }

    applyPuzzle(await response.json());
  } catch (error) {
    console.error(error);
    statusElement.textContent = 'Failed to load the puzzle.';
    updateBoardPresentation();
  } finally {
    isLoadingPuzzle = false;
    updateControlStates();

    if (puzzle) {
      renderBoard();
    } else {
      updateBoardPresentation();
    }
  }
}

async function hostRace() {
  if (isLoadingPuzzle) {
    return;
  }

  leaveFinishedMatch();

  if (isMultiplayerMode()) {
    return;
  }

  isLoadingPuzzle = true;
  updateControlStates();
  matchStatusElement.textContent = 'Creating race…';
  updateBoardPresentation(puzzle ? validateBoard(puzzle, values) : null);

  try {
    const payload = await postJson('/api/matches', {});
    matchSession = {
      matchId: payload.matchId,
      playerId: payload.playerId,
      role: payload.role,
      match: payload.match,
    };
    applyPuzzle(payload.puzzle);
    openMatchEventStream();
  } catch (error) {
    console.error(error);
    matchStatusElement.textContent = 'Failed to create a race.';
  } finally {
    isLoadingPuzzle = false;
    updateControlStates();

    if (puzzle) {
      renderBoard();
    } else {
      updateBoardPresentation();
    }
  }
}

async function joinRaceByCode(roomCode) {
  const normalizedRoomCode = roomCode.trim().toUpperCase();

  if (normalizedRoomCode.length !== 4 || isLoadingPuzzle) {
    return;
  }

  leaveFinishedMatch();

  if (isMultiplayerMode()) {
    return;
  }

  isLoadingPuzzle = true;
  updateControlStates();
  renderDiscoveredMatches();
  matchStatusElement.textContent = `Joining race ${normalizedRoomCode}…`;
  updateBoardPresentation(puzzle ? validateBoard(puzzle, values) : null);

  try {
    const payload = await postJson(`/api/matches/${normalizedRoomCode}/join`, {});
    matchSession = {
      matchId: payload.matchId,
      playerId: payload.playerId,
      role: payload.role,
      match: payload.match,
    };
    joinCodeInput.value = '';
    applyPuzzle(payload.puzzle);
    openMatchEventStream();
  } catch (error) {
    console.error(error);
    matchStatusElement.textContent = 'Failed to join that race.';
  } finally {
    isLoadingPuzzle = false;
    updateControlStates();
    renderDiscoveredMatches();

    if (puzzle) {
      renderBoard();
    } else {
      updateBoardPresentation();
    }
  }
}

async function joinRace() {
  await joinRaceByCode(joinCodeInput.value);
}

async function joinDiscoveredMatch(match) {
  const targetUrl = new URL(window.location.href);
  targetUrl.searchParams.set('join', match.roomCode);

  if (match.origin !== window.location.origin) {
    window.location.href = `${match.origin}/?join=${encodeURIComponent(match.roomCode)}`;
    return;
  }

  joinCodeInput.value = match.roomCode;
  await joinRaceByCode(match.roomCode);
}

async function leaveRace() {
  if (!matchSession || matchSession.role !== 'guest' || isLoadingPuzzle) {
    return;
  }

  isLoadingPuzzle = true;
  updateControlStates();

  try {
    await postJson(`/api/matches/${matchSession.matchId}/leave`, {
      playerId: matchSession.playerId,
    });
    resetToSoloMode('You left the race. Continuing in solo mode.', true);
  } catch (error) {
    console.error(error);
    matchStatusElement.textContent = 'Failed to leave the race.';
  } finally {
    isLoadingPuzzle = false;
    updateControlStates();
  }
}

async function closeHostedRace() {
  if (!matchSession || matchSession.role !== 'host' || isLoadingPuzzle) {
    return;
  }

  isLoadingPuzzle = true;
  updateControlStates();

  try {
    await postJson(`/api/matches/${matchSession.matchId}/close`, {
      playerId: matchSession.playerId,
    });
    isLoadingPuzzle = false;
    resetToSoloMode('Race closed. Continuing in solo mode.', false);
  } catch (error) {
    console.error(error);
    matchStatusElement.textContent = 'Failed to close the race.';
  } finally {
    isLoadingPuzzle = false;
    updateControlStates();
  }
}

document.addEventListener('keydown', (event) => {
  if (!puzzle || !getEditableBoardState()) {
    return;
  }

  if (event.key >= '1' && event.key <= '9') {
    setSelectedCellValue(Number(event.key));
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    setSelectedCellValue(null);
  }
});

boardElement.addEventListener('dblclick', (event) => {
  event.preventDefault();
});

if (openMenuButton && optionsModalElement) {
  openMenuButton.addEventListener('click', () => {
    optionsModalElement.showModal();
  });
}

if (closeMenuButton && optionsModalElement) {
  closeMenuButton.addEventListener('click', () => {
    optionsModalElement.close();
  });
}

if (optionsModalElement) {
  optionsModalElement.addEventListener('click', (event) => {
    const modalRect = optionsModalElement.getBoundingClientRect();
    const clickedOutside =
      event.clientX < modalRect.left ||
      event.clientX > modalRect.right ||
      event.clientY < modalRect.top ||
      event.clientY > modalRect.bottom;

    if (clickedOutside) {
      optionsModalElement.close();
    }
  });
}

newGameButton.addEventListener('click', (event) => {
  event.preventDefault();
  void loadPuzzle();
});

resetButton.addEventListener('click', () => {
  if (!puzzle || !getEditableBoardState()) {
    return;
  }

  values = [...puzzle.givens];
  selectedIndex = null;
  renderBoard();
});

hostRaceButton.addEventListener('click', () => {
  void hostRace();
});

joinRaceButton.addEventListener('click', () => {
  void joinRace();
});

leaveRaceButton.addEventListener('click', () => {
  void leaveRace();
});

closeRaceButton.addEventListener('click', () => {
  void closeHostedRace();
});

joinCodeInput.addEventListener('input', () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  updateControlStates();
});

async function initializeApp() {
  updateControlStates();
  updateMatchStatus();
  updateBoardPresentation();
  renderDiscoveredMatches();
  void refreshDiscoveredMatches();

  const joinCode = new URLSearchParams(window.location.search).get('join');

  if (joinCode) {
    joinCodeInput.value = joinCode.toUpperCase().slice(0, 4);
    updateControlStates();
    await joinRaceByCode(joinCode);
    return;
  }

  await loadPuzzle();
}

void initializeApp();

window.addEventListener('beforeunload', () => {
  closeEventSource();
  clearDiscoveryRefresh();
});
