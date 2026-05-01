import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { GameToolbar } from './components/GameToolbar';
import { PlayerPanel } from './components/PlayerPanel';
import { SettingsPanel } from './components/SettingsPanel';
import type { PlayerAction } from './game/types';
import { useBattleGame, type BattleState, type PlayerId } from './hooks/useBattleGame';
import { useOnlineRoom } from './hooks/useOnlineRoom';
import { useSoloGame } from './hooks/useSoloGame';
import { translations, type Language } from './i18n';

type AppScreen = 'menu' | 'game';
type AppMode = 'solo' | 'local' | 'online';

const keyMap: Record<string, { playerId: PlayerId; action: PlayerAction }> = {
  KeyA: { playerId: 'p1', action: 'left' },
  KeyD: { playerId: 'p1', action: 'right' },
  KeyW: { playerId: 'p1', action: 'rotate' },
  KeyS: { playerId: 'p1', action: 'softDrop' },
  Space: { playerId: 'p1', action: 'hardDrop' },
  ArrowLeft: { playerId: 'p2', action: 'left' },
  ArrowRight: { playerId: 'p2', action: 'right' },
  ArrowUp: { playerId: 'p2', action: 'rotate' },
  ArrowDown: { playerId: 'p2', action: 'softDrop' },
  Enter: { playerId: 'p2', action: 'hardDrop' },
};

