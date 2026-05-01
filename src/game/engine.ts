import {
  addGarbageLines,
  attackForLines,
  clearFullLines,
  createInitialBoardState,
  hardDrop,
  isValidPosition,
  lockPiece,
  movePiece,
  rotatePiece,
  scoreForLines,
  spawnPiece,
} from './board';
import type { PieceRandomizer } from './random';
import { getPieceCells } from './tetrominoes';
import type { AudioEvent, BoardState, MotionKind, PlayerAction, Point, Tetromino } from './types';

export interface StepResult {
  state: BoardState;
  attack: number;
  audioEvents: AudioEvent[];
}

export function createPlayerState(randomizer: PieceRandomizer): BoardState {
  return createInitialBoardState(randomizer.next(), randomizer.next());
}

function nextMotion(state: BoardState, kind: MotionKind) {
  return {
    kind,
    id: (state.motion?.id ?? 0) + 1,
  };
}

function samePiece(a: Tetromino, b: Tetromino): boolean {
  return a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.type === b.type;
}

function landedCellsAfterClear(cells: Point[], board: BoardState['board']): Point[] {
  const fullRows = new Set(
    board
      .map((row, index) => (row.every((cell) => cell !== null) ? index : -1))
      .filter((index) => index >= 0),
  );

  return cells
    .filter((cell) => cell.y >= 0 && !fullRows.has(cell.y))
    .map((cell) => ({
      x: cell.x,
      y: cell.y + [...fullRows].filter((row) => row > cell.y).length,
    }))
    .filter((cell) => cell.y >= 0);
}

function finishLock(state: BoardState, lockedPiece: Tetromino, randomizer: PieceRandomizer): StepResult {
  const locked = lockPiece(state.board, lockedPiece);
  const lockedCells = landedCellsAfterClear(getPieceCells(lockedPiece), locked.board);
  const cleared = clearFullLines(locked.board);
  const attack = attackForLines(cleared.lines);
  const current = spawnPiece(state.next);
  const next = randomizer.next();
  const lost = locked.overflow || !isValidPosition(cleared.board, current);
  const lastEvent = lost ? 'lose' : attack > 0 ? 'attack' : cleared.lines > 0 ? 'clear' : 'land';
  const audioEvents: AudioEvent[] = ['land'];

  if (cleared.lines > 0) {
    audioEvents.push(`clear${Math.min(cleared.lines, 4)}` as AudioEvent);
  }

  if (attack > 0) {
    audioEvents.push('attack');
  }

  if (lost) {
    audioEvents.push('lose');
  }

  return {
    state: {
      ...state,
      board: cleared.board,
      current,
      next,
      score: state.score + scoreForLines(cleared.lines),
      lines: state.lines + cleared.lines,
      attacks: state.attacks + attack,
      lost,
      lastEvent,
      motion: nextMotion(state, 'land'),
      landedCells: lockedCells,
    },
    attack,
    audioEvents,
  };
}

export function tickPlayer(state: BoardState, randomizer: PieceRandomizer): StepResult {
  if (state.lost) {
    return { state, attack: 0, audioEvents: [] };
  }

  const moved = { ...state.current, y: state.current.y + 1 };

  if (isValidPosition(state.board, moved)) {
    return {
      state: { ...state, current: moved, lastEvent: 'idle', landedCells: [] },
      attack: 0,
      audioEvents: [],
    };
  }

  return finishLock(state, state.current, randomizer);
}

export function performAction(
  state: BoardState,
  action: PlayerAction,
  randomizer: PieceRandomizer,
): StepResult {
  if (state.lost) {
    return { state, attack: 0, audioEvents: [] };
  }

  if (action === 'left') {
    const current = movePiece(state.board, state.current, -1, 0);
    return {
      state: {
        ...state,
        current,
        lastEvent: samePiece(current, state.current) ? 'idle' : 'move',
        motion: samePiece(current, state.current) ? state.motion : nextMotion(state, 'left'),
        landedCells: [],
      },
      attack: 0,
      audioEvents: samePiece(current, state.current) ? [] : ['moveLeft'],
    };
  }

  if (action === 'right') {
    const current = movePiece(state.board, state.current, 1, 0);
    return {
      state: {
        ...state,
        current,
        lastEvent: samePiece(current, state.current) ? 'idle' : 'move',
        motion: samePiece(current, state.current) ? state.motion : nextMotion(state, 'right'),
        landedCells: [],
      },
      attack: 0,
      audioEvents: samePiece(current, state.current) ? [] : ['moveRight'],
    };
  }

  if (action === 'rotate') {
    const current = rotatePiece(state.board, state.current);
    return {
      state: {
        ...state,
        current,
        lastEvent: samePiece(current, state.current) ? 'idle' : 'rotate',
        motion: samePiece(current, state.current) ? state.motion : nextMotion(state, 'rotate'),
        landedCells: [],
      },
      attack: 0,
      audioEvents: samePiece(current, state.current) ? [] : ['rotate'],
    };
  }

  if (action === 'softDrop') {
    const result = tickPlayer(state, randomizer);
    if (result.state.current.y !== state.current.y && result.state.lastEvent === 'idle') {
      return {
        ...result,
        state: {
          ...result.state,
          lastEvent: 'softDrop',
          motion: nextMotion(state, 'softDrop'),
          landedCells: [],
        },
        audioEvents: ['softDrop'],
      };
    }

    return result;
  }

  const result = finishLock({ ...state, motion: nextMotion(state, 'hardDrop') }, hardDrop(state.board, state.current), randomizer);
  return {
    ...result,
    audioEvents: ['hardDrop', ...result.audioEvents],
  };
}

export function receiveGarbage(
  state: BoardState,
  lines: number,
  random: () => number = Math.random,
): BoardState {
  if (state.lost || lines <= 0) {
    return state;
  }

  const withGarbage = addGarbageLines(state.board, lines, random);
  const lost = withGarbage.overflow || !isValidPosition(withGarbage.board, state.current);

  return {
    ...state,
    board: withGarbage.board,
    lost,
    lastEvent: lost ? 'lose' : 'garbage',
    landedCells: [],
  };
}
