import { PIECE_TYPES } from './constants';
import type { TetrominoType } from './types';

export interface PieceRandomizer {
  next(): TetrominoType;
}

export function createSevenBagRandomizer(random: () => number = Math.random): PieceRandomizer {
  let bag: TetrominoType[] = [];

  const refill = () => {
    bag = [...PIECE_TYPES];
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
    }
  };

  return {
    next() {
      if (bag.length === 0) {
        refill();
      }

      return bag.pop()!;
    },
  };
}

export function createSeededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
