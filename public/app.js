import { getRegionSizes, validateBoard } from '/shared/validate.js';

const boardElement = document.querySelector('#board');
const statusElement = document.querySelector('#status');
const newGameButton = document.querySelector('#new-game');
const resetButton = document.querySelector('#reset-game');

let puzzle = null;
let values = [];
let selectedIndex = null;

function getRegionPalette(regionCount) {
  return Array.from({ length: regionCount }, (_, index) => {
    const hue = Math.round((index * 360) / Math.max(regionCount, 1));

    return `hsl(${hue} 42% 87%)`;
  });
}

function getNeighborIndex(index, rowOffset, columnOffset) {
  const row = Math.floor(index / puzzle.width);
  const column = index % puzzle.width;
  const nextRow = row + rowOffset;
  const nextColumn = column + columnOffset;

  if (
    nextRow < 0 ||
    nextRow >= puzzle.height ||
    nextColumn < 0 ||
    nextColumn >= puzzle.width
  ) {
    return null;
  }

  return nextRow * puzzle.width + nextColumn;
}

function getRegionBorderWidth(index, rowOffset, columnOffset) {
  const neighborIndex = getNeighborIndex(index, rowOffset, columnOffset);

  if (neighborIndex === null) {
    return 3;
  }

  return puzzle.regions[index] === puzzle.regions[neighborIndex] ? 1 : 3;
}

function getCellLabel(index, regionSizes) {
  const given = puzzle.givens[index];
  const value = values[index];
  const regionSize = regionSizes[puzzle.regions[index]];
  const displayValue = value ?? 'empty';
  const clue = given !== null ? ', given clue' : '';

  return `Cell ${index + 1}, region size ${regionSize}, value ${displayValue}${clue}`;
}

function updateStatus(result) {
  if (result.solved) {
    statusElement.textContent = 'Solved. Every region is complete and no matching numbers touch.';
    return;
  }

  if (result.conflicts.size > 0) {
    statusElement.textContent = 'There is a rule conflict on the board.';
    return;
  }

  const filledCount = values.filter((value) => value !== null).length;
  statusElement.textContent = `Puzzle in progress: ${filledCount}/${values.length} cells filled.`;
}

function renderBoard() {
  const result = validateBoard(puzzle, values);
  const regionSizes = getRegionSizes(puzzle);
  const regionCount = Math.max(...puzzle.regions) + 1;
  const regionPalette = getRegionPalette(regionCount);

  boardElement.innerHTML = '';
  boardElement.style.gridTemplateColumns = `repeat(${puzzle.width}, minmax(0, 1fr))`;

  for (let index = 0; index < values.length; index += 1) {
    const cell = document.createElement('button');
    const row = Math.floor(index / puzzle.width);
    const column = index % puzzle.width;
    const value = values[index];
    const given = puzzle.givens[index];
    const regionId = puzzle.regions[index];
    const isSelected = selectedIndex === index;

    cell.type = 'button';
    cell.className = 'cell';
    cell.textContent = value ?? '';
    cell.disabled = given !== null;
    cell.ariaLabel = getCellLabel(index, regionSizes);
    cell.style.setProperty('--region-color', regionPalette[regionId]);
    cell.style.borderTopWidth = `${getRegionBorderWidth(index, -1, 0)}px`;
    cell.style.borderBottomWidth = `${getRegionBorderWidth(index, 1, 0)}px`;
    cell.style.borderLeftWidth = `${getRegionBorderWidth(index, 0, -1)}px`;
    cell.style.borderRightWidth = `${getRegionBorderWidth(index, 0, 1)}px`;

    if (column === 0) {
      cell.style.borderLeftWidth = '3px';
    }

    if (column === puzzle.width - 1) {
      cell.style.borderRightWidth = '3px';
    }

    if (row === 0) {
      cell.style.borderTopWidth = '3px';
    }

    if (row === puzzle.height - 1) {
      cell.style.borderBottomWidth = '3px';
    }

    if (given !== null) {
      cell.classList.add('given');
    }

    if (result.conflicts.has(index)) {
      cell.classList.add('invalid');
    }

    if (result.completedRegions.has(regionId)) {
      cell.classList.add('region-complete');
    }

    if (isSelected) {
      cell.classList.add('selected');
    }

    cell.addEventListener('click', () => {
      if (given !== null) {
        return;
      }

      selectedIndex = index;
      cycleCellValue(index);
    });

    boardElement.append(cell);
  }

  updateStatus(result);
}

function cycleCellValue(index) {
  const regionSizes = getRegionSizes(puzzle);
  const maxValue = regionSizes[puzzle.regions[index]];
  const currentValue = values[index] ?? 0;
  const nextValue = currentValue >= maxValue ? null : currentValue + 1;

  values[index] = nextValue;
  renderBoard();
}

function setSelectedCellValue(value) {
  if (selectedIndex === null || puzzle.givens[selectedIndex] !== null) {
    return;
  }

  const regionSizes = getRegionSizes(puzzle);
  const maxValue = regionSizes[puzzle.regions[selectedIndex]];

  if (value === null) {
    values[selectedIndex] = null;
    renderBoard();
    return;
  }

  if (value >= 1 && value <= maxValue) {
    values[selectedIndex] = value;
    renderBoard();
  }
}

async function loadPuzzle() {
  statusElement.textContent = 'Loading puzzle…';

  const response = await fetch('/api/puzzle');

  if (!response.ok) {
    throw new Error('Could not load a puzzle.');
  }

  puzzle = await response.json();
  values = [...puzzle.givens];
  selectedIndex = null;
  renderBoard();
}

document.addEventListener('keydown', (event) => {
  if (!puzzle) {
    return;
  }

  if (event.key >= '1' && event.key <= '9') {
    setSelectedCellValue(Number(event.key));
    return;
  }

  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
    setSelectedCellValue(null);
  }
});

newGameButton.addEventListener('click', async () => {
  await loadPuzzle();
});

resetButton.addEventListener('click', () => {
  if (!puzzle) {
    return;
  }

  values = [...puzzle.givens];
  selectedIndex = null;
  renderBoard();
});

loadPuzzle().catch((error) => {
  console.error(error);
  statusElement.textContent = 'Failed to load the puzzle.';
});
