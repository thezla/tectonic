import { createPuzzleWithSolution } from '../src/shared/puzzle.js';
import {
  buildRegionCells,
  countSolutions,
  getCellIndex,
  getCellPosition,
  validateBoard,
} from '../src/shared/validate.js';

const AMBIGUOUS_PUZZLE = {
  width: 5,
  height: 5,
  regions: [
    4, 4, 4, 5, 6,
    4, 4, 5, 5, 0,
    3, 3, 0, 0, 0,
    2, 3, 0, 1, 1,
    2, 3, 3, 1, 1,
  ],
};
const AMBIGUOUS_GIVENS = Array(25).fill(null);

function getOrthogonalNeighborIndices(width, height, index) {
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

function assertRegionsAreOrthogonallyConnected(puzzle) {
  const regionCells = buildRegionCells(puzzle);

  for (const [regionId, cells] of regionCells.entries()) {
    const visited = new Set([cells[0]]);
    const queue = [cells[0]];

    while (queue.length > 0) {
      const currentIndex = queue.shift();

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

  for (const cells of buildRegionCells(puzzle).values()) {
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

console.log('Smoke test passed.');
