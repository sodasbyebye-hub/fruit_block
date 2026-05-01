import type { CSSProperties } from 'react';
import { BLOCK_ASSETS, PIECE_COLORS } from '../game/constants';
import { SHAPES } from '../game/tetrominoes';
import type { TetrominoType } from '../game/types';

interface NextPreviewProps {
  type: TetrominoType;
  label: string;
}

export function NextPreview({ type, label }: NextPreviewProps) {
  const cells = SHAPES[type][0];

  return (
    <div className="next-preview" aria-label={`${label} ${type}`}>
      {Array.from({ length: 16 }, (_, index) => {
        const x = index % 4;
        const y = Math.floor(index / 4);
        const filled = cells.some((cell) => cell.x === x && cell.y === y);

        return (
          <span
            className={`preview-cell ${filled ? 'preview-cell-filled' : ''}`}
            key={index}
            style={
              filled
                ? ({
                    '--cell-color': PIECE_COLORS[type],
                    '--cell-image': `url("${BLOCK_ASSETS[type]}")`,
                  } as CSSProperties)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
