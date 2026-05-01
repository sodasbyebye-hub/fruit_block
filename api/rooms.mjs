import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { createRoomCode, normalizeRoomCode } from '../server/rooms.mjs';
import {
  SIGNAL_ROOM_TTL_MS,
  compactEvents,
  getRole,
  isExpired,
  normalizeClientId,
  pushEvent,
  selectEvents,
} from '../server/signalingRooms.mjs';

const ROOM_TTL_SECONDS = Math.ceil(SIGNAL_ROOM_TTL_MS / 1000);
const LOCK_TTL_SECONDS = 3;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    writeJson(response, 405, { messages: [{ type: 'roomError', message: 'Method not allowed' }] });
    return;
  }

  const redis = createRedis();
  if (!redis) {
    writeJson(response, 503, { messages: [{ type: 'roomError', message: 'Missing Upstash Redis environment variables' }] });
    return;
  }

  let message;

  try {
    message = await readJson(request);
  } catch {
    writeJson(response, 400, { messages: [{ type: 'roomError', message: 'Invalid message' }] });
    return;
  }

  const clientId = normalizeClientId(message.clientId);
  if (!clientId) {
    writeJson(response, 400, { messages: [{ type: 'roomError', message: 'Missing client id' }] });
    return;
  }

  const now = Date.now();

  if (message.type === 'createRoom') {
    const result = await createRoom(redis, clientId, now);
    writeJson(response, result.status, result.body);
    return;
  }

  const code = normalizeRoomCode(message.code);
  if (!code) {
    writeJson(response, 400, { messages: [{ type: 'roomError', message: 'Missing room code' }] });
    return;
  }

  const result = await withRoomLock(redis, code, async () => handleRoomMessage(redis, code, clientId, message, now));
  writeJson(response, result.status, result.body);
}

function createRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return Redis.fromEnv();
}

async function createRoom(redis, hostId, now) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = createRoomCode(new Set());
    const room = {
      code,
      hostId,
      guestId: null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      nextEventId: 1,
      events: [],
    };

    const created = await redis.set(roomKey(code), room, { ex: ROOM_TTL_SECONDS, nx: true });
    if (created) {
      return { status: 200, body: { messages: [{ type: 'roomCreated', code, role: 'host' }], cursor: 0 } };
    }
  }

  return { status: 503, body: { messages: [{ type: 'roomError', message: 'Unable to create a room' }] } };
}

async function handleRoomMessage(redis, code, clientId, message, now) {
  const key = roomKey(code);
  const room = await redis.get(key);

  if (!room || room.closedAt || isExpired(room, now)) {
    await redis.del(key);
    return { status: 404, body: { messages: [{ type: 'roomError', message: 'Room not found' }] } };
  }

  if (message.type === 'joinRoom') {
    return joinRoom(redis, room, clientId, now);
  }

  const role = getRole(room, clientId);
  if (!role) {
    return { status: 404, body: { messages: [{ type: 'roomError', message: 'Room not found' }] } };
  }

  room.updatedAt = now;

  if (message.type === 'signal') {
    const target = role === 'host' ? 'guest' : 'host';
    pushEvent(room, target, { type: 'signal', signal: message.signal }, now);
    room.events = compactEvents(room.events, now);
    await saveRoom(redis, room);
    return { status: 200, body: { messages: [], cursor: room.nextEventId - 1 } };
  }

  if (message.type === 'poll') {
    room.events = compactEvents(room.events, now);
    await saveRoom(redis, room);
    return { status: 200, body: selectEvents(room, role, Number(message.after ?? 0)) };
  }

  if (message.type === 'leaveRoom') {
    if (role === 'host') {
      room.closedAt = now;
      pushEvent(room, 'guest', { type: 'peerLeft' }, now);
    } else {
      room.guestId = null;
      pushEvent(room, 'host', { type: 'peerLeft' }, now);
    }

    await saveRoom(redis, room);
    return { status: 200, body: { messages: [], cursor: room.nextEventId - 1 } };
  }

  return { status: 400, body: { messages: [{ type: 'roomError', message: 'Invalid message' }] } };
}

async function joinRoom(redis, room, guestId, now) {
  if (room.hostId === guestId) {
    return { status: 409, body: { messages: [{ type: 'roomError', message: 'Room not found' }] } };
  }

  if (room.guestId && room.guestId !== guestId) {
    return { status: 409, body: { messages: [{ type: 'roomError', message: 'Room is full' }] } };
  }

  const isNewGuest = !room.guestId;
  room.guestId = guestId;
  room.updatedAt = now;

  if (isNewGuest) {
    pushEvent(room, 'host', { type: 'peerJoined' }, now);
  }

  await saveRoom(redis, room);
  return { status: 200, body: { messages: [{ type: 'roomJoined', code: room.code, role: 'guest' }], cursor: 0 } };
}

async function withRoomLock(redis, code, operation) {
  const key = lockKey(code);
  const token = randomUUID();

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const locked = await redis.set(key, token, { ex: LOCK_TTL_SECONDS, nx: true });
    if (locked) {
      try {
        return await operation();
      } finally {
        if ((await redis.get(key)) === token) {
          await redis.del(key);
        }
      }
    }

    await delay(20 + attempt * 5);
  }

  return { status: 409, body: { messages: [{ type: 'roomError', message: 'Room is busy' }] } };
}

function saveRoom(redis, room) {
  return redis.set(roomKey(room.code), room, { ex: ROOM_TTL_SECONDS });
}

function roomKey(code) {
  return `jelly-battle:rooms:${code}`;
}

function lockKey(code) {
  return `jelly-battle:rooms:${code}:lock`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
