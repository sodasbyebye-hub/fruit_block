import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { createRoomCode, normalizeRoomCode } from '../../server/rooms.mjs';

type OnlineRole = 'host' | 'guest';
type EventTarget = OnlineRole | 'both';
type RoomEventType = 'peerJoined' | 'peerLeft' | 'relay';

interface ClientMessage {
  type?: string;
  code?: unknown;
  clientId?: unknown;
  after?: unknown;
  payload?: unknown;
}

interface StoredEvent {
  id: number;
  target: EventTarget;
  type: RoomEventType;
  payload?: unknown;
  createdAt: number;
}

interface RoomRecord {
  code: string;
  hostId: string;
  guestId: string | null;
  hostSeenAt: number;
  guestSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  nextEventId: number;
  events: StoredEvent[];
}

const ROOM_STORE = 'jelly-battle-rooms';
const ROOM_TTL_MS = 1000 * 60 * 60;
const PEER_TIMEOUT_MS = 1000 * 25;
const EVENT_TTL_MS = 1000 * 60 * 2;
const MAX_EVENTS = 300;
const jsonHeaders = { 'Content-Type': 'application/json' };

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ messages: [{ type: 'roomError', message: 'Method not allowed' }] }, 405);
  }

  let message: ClientMessage;

  try {
    message = (await request.json()) as ClientMessage;
  } catch {
    return json({ messages: [{ type: 'roomError', message: 'Invalid message' }] }, 400);
  }

  const clientId = normalizeClientId(message.clientId);
  if (!clientId) {
    return json({ messages: [{ type: 'roomError', message: 'Missing client id' }] }, 400);
  }

  const store = getStore(ROOM_STORE, { consistency: 'strong' });
  const now = Date.now();

  if (message.type === 'createRoom') {
    return createRoom(store, clientId, now);
  }

  const code = normalizeRoomCode(message.code);
  if (!code) {
    return json({ messages: [{ type: 'roomError', message: 'Missing room code' }] }, 400);
  }

  const room = await readRoom(store, code);

  if (!room || isExpired(room, now)) {
    if (room) {
      await store.delete(roomKey(code));
    }

    return json({ messages: [{ type: 'roomError', message: 'Room not found' }] }, 404);
  }

  if (message.type === 'joinRoom') {
    return joinRoom(store, room, clientId, now);
  }

  const role = getRole(room, clientId);
  if (!role) {
    return json({ messages: [{ type: 'roomError', message: 'Room not found' }] }, 404);
  }

  markSeen(room, role, now);
  applyPeerTimeout(room, now);

  if (message.type === 'poll') {
    await saveRoom(store, room, now);
    return json(selectEvents(room, role, Number(message.after ?? 0)));
  }

  if (message.type === 'relay') {
    const target: OnlineRole = role === 'host' ? 'guest' : 'host';
    const hasPeer = target === 'guest' ? Boolean(room.guestId) : !room.closedAt;

    if (!hasPeer) {
      await saveRoom(store, room, now);
      return json({ messages: [{ type: 'roomError', message: 'Peer is not connected' }] }, 409);
    }

    pushEvent(room, target, { type: 'relay', payload: message.payload }, now);
    await saveRoom(store, room, now);
    return json({ messages: [], cursor: room.nextEventId - 1 });
  }

  if (message.type === 'leaveRoom') {
    if (role === 'host') {
      room.closedAt = now;
      pushEvent(room, 'guest', { type: 'peerLeft' }, now);
    } else {
      room.guestId = null;
      room.guestSeenAt = null;
      pushEvent(room, 'host', { type: 'peerLeft' }, now);
    }

    await saveRoom(store, room, now);
    return json({ messages: [], cursor: room.nextEventId - 1 });
  }

  return json({ messages: [{ type: 'roomError', message: 'Invalid message' }] }, 400);
};

export const config: Config = {
  path: '/api/rooms',
};

