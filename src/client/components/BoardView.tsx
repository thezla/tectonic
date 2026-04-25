import type { BoardValues, MatchSession, Puzzle, ValidationResult } from '../../shared/api.js';
import { Cell } from './Cell.js';

type BoardViewProps = {
  puzzle: Puzzle | null;
  values: BoardValues;
  result: ValidationResult | null;
  boardLocked: boolean;
  selectedIndex: number | null;
  showLockedOverlay: boolean;
  lockedOverlayTitle: string;
  matchSession: MatchSession | null;
  onSelectCell: (index: number) => void;
  onCycleCell: (index: number) => void;
  onClearCell: (index: number) => void;
};

export function BoardView({
  puzzle,
  values,
  result,
  boardLocked,
  selectedIndex,
  showLockedOverlay,
  lockedOverlayTitle,
  matchSession,
  onSelectCell,
  onCycleCell,
  onClearCell,
}: BoardViewProps) {
  return (
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
                onSelect={onSelectCell}
                onCycle={onCycleCell}
                onClear={() => onClearCell(index)}
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
        <p id="board-locked-overlay-title" className="board-locked-overlay-title">{showLockedOverlay ? lockedOverlayTitle : ''}</p>
      </div>
    </div>
  );
}
