import { describe, expect, it } from 'vitest';
import { BOARD_HEIGHT, BOARD_WIDTH } from './constants';
import { createEmptyBoard, createInitialBoardState } from './board';
import { performAction, tickPlayer } from './engine';
import type { Cell, TetrominoType } from './types';

function randomizer(sequence: TetrominoType[] = ['O', 'I', 'T', 'S']) {
  let index = 0;
  return {
    next() {
      const piece = sequence[index % sequence.length];
      index += 1;
      return piece;
    },
  };
}

describe('engine animation metadata', () => {
  it('emits repeated motion ids for player actions', () => {
    const bag = randomizer();
    const state = createInitialBoardState('O', 'I');

    const first = performAction(state, 'left', bag);
    const second = performAction(first.state, 'right', bag);
    const rotated = performAction(second.state, 'rotate', bag);
    const dropped = performAction(rotated.state, 'softDrop', bag);

    expect(first.state.motion).toMatchObject({ kind: 'left', id: 1 });
    expect(second.state.motion).toMatchObject({ kind: 'right', id: 2 });
    expect(rotated.state.motion).toMatchObject({ kind: 'rotate', id: 3 });
    expect(dropped.state.motion).toMatchObject({ kind: 'softDrop', id: 4 });
    expect(first.audioEvents).toEqual(['moveLeft']);
    expect(second.audioEvents).toEqual(['moveRight']);
    expect(rotated.audioEvents).toEqual(['rotate']);
    expect(dropped.audioEvents).toEqual(['softDrop']);
  });

  it('marks landed cells when hard dropping a piece', () => {
    const result = performAction(createInitialBoardState('O', 'I'), 'hardDrop', randomizer());

    expect(result.state.lastEvent).toBe('land');
    expect(result.state.motion?.kind).toBe('land');
    expect(result.state.landedCells).toHaveLength(4);
    expect(result.state.landedCells.every((cell) => cell.y >= 0 && cell.y < BOARD_HEIGHT)).toBe(true);
    expect(result.audioEvents).toEqual(['hardDrop', 'land']);
  });

  it('marks a natural lock as landed on gravity tick', () => {
    const state = createInitialBoardState('O', 'I');
    state.current.y = BOARD_HEIGHT - 2;
    const result = tickPlayer(state, randomizer());

    expect(result.state.lastEvent).toBe('land');
    expect(result.state.landedCells).toHaveLength(4);
    expect(result.audioEvents).toEqual(['land']);
  });

  it('keeps landed cells in bounds after a line clear', () => {
    const state = createInitialBoardState('O', 'I');
    const board = createEmptyBoard();
    board[BOARD_HEIGHT - 1] = Array<Cell>(BOARD_WIDTH).fill('T');
    board[BOARD_HEIGHT - 1][4] = null;
    board[BOARD_HEIGHT - 1][5] = null;
    state.board = board;

    const result = performAction(state, 'hardDrop', randomizer());

    expect(result.state.lastEvent).toBe('clear');
    expect(result.state.landedCells.length).toBeGreaterThan(0);
    expect(result.state.landedCells.every((cell) => cell.y >= 0 && cell.y < BOARD_HEIGHT)).toBe(true);
    expect(result.audioEvents).toContain('hardDrop');
    expect(result.audioEvents).toContain('land');
    expect(result.audioEvents).toContain('clear1');
  });

  it('emits stronger clear and attack audio for multi-line clears', () => {
    const state = createInitialBoardState('I', 'O');
    const board = createEmptyBoard();

    for (let row = BOARD_HEIGHT - 4; row < BOARD_HEIGHT; row += 1) {
      board[row] = Array<Cell>(BOARD_WIDTH).fill('T');
      board[row][5] = null;
    }

    state.board = board;
    state.current = { type: 'I', rotation: 1, x: 3, y: BOARD_HEIGHT - 6 };
    const result = performAction(state, 'hardDrop', randomizer());

    expect(result.state.lastEvent).toBe('attack');
    expect(result.attack).toBe(4);
    expect(result.audioEvents).toEqual(['hardDrop', 'land', 'clear4', 'attack']);
  });
});
