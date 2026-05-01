import type { OnlineRole, SignalMessage } from './onlineProtocol';

export interface RoomServerMessage {
  type: 'roomCreated' | 'roomJoined' | 'peerJoined' | 'peerLeft' | 'roomError' | 'signal';
  code?: string;
  role?: OnlineRole;
  message?: string;
  signal?: SignalMessage;
  id?: number;
}

interface RoomResponse {
  messages: RoomServerMessage[];
  cursor?: number;
}

type RoomRequest =
  | { type: 'createRoom'; clientId: string }
  | { type: 'joinRoom'; code: string; clientId: string }
  | { type: 'signal'; code: string; clientId: string; signal: SignalMessage }
  | { type: 'poll'; code: string; clientId: string; after: number }
  | { type: 'leaveRoom'; code: string; clientId: string };

const CLIENT_ID_KEY = 'jelly-battle-client-id';

export function getOnlineClientId() {
  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  window.sessionStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function createSignalingClient(endpoint = '/api/rooms') {
  async function post(message: RoomRequest, signal?: AbortSignal): Promise<RoomResponse> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal,
    });

    const body = (await response.json()) as RoomResponse;
    const error = body.messages.find((item) => item.type === 'roomError');
    if (!response.ok || error) {
      throw new Error(error?.message ?? 'Room server error');
    }

    return body;
  }

  return {
    createRoom: (clientId: string, signal?: AbortSignal) => post({ type: 'createRoom', clientId }, signal),
    joinRoom: (code: string, clientId: string, signal?: AbortSignal) => post({ type: 'joinRoom', code, clientId }, signal),
    sendSignal: (code: string, clientId: string, rtcSignal: SignalMessage, signal?: AbortSignal) =>
      post({ type: 'signal', code, clientId, signal: rtcSignal }, signal),
    poll: (code: string, clientId: string, after: number, signal?: AbortSignal) =>
      post({ type: 'poll', code, clientId, after }, signal),
    leaveRoom: (code: string, clientId: string, signal?: AbortSignal) => post({ type: 'leaveRoom', code, clientId }, signal),
  };
}

export type SignalingClient = ReturnType<typeof createSignalingClient>;
