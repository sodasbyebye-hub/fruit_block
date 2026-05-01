import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRAVITY_MS } from '../game/constants';
import { createPlayerState, performAction, tickPlayer } from '../game/engine';
import { createSevenBagRandomizer, type PieceRandomizer } from '../game/random';
import type { AudioEvent, BoardState, PlayerAction } from '../game/types';
import { useAudioEngine } from './useAudioEngine';
import type { GameStatus, PlayerId, PlayerView } from './useBattleGame';

export interface SoloState {
  status: GameStatus;
  player: PlayerView;
  winner: null;
}

function makePlayer(randomizer: PieceRandomizer): PlayerView {
  return { ...createPlayerState(randomizer), id: 'p1', name: '草莓玩家' };
}

function keepPlayerIdentity(previous: PlayerView, next: BoardState): PlayerView {
  return {
    ...next,
    id: previous.id,
    name: previous.name,
  };
}

export function useSoloGame() {
  const randomizerRef = useRef(createSevenBagRandomizer());
  const audio = useAudioEngine();
  const [state, setState] = useState<SoloState>(() => ({
    status: 'ready',
    player: makePlayer(randomizerRef.current),
    winner: null,
  }));

  const commitPlayer = useCallback(
    (
      updater: (player: PlayerView) => {
        player: PlayerView;
        audioEvents: AudioEvent[];
      },
    ) => {
      setState((current) => {
        if (current.status !== 'playing') {
          return current;
        }

        const result = updater(current.player);
        result.audioEvents.forEach(audio.playEffect);

        if (result.player.lost) {
          audio.stopMusic();
        }

        return {
          status: result.player.lost ? 'finished' : 'playing',
          player: result.player,
          winner: null,
        };
      });
    },
    [audio],
  );

  const start = useCallback(() => {
    audio.playEffect('start');
    audio.startMusic();
    setState((current) => ({
      ...current,
      status: 'playing',
      winner: null,
    }));
  }, [audio]);

  const pause = useCallback(() => {
    audio.playEffect('pause');
    audio.pauseMusic();
    setState((current) => ({
      ...current,
      status: current.status === 'playing' ? 'paused' : current.status,
    }));
  }, [audio]);

  const resume = useCallback(() => {
    audio.playEffect('resume');
    audio.resumeMusic();
    setState((current) => ({
      ...current,
      status: current.status === 'paused' ? 'playing' : current.status,
    }));
  }, [audio]);

  const reset = useCallback(() => {
    audio.playEffect('reset');
    audio.stopMusic();
    randomizerRef.current = createSevenBagRandomizer();
    setState({
      status: 'ready',
      player: makePlayer(randomizerRef.current),
      winner: null,
    });
  }, [audio]);

  const dispatch = useCallback(
    (playerId: PlayerId, action: PlayerAction) => {
      if (playerId !== 'p1') {
        return;
      }

      commitPlayer((player) => {
        const result = performAction(player, action, randomizerRef.current);

        return {
          player: keepPlayerIdentity(player, result.state),
          audioEvents: result.audioEvents,
        };
      });
    },
    [commitPlayer],
  );

  useEffect(() => {
    if (state.status !== 'playing') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      commitPlayer((player) => {
        const result = tickPlayer(player, randomizerRef.current);

        return {
          player: keepPlayerIdentity(player, result.state),
          audioEvents: result.audioEvents,
        };
      });
    }, GRAVITY_MS);

    return () => window.clearInterval(interval);
  }, [commitPlayer, state.status]);

  const controls = useMemo(
    () => ({
      start,
      pause,
      resume,
      reset,
      dispatch,
      effectsEnabled: audio.effectsEnabled,
      musicEnabled: audio.musicEnabled,
      effectsVolume: audio.effectsVolume,
      musicVolume: audio.musicVolume,
      setEffectsEnabled: audio.setEffectsEnabled,
      setMusicEnabled: audio.setMusicEnabled,
      setEffectsVolume: audio.setEffectsVolume,
      setMusicVolume: audio.setMusicVolume,
    }),
    [
      audio.effectsEnabled,
      audio.effectsVolume,
      audio.musicEnabled,
      audio.musicVolume,
      audio.setEffectsEnabled,
      audio.setEffectsVolume,
      audio.setMusicEnabled,
      audio.setMusicVolume,
      dispatch,
      pause,
      reset,
      resume,
      start,
    ],
  );

  return { state, controls };
}
