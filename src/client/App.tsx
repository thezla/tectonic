import { useEffect, useMemo, useRef, useState } from 'react';

import type { BoardValues, DiscoveryMatch, MatchEvent, MatchSession, Puzzle } from '../shared/api.js';
import { getRegionSizes, validateBoard } from '../shared/validate.js';
import {
  closeMatch,
  createMatch,
  joinMatch,
  leaveMatch,
  loadPuzzle,
  reportProgress,
  startRematch,
  submitMatchFinish,
} from './api.js';
import {
  getFilledCount,
  getOpponentPlayerState,
  getScoredFilledCount,
} from './board.js';
import { BattleStrip } from './components/BattleStrip.js';
import { BoardView } from './components/BoardView.js';
import { OptionsModal } from './components/OptionsModal.js';
import { useDiscovery } from './hooks/useDiscovery.js';
import { openMatchEventStream } from './matchEvents.js';
import { getBoardMessage, getBoardStatus, getEditableBoardState, getMatchStatus } from './status.js';

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
  const [opponentBurst, setOpponentBurst] = useState<{ key: number; amount: number } | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const progressTimeoutRef = useRef<number | null>(null);
  const lastReportedFilledCountRef = useRef<number | null>(null);
  const isSubmittingFinishRef = useRef(false);
  const matchSessionRef = useRef<MatchSession | null>(null);
  const puzzleRef = useRef<Puzzle | null>(null);
  const valuesRef = useRef<BoardValues>([]);
  const { lanDiscoveryEnabled, discoveredMatches } = useDiscovery();

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

  function updateMatchSession(nextSession: MatchSession | null) {
    matchSessionRef.current = nextSession;
    setMatchSession(nextSession);
  }

  function resetToSoloMode(message: string, keepCurrentBoard = false) {
    updateMatchSession(null);
    isSubmittingFinishRef.current = false;
    setStatus(message);
    lastReportedFilledCountRef.current = keepCurrentBoard && puzzleRef.current ? getFilledCount(valuesRef.current) : null;

    if (!keepCurrentBoard) {
      window.setTimeout(() => void loadSoloPuzzle(true), 0);
    }
  }

  async function loadSoloPuzzle(force = false) {
    if (isLoadingPuzzle || (!force && matchSessionRef.current)) {
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
      updateMatchSession({
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
      updateMatchSession({
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
      updateMatchSession({ ...session, match: payload.match });
    } catch (error) {
      console.error(error);
      setStatus('Failed to start the next race.');
    } finally {
      setIsLoadingPuzzle(false);
    }
  }

  function updateCellValue(index: number, value: number | null) {
    setValues((currentValues) => currentValues.map((currentValue, valueIndex) => (valueIndex === index ? value : currentValue)));
  }

  function setSelectedCellValue(value: number | null) {
    if (selectedIndex === null || !puzzle || puzzle.givens[selectedIndex] !== null || !editableBoard) {
      return;
    }

    const regionSizes = getRegionSizes(puzzle);
    const maxValue = regionSizes[puzzle.regions[selectedIndex]];

    if (value === null || (value >= 1 && value <= maxValue)) {
      updateCellValue(selectedIndex, value);
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
          const currentSession = matchSessionRef.current;

          if (!currentSession) {
            return;
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

          updateMatchSession(nextSession);
          return;
        }

        if (event.type === 'match_reset') {
          const currentSession = matchSessionRef.current;

          if (!currentSession) {
            return;
          }

          applyPuzzle(event.puzzle);
          updateMatchSession({ ...currentSession, match: event.match });
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
      } finally {
        progressTimeoutRef.current = null;
      }
    }, 80);

    return () => {
      if (progressTimeoutRef.current !== null) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
    };
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
        <OptionsModal
          isOpen={isOptionsOpen}
          isLoadingPuzzle={isLoadingPuzzle}
          multiplayerLocked={multiplayerLocked}
          resetDisabled={resetDisabled}
          status={status}
          joinCode={joinCode}
          roomCodeText={roomCodeText}
          matchStatus={matchStatus}
          lanDiscoveryEnabled={lanDiscoveryEnabled}
          discoveredMatches={discoveredMatches}
          isGuest={isGuest}
          isHost={isHost}
          finishedMatch={finishedMatch}
          onOpenChange={setIsOptionsOpen}
          onNewPuzzle={() => void loadSoloPuzzle()}
          onReset={resetBoard}
          onHostRace={() => void hostRace()}
          onJoinRace={() => void joinRaceByCode(joinCode)}
          onJoinCodeChange={(value) => setJoinCode(normalizeRoomCode(value))}
          onStartNextRace={() => void startNextRace()}
          onLeaveRace={() => void leaveRace()}
          onCloseRace={() => void closeHostedRace()}
          onJoinDiscoveredMatch={(match) => void joinDiscoveredMatch(match)}
        />
        {matchSession && puzzle && result ? (
          <BattleStrip
            matchSession={matchSession}
            values={values}
            result={result}
            opponentBurst={opponentBurst}
          />
        ) : null}
        <BoardView
          puzzle={puzzle}
          values={values}
          result={result}
          boardLocked={boardLocked}
          selectedIndex={selectedIndex}
          showLockedOverlay={showLockedOverlay}
          lockedOverlayTitle={boardMessage.title}
          matchSession={matchSession}
          onSelectCell={setSelectedIndex}
          onCycleCell={cycleCellValue}
          onClearCell={(index) => {
            setSelectedIndex(index);
            updateCellValue(index, null);
          }}
        />
      </section>
    </main>
  );
}
