import type { Translation } from '../i18n';
import type { GameStatus, PlayerId } from '../hooks/useBattleGame';

interface GameToolbarProps {
  status: GameStatus;
  winner: PlayerId | null;
  labels: Translation;
  settingsOpen: boolean;
  canControl?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onToggleSettings: () => void;
}

export function GameToolbar({
  status,
  winner,
  labels,
  settingsOpen,
  canControl = true,
  onStart,
  onPause,
  onResume,
  onReset,
  onToggleSettings,
}: GameToolbarProps) {
  const winnerName = winner === 'p1' ? labels.player1 : labels.player2;
  const headline =
    status === 'finished'
      ? labels.titleWin(winnerName)
      : status === 'paused'
        ? labels.titlePaused
        : status === 'playing'
          ? labels.titlePlaying
          : labels.titleReady;

  return (
    <header className="game-toolbar">
      <div className="brand-block">
        <span className="brand-mark">T</span>
        <div>
          <p className="eyebrow">{labels.brand}</p>
          <h1>{headline}</h1>
        </div>
      </div>

      <div className="toolbar-actions">
        {canControl && status === 'ready' && (
          <button className="primary-button" type="button" onClick={onStart}>
            {labels.start}
          </button>
        )}
        {canControl && status === 'playing' && (
          <button className="icon-button" title={labels.pause} type="button" onClick={onPause}>
            ||
          </button>
        )}
        {canControl && status === 'paused' && (
          <button className="primary-button" type="button" onClick={onResume}>
            {labels.resume}
          </button>
        )}
        {canControl && (
          <button className="icon-button toolbar-text-button" title={labels.restart} type="button" onClick={onReset}>
            {labels.restart}
          </button>
        )}
        <button
          className={`icon-button toolbar-text-button ${settingsOpen ? 'is-active' : ''}`}
          title={settingsOpen ? labels.closeSettings : labels.settings}
          type="button"
          onClick={onToggleSettings}
        >
          {labels.settings}
        </button>
      </div>
    </header>
  );
}
