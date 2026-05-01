import { ATTACK_BY_LINES, BOARD_HEIGHT, BOARD_WIDTH, SCORE_BY_LINES, SPAWN_X, SPAWN_Y } from './constants';
import { getPieceCells } from './tetrominoes';
import type { BoardState, Cell, ClearResult, LockResult, Matrix, Tetromino, TetrominoType } from './types';

export function createEmptyBoard(): Matrix {
  return Array.from({ length: BOARD_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));
}

export function cloneBoard(board: Matrix): Matrix {
  return board.map((row) => [...row]);
}

export function spawnPiece(type: TetrominoType): Tetromino {
  return { type, rotation: 0, x: SPAWN_X, y: SPAWN_Y };
}

export function isValidPosition(board: Matrix, piece: Tetromino): boolean {
  return getPieceCells(piece).every(({ x, y }) => {
    if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) {
      return false;
    }

    if (y < 0) {
      return true;
    }

    return board[y][x] === null;
  });
}

export function movePiece(board: Matrix, piece: Tetromino, dx: number, dy: number): Tetromino {
  const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return isValidPosition(board, moved) ? moved : piece;
}

export function rotatePiece(board: Matrix, piece: Tetromino): Tetromino {
  const rotated = { ...piece, rotation: piece.rotation + 1 };
  const wallKicks = [0, -1, 1, -2, 2];

  for (const kick of wallKicks) {
    const candidate = { ...rotated, x: rotated.x + kick };
    if (isValidPosition(board, candidate)) {
      return candidate;
    }
  }

  return piece;
}

export function hardDrop(board: Matrix, piece: Tetromino): Tetromino {
  let dropped = piece;
  let next = { ...dropped, y: dropped.y + 1 };

  while (isValidPosition(board, next)) {
    dropped = next;
    next = { ...dropped, y: dropped.y + 1 };
  }

  return dropped;
}

export function lockPiece(board: Matrix, piece: Tetromino): LockResult {
  const nextBoard = cloneBoard(board);
  let overflow = false;

  for (const { x, y } of getPieceCells(piece)) {
    if (y < 0) {
      overflow = true;
      continue;
    }

    nextBoard[y][x] = piece.type;
  }

  return { board: nextBoard, overflow };
}

export function clearFullLines(board: Matrix): ClearResult {
  const remainingRows = board.filter((row) => row.some((cell) => cell === null));
  const lines = BOARD_HEIGHT - remainingRows.length;
  const emptyRows = Array.from({ length: lines }, () => Array<Cell>(BOARD_WIDTH).fill(null));

  return {
    board: [...emptyRows, ...remainingRows],
    lines,
  };
}

export function addGarbageLines(board: Matrix, count: number, random: () => number = Math.random): LockResult {
  if (count <= 0) {
    return { board: cloneBoard(board), overflow: false };
  }

  const nextBoard = cloneBoard(board);
  let overflow = false;

  for (let index = 0; index < count; index += 1) {
    const removed = nextBoard.shift();
    if (removed?.some((cell) => cell !== null)) {
      overflow = true;
    }

    const hole = Math.floor(random() * BOARD_WIDTH);
    nextBoard.push(
      Array.from({ length: BOARD_WIDTH }, (_, column) => (column === hole ? null : 'garbage')),
    );
  }

  return { board: nextBoard, overflow };
}

export function createInitialBoardState(current: TetrominoType, next: TetrominoType): BoardState {
  return {
    board: createEmptyBoard(),
    current: spawnPiece(current),
    next,
    score: 0,
    lines: 0,
    attacks: 0,
    lost: false,
    lastEvent: 'idle',
    motion: null,
    landedCells: [],
  };
}

export function scoreForLines(lines: number): number {
  return SCORE_BY_LINES[lines] ?? lines * 300;
}

export function attackForLines(lines: number): number {
  return ATTACK_BY_LINES[lines] ?? 0;
}
