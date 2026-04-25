import { buildRegionCells, countSolutions, getCellIndex, getCellPosition } from './validate.js';
import type { BoardValues, Puzzle, PuzzleWithSolution } from './api.js';

const DEFAULT_WIDTH = 5;
const DEFAULT_HEIGHT = 5;
const MAX_REGION_SIZE = 5;
const MAX_GENERATION_ATTEMPTS = 50;
const BASE_LAYOUTS = [
  {
    regions: [
      4, 4, 4, 5, 6,
      4, 4, 5, 5, 0,
      3, 3, 0, 0, 0,
      2, 3, 0, 1, 1,
      2, 3, 3, 1, 1,
    ],
    solution: [
      1, 2, 5, 3, 1,
      3, 4, 1, 2, 4,
      2, 5, 3, 5, 1,
      1, 4, 2, 4, 2,
      2, 3, 1, 3, 1,
    ],
  },
  {
    regions: [
      3, 5, 5, 5, 5,
      3, 5, 4, 4, 6,
      1, 2, 4, 4, 4,
      2, 2, 0, 0, 7,
      2, 2, 0, 0, 0,
    ],
    solution: [
      1, 3, 1, 5, 2,
      2, 4, 2, 4, 1,
      1, 5, 1, 3, 5,
      2, 4, 2, 4, 1,
      1, 3, 1, 5, 3,
    ],
  },
  {
    regions: [
      5, 5, 1, 0, 6,
      1, 1, 1, 0, 0,
      2, 2, 1, 0, 4,
      2, 2, 3, 3, 4,
      2, 3, 3, 3, 4,
    ],
    solution: [
      1, 2, 1, 3, 1,
      4, 3, 5, 4, 2,
      2, 1, 2, 1, 3,
      5, 4, 5, 4, 2,
      3, 2, 1, 3, 1,
    ],
  },
  {
    regions: [
      0, 3, 4, 4, 4,
      0, 3, 3, 2, 2,
      0, 3, 3, 2, 2,
      0, 5, 1, 1, 2,
      0, 5, 1, 1, 1,
    ],
    solution: [
      2, 5, 2, 3, 1,
      1, 4, 1, 4, 5,
      3, 2, 3, 2, 1,
      4, 1, 4, 5, 3,
      5, 2, 3, 1, 2,
    ],
  },
  {
    regions: [
      3, 3, 3, 0, 4,
      5, 5, 0, 0, 4,
      5, 5, 1, 0, 4,
      5, 1, 1, 0, 2,
      6, 1, 1, 2, 2,
    ],
    solution: [
      3, 2, 1, 2, 1,
      5, 4, 3, 4, 3,
      2, 1, 2, 1, 2,
      3, 5, 3, 5, 3,
      1, 4, 1, 2, 1,
    ],
  },
  {
    regions: [
      1, 3, 5, 5, 6,
      1, 3, 3, 4, 4,
      1, 3, 3, 4, 4,
      1, 2, 2, 0, 0,
      2, 2, 2, 0, 0,
    ],
    solution: [
      1, 4, 1, 2, 1,
      2, 3, 5, 4, 3,
      4, 1, 2, 1, 2,
      3, 5, 3, 4, 3,
      1, 4, 2, 1, 2,
    ],
  },
  {
    regions: [
      5, 3, 0, 0, 2,
      3, 3, 0, 2, 2,
      3, 3, 6, 2, 2,
      1, 1, 1, 4, 7,
      1, 1, 4, 4, 4,
    ],
    solution: [
      1, 5, 1, 3, 2,
      2, 3, 2, 5, 1,
      1, 4, 1, 3, 4,
      3, 2, 5, 2, 1,
      1, 4, 1, 4, 3,
    ],
  },
  {
    regions: [
      7, 2, 2, 2, 5,
      2, 2, 0, 0, 1,
      4, 6, 0, 0, 1,
      4, 3, 3, 3, 1,
      4, 3, 3, 1, 1,
    ],
    solution: [
      1, 3, 1, 5, 1,
      2, 4, 2, 4, 2,
      3, 1, 3, 1, 3,
      2, 5, 4, 2, 4,
      1, 3, 1, 5, 1,
    ],
  },
  {
    regions: [
      4, 4, 1, 1, 1,
      4, 4, 1, 1, 2,
      3, 3, 2, 2, 2,
      3, 3, 6, 2, 0,
      5, 0, 0, 0, 0,
    ],
    solution: [
      4, 1, 2, 3, 1,
      2, 3, 5, 4, 5,
      1, 4, 2, 3, 1,
      2, 3, 1, 4, 5,
      1, 4, 2, 3, 1,
    ],
  },
];
const RECENT_LAYOUT_MEMORY = 3;
const recentLayoutIndices: number[] = [];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseBaseLayout(): { regions: number[]; solution: number[] } {
  const availableIndices = BASE_LAYOUTS
    .map((_, index) => index)
    .filter((index) => !recentLayoutIndices.includes(index));
  const selectedIndex = randomChoice(availableIndices.length > 0 ? availableIndices : BASE_LAYOUTS.map((_, index) => index));

  recentLayoutIndices.push(selectedIndex);

  if (recentLayoutIndices.length > RECENT_LAYOUT_MEMORY) {
    recentLayoutIndices.shift();
  }

  return BASE_LAYOUTS[selectedIndex];
}

function rotateSquareGrid<T>(cells: T[], width: number): T[] {
  const rotated = Array<T>(cells.length);

  for (let index = 0; index < cells.length; index += 1) {
    const { row, column } = getCellPosition(width, index);
    const nextRow = column;
    const nextColumn = width - 1 - row;
    rotated[getCellIndex(width, nextRow, nextColumn)] = cells[index];
  }

  return rotated;
}

function reflectSquareGrid<T>(cells: T[], width: number): T[] {
  const reflected = Array<T>(cells.length);

  for (let index = 0; index < cells.length; index += 1) {
    const { row, column } = getCellPosition(width, index);
    const nextColumn = width - 1 - column;
    reflected[getCellIndex(width, row, nextColumn)] = cells[index];
  }

  return reflected;
}

function transformBoard(values: number[], regions: number[], width: number): { values: number[]; regions: number[] } {
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

    if (cells.length < 1 || cells.length > MAX_REGION_SIZE) {
      throw new Error(`Region ${regionId} is outside the allowed 1-5 size range.`);
    }
  }
}

function createGivens(puzzle: Puzzle, solution: number[]): BoardValues {
  const givens: BoardValues = [...solution];
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

export function createPuzzleWithSolution({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}): PuzzleWithSolution {
  if (width !== DEFAULT_WIDTH || height !== DEFAULT_HEIGHT) {
    throw new Error('This MVP generator currently supports only 5x5 boards.');
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const baseLayout = chooseBaseLayout();
    const transformed = transformBoard(baseLayout.solution, baseLayout.regions, width);
    const puzzle = {
      width,
      height,
      regions: transformed.regions,
      givens: [],
    } satisfies Puzzle;

    assertRegionsAreOrthogonallyConnected(puzzle);

    const givens = createGivens(puzzle, transformed.values);

    if (countSolutions(puzzle, givens, 2) !== 1) {
      continue;
    }

    return {
      puzzle: {
        ...puzzle,
        givens,
      },
      solution: transformed.values,
    };
  }

  throw new Error('Failed to generate a unique-solution puzzle.');
}

export function createPuzzle(options = {}): Puzzle {
  return createPuzzleWithSolution(options).puzzle;
}
