import { formatSoloElapsed } from '../soloTimer.js';

type SoloCompletionProps = {
  completed: boolean;
  elapsedMs: number;
  onPlayAgain: () => void;
};

export function SoloCompletion({ completed, elapsedMs, onPlayAgain }: SoloCompletionProps) {
  return (
    <div className="solo-completion-area">
      <div role="status" aria-live="polite" aria-atomic="true">
        {completed ? (
          <div className="solo-completion-message">
            <strong><span aria-hidden="true">✦ </span>Puzzle solved!</strong>
            <span>Completed in {formatSoloElapsed(elapsedMs)}</span>
          </div>
        ) : null}
      </div>
      {completed ? <button type="button" onClick={onPlayAgain}>Play again</button> : null}
    </div>
  );
}
