import type { BoardValues, MatchSession, Puzzle, ValidationResult } from '../shared/api.js';
import { getCellPosition, getRegionSizes } from '../shared/validate.js';

export function getRegionPalette(regionCount: number): string[] {
  return Array.from({ length: regionCount }, (_, index) => {
    const hue = Math.round((index * 360) / Math.max(regionCount, 1));
    return `hsl(${hue} 42% 87%)`;
  });
}

export function getNeighborIndex(puzzle: Puzzle, index: number, rowOffset: number, columnOffset: number): number | null {
  const { row, column } = getCellPosition(puzzle.width, index);
  const nextRow = row + rowOffset;
  const nextColumn = column + columnOffset;

  if (nextRow < 0 || nextRow >= puzzle.height || nextColumn < 0 || nextColumn >= puzzle.width) {
    return null;
  }

  return nextRow * puzzle.width + nextColumn;
}

export function getRegionBorderWidth(puzzle: Puzzle, index: number, rowOffset: number, columnOffset: number): number {
  const neighborIndex = getNeighborIndex(puzzle, index, rowOffset, columnOffset);

  if (neighborIndex === null) {
    return 3;
  }

  return puzzle.regions[index] === puzzle.regions[neighborIndex] ? 1 : 3;
}

export function getCellLabel(puzzle: Puzzle, values: BoardValues, index: number): string {
  const regionSizes = getRegionSizes(puzzle);
  const given = puzzle.givens[index];
  const value = values[index];
  const regionSize = regionSizes[puzzle.regions[index]];
  const displayValue = value ?? 'empty';
  const clue = given !== null ? ', given clue' : '';

  return `Cell ${index + 1}, region size ${regionSize}, value ${displayValue}${clue}`;
}

export function getFilledCount(values: BoardValues): number {
  return values.filter((value) => value !== null).length;
}

export function getScoredFilledCount(values: BoardValues, result: ValidationResult): number {
  let filledCount = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && !result.conflicts.has(index)) {
      filledCount += 1;
    }
  }

  return filledCount;
}

export function getLocalPlayerState(matchSession: MatchSession | null) {
  return matchSession?.match.players.find((player) => player.role === matchSession.role) ?? null;
}

export function getOpponentPlayerState(matchSession: MatchSession | null) {
  return matchSession?.match.players.find((player) => player.role !== matchSession.role && player.joined) ?? null;
}
