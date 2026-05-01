import type { CSSProperties } from 'react';
import { BLOCK_ASSETS, BOARD_HEIGHT, BOARD_WIDTH, PIECE_COLORS } from '../game/constants';
import { getPieceCells } from '../game/tetrominoes';
import type { BoardState, Cell, TetrominoType } from '../game/types';

interface GameBoardProps {
  player: BoardState;
}

export function GameBoard({ player }: GameBoardProps) {
  const activeCells = new Set<string>();
  const landedCells = new Set(player.landedCells.map((cell) => `${cell.x}-${cell.y}`));

  for (const { x, y } of getPieceCells(player.current)) {
    if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      activeCells.add(`${x}-${y}`);
    }
  }

  return (
    <div className={`board ${player.lastEvent !== 'idle' ? `is-${player.lastEvent}` : ''}`} aria-label="Tetris board">
      {player.board.flatMap((row, rowIndex) =>
        row.map((boardCell, columnIndex) => {
          const positionKey = `${columnIndex}-${rowIndex}`;
          const isActive = activeCells.has(positionKey);
          const isLanded = landedCells.has(positionKey);
          const cell = isActive ? player.current.type : boardCell;
          const motionClass = isActive && player.motion ? `motion-${player.motion.kind}` : '';
          const animationKey = [
            rowIndex,
            columnIndex,
            isActive ? player.motion?.id ?? 0 : isLanded ? player.motion?.id ?? 'landed' : 'fixed',
          ].join('-');

          return (
            <div
              className={[
                'cell',
                cell ? 'cell-filled' : '',
                cell === 'garbage' ? 'cell-garbage' : '',
                isActive ? 'cell-active' : '',
                isLanded ? 'cell-landed' : '',
                motionClass,
              ]
                .filter(Boolean)
                .join(' ')}
              key={animationKey}
              style={cell ? cellStyle(cell) : undefined}
            />
          );
        }),
      )}
    </div>
  );
}

function cellStyle(cell: NonNullable<Cell>) {
  const color = PIECE_COLORS[cell];
  return {
    '--cell-color': color,
    '--cell-image': cell === 'garbage' ? 'none' : `url("${BLOCK_ASSETS[cell as TetrominoType]}")`,
  } as CSSProperties;
}
