import { useLayoutEffect, useRef, useState } from 'react';

import type { Puzzle } from '../../shared/api.js';
import {
  advanceSoloTimer,
  createSoloTimer,
  getSoloPuzzleKey,
  pauseSoloTimer,
  readSoloTimer,
  writeSoloTimer,
  type SoloTimer,
} from '../soloTimer.js';

function getTimerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useSoloTimer(puzzle: Puzzle | null, isLoading: boolean, isRace: boolean, solved: boolean) {
  const timerRef = useRef<SoloTimer | null>(null);
  const [timer, setTimer] = useState<SoloTimer | null>(null);
  const [resetRevision, setResetRevision] = useState(0);
  const puzzleKey = puzzle ? getSoloPuzzleKey(puzzle) : null;

  function reset(nextPuzzle: Puzzle) {
    const fresh = createSoloTimer(getSoloPuzzleKey(nextPuzzle));
    timerRef.current = fresh;
    writeSoloTimer(fresh, getTimerStorage());
    setTimer(fresh);
    setResetRevision((revision) => revision + 1);
  }

  useLayoutEffect(() => {
    if (puzzleKey === null) {
      return;
    }

    const storage = getTimerStorage();
    const current = timerRef.current;
    timerRef.current = current?.puzzleKey === puzzleKey ? current : readSoloTimer(puzzleKey, storage);
    let intervalId: number | undefined;

    function publish(next: SoloTimer) {
      timerRef.current = next;
      writeSoloTimer(next, storage);
      setTimer(next);
    }

    function stop() {
      window.clearInterval(intervalId);
      intervalId = undefined;
      if (timerRef.current) {
        publish(pauseSoloTimer(timerRef.current, performance.now()));
      }
    }

    function tick() {
      if (timerRef.current) {
        publish(advanceSoloTimer(timerRef.current, {
          isLoading: isLoading || document.visibilityState === 'hidden',
          isRace,
          solved,
        }, performance.now()));
      }
    }

    function start() {
      window.clearInterval(intervalId);
      tick();
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      if (timerRef.current?.runningSince !== null && timerRef.current?.runningSince !== undefined) {
        intervalId = window.setInterval(tick, 250);
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        start();
      }
    }

    start();
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', start);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pageshow', start);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [puzzleKey, isLoading, isRace, solved, resetRevision]);

  return { elapsedMs: timer?.elapsedMs ?? 0, completed: !isRace && !isLoading && timer?.completed === true, reset };
}
