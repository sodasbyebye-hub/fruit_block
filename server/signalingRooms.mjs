import { createRoomCode, normalizeRoomCode } from './rooms.mjs';

export const SIGNAL_ROOM_TTL_MS = 1000 * 60 * 5;
export const SIGNAL_EVENT_TTL_MS = 1000 * 60 * 2;
export const SIGNAL_MAX_EVENTS = 240;

export function createSignalRoomStore(random = Math.random, clock = () => Date.now()) {
  const rooms = new Map();

  function handle(message) {
    const now = clock();
    cleanup(now);

    const clientId = normalizeClientId(message.clientId);
    if (!clientId) {
      return response([{ type: 'roomError', message: 'Missing client id' }], 400);
    }

    if (message.type === 'createRoom') {
      return createRoom(clientId, now);
    }

    const code = normalizeRoomCode(message.code);
    if (!code) {
      return response([{ type: 'roomError', message: 'Missing room code' }], 400);
    }

    const room = rooms.get(code);
    if (!room || room.closedAt || isExpired(room, now)) {
      rooms.delete(code);
      return response([{ type: 'roomError', message: 'Room not found' }], 404);
    }

    if (message.type === 'joinRoom') {
      return joinRoom(room, clientId, now);
    }

    const role = getRole(room, clientId);
    if (!role) {
      return response([{ type: 'roomError', message: 'Room not found' }], 404);
    }

    room.updatedAt = now;

    if (message.type === 'signal') {
      return signal(room, role, message.signal, now);
    }

    if (message.type === 'poll') {
      room.events = compactEvents(room.events, now);
      return {
        status: 200,
        body: selectEvents(room, role, Number(message.after ?? 0)),
      };
    }

    if (message.type === 'leaveRoom') {
      leaveRoom(room, role, now);
      return { status: 200, body: { messages: [], cursor: room.nextEventId - 1 } };
    }

    return response([{ type: 'roomError', message: 'Invalid message' }], 400);
  }

  function createRoom(hostId, now) {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = createRoomCode(new Set(rooms.keys()), random);
      if (rooms.has(code)) {
        continue;
      }

      rooms.set(code, {
        code,
        hostId,
        guestId: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        nextEventId: 1,
        events: [],
      });

      return { status: 200, body: { messages: [{ type: 'roomCreated', code, role: 'host' }], cursor: 0 } };
    }

    return response([{ type: 'roomError', message: 'Unable to create a room' }], 503);
  }

  function joinRoom(room, guestId, now) {
    if (room.hostId === guestId) {
      return response([{ type: 'roomError', message: 'Room not found' }], 409);
    }

    if (room.guestId && room.guestId !== guestId) {
      return response([{ type: 'roomError', message: 'Room is full' }], 409);
    }

    const isNewGuest = !room.guestId;
    room.guestId = guestId;
    room.updatedAt = now;

    if (isNewGuest) {
      pushEvent(room, 'host', { type: 'peerJoined' }, now);
    }

    return { status: 200, body: { messages: [{ type: 'roomJoined', code: room.code, role: 'guest' }], cursor: 0 } };
  }

  function signal(room, role, signalMessage, now) {
    const target = role === 'host' ? 'guest' : 'host';
    pushEvent(room, target, { type: 'signal', signal: signalMessage }, now);
    room.events = compactEvents(room.events, now);
    return { status: 200, body: { messages: [], cursor: room.nextEventId - 1 } };
  }

  function leaveRoom(room, role, now) {
    if (role === 'host') {
      room.closedAt = now;
      pushEvent(room, 'guest', { type: 'peerLeft' }, now);
      return;
    }

    room.guestId = null;
    pushEvent(room, 'host', { type: 'peerLeft' }, now);
  }

  function cleanup(now) {
    for (const [code, room] of rooms) {
      if (room.closedAt || isExpired(room, now)) {
        rooms.delete(code);
      }
    }
  }

  return {
    rooms,
    handle,
  };
}

export function pushEvent(room, target, event, now) {
  room.events.push({
    ...event,
    id: room.nextEventId,
    target,
    createdAt: now,
  });
  room.nextEventId += 1;
}

export function selectEvents(room, role, after) {
  const messages = room.events
    .filter((event) => event.id > after && event.target === role)
    .map(({ target, createdAt, ...event }) => event);

  return {
    messages,
    cursor: room.nextEventId - 1,
  };
}

export function compactEvents(events, now) {
  return events.filter((event) => now - event.createdAt < SIGNAL_EVENT_TTL_MS).slice(-SIGNAL_MAX_EVENTS);
}

export function getRole(room, clientId) {
  if (room.hostId === clientId) {
    return 'host';
  }

  if (room.guestId === clientId) {
    return 'guest';
  }

  return null;
}

export function normalizeClientId(clientId) {
  return String(clientId ?? '').trim().slice(0, 80);
}

export function isExpired(room, now) {
  return now - room.updatedAt > SIGNAL_ROOM_TTL_MS;
}

function response(messages, status) {
  return {
    status,
    body: { messages },
  };
}
