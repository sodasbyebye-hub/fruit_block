import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { GameBoard } from './GameBoard';
import { NextPreview } from './NextPreview';
import { TouchControls, type TouchLayout } from './TouchControls';
import type { PlayerAction } from '../game/types';
import type { PlayerId, PlayerView } from '../hooks/useBattleGame';
import type { Translation } from '../i18n';

interface PlayerPanelProps {
  player: PlayerView;
  accent: 'pink' | 'blue';
  labels: Translation;
  size?: 'normal' | 'large' | 'small';
  badge?: string;
  touchLayout?: TouchLayout;
  boardGestures?: boolean;
  onAction: (playerId: PlayerId, action: PlayerAction) => void;
}

const BOARD_SWIPE_THRESHOLD = 32;

export function PlayerPanel({
  player,
  accent,
  labels,
  size = 'normal',
  badge,
  touchLayout = 'full',
  boardGestures = false,
  onAction,
}: PlayerPanelProps) {
  const playerName = player.id === 'p1' ? labels.player1 : labels.player2;
  const boardGestureStart = useRef<{ x: number; y: number } | null>(null);

  const handleBoardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!boardGestures) {
      return;
    }

    boardGestureStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBoardPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!boardGestures || !boardGestureStart.current) {
      return;
    }

    const deltaX = event.clientX - boardGestureStart.current.x;
    const deltaY = event.clientY - boardGestureStart.current.y;
    boardGestureStart.current = null;

    if (deltaY > BOARD_SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX) * 1.25) {
      onAction(player.id, 'softDrop');
    }
  };

  return (
    <section className={`player-panel player-${accent} player-${size} ${player.lost ? 'is-lost' : ''}`}>
      <header className="player-header">
        <div>
          <p className="eyebrow">{player.id === 'p1' ? labels.p1Controls : labels.p2Controls}</p>
          <h2>{badge ? `${badge} · ${playerName}` : playerName}</h2>
        </div>
        <div className="score-bubble">
          <span>{player.score}</span>
          {labels.scoreUnit}
        </div>
      </header>

      <div className="player-content">
        <div
          className={`board-gesture-zone ${boardGestures ? 'has-gestures' : ''}`}
          onPointerCancel={() => {
            boardGestureStart.current = null;
          }}
          onPointerDown={handleBoardPointerDown}
          onPointerUp={handleBoardPointerUp}
        >
          <GameBoard player={player} />
        </div>
        <aside className="side-stats">
          <div className="stat-block">
            <span>{labels.next}</span>
            <NextPreview type={player.next} label={labels.next} />
          </div>
          <div className="stat-block compact">
            <span>{labels.lines}</span>
            <strong>{player.lines}</strong>
          </div>
          <div className="stat-block compact">
            <span>{labels.attack}</span>
            <strong>{player.attacks}</strong>
          </div>
        </aside>
      </div>

      <TouchControls
        playerId={player.id}
        labels={labels}
        layout={touchLayout}
        softDropOnHold={touchLayout === 'splitCompact'}
        onAction={onAction}
      />
    </section>
  );
}
