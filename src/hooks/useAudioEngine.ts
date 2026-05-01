import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioEvent } from '../game/types';

type WebkitWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

interface AudioGraph {
  context: AudioContext;
  effectsGain: GainNode;
  musicGain: GainNode;
}

const musicNotes = [659, 0, 784, 0, 988, 880, 784, 0, 587, 0, 740, 0, 880, 784, 659, 0];
const bassNotes = [164, 0, 0, 0, 196, 0, 0, 0, 147, 0, 0, 0, 196, 0, 0, 0];
const STEP_MS = 145;
const EFFECTS_GAIN = 0.35;
const MUSIC_GAIN = 0.08;

export function useAudioEngine() {
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [musicEnabledState, setMusicEnabledState] = useState(true);
  const [effectsVolume, setEffectsVolumeState] = useState(0.8);
  const [musicVolume, setMusicVolumeState] = useState(0.7);
  const graphRef = useRef<AudioGraph | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const musicStepRef = useRef(0);
  const musicWantedRef = useRef(false);
  const effectsEnabledRef = useRef(true);
  const musicEnabledRef = useRef(true);
  const effectsVolumeRef = useRef(0.8);
  const musicVolumeRef = useRef(0.7);

  const ensureGraph = useCallback(() => {
    if (graphRef.current) {
      void graphRef.current.context.resume();
      return graphRef.current;
    }

    const AudioContextConstructor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    const context = new AudioContextConstructor();
    const effectsGain = context.createGain();
    const musicGain = context.createGain();
    const compressor = context.createDynamicsCompressor();

    effectsGain.gain.value = EFFECTS_GAIN * effectsVolumeRef.current;
    musicGain.gain.value = MUSIC_GAIN * musicVolumeRef.current;
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;
    effectsGain.connect(compressor);
    musicGain.connect(compressor);
    compressor.connect(context.destination);

    graphRef.current = { context, effectsGain, musicGain };
    void context.resume();
    return graphRef.current;
  }, []);

  const playTone = useCallback(
    (
      frequency: number,
      duration: number,
      options: {
        destination?: GainNode;
        type?: OscillatorType;
        startFrequency?: number;
        volume?: number;
        delay?: number;
      } = {},
    ) => {
      const graph = ensureGraph();
      if (!graph) {
        return;
      }

      const destination = options.destination ?? graph.effectsGain;
      const now = graph.context.currentTime + (options.delay ?? 0);
      const oscillator = graph.context.createOscillator();
      const gain = graph.context.createGain();

      oscillator.type = options.type ?? 'sine';
      oscillator.frequency.setValueAtTime(options.startFrequency ?? frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency, now + Math.min(duration * 0.72, 0.16));
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.18, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    },
    [ensureGraph],
  );

  const playEffect = useCallback(
    (event: AudioEvent) => {
      if (!effectsEnabledRef.current) {
        return;
      }

      switch (event) {
        case 'moveLeft':
          playTone(520, 0.045, { startFrequency: 610, type: 'triangle', volume: 0.12 });
          break;
        case 'moveRight':
          playTone(610, 0.045, { startFrequency: 520, type: 'triangle', volume: 0.12 });
          break;
        case 'rotate':
          playTone(740, 0.07, { startFrequency: 520, type: 'sine', volume: 0.14 });
          playTone(988, 0.055, { delay: 0.035, type: 'sine', volume: 0.08 });
          break;
        case 'softDrop':
          playTone(330, 0.035, { startFrequency: 460, type: 'triangle', volume: 0.075 });
          break;
        case 'hardDrop':
          playTone(150, 0.085, { startFrequency: 300, type: 'sawtooth', volume: 0.13 });
          break;
        case 'land':
          playTone(220, 0.08, { startFrequency: 130, type: 'triangle', volume: 0.15 });
          playTone(330, 0.07, { delay: 0.035, type: 'sine', volume: 0.08 });
          break;
        case 'clear1':
          playTone(660, 0.08, { type: 'sine', volume: 0.12 });
          break;
        case 'clear2':
          [660, 880].forEach((note, index) => playTone(note, 0.09, { delay: index * 0.04, volume: 0.12 }));
          break;
        case 'clear3':
          [660, 880, 1047].forEach((note, index) => playTone(note, 0.1, { delay: index * 0.035, volume: 0.12 }));
          break;
        case 'clear4':
          [784, 988, 1175, 1568].forEach((note, index) => playTone(note, 0.12, { delay: index * 0.035, volume: 0.13 }));
          break;
        case 'attack':
          playTone(1245, 0.09, { startFrequency: 740, type: 'square', volume: 0.1 });
          playTone(932, 0.11, { delay: 0.045, type: 'triangle', volume: 0.1 });
          break;
        case 'garbageReceived':
          playTone(190, 0.12, { startFrequency: 420, type: 'sawtooth', volume: 0.11 });
          break;
        case 'lose':
          playTone(220, 0.18, { startFrequency: 520, type: 'sawtooth', volume: 0.13 });
          playTone(140, 0.22, { delay: 0.12, startFrequency: 240, type: 'triangle', volume: 0.1 });
          break;
        case 'start':
          [523, 659, 784].forEach((note, index) => playTone(note, 0.075, { delay: index * 0.045, volume: 0.1 }));
          break;
        case 'pause':
          playTone(392, 0.08, { startFrequency: 523, type: 'triangle', volume: 0.09 });
          break;
        case 'resume':
          playTone(523, 0.08, { startFrequency: 392, type: 'triangle', volume: 0.1 });
          break;
        case 'reset':
          [784, 659, 523].forEach((note, index) => playTone(note, 0.055, { delay: index * 0.035, volume: 0.085 }));
          break;
      }
    },
    [playTone],
  );

  const playMusicStep = useCallback(() => {
    const graph = ensureGraph();
    if (!graph || !musicEnabledRef.current || !musicWantedRef.current) {
      return;
    }

    const step = musicStepRef.current % musicNotes.length;
    const note = musicNotes[step];
    const bass = bassNotes[step];

    if (note > 0) {
      playTone(note, 0.12, { destination: graph.musicGain, type: 'triangle', volume: step % 4 === 0 ? 0.12 : 0.08 });
    }

    if (bass > 0) {
      playTone(bass, 0.18, { destination: graph.musicGain, type: 'sine', volume: 0.08 });
    }

    musicStepRef.current = (musicStepRef.current + 1) % musicNotes.length;
  }, [ensureGraph, playTone]);

  const pauseMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
  }, []);

  const startMusic = useCallback(() => {
    musicWantedRef.current = true;
    if (!musicEnabledRef.current || musicTimerRef.current !== null) {
      return;
    }

    void ensureGraph()?.context.resume();
    playMusicStep();
    musicTimerRef.current = window.setInterval(playMusicStep, STEP_MS);
  }, [ensureGraph, playMusicStep]);

  const resumeMusic = useCallback(() => {
    startMusic();
  }, [startMusic]);

  const stopMusic = useCallback(() => {
    musicWantedRef.current = false;
    pauseMusic();
    musicStepRef.current = 0;
  }, [pauseMusic]);

  const setMusicEnabled = useCallback(
    (enabled: boolean) => {
      musicEnabledRef.current = enabled;
      setMusicEnabledState(enabled);

      if (!enabled) {
        pauseMusic();
        return;
      }

      if (musicWantedRef.current) {
        startMusic();
      }
    },
    [pauseMusic, startMusic],
  );

  const setEffectsEnabledSafe = useCallback((enabled: boolean) => {
    effectsEnabledRef.current = enabled;
    setEffectsEnabled(enabled);
  }, []);

  const setEffectsVolume = useCallback((volume: number) => {
    const nextVolume = Math.min(Math.max(volume, 0), 1);
    effectsVolumeRef.current = nextVolume;
    setEffectsVolumeState(nextVolume);

    if (graphRef.current) {
      graphRef.current.effectsGain.gain.setTargetAtTime(
        EFFECTS_GAIN * nextVolume,
        graphRef.current.context.currentTime,
        0.025,
      );
    }
  }, []);

  const setMusicVolume = useCallback((volume: number) => {
    const nextVolume = Math.min(Math.max(volume, 0), 1);
    musicVolumeRef.current = nextVolume;
    setMusicVolumeState(nextVolume);

    if (graphRef.current) {
      graphRef.current.musicGain.gain.setTargetAtTime(
        MUSIC_GAIN * nextVolume,
        graphRef.current.context.currentTime,
        0.04,
      );
    }
  }, []);

  useEffect(
    () => () => {
      stopMusic();
      void graphRef.current?.context.close();
    },
    [stopMusic],
  );

  return useMemo(
    () => ({
      effectsEnabled,
      musicEnabled: musicEnabledState,
      effectsVolume,
      musicVolume,
      setEffectsEnabled: setEffectsEnabledSafe,
      setMusicEnabled,
      setEffectsVolume,
      setMusicVolume,
      playEffect,
      startMusic,
      pauseMusic,
      resumeMusic,
      stopMusic,
    }),
    [
      effectsEnabled,
      effectsVolume,
      musicEnabledState,
      musicVolume,
      pauseMusic,
      playEffect,
      resumeMusic,
      setEffectsEnabledSafe,
      setEffectsVolume,
      setMusicEnabled,
      setMusicVolume,
      startMusic,
      stopMusic,
    ],
  );
}
