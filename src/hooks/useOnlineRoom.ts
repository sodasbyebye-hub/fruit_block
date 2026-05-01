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
  | { type: 'leaveRoom'; code: string }
  | { type: 'poll'; code: string; after: number };

interface HttpRoomResponse {
  messages?: Array<ServerMessage & { eventId?: number }>;
  cursor?: number;
}

type SignalingTransport = 'websocket' | 'http';

const HTTP_POLL_MS = 220;

export function resolveHttpCursor(currentCursor: number, response: HttpRoomResponse, advanceResponseCursor: boolean) {
  const messageCursor = Math.max(
    currentCursor,
    ...(response.messages ?? [])
      .map((message) => message.eventId)
      .filter((eventId): eventId is number => typeof eventId === 'number'),
  );

  if (advanceResponseCursor && typeof response.cursor === 'number') {
    return Math.max(messageCursor, response.cursor);
  }

  return messageCursor;
}

function getWebSocketUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8787`;
}

function getHttpRoomUrl() {
  return import.meta.env.VITE_SIGNALING_HTTP_URL ?? '/api/rooms';
}

function getSignalingTransport(): SignalingTransport {
  const configured = import.meta.env.VITE_SIGNALING_TRANSPORT;

  if (configured === 'http' || configured === 'websocket') {
    return configured;
  }

  if (import.meta.env.VITE_WS_URL) {
    return 'websocket';
  }

  if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return 'websocket';
  }

  return 'http';
}

function createClientId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function useOnlineRoom(hostGame: BattleGame) {
  const socketRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<SignalingTransport | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);
  const cursorRef = useRef(0);
  const sessionRef = useRef(0);
  const clientIdRef = useRef(createClientId());
  const roleRef = useRef<OnlineRole | null>(null);
  const roomCodeRef = useRef('');
  const [role, setRole] = useState<OnlineRole | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [remoteState, setRemoteState] = useState<BattleState | null>(null);

  const clearHttpPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    pollInFlightRef.current = false;
  }, []);

  const handleMessage = useCallback(
    (message: ServerMessage & { eventId?: number }) => {
      if (typeof message.eventId === 'number') {
        cursorRef.current = Math.max(cursorRef.current, message.eventId);
      }

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

  const handleHttpResponse = useCallback(
    (response: HttpRoomResponse, options: { advanceCursor?: boolean } = {}) => {
      response.messages?.forEach(handleMessage);
      cursorRef.current = resolveHttpCursor(cursorRef.current, response, options.advanceCursor ?? true);
    },
    [handleMessage],
  );

  const startHttpPolling = useCallback(
    (code: string, session: number) => {
      clearHttpPolling();
      cursorRef.current = 0;

      const poll = async () => {
        if (pollInFlightRef.current || sessionRef.current !== session || transportRef.current !== 'http') {
          return;
        }

        pollInFlightRef.current = true;

        try {
          const response = await fetch(getHttpRoomUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'poll',
              code,
              after: cursorRef.current,
              clientId: clientIdRef.current,
            }),
          });

          const data = (await response.json()) as HttpRoomResponse;
          if (sessionRef.current === session) {
            handleHttpResponse(data, { advanceCursor: true });
          }
        } catch {
          if (sessionRef.current === session) {
            setStatus('error');
            setError('Online room service is not available');
          }
        } finally {
          pollInFlightRef.current = false;
        }
      };

      pollTimerRef.current = window.setInterval(poll, HTTP_POLL_MS);
      void poll();
    },
    [clearHttpPolling, handleHttpResponse],
  );

  const sendHttp = useCallback(
    async (message: ClientMessage) => {
      const session = sessionRef.current;

      try {
        const response = await fetch(getHttpRoomUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...message, clientId: clientIdRef.current }),
        });
        const data = (await response.json()) as HttpRoomResponse;

        if (sessionRef.current !== session) {
          return;
        }

        handleHttpResponse(data, { advanceCursor: message.type === 'createRoom' || message.type === 'joinRoom' });

        const joinedRoom = data.messages?.find((serverMessage) => serverMessage.type === 'roomCreated' || serverMessage.type === 'roomJoined');
        if (joinedRoom?.code) {
          startHttpPolling(joinedRoom.code, session);
        }
      } catch {
        if (sessionRef.current === session) {
          setStatus('error');
          setError('Online room service is not available');
        }
      }
    },
    [handleHttpResponse, startHttpPolling],
  );

  const send = useCallback(
    (message: ClientMessage) => {
      if (transportRef.current === 'websocket' && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify(message));
        return;
      }

      if (transportRef.current === 'http') {
        void sendHttp(message);
      }
    },
    [sendHttp],
  );

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
    clearHttpPolling();
    socketRef.current?.close();
    socketRef.current = null;
    transportRef.current = null;
    roleRef.current = null;
    roomCodeRef.current = '';
    cursorRef.current = 0;
    setRole(null);
    setRoomCode('');
    setStatus('offline');
    setError('');
    setCopied(false);
    setRemoteState(null);
  }, [clearHttpPolling, send]);

  const connectWebSocket = useCallback(
    (onOpen: (socket: WebSocket) => void) => {
      disconnect();
      sessionRef.current += 1;
      transportRef.current = 'websocket';
      setStatus('connecting');
      setError('');

      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => onOpen(socket));
      socket.addEventListener('error', () => {
        setStatus('error');
        setError('WebSocket server is not available');
      });
      socket.addEventListener('close', () => {
        if (roleRef.current) {
          setStatus('offline');
        }
      });
      socket.addEventListener('message', (event) => {
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

  const connectHttp = useCallback(
    (message: Extract<ClientMessage, { type: 'createRoom' | 'joinRoom' }>) => {
      disconnect();
      sessionRef.current += 1;
      transportRef.current = 'http';
      cursorRef.current = 0;
      setStatus('connecting');
      setError('');
      void sendHttp(message);
    },
    [disconnect, sendHttp],
  );

  const createRoom = useCallback(() => {
    if (getSignalingTransport() === 'websocket') {
      connectWebSocket((socket) => socket.send(JSON.stringify({ type: 'createRoom' })));
      return;
    }

    connectHttp({ type: 'createRoom' });
  }, [connectHttp, connectWebSocket]);

  const joinRoom = useCallback(
    (code: string) => {
      if (getSignalingTransport() === 'websocket') {
        connectWebSocket((socket) => socket.send(JSON.stringify({ type: 'joinRoom', code })));
        return;
      }

      connectHttp({ type: 'joinRoom', code });
    },
    [connectHttp, connectWebSocket],
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
