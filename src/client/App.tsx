import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { BoardValues, DiscoveryMatch, MatchEvent, MatchSession, Puzzle } from '../shared/api.js';
import { getCellPosition, getRegionSizes, validateBoard } from '../shared/validate.js';
import {
  closeMatch,
  createMatch,
  joinMatch,
  leaveMatch,
  loadDiscoveredMatches,
  loadPuzzle,
  reportProgress,
  startRematch,
  submitMatchFinish,
} from './api.js';
import {
  getCellLabel,
  getFilledCount,
  getLocalPlayerState,
  getOpponentPlayerState,
  getRegionBorderWidth,
  getRegionPalette,
  getScoredFilledCount,
} from './board.js';
import { openMatchEventStream } from './matchEvents.js';
import { getBoardMessage, getBoardStatus, getEditableBoardState, getMatchStatus } from './status.js';

const LONG_PRESS_DURATION_MS = 420;

type CellStyle = CSSProperties & {
  '--region-color': string;
};

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function App() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [values, setValues] = useState<BoardValues>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
  const [matchSession, setMatchSession] = useState<MatchSession | null>(null);
  const [status, setStatus] = useState('Loading puzzle…');
  const [joinCode, setJoinCode] = useState('');
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [lanDiscoveryEnabled, setLanDiscoveryEnabled] = useState(true);
  const [discoveredMatches, setDiscoveredMatches] = useState<DiscoveryMatch[]>([]);
  const [opponentBurst, setOpponentBurst] = useState<{ key: number; amount: number } | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const optionsModalRef = useRef<HTMLDialogElement | null>(null);
  const progressTimeoutRef = useRef<number | null>(null);
  const lastReportedFilledCountRef = useRef<number | null>(null);
  const isSubmittingFinishRef = useRef(false);
  const matchSessionRef = useRef<MatchSession | null>(null);
  const puzzleRef = useRef<Puzzle | null>(null);
  const valuesRef = useRef<BoardValues>([]);

  matchSessionRef.current = matchSession;
  puzzleRef.current = puzzle;
  valuesRef.current = values;

  const editableBoard = getEditableBoardState(isLoadingPuzzle, matchSession);
  const result = useMemo(() => (puzzle ? validateBoard(puzzle, values) : null), [puzzle, values]);
  const boardMessage = getBoardMessage(puzzle, values, result, isLoadingPuzzle, matchSession, status);
  const showLockedOverlay = boardMessage.tone === 'locked';
  const matchStatus = getMatchStatus(matchSession, lanDiscoveryEnabled);
  const roomCodeText = matchSession ? `Race code: ${matchSession.match.roomCode}` : 'Solo mode';

  function applyPuzzle(nextPuzzle: Puzzle) {
    setPuzzle(nextPuzzle);
    setValues([...nextPuzzle.givens]);
    setSelectedIndex(null);
    lastReportedFilledCountRef.current = getFilledCount(nextPuzzle.givens);
  }

  function resetToSoloMode(message: string, keepCurrentBoard = false) {
    setMatchSession(null);
    isSubmittingFinishRef.current = false;
    setStatus(message);
    lastReportedFilledCountRef.current = keepCurrentBoard && puzzleRef.current ? getFilledCount(valuesRef.current) : null;

    if (!keepCurrentBoard) {
      void loadSoloPuzzle();
    }
  }

  async function loadSoloPuzzle() {
    if (isLoadingPuzzle || matchSessionRef.current) {
      return;
    }

    setIsLoadingPuzzle(true);
    setSelectedIndex(null);
    setStatus('Loading puzzle…');
    document.activeElement instanceof HTMLElement && document.activeElement.blur();

    try {
      applyPuzzle(await loadPuzzle());
    } catch (error) {
      console.error(error);
      setStatus('Failed to load the puzzle.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  async function hostRace() {
    if (isLoadingPuzzle || matchSessionRef.current) {
      return;
    }

    setIsLoadingPuzzle(true);
    setStatus('Creating race…');

    try {
      const payload = await createMatch();
      setMatchSession({
        matchId: payload.matchId,
        playerId: payload.playerId,
        role: payload.role,
        match: payload.match,
      });
      applyPuzzle(payload.puzzle);
      setIsOptionsOpen(false);
    } catch (error) {
      console.error(error);
      setStatus('Failed to create a race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  async function joinRaceByCode(roomCode: string) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (normalizedRoomCode.length !== 4 || isLoadingPuzzle || matchSessionRef.current) {
      return;
    }

    setIsLoadingPuzzle(true);
    setStatus(`Joining race ${normalizedRoomCode}…`);

    try {
      const payload = await joinMatch(normalizedRoomCode);
      setMatchSession({
        matchId: payload.matchId,
        playerId: payload.playerId,
        role: payload.role,
        match: payload.match,
      });
      setJoinCode('');
      applyPuzzle(payload.puzzle);
      setIsOptionsOpen(false);
    } catch (error) {
      console.error(error);
      setStatus('Failed to join that race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  async function joinDiscoveredMatch(match: DiscoveryMatch) {
    if (match.origin !== window.location.origin) {
      window.location.href = `${match.origin}/?join=${encodeURIComponent(match.roomCode)}`;
      return;
    }

    setJoinCode(match.roomCode);
    await joinRaceByCode(match.roomCode);
  }

  async function leaveRace() {
    const session = matchSessionRef.current;

    if (!session || session.role !== 'guest' || isLoadingPuzzle) {
      return;
    }

    setIsLoadingPuzzle(true);

    try {
      await leaveMatch(session.matchId, session.playerId);
      resetToSoloMode('You left the race. Continuing in solo mode.', true);
    } catch (error) {
      console.error(error);
      setStatus('Failed to leave the race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  async function closeHostedRace() {
    const session = matchSessionRef.current;

    if (!session || session.role !== 'host' || isLoadingPuzzle) {
      return;
    }

    setIsLoadingPuzzle(true);

    try {
      await closeMatch(session.matchId, session.playerId);
      setIsLoadingPuzzle(false);
      resetToSoloMode('Race closed. Continuing in solo mode.', false);
    } catch (error) {
      console.error(error);
      setStatus('Failed to close the race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  async function startNextRace() {
    const session = matchSessionRef.current;

    if (!session || session.role !== 'host' || session.match.status !== 'finished' || isLoadingPuzzle) {
      return;
    }

    setIsLoadingPuzzle(true);
    setStatus('Preparing the next race…');

    try {
      const payload = await startRematch(session.matchId, session.playerId);
      applyPuzzle(payload.puzzle);
      setMatchSession({ ...session, match: payload.match });
    } catch (error) {
      console.error(error);
      setStatus('Failed to start the next race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  function setSelectedCellValue(value: number | null) {
    if (selectedIndex === null || !puzzle || puzzle.givens[selectedIndex] !== null || !editableBoard) {
      return;
    }

    const regionSizes = getRegionSizes(puzzle);
    const maxValue = regionSizes[puzzle.regions[selectedIndex]];

    if (value === null || (value >= 1 && value <= maxValue)) {
      setValues((currentValues) => currentValues.map((currentValue, index) => (index === selectedIndex ? value : currentValue)));
    }
  }

  function cycleCellValue(index: number) {
    if (!puzzle) {
      return;
    }

    const regionSizes = getRegionSizes(puzzle);
    const maxValue = regionSizes[puzzle.regions[index]];
    setSelectedIndex(index);
    setValues((currentValues) => {
      const currentValue = currentValues[index] ?? 0;
      const nextValue = currentValue >= maxValue ? null : currentValue + 1;
      return currentValues.map((value, valueIndex) => (valueIndex === index ? nextValue : value));
    });
  }

  function resetBoard() {
    if (!puzzle || !editableBoard) {
      return;
    }

    setValues([...puzzle.givens]);
    setSelectedIndex(null);
  }

  useEffect(() => {
    if (!optionsModalRef.current) {
      return;
    }

    if (isOptionsOpen && !optionsModalRef.current.open) {
      optionsModalRef.current.showModal();
    } else if (!isOptionsOpen && optionsModalRef.current.open) {
      optionsModalRef.current.close();
    }
  }, [isOptionsOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!puzzleRef.current || !getEditableBoardState(isLoadingPuzzle, matchSessionRef.current)) {
        return;
      }

      if (event.key >= '1' && event.key <= '9') {
        setSelectedCellValue(Number(event.key));
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
        setSelectedCellValue(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    async function refresh() {
      try {
        const payload = await loadDiscoveredMatches();

        if (cancelled) {
          return;
        }

        setLanDiscoveryEnabled(payload.enabled !== false);
        setDiscoveredMatches(payload.matches ?? []);

        if (payload.enabled !== false) {
          timeoutId = window.setTimeout(refresh, 2000);
        }
      } catch (error) {
        console.error(error);
        timeoutId = window.setTimeout(refresh, 2000);
      }
    }

    void refresh();

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const joinCodeParam = new URLSearchParams(window.location.search).get('join');

    if (joinCodeParam) {
      const normalized = normalizeRoomCode(joinCodeParam);
      setJoinCode(normalized);
      void joinRaceByCode(normalized);
      return;
    }

    void loadSoloPuzzle();
  }, []);

  useEffect(() => {
    if (!matchSession) {
      return;
    }

    const eventSource = openMatchEventStream(
      matchSession.matchId,
      matchSession.playerId,
      (event: MatchEvent) => {
        if (event.type === 'match_state') {
          setMatchSession((currentSession) => {
            if (!currentSession) {
              return currentSession;
            }

            const previousOpponentCount = getOpponentPlayerState(currentSession)?.filledCount ?? 0;
            const nextSession = { ...currentSession, match: event.match };
            const nextOpponentCount = getOpponentPlayerState(nextSession)?.filledCount ?? 0;

            if (event.puzzle && event.match.puzzleRevision !== currentSession.match.puzzleRevision) {
              applyPuzzle(event.puzzle);
            }

            if (event.match.status === 'active' && nextOpponentCount > previousOpponentCount) {
              setOpponentBurst({ key: Date.now(), amount: nextOpponentCount - previousOpponentCount });
            }

            return nextSession;
          });
          return;
        }

        if (event.type === 'match_reset') {
          applyPuzzle(event.puzzle);
          setMatchSession((currentSession) => currentSession && { ...currentSession, match: event.match });
          return;
        }

        if (event.type === 'match_closed') {
          resetToSoloMode('Host closed the race. Continuing in solo mode.', true);
        }
      },
      () => {
        setStatus('Connection to the race was interrupted. Trying to reconnect…');
      },
    );

    return () => eventSource.close();
  }, [matchSession?.matchId, matchSession?.playerId]);

  useEffect(() => {
    if (matchSession?.match.status !== 'countdown') {
      return;
    }

    const intervalId = window.setInterval(() => setCountdownTick((tick) => tick + 1), 200);
    return () => clearInterval(intervalId);
  }, [matchSession?.match.status, matchSession?.match.startsAt]);

  useEffect(() => {
    if (!opponentBurst) {
      return;
    }

    const timeoutId = window.setTimeout(() => setOpponentBurst(null), 700);
    return () => clearTimeout(timeoutId);
  }, [opponentBurst]);

  useEffect(() => {
    if (!matchSession || matchSession.match.status !== 'active' || !result) {
      return;
    }

    const filledCount = getScoredFilledCount(values, result);

    if (lastReportedFilledCountRef.current === filledCount) {
      return;
    }

    if (progressTimeoutRef.current !== null) {
      clearTimeout(progressTimeoutRef.current);
    }

    progressTimeoutRef.current = window.setTimeout(async () => {
      try {
        await reportProgress(matchSession.matchId, matchSession.playerId, filledCount);
        lastReportedFilledCountRef.current = filledCount;
      } catch (error) {
        console.error(error);
      }
    }, 80);
  }, [matchSession, result, values]);

  useEffect(() => {
    if (!matchSession || matchSession.match.status !== 'active' || !result?.solved || isSubmittingFinishRef.current) {
      return;
    }

    isSubmittingFinishRef.current = true;

    void submitMatchFinish(matchSession.matchId, matchSession.playerId, values).catch((error) => {
      console.error(error);
      isSubmittingFinishRef.current = false;
    });
  }, [matchSession, result?.solved, values]);

  useEffect(() => {
    if (result) {
      setStatus(getBoardStatus(values, result, matchSession));
    }
  }, [result, values, matchSession]);

  useEffect(() => {
    return () => {
      if (progressTimeoutRef.current !== null) {
        clearTimeout(progressTimeoutRef.current);
      }
    };
  }, []);

  void countdownTick;

  const multiplayerLocked = matchSession !== null;
  const boardLocked = !editableBoard;
  const isGuest = matchSession?.role === 'guest';
  const isHost = matchSession?.role === 'host';
  const finishedMatch = matchSession?.match.status === 'finished';
  const resetDisabled = isLoadingPuzzle || puzzle === null || boardLocked || matchSession?.match.status === 'finished';

  return (
    <main className="layout">
      <section className={`board-panel${boardLocked ? ' locked' : ''}`}>
        <button id="open-menu" className="menu-trigger" type="button" aria-label="Open game options" onClick={() => setIsOptionsOpen(true)}>
          ☰
        </button>
        <dialog
          id="options-modal"
          className="options-modal"
          aria-label="Game options"
          ref={optionsModalRef}
          onClose={() => setIsOptionsOpen(false)}
          onClick={(event) => {
            const modalRect = event.currentTarget.getBoundingClientRect();
            const clickedOutside =
              event.clientX < modalRect.left ||
              event.clientX > modalRect.right ||
              event.clientY < modalRect.top ||
              event.clientY > modalRect.bottom;

            if (clickedOutside) {
              setIsOptionsOpen(false);
            }
          }}
        >
          <div className="options-modal-content">
            <div className="options-modal-header">
              <h1>Tectonic</h1>
              <button id="close-menu" className="menu-close" type="button" aria-label="Close game options" onClick={() => setIsOptionsOpen(false)}>
                ✕
              </button>
            </div>
            <p className="intro">Fill each region with the numbers 1 through its size. Matching numbers may not touch, even diagonally.</p>
            <div className="controls">
              <button id="new-game" type="button" disabled={isLoadingPuzzle || multiplayerLocked} onClick={() => void loadSoloPuzzle()}>
                New puzzle
              </button>
              <button id="reset-game" type="button" disabled={resetDisabled} onClick={resetBoard}>
                Reset
              </button>
            </div>
            <p id="status" className="status">{status}</p>
            <section className="multiplayer-panel" aria-label="Create room controls">
              <h2>Create room</h2>
              <div className="controls multiplayer-controls">
                <button id="host-race" type="button" disabled={isLoadingPuzzle || multiplayerLocked} onClick={() => void hostRace()}>
                  Host race
                </button>
                <div className="join-controls">
                  <input
                    id="join-code"
                    type="text"
                    inputMode="text"
                    maxLength={4}
                    placeholder="Code"
                    aria-label="Race code"
                    value={joinCode}
                    disabled={isLoadingPuzzle || multiplayerLocked}
                    onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
                  />
                  <button
                    id="join-race"
                    type="button"
                    disabled={isLoadingPuzzle || multiplayerLocked || joinCode.trim().length !== 4}
                    onClick={() => void joinRaceByCode(joinCode)}
                  >
                    Join race
                  </button>
                </div>
              </div>
              <div className="controls multiplayer-session-controls">
                <button id="next-race" type="button" hidden={!(isHost && finishedMatch)} disabled={isLoadingPuzzle || !(isHost && finishedMatch)} onClick={() => void startNextRace()}>
                  Start next race
                </button>
                <button id="leave-race" type="button" hidden={!isGuest} disabled={isLoadingPuzzle || !isGuest} onClick={() => void leaveRace()}>
                  Leave race
                </button>
                <button id="close-race" type="button" hidden={!isHost} disabled={isLoadingPuzzle || !isHost} onClick={() => void closeHostedRace()}>
                  Close race
                </button>
              </div>
              <p id="room-code" className="status match-status">{roomCodeText}</p>
              <p id="match-status" className="status match-status">{matchStatus}</p>
              <HostedGamesList
                hidden={!lanDiscoveryEnabled}
                matches={discoveredMatches}
                disabled={isLoadingPuzzle || multiplayerLocked}
                onJoin={(match) => void joinDiscoveredMatch(match)}
              />
            </section>
          </div>
        </dialog>
        {matchSession && puzzle && result ? (
          <BattleStrip
            matchSession={matchSession}
            values={values}
            result={result}
            opponentBurst={opponentBurst}
          />
        ) : null}
        <div className="board-wrapper">
          <div
            id="board"
            className={`board${boardLocked ? ' locked' : ''}`}
            aria-label="Tectonic puzzle board"
            onDoubleClick={(event) => event.preventDefault()}
            style={puzzle ? { gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))` } : undefined}
          >
            {puzzle && result
              ? values.map((value, index) => (
                  <Cell
                    key={index}
                    puzzle={puzzle}
                    values={values}
                    value={value}
                    index={index}
                    selected={selectedIndex === index}
                    boardLocked={boardLocked}
                    result={result}
                    onSelect={setSelectedIndex}
                    onCycle={cycleCellValue}
                    onClear={() => {
                      setSelectedIndex(index);
                      setValues((currentValues) => currentValues.map((currentValue, valueIndex) => (valueIndex === index ? null : currentValue)));
                    }}
                  />
                ))
              : null}
          </div>
          <div id="board-locked-overlay" className="board-locked-overlay" aria-hidden="true" hidden={!showLockedOverlay}>
            {showLockedOverlay && matchSession ? (
              <div
                id="board-locked-overlay-room-code"
                className="board-locked-overlay-room-code"
                data-role={matchSession.role === 'host' ? 'host' : 'guest'}
              >
                <p id="board-locked-overlay-label" className="board-locked-overlay-label">
                  {matchSession.role === 'host' ? 'Host room code' : 'Race room code'}
                </p>
                <p id="board-locked-overlay-code" className="board-locked-overlay-code">{matchSession.match.roomCode}</p>
              </div>
            ) : null}
            <p id="board-locked-overlay-title" className="board-locked-overlay-title">{showLockedOverlay ? boardMessage.title : ''}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function HostedGamesList({
  hidden,
  matches,
  disabled,
  onJoin,
}: {
  hidden: boolean;
  matches: DiscoveryMatch[];
  disabled: boolean;
  onJoin: (match: DiscoveryMatch) => void;
}) {
  return (
    <section className="hosted-games" aria-label="Hosted games on your network" hidden={hidden}>
      <h3>Hosted games on your network</h3>
      <div id="hosted-games-list" className="hosted-games-list">
        {matches.length === 0 ? <p className="status hosted-games-empty">No joinable hosted games found yet.</p> : null}
        {matches.map((match) => (
          <article className="hosted-game-card" key={`${match.instanceId}:${match.matchId}`}>
            <div className="hosted-game-meta">
              <p className="hosted-game-title">{match.host || 'Room host'}</p>
              <span className="hosted-game-code">Code {match.roomCode}</span>
            </div>
            <p className="hosted-game-detail">{match.hostAddress}:{match.port}</p>
            <div className="hosted-game-actions">
              <button type="button" disabled={disabled} onClick={() => onJoin(match)}>
                Join
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BattleStrip({
  matchSession,
  values,
  result,
  opponentBurst,
}: {
  matchSession: MatchSession;
  values: BoardValues;
  result: ReturnType<typeof validateBoard>;
  opponentBurst: { key: number; amount: number } | null;
}) {
  const totalCells = values.length;
  const localCount = getScoredFilledCount(values, result);
  const opponent = getOpponentPlayerState(matchSession);
  const opponentCount = opponent?.filledCount ?? 0;
  const localPercent = totalCells > 0 ? (localCount / totalCells) * 100 : 0;
  const opponentPercent = totalCells > 0 ? (opponentCount / totalCells) * 100 : 0;
  const delta = localCount - opponentCount;
  const showInlineRoomCode = matchSession.match.status === 'active';
  const title = matchSession.match.status === 'finished' ? 'Battle result' : 'Head-to-head race';
  const localPlayer = getLocalPlayerState(matchSession);
  void localPlayer;

  let deltaText = 'Dead even';

  if (matchSession.match.status === 'waiting') {
    deltaText = 'Waiting for challenger';
  } else if (matchSession.match.status === 'countdown') {
    deltaText = 'Both players locked in';
  } else if (matchSession.match.status === 'finished') {
    deltaText = matchSession.match.winnerPlayerId === matchSession.playerId ? 'Victory' : 'Defeat';
  } else if (!opponent?.joined) {
    deltaText = 'Awaiting opponent';
  } else if (delta > 0) {
    deltaText = `Ahead by ${delta}`;
  } else if (delta < 0) {
    deltaText = `Behind by ${Math.abs(delta)}`;
  }

  return (
    <section id="battle-strip" className="battle-strip" aria-label="Battle progress">
      <div className="battle-strip-header">
        <div className="battle-title-group">
          <p id="battle-title" className="battle-title">{title}</p>
          <span id="battle-room-code" className="battle-room-code" hidden={!showInlineRoomCode}>{showInlineRoomCode ? matchSession.match.roomCode : ''}</span>
        </div>
        <span id="battle-delta" className="battle-delta">{deltaText}</span>
      </div>
      <div className="battle-lanes">
        <div className="battle-lane battle-lane-you">
          <div className="battle-lane-label-row">
            <span className="battle-lane-label">You</span>
            <span id="battle-you-count" className="battle-lane-count">{localCount}/{totalCells}</span>
          </div>
          <div className="battle-meter">
            <div id="battle-you-fill" className="battle-meter-fill battle-meter-fill-you" style={{ width: `${localPercent}%` }} />
          </div>
        </div>
        <div className={`battle-lane battle-lane-opponent${opponentBurst ? ' battle-lane-hit' : ''}`} key={opponentBurst?.key ?? 'opponent'}>
          <div className="battle-lane-label-row">
            <span className="battle-lane-label">Opponent</span>
            <span id="battle-opponent-count" className="battle-lane-count">{opponentCount}/{totalCells}</span>
          </div>
          <div className="battle-meter">
            <div id="battle-opponent-fill" className="battle-meter-fill battle-meter-fill-opponent" style={{ width: `${opponentPercent}%` }} />
          </div>
          <span id="battle-opponent-burst" className="battle-opponent-burst" aria-hidden="true">+{opponentBurst?.amount ?? 1}</span>
        </div>
      </div>
    </section>
  );
}

function Cell({
  puzzle,
  values,
  value,
  index,
  selected,
  boardLocked,
  result,
  onSelect,
  onCycle,
  onClear,
}: {
  puzzle: Puzzle;
  values: BoardValues;
  value: number | null;
  index: number;
  selected: boolean;
  boardLocked: boolean;
  result: ReturnType<typeof validateBoard>;
  onSelect: (index: number) => void;
  onCycle: (index: number) => void;
  onClear: () => void;
}) {
  const longPressTimeoutRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const regionCount = Math.max(...puzzle.regions) + 1;
  const regionPalette = getRegionPalette(regionCount);
  const { row, column } = getCellPosition(puzzle.width, index);
  const given = puzzle.givens[index];
  const regionId = puzzle.regions[index];
  const canEdit = given === null && !boardLocked;
  const classNames = ['cell'];

  if (given !== null) {
    classNames.push('given');
  }

  if (result.conflicts.has(index)) {
    classNames.push('invalid');
  }

  if (result.completedRegions.has(regionId)) {
    classNames.push('region-complete');
  }

  if (selected) {
    classNames.push('selected');
  }

  if (boardLocked && given === null) {
    classNames.push('locked');
  }

  const style: CellStyle = {
    '--region-color': regionPalette[regionId],
    borderTopWidth: row === 0 ? 3 : getRegionBorderWidth(puzzle, index, -1, 0),
    borderBottomWidth: row === puzzle.height - 1 ? 3 : getRegionBorderWidth(puzzle, index, 1, 0),
    borderLeftWidth: column === 0 ? 3 : getRegionBorderWidth(puzzle, index, 0, -1),
    borderRightWidth: column === puzzle.width - 1 ? 3 : getRegionBorderWidth(puzzle, index, 0, 1),
  };

  function clearLongPressTimeout() {
    if (longPressTimeoutRef.current !== null) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canEdit || event.button !== 0) {
      return;
    }

    suppressClickRef.current = false;
    clearLongPressTimeout();
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTimeoutRef.current = null;

      if (!canEdit || values[index] === null) {
        return;
      }

      onSelect(index);
      onClear();
      suppressClickRef.current = true;
    }, LONG_PRESS_DURATION_MS);
  }

  return (
    <button
      type="button"
      className={classNames.join(' ')}
      disabled={!canEdit}
      aria-label={getCellLabel(puzzle, values, index)}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPressTimeout}
      onPointerCancel={clearLongPressTimeout}
      onPointerLeave={clearLongPressTimeout}
      onClick={(event) => {
        if (!canEdit) {
          return;
        }

        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          return;
        }

        onCycle(index);
      }}
      onContextMenu={(event) => {
        if (!canEdit) {
          return;
        }

        event.preventDefault();
        onSelect(index);
        onClear();
      }}
    >
      {value ?? ''}
    </button>
  );
}
