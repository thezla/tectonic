import { useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { BoardValues, Puzzle, ValidationResult } from '../../shared/api.js';
import { getCellPosition } from '../../shared/validate.js';
import { getCellLabel, getRegionBorderWidth, getRegionPalette } from '../board.js';

const LONG_PRESS_DURATION_MS = 420;

type CellStyle = CSSProperties & {
  '--region-color': string;
};

type CellProps = {
  puzzle: Puzzle;
  values: BoardValues;
  value: number | null;
  index: number;
  selected: boolean;
  boardLocked: boolean;
  result: ValidationResult;
  onSelect: (index: number) => void;
  onCycle: (index: number) => void;
  onClear: () => void;
};

export function Cell({
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
}: CellProps) {
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
