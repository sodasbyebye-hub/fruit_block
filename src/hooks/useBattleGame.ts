import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRAVITY_MS } from '../game/constants';
import { createPlayerState, performAction, receiveGarbage, tickPlayer } from '../game/engine';
import { createSevenBagRandomizer, type PieceRandomizer } from '../game/random';
import type { AudioEvent, BoardState, PlayerAction } from '../game/types';
import { useAudioEngine } from './useAudioEngine';

export type GameStatus = 'ready' | 'playing' | 'paused' | 'finished';
export type PlayerId = 'p1' | 'p2';

export interface PlayerView extends BoardState {
  id: PlayerId;
  name: string;
}

export interface BattleState {
  status: GameStatus;
  players: [PlayerView, PlayerView];
  winner: PlayerId | null;
}

const playerNames: Record<PlayerId, string> = {
  p1: '草莓玩家',
  p2: '蓝莓玩家',
};

function makePlayers(randomizers: Record<PlayerId, PieceRandomizer>): [PlayerView, PlayerView] {
  return [
    { ...createPlayerState(randomizers.p1), id: 'p1', name: playerNames.p1 },
    { ...createPlayerState(randomizers.p2), id: 'p2', name: playerNames.p2 },
  ];
}

function makeRandomizers(): Record<PlayerId, PieceRandomizer> {
  return {
    p1: createSevenBagRandomizer(),
    p2: createSevenBagRandomizer(),
  };
}

function getWinner(players: [PlayerView, PlayerView]): PlayerId | null {
  if (players[0].lost && !players[1].lost) {
    return 'p2';
  }

  if (players[1].lost && !players[0].lost) {
    return 'p1';
  }

  if (players[0].lost && players[1].lost) {
    return players[0].score >= players[1].score ? 'p1' : 'p2';
  }

  return null;
}

function keepPlayerIdentity(previous: PlayerView, next: BoardState): PlayerView {
  return {
    ...next,
    id: previous.id,
    name: previous.name,
  };
}

export function useBattleGame() {
  const randomizersRef = useRef(makeRandomizers());
  const garbageRandomRef = useRef(Math.random);
  const audio = useAudioEngine();
  const [state, setState] = useState<BattleState>(() => ({
    status: 'ready',
    players: makePlayers(randomizersRef.current),
    winner: null,
  }));

  const commitPlayers = useCallback(
    (
      updater: (players: [PlayerView, PlayerView]) => {
        players: [PlayerView, PlayerView];
        audioEvents: AudioEvent[];
      },
    ) => {
      setState((current) => {
        if (current.status !== 'playing') {
          return current;
        }

        const result = updater(current.players);
        const winner = getWinner(result.players);
        result.audioEvents.forEach(audio.playEffect);

        if (winner) {
          audio.stopMusic();
        }

        return {
          status: winner ? 'finished' : 'playing',
          players: result.players,
          winner,
        };
      });
    },
    [audio],
  );

  const applyAttacks = useCallback((players: [PlayerView, PlayerView], attacks: [number, number]) => {
    let p1 = players[0];
    let p2 = players[1];
    const audioEvents: AudioEvent[] = [];

    if (attacks[0] > 0) {
      const nextP2 = receiveGarbage(p2, attacks[0], garbageRandomRef.current);
      p2 = keepPlayerIdentity(p2, nextP2);
      audioEvents.push('garbageReceived');
      if (nextP2.lost) {
        audioEvents.push('lose');
      }
    }

    if (attacks[1] > 0) {
      const nextP1 = receiveGarbage(p1, attacks[1], garbageRandomRef.current);
      p1 = keepPlayerIdentity(p1, nextP1);
      audioEvents.push('garbageReceived');
      if (nextP1.lost) {
        audioEvents.push('lose');
      }
    }

    return { players: [p1, p2] as [PlayerView, PlayerView], audioEvents };
  }, []);

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
    randomizersRef.current = makeRandomizers();
    setState({
      status: 'ready',
      players: makePlayers(randomizersRef.current),
      winner: null,
    });
  }, [audio]);

  const dispatch = useCallback(
    (playerId: PlayerId, action: PlayerAction) => {
      commitPlayers((players) => {
        const index = playerId === 'p1' ? 0 : 1;
        const nextPlayers = [...players] as [PlayerView, PlayerView];
        const result = performAction(nextPlayers[index], action, randomizersRef.current[playerId]);
        nextPlayers[index] = keepPlayerIdentity(nextPlayers[index], result.state);
        const attacks: [number, number] = index === 0 ? [result.attack, 0] : [0, result.attack];
        const attacked = applyAttacks(nextPlayers, attacks);

        return {
          players: attacked.players,
          audioEvents: [...result.audioEvents, ...attacked.audioEvents],
        };
      });
    },
    [applyAttacks, commitPlayers],
  );

  useEffect(() => {
    if (state.status !== 'playing') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      commitPlayers((players) => {
        const p1 = tickPlayer(players[0], randomizersRef.current.p1);
        const p2 = tickPlayer(players[1], randomizersRef.current.p2);
        const attacked = applyAttacks(
          [keepPlayerIdentity(players[0], p1.state), keepPlayerIdentity(players[1], p2.state)],
          [p1.attack, p2.attack],
        );

        return {
          players: attacked.players,
          audioEvents: [...p1.audioEvents, ...p2.audioEvents, ...attacked.audioEvents],
        };
      });
    }, GRAVITY_MS);

    return () => window.clearInterval(interval);
  }, [applyAttacks, commitPlayers, state.status]);

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
