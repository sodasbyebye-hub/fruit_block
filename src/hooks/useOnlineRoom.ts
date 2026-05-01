import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerAction } from '../game/types';
import { type ConnectionStatus, type DataChannelMessage, type OnlineRole } from '../online/onlineProtocol';
import { createSignalingClient, getOnlineClientId } from '../online/signalingClient';
import { createWebRtcRoom, type WebRtcRoomConnection } from '../online/webrtcRoom';
import type { BattleState, PlayerId, useBattleGame } from './useBattleGame';

type BattleGame = ReturnType<typeof useBattleGame>;

const SNAPSHOT_FRAME_MS = 50;
const PING_MS = 2000;

export function useOnlineRoom(hostGame: BattleGame) {
  const signaling = useMemo(() => createSignalingClient(), []);
  const clientIdRef = useRef('');
  const connectionRef = useRef<WebRtcRoomConnection | null>(null);
  const roleRef = useRef<OnlineRole | null>(null);
  const roomCodeRef = useRef('');
  const latestStateRef = useRef(hostGame.state);
  const snapshotTimerRef = useRef<number | null>(null);
  const [role, setRole] = useState<OnlineRole | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [remoteState, setRemoteState] = useState<BattleState | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  if (!clientIdRef.current && typeof window !== 'undefined') {
    clientIdRef.current = getOnlineClientId();
  }

  latestStateRef.current = hostGame.state;

  const sendChannelMessage = useCallback((message: DataChannelMessage) => {
    return connectionRef.current?.send(message) ?? false;
  }, []);

  const scheduleSnapshot = useCallback(() => {
    if (roleRef.current !== 'host' || status !== 'connected') {
      return;
    }

    if (snapshotTimerRef.current !== null) {
      return;
    }

    snapshotTimerRef.current = window.setTimeout(() => {
      snapshotTimerRef.current = null;
      sendChannelMessage({ type: 'hostSnapshot', state: latestStateRef.current });
    }, SNAPSHOT_FRAME_MS);
  }, [sendChannelMessage, status]);

  const handleChannelMessage = useCallback(
    (message: DataChannelMessage) => {
      if (message.type === 'guestInput' && roleRef.current === 'host') {
        hostGame.controls.dispatch('p2', message.action);
        return;
      }

      if (message.type === 'hostSnapshot' && roleRef.current === 'guest') {
        setRemoteState(message.state);
        return;
      }

      if (message.type === 'ping') {
        sendChannelMessage({ type: 'pong', id: message.id, sentAt: message.sentAt });
        return;
      }

      if (message.type === 'pong') {
        setLatencyMs(Math.max(0, Math.round(performance.now() - message.sentAt)));
      }
    },
    [hostGame.controls, sendChannelMessage],
  );

  const disconnect = useCallback(() => {
    connectionRef.current?.close();
    connectionRef.current = null;
    roleRef.current = null;
    roomCodeRef.current = '';
    setRole(null);
    setRoomCode('');
    setStatus('offline');
    setError('');
    setCopied(false);
    setRemoteState(null);
    setLatencyMs(null);

    if (snapshotTimerRef.current !== null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
  }, []);

  const openConnection = useCallback(
    (nextRole: OnlineRole, code: string, cursor: number) => {
      connectionRef.current?.close();
      roleRef.current = nextRole;
      roomCodeRef.current = code;
      setRole(nextRole);
      setRoomCode(code);
      setStatus(nextRole === 'host' ? 'waiting' : 'connecting');
      setError('');
      setRemoteState(nextRole === 'host' ? latestStateRef.current : null);
      setLatencyMs(null);

      connectionRef.current = createWebRtcRoom({
        role: nextRole,
        code,
        clientId: clientIdRef.current,
        cursor,
        signaling,
        onConnected: () => {
          setStatus('connected');
          if (nextRole === 'host') {
            sendChannelMessage({ type: 'hostSnapshot', state: latestStateRef.current });
          }
        },
        onMessage: handleChannelMessage,
        onPeerJoined: () => {
          setStatus('connecting');
        },
        onPeerLeft: () => {
          setStatus(nextRole === 'host' ? 'waiting' : 'offline');
          setError('Peer disconnected');
          setLatencyMs(null);
        },
        onError: (message) => {
          setStatus('error');
          setError(message);
        },
      });
    },
    [handleChannelMessage, sendChannelMessage, signaling],
  );

  const createRoom = useCallback(async () => {
    disconnect();
    setStatus('connecting');

    try {
      const result = await signaling.createRoom(clientIdRef.current);
      const message = result.messages.find((item) => item.type === 'roomCreated');
      if (!message?.code) {
        throw new Error('Unable to create a room');
      }

      openConnection('host', message.code, result.cursor ?? 0);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Room server error');
    }
  }, [disconnect, openConnection, signaling]);

  const joinRoom = useCallback(
    async (code: string) => {
      disconnect();
      setStatus('connecting');

      try {
        const result = await signaling.joinRoom(code, clientIdRef.current);
        const message = result.messages.find((item) => item.type === 'roomJoined');
        if (!message?.code) {
          throw new Error('Unable to join room');
        }

        openConnection('guest', message.code, result.cursor ?? 0);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Room server error');
      }
    },
    [disconnect, openConnection, signaling],
  );

  const copyInvite = useCallback(async () => {
    if (!roomCode) {
      return;
    }

    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }, [roomCode]);

  const dispatch = useCallback(
    (action: PlayerAction) => {
      if (roleRef.current === 'host') {
        hostGame.controls.dispatch('p1', action);
        return;
      }

      sendChannelMessage({ type: 'guestInput', action });
    },
    [hostGame.controls, sendChannelMessage],
  );

  const start = useCallback(() => {
    hostGame.controls.start();
    sendChannelMessage({ type: 'control', control: 'start' });
    scheduleSnapshot();
  }, [hostGame.controls, scheduleSnapshot, sendChannelMessage]);

  const pause = useCallback(() => {
    hostGame.controls.pause();
    sendChannelMessage({ type: 'control', control: 'pause' });
    scheduleSnapshot();
  }, [hostGame.controls, scheduleSnapshot, sendChannelMessage]);

  const resume = useCallback(() => {
    hostGame.controls.resume();
    sendChannelMessage({ type: 'control', control: 'resume' });
    scheduleSnapshot();
  }, [hostGame.controls, scheduleSnapshot, sendChannelMessage]);

  const reset = useCallback(() => {
    hostGame.controls.reset();
    sendChannelMessage({ type: 'control', control: 'reset' });
    scheduleSnapshot();
  }, [hostGame.controls, scheduleSnapshot, sendChannelMessage]);

  useEffect(() => {
    scheduleSnapshot();
  }, [hostGame.state, scheduleSnapshot]);

  useEffect(() => {
    if (status !== 'connected') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      sendChannelMessage({ type: 'ping', id: crypto.randomUUID(), sentAt: performance.now() });
    }, PING_MS);

    return () => window.clearInterval(interval);
  }, [sendChannelMessage, status]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    role,
    localPlayer: (role === 'guest' ? 'p2' : 'p1') as PlayerId,
    roomCode,
    status,
    error,
    copied,
    latencyMs,
    visibleState: role === 'guest' ? remoteState : hostGame.state,
    createRoom,
    joinRoom,
    copyInvite,
    disconnect,
    dispatch,
    controls: {
      start,
      pause,
      resume,
      reset,
    },
  };
}
