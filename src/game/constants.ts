import type { TetrominoType } from './types';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const SPAWN_X = 3;
export const SPAWN_Y = -2;
export const GRAVITY_MS = 620;

export const PIECE_TYPES: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export const PIECE_COLORS: Record<TetrominoType | 'garbage', string> = {
  I: '#62d9ff',
  J: '#8fa2ff',
  L: '#ffb15f',
  O: '#ffe66b',
  S: '#72e59a',
  T: '#d989ff',
  Z: '#ff7f9c',
  garbage: '#b7becb',
};

export const BLOCK_ASSETS: Record<TetrominoType, string> = {
  I: '/assets/blocks/block-i.png',
  J: '/assets/blocks/block-j.png',
  L: '/assets/blocks/block-l.png',
  O: '/assets/blocks/block-o.png',
  S: '/assets/blocks/block-s.png',
  T: '/assets/blocks/block-t.png',
  Z: '/assets/blocks/block-z.png',
};

export const SCORE_BY_LINES: Record<number, number> = {
  0: 0,
  1: 120,
  2: 320,
  3: 520,
  4: 900,
};

export const ATTACK_BY_LINES: Record<number, number> = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 4,
};
