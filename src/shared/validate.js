export function getCellIndex(width, row, column) {
  return row * width + column;
}

export function getCellPosition(width, index) {
  return {
    row: Math.floor(index / width),
    column: index % width,
  };
}

export function buildRegionCells(puzzle) {
  const regionCells = new Map();

  puzzle.regions.forEach((regionId, index) => {
    const cells = regionCells.get(regionId) ?? [];
    cells.push(index);
    regionCells.set(regionId, cells);
  });

  return regionCells;
}

export function getRegionSizes(puzzle) {
  const sizes = {};

  for (const [regionId, cells] of buildRegionCells(puzzle).entries()) {
    sizes[regionId] = cells.length;
  }

  return sizes;
}

export function getTouchingCellIndices(puzzle, index) {
  const { row, column } = getCellPosition(puzzle.width, index);
  const touching = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;

      if (
        nextRow < 0 ||
        nextRow >= puzzle.height ||
        nextColumn < 0 ||
        nextColumn >= puzzle.width
      ) {
        continue;
      }

      touching.push(getCellIndex(puzzle.width, nextRow, nextColumn));
    }
  }

  return touching;
}

export function getAllowedValues(puzzle, values, index) {
  const regionSizes = getRegionSizes(puzzle);
  const regionId = puzzle.regions[index];
  const maxValue = regionSizes[regionId];
  const regionCells = buildRegionCells(puzzle).get(regionId) ?? [];
  const regionValues = new Set(
    regionCells
      .filter((cellIndex) => cellIndex !== index)
      .map((cellIndex) => values[cellIndex])
      .filter((value) => Number.isInteger(value)),
  );

  const touchingValues = new Set(
    getTouchingCellIndices(puzzle, index)
      .map((cellIndex) => values[cellIndex])
      .filter((value) => Number.isInteger(value)),
  );

  const allowed = [];

  for (let value = 1; value <= maxValue; value += 1) {
    if (!regionValues.has(value) && !touchingValues.has(value)) {
      allowed.push(value);
    }
  }

  return allowed;
}

export function validateBoard(puzzle, values) {
  const regionCells = buildRegionCells(puzzle);
  const regionSizes = getRegionSizes(puzzle);
  const conflicts = new Set();
  const completedRegions = new Set();

  for (const [regionId, cells] of regionCells.entries()) {
    const maxValue = regionSizes[regionId];
    const seen = new Map();
    let isComplete = true;

    for (const cellIndex of cells) {
      const value = values[cellIndex];

      if (!Number.isInteger(value)) {
        isComplete = false;
        continue;
      }

      if (value < 1 || value > maxValue) {
        conflicts.add(cellIndex);
        continue;
      }

      const existingIndex = seen.get(value);

      if (existingIndex !== undefined) {
        conflicts.add(existingIndex);
        conflicts.add(cellIndex);
      } else {
        seen.set(value, cellIndex);
      }
    }

    if (isComplete && seen.size === maxValue) {
      completedRegions.add(regionId);
    }
  }

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!Number.isInteger(value)) {
      continue;
    }

    for (const touchingIndex of getTouchingCellIndices(puzzle, index)) {
      if (touchingIndex <= index) {
        continue;
      }

      if (values[touchingIndex] === value) {
        conflicts.add(index);
        conflicts.add(touchingIndex);
      }
    }
  }

  const solved =
    conflicts.size === 0 &&
    values.every((value) => Number.isInteger(value)) &&
    completedRegions.size === regionCells.size;

  return {
    completedRegions,
    conflicts,
    solved,
  };
}

function chooseNextCellForSearch(puzzle, values) {
  let bestIndex = null;
  let bestCandidates = null;

  for (let index = 0; index < values.length; index += 1) {
    if (Number.isInteger(values[index])) {
      continue;
    }

    const candidates = getAllowedValues(puzzle, values, index);

    if (candidates.length === 0) {
      return { index, candidates };
    }

    if (bestCandidates === null || candidates.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = candidates;

      if (bestCandidates.length === 1) {
        break;
      }
    }
  }

  if (bestIndex === null || bestCandidates === null) {
    return null;
  }

  return { index: bestIndex, candidates: bestCandidates };
}

export function countSolutions(puzzle, values, limit = 2) {
  const initialValues = [...values];
  const initialState = validateBoard(puzzle, initialValues);

  if (initialState.conflicts.size > 0) {
    return 0;
  }

  let solutions = 0;

  function search() {
    if (solutions >= limit) {
      return;
    }

    const nextCell = chooseNextCellForSearch(puzzle, initialValues);

    if (nextCell === null) {
      solutions += 1;
      return;
    }

    if (nextCell.candidates.length === 0) {
      return;
    }

    for (const candidate of nextCell.candidates) {
      initialValues[nextCell.index] = candidate;
      search();

      if (solutions >= limit) {
        initialValues[nextCell.index] = null;
        return;
      }
    }

    initialValues[nextCell.index] = null;
  }

  search();
  return solutions;
}
