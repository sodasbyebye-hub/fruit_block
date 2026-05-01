import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, BOARD_WIDTH } from './constants';
import {
  addGarbageLines,
  clearFullLines,
  createEmptyBoard,
  hardDrop,
  isValidPosition,
  lockPiece,
  movePiece,
  rotatePiece,
  spawnPiece,
} from './board';
import type { Cell } from './types';

describe('board rules', () => {
  it('keeps pieces inside walls and the floor', () => {
    const board = createEmptyBoard();
    let piece = spawnPiece('O');

    piece = movePiece(board, piece, -99, 0);
    expect(piece.x).toBe(3);

    const dropped = hardDrop(board, piece);
    expect(isValidPosition(board, { ...dropped, y: dropped.y + 1 })).toBe(false);
  });

  it('rotates a piece when space is available', () => {
    const board = createEmptyBoard();
    const piece = spawnPiece('T');
    const rotated = rotatePiece(board, piece);

    expect(rotated.rotation).toBe(1);
  });

  it('locks a piece into the board', () => {
    const board = createEmptyBoard();
    const piece = hardDrop(board, spawnPiece('O'));
    const locked = lockPiece(board, piece);

    expect(locked.overflow).toBe(false);
    expect(locked.board.flat().filter(Boolean)).toHaveLength(4);
  });

  it('clears full lines and adds empty rows at the top', () => {
    const board = createEmptyBoard();
    board[BOARD_HEIGHT - 1] = Array<Cell>(BOARD_WIDTH).fill('I');
    const result = clearFullLines(board);

    expect(result.lines).toBe(1);
    expect(result.board[0].every((cell) => cell === null)).toBe(true);
    expect(result.board[BOARD_HEIGHT - 1].every((cell) => cell === null)).toBe(true);
  });

  it('adds garbage rows with one hole and reports overflow', () => {
    const board = createEmptyBoard();
    board[0][0] = 'T';
    const result = addGarbageLines(board, 1, () => 0.4);
    const bottom = result.board[BOARD_HEIGHT - 1];

    expect(result.overflow).toBe(true);
    expect(bottom.filter((cell) => cell === null)).toHaveLength(1);
    expect(bottom.filter((cell) => cell === 'garbage')).toHaveLength(BOARD_WIDTH - 1);
  });
});