async function createRoom(store: ReturnType<typeof getStore>, hostId: string, now: number) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = createRoomCode(new Set());
    const existing = await readRoom(store, code);

    if (existing && !isExpired(existing, now)) {
      continue;
    }

    const room: RoomRecord = {
      code,
      hostId,
      guestId: null,
      hostSeenAt: now,
      guestSeenAt: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      nextEventId: 1,
      events: [],
    };

    await saveRoom(store, room, now);
    return json({ messages: [{ type: 'roomCreated', code, role: 'host' }], cursor: 0 });
  }

  return json({ messages: [{ type: 'roomError', message: 'Unable to create a room' }] }, 503);
}

async function joinRoom(store: ReturnType<typeof getStore>, room: RoomRecord, guestId: string, now: number) {
  if (room.closedAt) {
    return json({ messages: [{ type: 'roomError', message: 'Room not found' }] }, 404);
  }

  if (room.hostId === guestId) {
    return json({ messages: [{ type: 'roomError', message: 'Room not found' }] }, 409);
  }

  if (room.guestId && room.guestId !== guestId) {
    return json({ messages: [{ type: 'roomError', message: 'Room is full' }] }, 409);
  }

  room.guestId = guestId;
  room.guestSeenAt = now;
  pushEvent(room, 'host', { type: 'peerJoined' }, now);
  await saveRoom(store, room, now);

  return json({ messages: [{ type: 'roomJoined', code: room.code, role: 'guest' }], cursor: room.nextEventId - 1 });
}

async function readRoom(store: ReturnType<typeof getStore>, code: string) {
  return (await store.get(roomKey(code), { type: 'json' })) as RoomRecord | null;
}

async function saveRoom(store: ReturnType<typeof getStore>, room: RoomRecord, now: number) {
  room.updatedAt = now;
  room.events = compactEvents(room.events, now);
  await store.setJSON(roomKey(room.code), room);
}

function pushEvent(room: RoomRecord, target: EventTarget, event: { type: RoomEventType; payload?: unknown }, now: number) {
  room.events.push({
    ...event,
    id: room.nextEventId,
    target,
    createdAt: now,
  });
  room.nextEventId += 1;
}

function selectEvents(room: RoomRecord, role: OnlineRole, after: number) {
  const messages = room.events
    .filter((event) => event.id > after && (event.target === role || event.target === 'both'))
    .map((event) => ({
      type: event.type,
      payload: event.payload,
      eventId: event.id,
    }));

  return { messages, cursor: room.nextEventId - 1 };
}

function applyPeerTimeout(room: RoomRecord, now: number) {
  if (room.closedAt) {
    return;
  }

  if (room.guestId && room.guestSeenAt && now - room.guestSeenAt > PEER_TIMEOUT_MS) {
    room.guestId = null;
    room.guestSeenAt = null;
    pushEvent(room, 'host', { type: 'peerLeft' }, now);
  }

  if (room.hostSeenAt && now - room.hostSeenAt > PEER_TIMEOUT_MS) {
    room.closedAt = now;
    pushEvent(room, 'guest', { type: 'peerLeft' }, now);
  }
}

function markSeen(room: RoomRecord, role: OnlineRole, now: number) {
  if (role === 'host') {
    room.hostSeenAt = now;
    return;
  }

  room.guestSeenAt = now;
}

function getRole(room: RoomRecord, clientId: string): OnlineRole | null {
  if (room.hostId === clientId) {
    return 'host';
  }

  if (room.guestId === clientId) {
    return 'guest';
  }

  return null;
}

function compactEvents(events: StoredEvent[], now: number) {
  return events.filter((event) => now - event.createdAt < EVENT_TTL_MS).slice(-MAX_EVENTS);
}

function isExpired(room: RoomRecord, now: number) {
  return now - room.updatedAt > ROOM_TTL_MS;
}

function normalizeClientId(clientId: unknown) {
  return String(clientId ?? '').trim().slice(0, 80);
}

function roomKey(code: string) {
  return `rooms/${code}.json`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
