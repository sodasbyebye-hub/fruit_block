import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerAction } from '../game/types';
import type { BattleState, PlayerId, useBattleGame } from './useBattleGame';

type BattleGame = ReturnType<typeof useBattleGame>;
type OnlineRole = 'host' | 'guest';
type ConnectionStatus = 'offline' | 'connecting' | 'waiting' | 'connected' | 'error';

interface ServerMessage {
  type: 'roomCreated' | 'roomJoined' | 'peerJoined' | 'peerLeft' | 'roomError' | 'relay';
  code?: string;
  role?: OnlineRole;
  message?: string;
  payload?: RelayPayload;
}

type RelayPayload =
  | { type: 'guestInput'; action: PlayerAction }
  | { type: 'hostSnapshot'; state: BattleState }
  | { type: 'hostControl'; control: 'start' | 'pause' | 'resume' | 'reset' };

type ClientMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; code: string }
  | { type: 'relay'; code: string; payload: RelayPayload }
  | { type: 'leaveRoom'; code: string };

function isLocalHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (isLocalHost(window.location.hostname)) {
    return 'ws://127.0.0.1:8787';
  }

  return null;
}

export function useOnlineRoom(hostGame: BattleGame) {
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(0);
  const roleRef = useRef<OnlineRole | null>(null);
  const roomCodeRef = useRef('');
  const [role, setRole] = useState<OnlineRole | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [remoteState, setRemoteState] = useState<BattleState | null>(null);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'roomCreated' && message.code) {
        roleRef.current = 'host';
        roomCodeRef.current = message.code;
        setRole('host');
        setRoomCode(message.code);
        setStatus('waiting');
        return;
      }

      if (message.type === 'roomJoined' && message.code) {
        roleRef.current = 'guest';
        roomCodeRef.current = message.code;
        setRole('guest');
        setRoomCode(message.code);
        setStatus('connected');
        return;
      }

      if (message.type === 'peerJoined') {
        setStatus('connected');
        return;
      }

      if (message.type === 'peerLeft') {
        setStatus('waiting');
        setError('Peer disconnected');
        return;
      }

      if (message.type === 'roomError') {
        setStatus('error');
        setError(message.message ?? 'Room error');
        return;
      }

      if (message.type === 'relay' && message.payload) {
        const payload = message.payload;

        if (roleRef.current === 'host' && payload.type === 'guestInput') {
          hostGame.controls.dispatch('p2', payload.action);
        }

        if (roleRef.current === 'guest' && payload.type === 'hostSnapshot') {
          setRemoteState(payload.state);
        }
      }
    },
    [hostGame.controls],
  );

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  const relay = useCallback(
    (payload: RelayPayload) => {
      if (!roomCodeRef.current) {
        return;
      }

      send({ type: 'relay', code: roomCodeRef.current, payload });
    },
    [send],
  );

  const disconnect = useCallback(() => {
    if (roomCodeRef.current) {
      send({ type: 'leaveRoom', code: roomCodeRef.current });
    }

    sessionRef.current += 1;
    socketRef.current?.close();
    socketRef.current = null;
    roleRef.current = null;
    roomCodeRef.current = '';
    setRole(null);
    setRoomCode('');
    setStatus('offline');
    setError('');
    setCopied(false);
    setRemoteState(null);
  }, [send]);

  const connectWebSocket = useCallback(
    (onOpen: (socket: WebSocket) => void) => {
      disconnect();

      const url = getWebSocketUrl();
      if (!url) {
        setStatus('error');
        setError('Online battle needs VITE_WS_URL');
        return;
      }

      const session = sessionRef.current + 1;
      sessionRef.current = session;
      setStatus('connecting');
      setError('');

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (sessionRef.current === session) {
          onOpen(socket);
        }
      });
      socket.addEventListener('error', () => {
        if (sessionRef.current === session) {
          setStatus('error');
          setError('WebSocket server is not available');
        }
      });
      socket.addEventListener('close', () => {
        if (sessionRef.current === session && roleRef.current) {
          setStatus('offline');
        }
      });
      socket.addEventListener('message', (event) => {
        if (sessionRef.current !== session) {
          return;
        }

        try {
          handleMessage(JSON.parse(String(event.data)) as ServerMessage);
        } catch {
          setStatus('error');
          setError('Invalid room message');
        }
      });
    },
    [disconnect, handleMessage],
  );

  const createRoom = useCallback(() => {
    connectWebSocket((socket) => socket.send(JSON.stringify({ type: 'createRoom' })));
  }, [connectWebSocket]);

  const joinRoom = useCallback(
    (code: string) => {
      connectWebSocket((socket) => socket.send(JSON.stringify({ type: 'joinRoom', code })));
    },
    [connectWebSocket],
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

      relay({ type: 'guestInput', action });
    },
    [hostGame.controls, relay],
  );

  const start = useCallback(() => {
    hostGame.controls.start();
    relay({ type: 'hostControl', control: 'start' });
  }, [hostGame.controls, relay]);

  const pause = useCallback(() => {
    hostGame.controls.pause();
    relay({ type: 'hostControl', control: 'pause' });
  }, [hostGame.controls, relay]);

  const resume = useCallback(() => {
    hostGame.controls.resume();
    relay({ type: 'hostControl', control: 'resume' });
  }, [hostGame.controls, relay]);

  const reset = useCallback(() => {
    hostGame.controls.reset();
    relay({ type: 'hostControl', control: 'reset' });
  }, [hostGame.controls, relay]);

  useEffect(() => {
    if (role === 'host' && status === 'connected') {
      relay({ type: 'hostSnapshot', state: hostGame.state });
    }
  }, [hostGame.state, relay, role, status]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    role,
    localPlayer: (role === 'guest' ? 'p2' : 'p1') as PlayerId,
    roomCode,
    status,
    error,
    copied,
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
