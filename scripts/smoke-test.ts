import { createPuzzleWithSolution } from '../src/shared/puzzle.js';
import type { BoardValues, Puzzle } from '../src/shared/api.js';
import {
  buildRegionCells,
  countSolutions,
  getCellIndex,
  getCellPosition,
  validateBoard,
} from '../src/shared/validate.js';

const AMBIGUOUS_PUZZLE: Puzzle = {
  width: 5,
  height: 5,
  regions: [
    4, 4, 4, 5, 6,
    4, 4, 5, 5, 0,
    3, 3, 0, 0, 0,
    2, 3, 0, 1, 1,
    2, 3, 3, 1, 1,
  ],
  givens: Array(25).fill(null),
};
const AMBIGUOUS_GIVENS: BoardValues = Array(25).fill(null);
const regionLayoutSignatures = new Set<string>();
const sizeHistograms = new Set<string>();

function getOrthogonalNeighborIndices(width: number, height: number, index: number): number[] {
  const { row, column } = getCellPosition(width, index);
  const candidates = [
    [row - 1, column],
    [row + 1, column],
    [row, column - 1],
    [row, column + 1],
  ];

  return candidates
    .filter(
      ([nextRow, nextColumn]) =>
        nextRow >= 0 && nextRow < height && nextColumn >= 0 && nextColumn < width,
    )
    .map(([nextRow, nextColumn]) => getCellIndex(width, nextRow, nextColumn));
}

function assertRegionsAreOrthogonallyConnected(puzzle: Puzzle): void {
  const regionCells = buildRegionCells(puzzle);

  for (const [regionId, cells] of regionCells.entries()) {
    const visited = new Set([cells[0]]);
    const queue = [cells[0]];

    while (queue.length > 0) {
      const currentIndex = queue.shift();

      if (currentIndex === undefined) {
        continue;
      }

      for (const neighborIndex of getOrthogonalNeighborIndices(
        puzzle.width,
        puzzle.height,
        currentIndex,
      )) {
        if (puzzle.regions[neighborIndex] !== regionId || visited.has(neighborIndex)) {
          continue;
        }

        visited.add(neighborIndex);
        queue.push(neighborIndex);
      }
    }

    if (visited.size !== cells.length) {
      throw new Error(`Region ${regionId} is not orthogonally connected.`);
    }
  }
}

if (countSolutions(AMBIGUOUS_PUZZLE, AMBIGUOUS_GIVENS, 2) < 2) {
  throw new Error('Ambiguous regression fixture did not report multiple solutions.');
}

for (let iteration = 0; iteration < 100; iteration += 1) {
  const { puzzle, solution } = createPuzzleWithSolution();

  if (puzzle.givens.length !== puzzle.width * puzzle.height) {
    throw new Error('Puzzle givens length does not match the board size.');
  }

  if (puzzle.regions.length !== puzzle.width * puzzle.height) {
    throw new Error('Region map length does not match the board size.');
  }

  if (puzzle.givens.every((value) => value === null)) {
    throw new Error('Generated puzzle has no clues.');
  }

  const solvedResult = validateBoard(puzzle, solution);

  if (!solvedResult.solved) {
    throw new Error('Generated solution does not satisfy the puzzle rules.');
  }

  const givensResult = validateBoard(puzzle, puzzle.givens);

  if (givensResult.conflicts.size > 0) {
    throw new Error('Generated givens already contain rule conflicts.');
  }

  if (countSolutions(puzzle, puzzle.givens, 2) !== 1) {
    throw new Error('Generated puzzle does not have a unique solution.');
  }

  assertRegionsAreOrthogonallyConnected(puzzle);
  const regionCells = [...buildRegionCells(puzzle).values()];

  regionLayoutSignatures.add(puzzle.regions.join(','));
  sizeHistograms.add(
    [1, 2, 3, 4, 5]
      .map((size) => regionCells.filter((cells) => cells.length === size).length)
      .join('-'),
  );

  for (const cells of regionCells) {
    if (cells.length < 1 || cells.length > 5) {
      throw new Error('Generated a region outside the allowed 1-5 size range.');
    }
  }

  for (let index = 0; index < puzzle.givens.length; index += 1) {
    if (puzzle.givens[index] !== null && puzzle.givens[index] !== solution[index]) {
      throw new Error('A given cell does not match the generated solution.');
    }
  }
}

if (regionLayoutSignatures.size < 12) {
  throw new Error('Generated region layouts are not varied enough.');
}

if (sizeHistograms.size < 4) {
  throw new Error('Generated region size distributions are not varied enough.');
}

console.log('Smoke test passed.');
