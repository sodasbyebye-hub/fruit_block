export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Cell = TetrominoType | 'garbage' | null;
export type Matrix = Cell[][];

export interface Point {
  x: number;
  y: number;
}

export interface Tetromino {
  type: TetrominoType;
  rotation: number;
  x: number;
  y: number;
}

export interface LockResult {
  board: Matrix;
  overflow: boolean;
}

export interface ClearResult {
  board: Matrix;
  lines: number;
}

export type PlayerAction = 'left' | 'right' | 'rotate' | 'softDrop' | 'hardDrop';
export type MotionKind = 'left' | 'right' | 'rotate' | 'softDrop' | 'hardDrop' | 'land';
export type BoardEvent = 'idle' | 'move' | 'rotate' | 'softDrop' | 'land' | 'clear' | 'attack' | 'garbage' | 'lose';
export type AudioEvent =
  | 'moveLeft'
  | 'moveRight'
  | 'rotate'
  | 'softDrop'
  | 'hardDrop'
  | 'land'
  | 'clear1'
  | 'clear2'
  | 'clear3'
  | 'clear4'
  | 'attack'
  | 'garbageReceived'
  | 'lose'
  | 'start'
  | 'pause'
  | 'resume'
  | 'reset';

export interface MotionState {
  kind: MotionKind;
  id: number;
}

export interface BoardState {
  board: Matrix;
  current: Tetromino;
  next: TetrominoType;
  score: number;
  lines: number;
  attacks: number;
  lost: boolean;
  lastEvent: BoardEvent;
  motion: MotionState | null;
  landedCells: Point[];
}
