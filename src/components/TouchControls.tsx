import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { PlayerAction } from '../game/types';
import type { PlayerId } from '../hooks/useBattleGame';
import type { Translation } from '../i18n';

export type TouchLayout = 'full' | 'splitCompact';

interface TouchControlsProps {
  playerId: PlayerId;
  labels: Translation;
  layout?: TouchLayout;
  softDropOnHold?: boolean;
  onAction: (playerId: PlayerId, action: PlayerAction) => void;
}

interface TouchButton {
  action: PlayerAction;
  label: string;
  title: string;
  group: 'move' | 'action';
}

const HOLD_DELAY_MS = 240;
const SOFT_DROP_REPEAT_MS = 95;

export function TouchControls({
  playerId,
  labels,
  layout = 'full',
  softDropOnHold = false,
  onAction,
}: TouchControlsProps) {
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const didHoldRef = useRef(false);

  const buttons: TouchButton[] =
    layout === 'splitCompact'
      ? [
          { action: 'left', label: '<', title: labels.moveLeft, group: 'move' },
          { action: 'right', label: '>', title: labels.moveRight, group: 'move' },
          { action: 'rotate', label: '\u21bb', title: labels.rotate, group: 'action' },
          { action: 'hardDrop', label: '\u21e3', title: labels.hardDrop, group: 'action' },
        ]
      : [
          { action: 'left', label: '<', title: labels.moveLeft, group: 'move' },
          { action: 'rotate', label: '\u21bb', title: labels.rotate, group: 'action' },
          { action: 'right', label: '>', title: labels.moveRight, group: 'move' },
          { action: 'softDrop', label: 'v', title: labels.softDrop, group: 'action' },
          { action: 'hardDrop', label: '\u21e3', title: labels.hardDrop, group: 'action' },
        ];

  const clearHoldTimers = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => clearHoldTimers, []);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, action: PlayerAction) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (action !== 'hardDrop' || !softDropOnHold) {
      onAction(playerId, action);
      return;
    }

    clearHoldTimers();
    didHoldRef.current = false;
    holdTimeoutRef.current = window.setTimeout(() => {
      didHoldRef.current = true;
      onAction(playerId, 'softDrop');
      holdIntervalRef.current = window.setInterval(() => {
        onAction(playerId, 'softDrop');
      }, SOFT_DROP_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const handlePointerUp = (action: PlayerAction) => {
    const shouldHardDrop = action === 'hardDrop' && softDropOnHold && !didHoldRef.current;
    clearHoldTimers();

    if (shouldHardDrop) {
      onAction(playerId, 'hardDrop');
    }
  };

  return (
    <div className={`touch-controls touch-controls-${layout}`} aria-label={labels.touchControls}>
      {buttons.map((button) => (
        <button
          className={`touch-button touch-button-${button.action} touch-button-${button.group}`}
          key={button.action}
          title={button.title}
          type="button"
          onPointerCancel={() => clearHoldTimers()}
          onPointerDown={(event) => handlePointerDown(event, button.action)}
          onPointerLeave={() => clearHoldTimers()}
          onPointerUp={() => handlePointerUp(button.action)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