function App() {
  const soloGame = useSoloGame();
  const localGame = useBattleGame();
  const hostGame = useBattleGame();
  const online = useOnlineRoom(hostGame);
  const [screen, setScreen] = useState<AppScreen>('menu');
  const [mode, setMode] = useState<AppMode>('local');
  const [joinCode, setJoinCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [motionLevel, setMotionLevel] = useState(100);
  const [language, setLanguage] = useState<Language>('zh');
  const labels = translations[language];
  const motionStyle = useMemo(() => createMotionStyle(motionLevel), [motionLevel]);
  const activeState =
    mode === 'solo' ? soloGame.state : mode === 'online' && online.visibleState ? online.visibleState : localGame.state;
  const activeControls =
    mode === 'solo'
      ? soloGame.controls
      : mode === 'online'
      ? { ...hostGame.controls, ...online.controls, dispatch: online.dispatch }
      : localGame.controls;
  const activeStatus = activeState.status;
  const activeWinner = activeState.winner;
  const canControl = mode === 'solo' || mode === 'local' || online.role === 'host';
  const isFocusLayout = screen === 'game' && mode === 'online' && Boolean(online.role && online.visibleState);
  const appClassName = `app-shell screen-${screen} mode-${mode} ${isFocusLayout ? 'is-focus-layout' : ''}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (screen !== 'game') {
        return;
      }

      const mapped = keyMap[event.code];
      if (!mapped) {
        return;
      }

      event.preventDefault();

      if (mode === 'online') {
        const localPlayer = online.localPlayer;
        const onlineAction = mapped.playerId === localPlayer ? mapped.action : null;
        if (onlineAction) {
          online.dispatch(onlineAction);
        }
        return;
      }

      if (mode === 'solo') {
        if (mapped.playerId === 'p1') {
          soloGame.controls.dispatch('p1', mapped.action);
        }
        return;
      }

      localGame.controls.dispatch(mapped.playerId, mapped.action);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [localGame.controls, mode, online, screen, soloGame.controls]);

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (joinCode.trim()) {
      setMode('online');
      setScreen('game');
      online.joinRoom(joinCode);
    }
  };

  const openGameMode = (nextMode: AppMode) => {
    setMode(nextMode);
    setScreen('game');
    setSettingsOpen(false);
  };

  const backToMenu = () => {
    if (activeStatus === 'playing') {
      activeControls.pause();
    }

    if (mode === 'online' && online.role) {
      online.disconnect();
    }

    setSettingsOpen(false);
    setScreen('menu');
  };

  const settingsDialog = settingsOpen && (
    <div className="settings-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={labels.settings} onClick={(event) => event.stopPropagation()}>
        <SettingsPanel
          labels={labels}
          language={language}
          effectsVolume={localGame.controls.effectsVolume}
          musicVolume={localGame.controls.musicVolume}
          motionLevel={motionLevel}
          onLanguageChange={setLanguage}
          onEffectsVolumeChange={(volume) => {
            soloGame.controls.setEffectsVolume(volume);
            localGame.controls.setEffectsVolume(volume);
            hostGame.controls.setEffectsVolume(volume);
          }}
          onMusicVolumeChange={(volume) => {
            soloGame.controls.setMusicVolume(volume);
            localGame.controls.setMusicVolume(volume);
            hostGame.controls.setMusicVolume(volume);
          }}
          onMotionLevelChange={setMotionLevel}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    </div>
  );

  return (
    <main className={appClassName} style={motionStyle}>
      {settingsDialog}

      {screen === 'menu' ? (
        <StartMenu labels={labels} onOpenMode={openGameMode} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <>
      <GameToolbar
        status={activeStatus}
        winner={activeWinner}
        labels={labels}
        canControl={canControl}
        onStart={activeControls.start}
        onPause={activeControls.pause}
        onResume={activeControls.resume}
        onReset={activeControls.reset}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onBackToMenu={backToMenu}
      />

      {mode === 'online' && (
        <section className="mode-panel" aria-label={labels.modeOnline}>
          <div className="online-room-panel">
            <button className="primary-button" type="button" onClick={online.createRoom}>
              {labels.createRoom}
            </button>
            <form className="join-form" onSubmit={handleJoin}>
              <input
                aria-label={labels.enterInvite}
                placeholder={labels.enterInvite}
                value={joinCode}
                onChange={(event) => setJoinCode(event.currentTarget.value.toUpperCase())}
              />
              <button className="primary-button" type="submit">
                {labels.joinRoom}
              </button>
            </form>
            {online.roomCode && (
              <div className="invite-card">
                <span>{labels.inviteCode}</span>
                <strong>{online.roomCode}</strong>
                <button className="copy-button" type="button" onClick={online.copyInvite}>
                  {online.copied ? labels.copied : labels.copyInvite}
                </button>
              </div>
            )}
            <div className="online-status">
              {statusLabel(online.status, labels)}
              {online.error ? ` · ${online.error === 'Peer disconnected' ? labels.disconnected : online.error}` : ''}
              {online.role === 'guest' ? ` · ${labels.hostOnly}` : ''}
            </div>
            {online.role && (
              <button className="link-button" type="button" onClick={online.disconnect}>
                {labels.leaveRoom}
              </button>
            )}
          </div>
        </section>
      )}

      {mode === 'solo' ? (
        <section className="solo-stage" aria-label={labels.soloBoardLabel}>
          <PlayerPanel
            player={soloGame.state.player}
            accent="pink"
            labels={labels}
            size="large"
            boardGestures
            onAction={soloGame.controls.dispatch}
          />
        </section>
      ) : mode === 'online' && online.role && online.visibleState ? (
        <OnlineBattleStage state={online.visibleState} localPlayer={online.localPlayer} labels={labels} onAction={online.dispatch} />
      ) : mode === 'local' ? (
        <section className="battle-stage" aria-label={labels.boardLabel}>
          <PlayerPanel player={localGame.state.players[0]} accent="pink" labels={labels} onAction={localGame.controls.dispatch} />
          <div className="versus-pill">VS</div>
          <PlayerPanel player={localGame.state.players[1]} accent="blue" labels={labels} onAction={localGame.controls.dispatch} />
        </section>
      ) : (
        <section className="online-empty-state" aria-label={labels.modeOnline}>
          <p className="eyebrow">{labels.modeOnline}</p>
          <h2>{labels.onlinePrompt}</h2>
        </section>
      )}

      <footer className="hint-bar">
        <span>{labels.doubleClear}</span>
        <span>{labels.tripleClear}</span>
        <span>{labels.tetrisClear}</span>
      </footer>
        </>
      )}
    </main>
  );
}

export default App;

function StartMenu({
  labels,
  onOpenMode,
  onOpenSettings,
}: {
  labels: typeof translations.zh;
  onOpenMode: (mode: AppMode) => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="start-menu" aria-label={labels.chooseMode}>
      <img className="start-hero-image" alt="" src="/assets/home/fruit-block-homepage.png" />
      <div className="start-menu-content">
        <img className="start-title-image" alt={labels.brand} src="/assets/home/jelly-battle-title.png" />
        <h1 className="sr-only">{labels.brand}</h1>

        <div className="start-options">
          <button className="start-option option-solo" type="button" onClick={() => onOpenMode('solo')}>
            <span>{labels.modeSolo}</span>
          </button>
          <button className="start-option option-local" type="button" onClick={() => onOpenMode('local')}>
            <span>{labels.modeLocal}</span>
          </button>
          <button className="start-option option-online" type="button" onClick={() => onOpenMode('online')}>
            <span>{labels.modeOnline}</span>
          </button>
          <button className="start-option option-settings" type="button" onClick={onOpenSettings}>
            <span>{labels.settings}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function OnlineBattleStage({
  state,
  localPlayer,
  labels,
  onAction,
}: {
  state: BattleState;
  localPlayer: PlayerId;
  labels: typeof translations.zh;
  onAction: (action: PlayerAction) => void;
}) {
  const selfIndex = localPlayer === 'p1' ? 0 : 1;
  const opponentIndex = localPlayer === 'p1' ? 1 : 0;
  const selfPlayer = state.players[selfIndex];
  const opponent = state.players[opponentIndex];

  return (
    <section className="online-battle-stage" aria-label={labels.boardLabel}>
      <PlayerPanel
        player={selfPlayer}
        accent={localPlayer === 'p1' ? 'pink' : 'blue'}
        labels={labels}
        size="large"
        badge={labels.you}
        touchLayout="splitCompact"
        boardGestures
        onAction={(_, action) => onAction(action)}
      />
      <PlayerPanel
        player={opponent}
        accent={localPlayer === 'p1' ? 'blue' : 'pink'}
        labels={labels}
        size="small"
        badge={labels.opponent}
        onAction={() => undefined}
      />
    </section>
  );
}

function statusLabel(status: string, labels: typeof translations.zh) {
  if (status === 'connecting') {
    return labels.connecting;
  }

  if (status === 'waiting') {
    return labels.waitingPeer;
  }

  if (status === 'connected') {
    return labels.connected;
  }

  return labels.modeOnline;
}

function createMotionStyle(level: number): CSSProperties {
  const factor = level / 100;
  return {
    '--jelly-slide-distance': `${8 * factor}%`,
    '--jelly-slide-left': `${-8 * factor}%`,
    '--jelly-slide-right': `${8 * factor}%`,
    '--jelly-slide-rebound-left': `${2 * factor}%`,
    '--jelly-slide-rebound-right': `${-2 * factor}%`,
    '--jelly-drop-start': `${-10 * factor}%`,
    '--jelly-drop-impact': `${4 * factor}%`,
    '--jelly-land-start': `${-14 * factor}%`,
    '--jelly-land-impact': `${7 * factor}%`,
    '--board-land-distance': `${4 * factor}px`,
    '--board-attack-distance': `${-3 * factor}px`,
    '--board-shake-left': `${-4 * factor}px`,
    '--board-shake-right': `${4 * factor}px`,
    '--jelly-rotate-start': `${-7 * factor}deg`,
    '--jelly-rotate-peak': `${9 * factor}deg`,
    '--jelly-rotate-settle': `${-2 * factor}deg`,
    '--jelly-slide-squash-x': `${1 - 0.14 * factor}`,
    '--jelly-slide-stretch-y': `${1 + 0.12 * factor}`,
    '--jelly-slide-stretch-x': `${1 + 0.12 * factor}`,
    '--jelly-slide-squash-y': `${1 - 0.1 * factor}`,
    '--jelly-settle-x': `${1 - 0.04 * factor}`,
    '--jelly-settle-y': `${1 + 0.04 * factor}`,
    '--jelly-rotate-squash-x': `${1 - 0.08 * factor}`,
    '--jelly-rotate-stretch-y': `${1 + 0.08 * factor}`,
    '--jelly-rotate-stretch-x': `${1 + 0.11 * factor}`,
    '--jelly-rotate-squash-y': `${1 - 0.09 * factor}`,
    '--jelly-stretch-x-small': `${1 - 0.07 * factor}`,
    '--jelly-stretch-y-small': `${1 + 0.12 * factor}`,
    '--jelly-drop-squash-x': `${1 + 0.08 * factor}`,
    '--jelly-drop-squash-y': `${1 - 0.12 * factor}`,
    '--jelly-land-start-x': `${1 - 0.04 * factor}`,
    '--jelly-land-start-y': `${1 + 0.1 * factor}`,
    '--jelly-squash-x': `${1 + 0.16 * factor}`,
    '--jelly-squash-y': `${1 - 0.26 * factor}`,
  } as CSSProperties;
}
