import { buildRegionCells, countSolutions, getCellIndex, getCellPosition } from './validate.js';

const DEFAULT_WIDTH = 5;
const DEFAULT_HEIGHT = 5;
const MAX_REGION_SIZE = 5;
const BASE_SOLUTION = [
  1, 2, 5, 3, 1,
  3, 4, 1, 2, 4,
  2, 5, 3, 5, 1,
  1, 4, 2, 4, 2,
  2, 3, 1, 3, 1,
];
const BASE_REGIONS = [
  4, 4, 4, 5, 6,
  4, 4, 5, 5, 0,
  3, 3, 0, 0, 0,
  2, 3, 0, 1, 1,
  2, 3, 3, 1, 1,
];

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function rotateSquareGrid(cells, width) {
  const rotated = Array(cells.length).fill(null);

  for (let index = 0; index < cells.length; index += 1) {
    const { row, column } = getCellPosition(width, index);
    const nextRow = column;
    const nextColumn = width - 1 - row;
    rotated[getCellIndex(width, nextRow, nextColumn)] = cells[index];
  }

  return rotated;
}

function reflectSquareGrid(cells, width) {
  const reflected = Array(cells.length).fill(null);

  for (let index = 0; index < cells.length; index += 1) {
    const { row, column } = getCellPosition(width, index);
    const nextColumn = width - 1 - column;
    reflected[getCellIndex(width, row, nextColumn)] = cells[index];
  }

  return reflected;
}

function transformBoard(values, regions, width) {
  let nextValues = [...values];
  let nextRegions = [...regions];
  const rotations = Math.floor(Math.random() * 4);

  for (let turn = 0; turn < rotations; turn += 1) {
    nextValues = rotateSquareGrid(nextValues, width);
    nextRegions = rotateSquareGrid(nextRegions, width);
  }

  if (Math.random() < 0.5) {
    nextValues = reflectSquareGrid(nextValues, width);
    nextRegions = reflectSquareGrid(nextRegions, width);
  }

  return {
    values: nextValues,
    regions: nextRegions,
  };
}

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

    if (cells.length < 1 || cells.length > MAX_REGION_SIZE) {
      throw new Error(`Region ${regionId} is outside the allowed 1-5 size range.`);
    }
  }
}

function createGivens(puzzle, solution) {
  const givens = [...solution];
  const removalOrder = shuffle(solution.map((_, index) => index));

  for (const cellIndex of removalOrder) {
    const removedValue = givens[cellIndex];
    givens[cellIndex] = null;

    if (countSolutions(puzzle, givens, 2) !== 1) {
      givens[cellIndex] = removedValue;
    }
  }

  return givens;
}

export function createPuzzleWithSolution({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
  if (width !== DEFAULT_WIDTH || height !== DEFAULT_HEIGHT) {
    throw new Error('This MVP generator currently supports only 5x5 boards.');
  }

  const transformed = transformBoard(BASE_SOLUTION, BASE_REGIONS, width);
  const puzzle = {
    width,
    height,
    regions: transformed.regions,
  };

  assertRegionsAreOrthogonallyConnected(puzzle);

  return {
    puzzle: {
      ...puzzle,
      givens: createGivens(puzzle, transformed.values),
    },
    solution: transformed.values,
  };
}

export function createPuzzle(options = {}) {
  return createPuzzleWithSolution(options).puzzle;
}
